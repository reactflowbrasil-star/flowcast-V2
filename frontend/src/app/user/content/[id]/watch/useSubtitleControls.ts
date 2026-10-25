'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { SubtitleTrackResponse } from '@/types';

export type SubtitleControlsArgs = {
  contentId: number;
  subtitles: SubtitleTrackResponse[];
  playerOpen: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  shakaRef: RefObject<any>;
};

export function useSubtitleControls({
  contentId,
  subtitles,
  playerOpen,
  videoRef,
  shakaRef}: SubtitleControlsArgs) {
  const [selectedSubtitleIndex, setSelectedSubtitleIndex] = useState<number>(-1);
  const [subtitleSize, setSubtitleSize] = useState<'sm' | 'md' | 'lg'>('md');

  const applySubtitleSelection = useCallback(
    (index: number) => {
      // Prefer Shaka-managed tracks when player is active
      const shakaPlayer = shakaRef.current;
      if (shakaPlayer) {
        try {
          const anyPlayer = shakaPlayer as any;
          const tracks = anyPlayer.getTextTracks?.() || [];

          if (index >= 0 && index < tracks.length) {
            anyPlayer.setTextTrackVisibility(true);
            anyPlayer.selectTextTrack(tracks[index]);
            setSelectedSubtitleIndex(index);
            try {
              localStorage.setItem(`iptv_subs_${contentId}`, String(index));
            } catch {}
            return;
          }
        } catch {
          // fall through to native toggle
        }
      }

      // Fallback to native <video> text tracks (MP4/native)
      const v = videoRef.current;
      if (!v) {
        return;
      }

      const tracks = v.textTracks;

      // Disable all tracks first
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].mode = 'disabled';
      }

      // Enable the selected track
      if (index >= 0 && index < tracks.length) {
        const track = tracks[index];
        track.mode = 'showing';

        // Force reload if track has no cues loaded yet
        if (!track.cues || track.cues.length === 0) {
          // Try to force reload by toggling mode
          track.mode = 'disabled';
          setTimeout(() => {
            track.mode = 'showing';
          }, 100);
        }
      }

      setSelectedSubtitleIndex(index);
      try {
        localStorage.setItem(`iptv_subs_${contentId}`, String(index));
      } catch {}
    },
    [contentId, shakaRef, videoRef]
  );

  const disableAllSubtitles = useCallback(() => {
    // Prefer Shaka when active
    const shakaPlayer = shakaRef.current;
    if (shakaPlayer) {
      try {
        (shakaPlayer as any).setTextTrackVisibility(false);
      } catch {}
      setSelectedSubtitleIndex(-1);
      try {
        localStorage.setItem(`iptv_subs_${contentId}`, String(-1));
      } catch {}
      return;
    }

    // Fallback to native
    const v = videoRef.current;
    if (!v) return;
    const tracks = v.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].mode = 'disabled';
    }
    setSelectedSubtitleIndex(-1);
    try {
      localStorage.setItem(`iptv_subs_${contentId}`, String(-1));
    } catch {}
  }, [contentId, shakaRef, videoRef]);

  // Enhanced subtitle setup for native player
  useEffect(() => {
    if (!playerOpen) return;

    const setupSubtitles = () => {
      try {
        const v = videoRef.current;
        if (!v) return;

        // Wait for text tracks to be loaded
        if (v.textTracks.length === 0 && subtitles.length > 0) {
          return false;
        }

        const saved = localStorage.getItem(`iptv_subs_${contentId}`);
        if (saved !== null) {
          const idx = parseInt(saved, 10);
          if (Number.isFinite(idx) && idx >= -1) {
            if (idx === -1) {
              disableAllSubtitles();
            } else if (idx < Math.min(subtitles.length, v.textTracks.length)) {
              applySubtitleSelection(idx);
            } else {
              // Saved index is out of range, reset to first available
              if (subtitles.length > 0 && v.textTracks.length > 0) {
                applySubtitleSelection(0);
              } else {
                disableAllSubtitles();
              }
            }
            return true;
          }
        }

        // Default: enable first subtitle if available
        if (subtitles.length > 0 && v.textTracks.length > 0) {
          applySubtitleSelection(0);
        } else {
          disableAllSubtitles();
        }
        return true;
      } catch (err) {
        console.error('🎬 Error setting up subtitles:', err);
        return true; // Stop retrying on error
      }
    };

    // Try multiple times with increasing delays for native player
    let attempts = 0;
    const maxAttempts = 10;
    const retryTimers: ReturnType<typeof setTimeout>[] = [];

    const attemptSetup = () => {
      attempts++;

      const success = setupSubtitles();
      if (!success && attempts < maxAttempts) {
        const retryTimer = setTimeout(attemptSetup, 200 * attempts); // Increasing delays: 200ms, 400ms, 600ms, etc.
        retryTimers.push(retryTimer);
      }
    };

    // Start with immediate attempt, then use delays
    const timer = setTimeout(attemptSetup, 100);

    return () => {
      clearTimeout(timer);
      retryTimers.forEach((retryTimer) => clearTimeout(retryTimer));
    };
  }, [applySubtitleSelection, contentId, disableAllSubtitles, playerOpen, subtitles, videoRef]);

  return {
    selectedSubtitleIndex,
    setSelectedSubtitleIndex,
    subtitleSize,
    setSubtitleSize,
    applySubtitleSelection,
    disableAllSubtitles};
}
