'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Settings, SkipBack, SkipForward, Captions, Download, Languages } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSubtitleLanguageName } from '@/constants/subtitleLanguages';
import { useTranslation } from 'react-i18next';

// Helper to determine if a URL is from our own server (same-origin or relative)
// External URLs should not include credentials to avoid CORS issues
const isInternalUrl = (url: string): boolean => {
  if (!url) return false;

  // Relative URLs are always internal
  if (url.startsWith('/') && !url.startsWith('//')) return true;

  try {
    const urlObj = new URL(url, window.location.origin);
    // Check if it's same origin
    return urlObj.origin === window.location.origin;
  } catch {
    // If URL parsing fails, assume it's internal (relative path)
    return true;
  }
};

// AudioTracks API types (browser-specific, not in standard TypeScript lib)
interface AudioTrack {
  enabled: boolean;
  id: string;
  kind: string;
  label: string;
  language: string;
}

interface AudioTrackList {
  length: number;
  [index: number]: AudioTrack;
  getTrackById?(id: string): AudioTrack | null;
}

interface HTMLVideoElementWithAudioTracks extends HTMLVideoElement {
  audioTracks?: AudioTrackList;
}

interface ModernVideoPlayerProps {
  src: string;
  poster?: string;
  subtitles: Array<{
    id: number | string;
    url: string;
    language: string;
    label: string;
  }>;
  onSubtitleChange?: (index: number) => void;
  onPlaybackRateChange?: (rate: number) => void;
  className?: string;
}

export const ModernVideoPlayer = React.forwardRef<HTMLVideoElement, ModernVideoPlayerProps>(({
  src,
  poster,
  subtitles = [],
  onSubtitleChange,
  onPlaybackRateChange,
  className
}, ref) => {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  // Forward the ref to the parent component
  useEffect(() => {
    if (typeof ref === 'function') {
      ref(videoRef.current);
    } else if (ref) {
      ref.current = videoRef.current;
    }
  });

  // Delayed src state to ensure crossOrigin is applied first
  // This prevents 401 errors on first load when credentials aren't sent
  const [mountedSrc, setMountedSrc] = useState<string>('');

  useEffect(() => {
    // Wait for component to mount with crossOrigin attribute before setting src
    if (src) setIsBuffering(true);
    const timer = setTimeout(() => {
      if (src && videoRef.current) {
        // Set crossOrigin based on URL origin:
        // - Internal URLs: use-credentials (for authentication)
        // - External URLs: anonymous (to avoid CORS issues)
        videoRef.current.crossOrigin = isInternalUrl(src) ? 'use-credentials' : 'anonymous';
        setMountedSrc(src);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [src]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [selectedSubtitle, setSelectedSubtitle] = useState<number>(-1);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isBuffering, setIsBuffering] = useState(false);
  const subtitleRetryTimersRef = useRef<number[]>([]);

  // Audio tracks state
  const [audioTracks, setAudioTracks] = useState<Array<{ index: number, label: string, language: string, enabled: boolean }>>([]);
  const [showAudioTracks, setShowAudioTracks] = useState(false);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<number>(0);

  // Hide controls after 15 seconds of inactivity (increased from 3 seconds)
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showControls && isPlaying) {
      timer = setTimeout(() => setShowControls(false), 15000);
    }
    return () => clearTimeout(timer);
  }, [showControls, isPlaying]);

  // Detect audio tracks when video metadata loads
  useEffect(() => {
    const video = videoRef.current as HTMLVideoElementWithAudioTracks | null;
    if (!video) return;

    const handleLoadedMetadata = () => {
      // Detect audio tracks (browser-specific API)
      if (video.audioTracks && video.audioTracks.length > 0) {
        const tracks = [];
        for (let i = 0; i < video.audioTracks.length; i++) {
          const track = video.audioTracks[i];
          tracks.push({
            index: i,
            label: track.label || `Audio ${i + 1}`,
            language: track.language || 'unknown',
            enabled: track.enabled
          });

          if (track.enabled) {
            setSelectedAudioTrack(i);
          }
        }
        setAudioTracks(tracks);
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    // Also try to detect on loadeddata event as backup
    const handleLoadedData = () => {
      if (video.audioTracks && video.audioTracks.length > 0 && audioTracks.length === 0) {
        handleLoadedMetadata();
      }
    };

    video.addEventListener('loadeddata', handleLoadedData);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('loadeddata', handleLoadedData);
    };
  }, [subtitles, audioTracks.length]);

  // Update UI state when text tracks change (parent component controls the actual tracks)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || video.textTracks.length === 0) return;

    const checkActiveTrack = () => {
      for (let i = 0; i < video.textTracks.length; i++) {
        if (video.textTracks[i].mode === 'showing') {
          if (selectedSubtitle !== i) {
            setSelectedSubtitle(i);
          }
          return;
        }
      }
      // No track is showing
      if (selectedSubtitle !== -1) {
        setSelectedSubtitle(-1);
      }
    };

    // Check immediately
    checkActiveTrack();

    // Listen for track changes
    const handleTrackChange = () => {
      checkActiveTrack();
    };

    for (let i = 0; i < video.textTracks.length; i++) {
      video.textTracks[i].addEventListener('cuechange', handleTrackChange);
    }

    return () => {
      for (let i = 0; i < video.textTracks.length; i++) {
        video.textTracks[i].removeEventListener('cuechange', handleTrackChange);
      }
    };
  }, [subtitles, selectedSubtitle]);

  // Robust subtitle loading with error handling and retry
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTrackError = (event: Event) => {
      const track = event.target as HTMLTrackElement;
      console.error('❌ Subtitle track failed to load:', track.src, track.label);

      // Retry loading after 1 second
      const retryTimer = window.setTimeout(() => {
        const currentSrc = track.src;
        track.src = '';
        const restoreTimer = window.setTimeout(() => {
          track.src = currentSrc;
        }, 100);
        subtitleRetryTimersRef.current.push(restoreTimer);
      }, 1000);
      subtitleRetryTimersRef.current.push(retryTimer);
    };

    const handleTrackLoad = (_event: Event) => {
      // Track loaded successfully
    };

    // Add error and load listeners to all track elements
    const trackElements = video.querySelectorAll('track');
    trackElements.forEach((track) => {
      track.addEventListener('error', handleTrackError);
      track.addEventListener('load', handleTrackLoad);
    });

    return () => {
      trackElements.forEach((track) => {
        track.removeEventListener('error', handleTrackError);
        track.removeEventListener('load', handleTrackLoad);
      });
      subtitleRetryTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      subtitleRetryTimersRef.current = [];
    };
  }, [subtitles]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleDurationChange = () => setDuration(video.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleVolumeChange = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
    };
    const handleLoading = () => setIsBuffering(true);
    const handleCanPlay = () => setIsBuffering(false);
    const handleError = () => {
      setIsBuffering(false);
      setMountedSrc('');
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('volumechange', handleVolumeChange);
    video.addEventListener('loadstart', handleLoading);
    video.addEventListener('waiting', handleLoading);
    video.addEventListener('stalled', handleLoading);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('playing', handleCanPlay);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('volumechange', handleVolumeChange);
      video.removeEventListener('loadstart', handleLoading);
      video.removeEventListener('waiting', handleLoading);
      video.removeEventListener('stalled', handleLoading);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('playing', handleCanPlay);
      video.removeEventListener('error', handleError);
    };
  }, []);

  // Fullscreen handling
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
  };

  const handleProgressClick = (e: React.MouseEvent) => {
    const video = videoRef.current;
    const progressBar = progressRef.current;
    if (!video || !progressBar) return;

    const rect = progressBar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickRatio = clickX / rect.width;
    video.currentTime = clickRatio * duration;
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const newVolume = parseFloat(e.target.value);
    video.volume = newVolume;
    setVolume(newVolume);
  };

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await videoRef.current?.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  const skipTime = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(duration, video.currentTime + seconds));
  };

  const changePlaybackSpeed = (speed: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = speed;
    setPlaybackSpeed(speed);
    onPlaybackRateChange?.(speed);
  };

  const selectSubtitle = (index: number) => {
    setSelectedSubtitle(index);
    setShowSubtitles(false);
    onSubtitleChange?.(index);
  };

  const selectAudioTrack = (index: number) => {
    const video = videoRef.current as HTMLVideoElementWithAudioTracks | null;
    if (!video || !video.audioTracks) return;

    // Disable all tracks and enable the selected one
    for (let i = 0; i < video.audioTracks.length; i++) {
      video.audioTracks[i].enabled = (i === index);
    }

    setSelectedAudioTrack(index);
    setShowAudioTracks(false);

    // Update the tracks state to reflect the change
    setAudioTracks(prev => prev.map((track, i) => ({
      ...track,
      enabled: i === index
    })));
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const progressPercentage = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={cn("relative bg-black rounded-xl overflow-hidden group", className)}
      onMouseMove={() => setShowControls(true)}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        src={mountedSrc}
        poster={poster}
        className="w-full h-full object-contain rounded-xl"
        playsInline
        crossOrigin={isInternalUrl(mountedSrc) ? 'use-credentials' : 'anonymous'}
        onClick={togglePlay}
        onError={() => setIsBuffering(false)}
      >
        {subtitles.map((sub, index) => (
          <track
            key={sub.id}
            src={sub.url}
            kind="subtitles"
            srcLang={sub.language}
            label={sub.label}
          />
        ))}
      </video>

      {/* Subtle Flowcast watermark, kept visible while the video plays. */}
      <img
        src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/flowcast-logo.png`}
        alt="Flowcast"
        className="pointer-events-none absolute left-3 top-3 z-20 w-24 opacity-55 drop-shadow-md sm:left-5 sm:top-5 sm:w-32"
      />

      {/* Loading Spinner */}
      {isBuffering && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/35">
          <img src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/flowcast-logo.png`} alt="Flowcast" className="w-40 max-w-[55vw] animate-pulse opacity-80" />
          <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-white/25 border-t-white/90" />
        </div>
      )}

      {/* Center Play Button */}
      {!isPlaying && !isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <button
            onClick={togglePlay}
            className="w-20 h-20 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/20 transition-colors pointer-events-auto"
          >
            <Play className="w-8 h-8 text-white ml-1" />
          </button>
        </div>
      )}

      {/* Controls Overlay */}
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent transition-opacity duration-300 pointer-events-none",
          showControls ? "opacity-100" : "opacity-0"
        )}
      >
        {/* Bottom Controls */}
        <div className="absolute bottom-0 left-0 right-0 p-4 space-y-3 pointer-events-auto">
          {/* Progress Bar */}
          <div
            ref={progressRef}
            className="w-full h-1 bg-white/30 rounded-full cursor-pointer group/progress"
            onClick={handleProgressClick}
          >
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full relative group-hover/progress:h-2 transition-all"
              style={{ width: `${progressPercentage}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity" />
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {/* Play/Pause */}
              <button
                onClick={togglePlay}
                className="w-10 h-10 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 text-white" />
                ) : (
                  <Play className="w-5 h-5 text-white ml-0.5" />
                )}
              </button>

              {/* Skip Buttons */}
              <button
                onClick={() => skipTime(-10)}
                className="w-8 h-8 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                <SkipBack className="w-4 h-4 text-white" />
              </button>
              <button
                onClick={() => skipTime(10)}
                className="w-8 h-8 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                <SkipForward className="w-4 h-4 text-white" />
              </button>

              {/* Volume Controls */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={toggleMute}
                  className="w-8 h-8 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-white" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-white" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-20 h-1 bg-white/30 rounded-full appearance-none slider"
                />
              </div>

              {/* Time Display */}
              <div className="text-white text-sm font-medium">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {/* Audio Tracks - Always show button to display audio info */}
              <div className="relative">
                <button
                  onClick={() => setShowAudioTracks(!showAudioTracks)}
                  className={cn(
                    "w-8 h-8 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/20 transition-colors",
                    audioTracks.length > 0 && "bg-purple-500/50"
                  )}
                  title={audioTracks.length > 0
                    ? t('user.player.audioTracksTitleWithCount', { count: audioTracks.length })
                    : t('user.player.audioInfo')
                  }
                >
                  <Languages className="w-4 h-4 text-white" />
                </button>

                {showAudioTracks && (
                  <div className="absolute bottom-10 right-0 w-[400px] bg-black/95 backdrop-blur-md rounded-xl p-4 max-h-[70vh] overflow-y-auto border border-white/10 shadow-2xl">
                    <div className="mb-3 pb-2 border-b border-white/10">
                      <h3 className="text-white font-semibold text-sm">
                        {audioTracks.length > 0
                          ? t('user.player.audioTracksTitleWithCount', { count: audioTracks.length })
                          : t('user.player.audioTracksTitle')
                        }
                      </h3>
                    </div>

                    {audioTracks.length === 0 ? (
                      <div className="text-center py-6">
                        <div className="text-4xl mb-3">🎵</div>
                        <p className="text-white/60 text-sm mb-2">{t('user.player.noAudioTracks')}</p>
                        <p className="text-white/40 text-xs">
                          {t('user.player.noAudioTracksHelpLine1')}<br />
                          {t('user.player.noAudioTracksHelpLine2')}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {audioTracks.map((track) => {
                          const langName = getSubtitleLanguageName(track.language);
                          const langCode = track.language.toLowerCase();

                          // Map language codes to emojis
                          const emojiMap: Record<string, string> = {
                            'zh': '🇨🇳', 'zh-cn': '🇨🇳', 'zh-hans': '🇨🇳',
                            'zh-tw': '🇹🇼', 'zh-hant': '🇹🇼', 'zh-hk': '🇭🇰',
                            'cmn': '🇨🇳', 'cmn-tw': '🇹🇼',
                            'ja': '🇯🇵', 'jpn': '🇯🇵',
                            'ko': '🇰🇷', 'kor': '🇰🇷',
                            'en': '🇬🇧', 'eng': '🇬🇧',
                            'es': '🇪🇸', 'spa': '🇪🇸',
                            'fr': '🇫🇷', 'fra': '🇫🇷',
                            'de': '🇩🇪', 'deu': '🇩🇪',
                            'it': '🇮🇹', 'ita': '🇮🇹',
                            'pt': '🇵🇹', 'por': '🇵🇹',
                            'pt-br': '🇧🇷',
                            'ru': '🇷🇺', 'rus': '🇷🇺',
                            'ar': '🇸🇦', 'ara': '🇸🇦',
                            'hi': '🇮🇳', 'hin': '🇮🇳',
                            'tr': '🇹🇷', 'tur': '🇹🇷',
                            'nl': '🇳🇱', 'nld': '🇳🇱',
                            'pl': '🇵🇱', 'pol': '🇵🇱',
                            'sv': '🇸🇪', 'swe': '🇸🇪',
                            'no': '🇳🇴', 'nor': '🇳🇴', 'nb': '🇳🇴',
                            'da': '🇩🇰', 'dan': '🇩🇰',
                            'fi': '🇫🇮', 'fin': '🇫🇮',
                            'cs': '🇨🇿', 'ces': '🇨🇿',
                            'el': '🇬🇷', 'ell': '🇬🇷',
                            'he': '🇮🇱', 'heb': '🇮🇱',
                            'th': '🇹🇭', 'tha': '🇹🇭',
                            'vi': '🇻🇳', 'vie': '🇻🇳',
                            'id': '🇮🇩', 'ind': '🇮🇩',
                            'uk': '🇺🇦', 'ukr': '🇺🇦',
                            'ro': '🇷🇴', 'ron': '🇷🇴',
                            'hu': '🇭🇺', 'hun': '🇭🇺',
                            'hr': '🇭🇷', 'hrv': '🇭🇷',
                            'sr': '🇷🇸', 'srp': '🇷🇸',
                            'bg': '🇧🇬', 'bul': '🇧🇬',
                            'sk': '🇸🇰', 'slk': '🇸🇰',
                            'sl': '🇸🇮', 'slv': '🇸🇮',
                            'is': '🇮🇸', 'isl': '🇮🇸',
                            'unknown': '🎵', 'und': '🎵'};

                          const emoji = emojiMap[langCode] || '🎵';
                          const displayName = track.label || langName;

                          return (
                            <button
                              key={track.index}
                              onClick={() => selectAudioTrack(track.index)}
                              className={cn(
                                "w-full px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200",
                                "border border-white/10 hover:border-white/30",
                                "flex items-center justify-between",
                                selectedAudioTrack === track.index
                                  ? "bg-gradient-to-br from-purple-500 to-purple-600 text-white border-purple-400 shadow-lg shadow-purple-500/30"
                                  : "bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
                              )}
                              title={displayName}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-xl">{emoji}</span>
                                <span className="truncate">{displayName}</span>
                              </div>
                              {selectedAudioTrack === track.index && (
                                <span className="text-xs bg-white/20 px-2 py-0.5 rounded">{t('common.active')}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Subtitles */}
              <div className="relative">
                <button
                  onClick={() => setShowSubtitles(!showSubtitles)}
                  className={cn(
                    "w-8 h-8 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/20 transition-colors",
                    selectedSubtitle >= 0 && "bg-blue-500/50"
                  )}
                >
                  <Captions className="w-4 h-4 text-white" />
                </button>

                {showSubtitles && (
                  <div className="absolute bottom-10 right-0 w-[560px] bg-black/95 backdrop-blur-md rounded-xl p-4 max-h-[70vh] overflow-y-auto border border-white/10 shadow-2xl">
                    <div className="mb-3 pb-2 border-b border-white/10">
                      <h3 className="text-white font-semibold text-sm">{t('user.player.subtitlesTitle')}</h3>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => selectSubtitle(-1)}
                        className={cn(
                          "px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-200",
                          "border border-white/10 hover:border-white/30",
                          selectedSubtitle === -1
                            ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white border-blue-400 shadow-lg shadow-blue-500/30"
                            : "bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
                        )}
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="text-lg">🚫</span>
                          <span>{t('user.player.noSubtitles')}</span>
                        </div>
                      </button>
                      {subtitles.map((sub, index) => {
                        const langName = getSubtitleLanguageName(sub.language || sub.label);
                        const langCode = (sub.language || sub.label || '').toLowerCase();

                        // Map language codes to emojis
                        const emojiMap: Record<string, string> = {
                          'zh': '🇨🇳', 'zh-cn': '🇨🇳', 'zh-hans': '🇨🇳',
                          'zh-tw': '🇹🇼', 'zh-hant': '🇹🇼', 'zh-hk': '🇭🇰',
                          'cmn': '🇨🇳', 'cmn-tw': '🇹🇼',
                          'ja': '🇯🇵', 'jpn': '🇯🇵',
                          'ko': '🇰🇷', 'kor': '🇰🇷',
                          'en': '🇬🇧', 'eng': '🇬🇧',
                          'es': '🇪🇸', 'spa': '🇪🇸',
                          'fr': '🇫🇷', 'fra': '🇫🇷',
                          'de': '🇩🇪', 'deu': '🇩🇪',
                          'it': '🇮🇹', 'ita': '🇮🇹',
                          'pt': '🇵🇹', 'por': '🇵🇹',
                          'pt-br': '🇧🇷',
                          'ru': '🇷🇺', 'rus': '🇷🇺',
                          'ar': '🇸🇦', 'ara': '🇸🇦',
                          'hi': '🇮🇳', 'hin': '🇮🇳',
                          'tr': '🇹🇷', 'tur': '🇹🇷',
                          'nl': '🇳🇱', 'nld': '🇳🇱',
                          'pl': '🇵🇱', 'pol': '🇵🇱',
                          'sv': '🇸🇪', 'swe': '🇸🇪',
                          'no': '🇳🇴', 'nor': '🇳🇴', 'nb': '🇳🇴',
                          'da': '🇩🇰', 'dan': '🇩🇰',
                          'fi': '🇫🇮', 'fin': '🇫🇮',
                          'cs': '🇨🇿', 'ces': '🇨🇿',
                          'el': '🇬🇷', 'ell': '🇬🇷',
                          'he': '🇮🇱', 'heb': '🇮🇱',
                          'th': '🇹🇭', 'tha': '🇹🇭',
                          'vi': '🇻🇳', 'vie': '🇻🇳',
                          'id': '🇮🇩', 'ind': '🇮🇩',
                          'uk': '🇺🇦', 'ukr': '🇺🇦',
                          'ro': '🇷🇴', 'ron': '🇷🇴',
                          'hu': '🇭🇺', 'hun': '🇭🇺',
                          'hr': '🇭🇷', 'hrv': '🇭🇷',
                          'sr': '🇷🇸', 'srp': '🇷🇸',
                          'bg': '🇧🇬', 'bul': '🇧🇬',
                          'sk': '🇸🇰', 'slk': '🇸🇰',
                          'sl': '🇸🇮', 'slv': '🇸🇮',
                          'is': '🇮🇸', 'isl': '🇮🇸',
                          'unknown': '❓', 'und': '❓'};

                        const emoji = emojiMap[langCode] || '🌐';
                        const displayName = langName;

                        return (
                          <button
                            key={sub.id}
                            onClick={() => selectSubtitle(index)}
                            className={cn(
                              "px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-200",
                              "border border-white/10 hover:border-white/30",
                              selectedSubtitle === index
                                ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white border-blue-400 shadow-lg shadow-blue-500/30"
                                : "bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
                            )}
                            title={displayName}
                          >
                            <div className="flex items-center justify-center gap-1.5">
                              <span className="text-lg">{emoji}</span>
                              <span className="truncate">{displayName}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Settings */}
              <div className="relative">
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="w-8 h-8 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
                >
                  <Settings className="w-4 h-4 text-white" />
                </button>

                {showSettings && (
                  <div className="absolute bottom-10 right-0 w-40 bg-black/90 backdrop-blur-sm rounded-lg p-2 space-y-2">
                    <div className="text-white text-xs font-medium px-2">{t('user.player.playbackSpeed')}</div>
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                      <button
                        key={speed}
                        onClick={() => changePlaybackSpeed(speed)}
                        className={cn(
                          "w-full text-left px-3 py-1 rounded text-sm hover:bg-white/10 transition-colors",
                          playbackSpeed === speed ? "text-blue-400" : "text-white"
                        )}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Fullscreen */}
              <button
                onClick={toggleFullscreen}
                className="w-8 h-8 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                <Maximize className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Custom Styles */}
      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
        }
        .slider::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  );
});

ModernVideoPlayer.displayName = 'ModernVideoPlayer';
