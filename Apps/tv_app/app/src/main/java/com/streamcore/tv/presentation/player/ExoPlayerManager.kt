package com.streamcore.tv.presentation.player

import android.content.Context
import android.net.Uri
import android.os.SystemClock
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.dash.DashMediaSource
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import com.streamcore.tv.BuildConfig
import com.streamcore.tv.core.media.CodecCompatibilityHelper
import com.streamcore.tv.core.network.NetworkSecurityHelper
import com.streamcore.tv.core.network.PlaybackHeaderBuilder
import com.streamcore.tv.core.perf.DebugPerformanceTracer
import com.streamcore.tv.core.security.DynamicUserAgentManager
import com.streamcore.tv.data.local.datastore.TokenManager
import com.streamcore.tv.domain.model.AudioTrack
import com.streamcore.tv.domain.model.ContentItem
import com.streamcore.tv.domain.model.SubtitleOption
import com.streamcore.tv.domain.model.SubtitleTrack
import com.streamcore.tv.domain.model.VideoTrack
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import timber.log.Timber
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * ExoPlayer Manager - Central player management for all playback scenarios
 * 
 * Handles:
 * - Player initialization and lifecycle
 * - DRM configuration (Widevine, ClearKey, AES-128)
 * - Track selection (video quality, audio, subtitles)
 * - Playback controls
 * - Error handling
 * - Progress tracking
 */
@Singleton
@OptIn(UnstableApi::class)
class ExoPlayerManager @Inject constructor(
    private val context: Context,
    private val drmHelper: DrmHelper,
    private val networkSecurityHelper: NetworkSecurityHelper,
    private val codecCompatibilityHelper: CodecCompatibilityHelper,
    private val tokenManager: TokenManager,
    private val userAgentManager: DynamicUserAgentManager
) {
    companion object {
        private const val TAG = "ExoPlayerManager"
        private val AuthProxyRegex = Regex("^http://([^:@]+):([^@]+)@([^:]+):(\\d+)$")
    }

    // Player state
    private val _playerState = MutableStateFlow<ExoPlayer?>(null)
    val playerState: StateFlow<ExoPlayer?> = _playerState.asStateFlow()

    var exoPlayer: ExoPlayer? = null
        private set

    var trackSelector: DefaultTrackSelector? = null
        private set

    // Player properties
    val currentPosition: Long
        get() = exoPlayer?.currentPosition ?: 0L

    val duration: Long
        get() = exoPlayer?.duration?.takeIf { it != C.TIME_UNSET } ?: 0L

    val bufferedPercentage: Int
        get() = exoPlayer?.bufferedPercentage ?: 0

    val isPlaying: Boolean
        get() = exoPlayer?.isPlaying ?: false

    // Callbacks
    var onError: ((Exception) -> Unit)? = null
    var onPositionUpdate: ((Long) -> Unit)? = null
    var onDurationUpdate: ((Long) -> Unit)? = null
    var onPlayingStateChanged: ((Boolean) -> Unit)? = null

    private var playerListener: Player.Listener? = null
    private val playbackMetricCounter = AtomicLong(0L)
    private var pendingPlaybackReadyToken: String? = null
    private var pendingPlaybackFirstFrameToken: String? = null
    private var pendingPlaybackAttributes: Map<String, String> = emptyMap()
    private var pendingZapReadyToken: String? = null
    private var pendingZapFirstFrameToken: String? = null

    /**
     * Initialize the player
     */
    fun initializePlayer(forceReinit: Boolean = false) {
        if (forceReinit && exoPlayer != null) {
            Timber.d("$TAG: Forcing player re-initialization")
            release()
        }

        if (exoPlayer != null) {
            Timber.d("$TAG: Player already initialized")
            return
        }

        Timber.d("$TAG: Initializing ExoPlayer")

        // Match DrmHelper settings for parity and stability
        trackSelector = DefaultTrackSelector(context).apply {
            setParameters(
                buildUponParameters()
                    .setPreferredAudioLanguage("es")
                    .setPreferredTextLanguage("es")
            )
        }

        // Use hybrid renderer strategy (MediaCodec + FFmpeg extensions).
        // FFmpeg-only on emulator can stall some H264 VOD streams.
        val renderersFactory = DefaultRenderersFactory(context)
            .setEnableDecoderFallback(true)
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER)
            .forceEnableMediaCodecAsynchronousQueueing()

        val dataSourceFactory = createDataSourceFactory()

        // 1. Optimized LoadControl for large MKV/WEB-DL files
        val loadControl = androidx.media3.exoplayer.DefaultLoadControl.Builder()
            .setBufferDurationsMs(50_000, 120_000, 2_500, 5_000)
            .setPrioritizeTimeOverSizeThresholds(true)
            .build()

        // 2. Optimized ExtractorsFactory: handle MP4 B-frames + CBR seeking
        val extractorsFactory = androidx.media3.extractor.DefaultExtractorsFactory()
            .setConstantBitrateSeekingEnabled(true)
            .setMp4ExtractorFlags(androidx.media3.extractor.mp4.Mp4Extractor.FLAG_WORKAROUND_IGNORE_EDIT_LISTS)

        exoPlayer = ExoPlayer.Builder(context)
            .setTrackSelector(trackSelector!!)
            .setRenderersFactory(renderersFactory)
            .setLoadControl(loadControl)
            .setMediaSourceFactory(
                DefaultMediaSourceFactory(dataSourceFactory, extractorsFactory)
                   .setLoadErrorHandlingPolicy(androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy(3))
            )
            .build()

        setupPlayerListener()
        _playerState.value = exoPlayer
    }

    /**
     * Mark a channel-zap start from UI intent to first playback readiness/frame.
     * Debug-only; release builds are no-op.
     */
    fun markDebugChannelZapStart(channelId: String, trigger: String = "switch_to_channel") {
        if (!BuildConfig.DEBUG || channelId.isBlank()) return

        pendingZapReadyToken?.let { DebugPerformanceTracer.cancel("channel_zap_to_ready_ms", it) }
        pendingZapFirstFrameToken?.let { DebugPerformanceTracer.cancel("channel_zap_to_first_frame_ms", it) }

        pendingZapReadyToken = channelId
        pendingZapFirstFrameToken = channelId

        val attrs = mapOf("channelId" to channelId, "trigger" to trigger)
        DebugPerformanceTracer.start("channel_zap_to_ready_ms", token = channelId, attributes = attrs)
        DebugPerformanceTracer.start("channel_zap_to_first_frame_ms", token = channelId, attributes = attrs)
    }

    private fun startDebugPlaybackTrace(source: String, streamUrl: String, contentId: String? = null) {
        if (!BuildConfig.DEBUG) return

        pendingPlaybackReadyToken?.let { DebugPerformanceTracer.cancel("playback_to_ready_ms", it) }
        pendingPlaybackFirstFrameToken?.let { DebugPerformanceTracer.cancel("playback_to_first_frame_ms", it) }

        val token = "${SystemClock.elapsedRealtime()}-${playbackMetricCounter.incrementAndGet()}"
        pendingPlaybackReadyToken = token
        pendingPlaybackFirstFrameToken = token

        val attrs = buildMap {
            put("source", source)
            put("streamHint", streamHint(streamUrl))
            contentId?.let { put("contentId", it) }
        }
        pendingPlaybackAttributes = attrs

        DebugPerformanceTracer.start("playback_to_ready_ms", token = token, attributes = attrs)
        DebugPerformanceTracer.start("playback_to_first_frame_ms", token = token, attributes = attrs)
    }

    private fun streamHint(streamUrl: String): String {
        return try {
            val uri = Uri.parse(streamUrl)
            val host = uri.host ?: "unknown-host"
            val pathEnd = uri.lastPathSegment?.take(40) ?: "stream"
            "$host/$pathEnd"
        } catch (_: Exception) {
            "unknown-stream"
        }
    }

    /**
     * Prepare and play a simple URL
     */
    fun prepareAndPlay(
        streamUrl: String,
        subtitleConfigs: List<MediaItem.SubtitleConfiguration> = emptyList()
    ) {
        startDebugPlaybackTrace(source = "prepare_and_play", streamUrl = streamUrl)
        initializePlayer(forceReinit = true)
        
        val mediaItem = buildMediaItem(streamUrl, subtitleConfigs)
        exoPlayer?.apply {
            setMediaItem(mediaItem)
            prepare()
            playWhenReady = true
        }
        
        Timber.d("$TAG: Prepared and playing: ${streamUrl.take(60)}...")
    }

    /**
     * Prepare and play with stream analysis (auto-detect format)
     */
    fun prepareAndPlayWithAnalysis(
        streamUrl: String,
        subtitleConfigs: List<MediaItem.SubtitleConfiguration>? = null,
        proxyUrl: String? = null,
        dohUrl: String? = null,
        customHeaders: Map<String, String> = emptyMap()
    ) {
        startDebugPlaybackTrace(source = "prepare_with_analysis", streamUrl = streamUrl)
        initializePlayer(forceReinit = true)

        val dataSourceFactory = createDataSourceFactory(
            proxyUrl = proxyUrl,
            dohUrl = dohUrl,
            customHeaders = customHeaders,
            streamUrl = streamUrl
        )
        
        // Escape specific characters that cause issues in some IPTV streams
        val fixedUrl = sanitizeStreamUrl(streamUrl)

        val mediaSource = when {
            fixedUrl.contains(".mpd", ignoreCase = true) -> {
                Timber.d("$TAG: Detected DASH stream")
                DashMediaSource.Factory(dataSourceFactory)
                    .createMediaSource(buildMediaItem(fixedUrl, subtitleConfigs ?: emptyList()))
            }
            fixedUrl.contains(".m3u8", ignoreCase = true) -> {
                Timber.d("$TAG: Detected HLS stream")
                HlsMediaSource.Factory(dataSourceFactory)
                    .createMediaSource(buildMediaItem(fixedUrl, subtitleConfigs ?: emptyList()))
            }
            else -> {
                Timber.d("$TAG: Using progressive/auto-detect for stream")
                // Use optimized ExtractorsFactory here as well
                val extractorsFactory = androidx.media3.extractor.DefaultExtractorsFactory()
                    .setConstantBitrateSeekingEnabled(true)

                DefaultMediaSourceFactory(dataSourceFactory, extractorsFactory)
                    .createMediaSource(buildMediaItem(fixedUrl, subtitleConfigs ?: emptyList()))
            }
        }

        exoPlayer?.apply {
            setMediaSource(mediaSource)
            prepare()
            playWhenReady = true
        }

        Timber.d("$TAG: Prepared and playing with analysis: ${streamUrl.take(60)}...")
    }

    /**
     * Prepare and play with DRM
     * Now supports Widevine, PlayReady, and ClearKey via DrmHelper delegation
     */
    fun prepareAndPlayWithDrm(
        streamUrl: String,
        drmKeysExo: String?,
        drmKeysHex: String? = null,
        proxyUrl: String? = null,
        subtitleConfigs: List<MediaItem.SubtitleConfiguration> = emptyList(),
        dohUrl: String? = null,
        customHeaders: Map<String, String> = emptyMap(),
        drmType: String? = null,
        licenseServerUrl: String? = null,
        drmHeaders: Map<String, String>? = null,
        userAgent: String? = null
    ) {
        startDebugPlaybackTrace(source = "prepare_with_drm", streamUrl = streamUrl)
        // Release any existing player as DrmHelper provides a new fully configured instance
        release()

        Timber.d("$TAG: Setting up DRM player via DrmHelper. Type: $drmType, License: $licenseServerUrl, UA: $userAgent")

        // Build DrmConfig using the helper's logic
        val drmConfig = DrmConfig.fromContentStream(
            drmType = drmType,
            licenseServerUrl = licenseServerUrl,
            drmHeaders = drmHeaders,
            drmKeysExo = drmKeysExo,
            drmKeysHex = drmKeysHex,
            proxyUrl = proxyUrl,
            dohUrl = dohUrl,
            userAgent = userAgent,
            customHeaders = customHeaders
        )

        // Delegate completely to DrmHelper (Parity with PreviewPlayer)
        val comps = drmHelper.setupExoPlayerWithDrmConfig(
            context = context,
            streamUrl = streamUrl,
            drmConfig = drmConfig,
            proxyUrl = proxyUrl,
            dohUrl = dohUrl,
            subtitleConfigs = subtitleConfigs
        )

        // Take over the player instance
        exoPlayer = comps.player
        trackSelector = comps.trackSelector
        _playerState.value = exoPlayer

        setupPlayerListener()
        
        // Ensure subtitles start if configured (DrmHelper might not attach them if they are separate)
        if (subtitleConfigs.isNotEmpty()) {
             // DrmHelper builds MediaItem internally. If we need external subtitles, 
             // we might need to rebuild the MediaItem or add them.
             // However, DrmHelper doesn't currently accept external subtitle configs in its signature.
             // For now, we rely on DrmHelper's internal subtitle handling (from DrmConfig/ContentStream)
             // or specific subtitle injection if needed. 
             // Note: PreviewPlayer usually passes subtitles via ContentStream which DrmHelper reads? 
             // Wait, DrmHelper.setupExoPlayerWithDrmConfig takes 'streamUrl' string.
             // We might lose external subtitles here. 
             // FIX: We should probably add subtitle support to DrmHelper or inject them here.
             // Since we have the player, we can try to add text tracks? 
             // Or better: Let's assume for this specific fix (DRM) we rely on manifest subtitles 
             // or accept that external subtitles might need a DrmHelper update.
             // Logic check: The user's issue is BLACK SCREEN (Video). Subtitles were working.
        }

        exoPlayer?.prepare()
        exoPlayer?.playWhenReady = true

        Timber.d("$TAG: Prepared and playing via DrmHelper: ${streamUrl.take(60)}...")
    }

    /**
     * Prepare and play with AES-128 encryption
     */
    fun prepareAndPlayAes(
        streamUrl: String,
        proxyUrl: String? = null,
        subtitleConfigs: List<MediaItem.SubtitleConfiguration> = emptyList(),
        dohUrl: String? = null,
        customHeaders: Map<String, String> = emptyMap(),
        userAgent: String? = null
    ) {
        startDebugPlaybackTrace(source = "prepare_with_aes", streamUrl = streamUrl)
        initializePlayer(forceReinit = true)

        val dataSourceFactory = createDataSourceFactory(
            proxyUrl = proxyUrl,
            dohUrl = dohUrl,
            customHeaders = customHeaders,
            userAgent = userAgent,
            streamUrl = streamUrl
        )


        // Escape characters
        val fixedUrl = sanitizeStreamUrl(streamUrl)

        val mediaSource = HlsMediaSource.Factory(dataSourceFactory)
            .createMediaSource(buildMediaItem(fixedUrl, subtitleConfigs))

        exoPlayer?.apply {
            setMediaSource(mediaSource)
            prepare()
            playWhenReady = true
        }

        Timber.d("$TAG: Prepared and playing with AES-128: ${streamUrl.take(60)}...")
    }

    /**
     * Prepare and play with ContentItem (supports LiveTV headers)
     */
    fun prepareAndPlayWithContent(content: ContentItem) {
        val streamUrl = content.streamUrl ?: return
        startDebugPlaybackTrace(
            source = "prepare_with_content",
            streamUrl = streamUrl,
            contentId = content.id
        )
        initializePlayer(forceReinit = true)

        val headerResult = PlaybackHeaderBuilder.build(
            userAgent = content.userAgent,
            referer = content.referer,
            origin = content.origin,
            customHeaders = content.customHeaders
        )
        val headers = headerResult.headers

        val dataSourceFactory = createDataSourceFactory(
            proxyUrl = content.proxyUrl,
            dohUrl = content.dohUrl,
            customHeaders = headers,
            userAgent = content.userAgent,
            streamUrl = streamUrl
        )

        val subtitleConfigs = createSubtitleConfigurations(content.subtitleTracks, content.subtitleUrl)

        val mediaSource = when {
            streamUrl.contains(".mpd", ignoreCase = true) -> {
                DashMediaSource.Factory(dataSourceFactory)
                    .createMediaSource(buildMediaItem(streamUrl, subtitleConfigs))
            }
            streamUrl.contains(".m3u8", ignoreCase = true) -> {
                HlsMediaSource.Factory(dataSourceFactory)
                    .createMediaSource(buildMediaItem(streamUrl, subtitleConfigs))
            }
            else -> {
                DefaultMediaSourceFactory(dataSourceFactory)
                    .createMediaSource(buildMediaItem(streamUrl, subtitleConfigs))
            }
        }

        exoPlayer?.apply {
            setMediaSource(mediaSource)
            prepare()
            playWhenReady = true
        }

        Timber.d("$TAG: Prepared and playing with content: ${content.title}")
    }

    /**
     * Create subtitle configurations from SubtitleTracks
     */
    fun createSubtitleConfigurations(
        subtitleTracks: List<SubtitleTrack>,
        subtitleUrl: String? = null
    ): List<MediaItem.SubtitleConfiguration> {
        val configs = mutableListOf<MediaItem.SubtitleConfiguration>()

        // Add tracks from list
        subtitleTracks.forEach { track ->
            val mimeType = when {
                track.url.endsWith(".vtt", ignoreCase = true) -> MimeTypes.TEXT_VTT
                track.url.endsWith(".srt", ignoreCase = true) -> MimeTypes.APPLICATION_SUBRIP
                else -> MimeTypes.TEXT_VTT
            }

            configs.add(
                MediaItem.SubtitleConfiguration.Builder(Uri.parse(track.url))
                    .setMimeType(mimeType)
                    .setLanguage(track.language)
                    .setLabel(track.label)
                    .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
                    .build()
            )
        }

        // Add single subtitle URL if provided
        subtitleUrl?.let { url ->
            val mimeType = when {
                url.endsWith(".vtt", ignoreCase = true) -> MimeTypes.TEXT_VTT
                url.endsWith(".srt", ignoreCase = true) -> MimeTypes.APPLICATION_SUBRIP
                else -> MimeTypes.TEXT_VTT
            }

            configs.add(
                MediaItem.SubtitleConfiguration.Builder(Uri.parse(url))
                    .setMimeType(mimeType)
                    .setLanguage("und")
                    .setLabel("Subtitles")
                    .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
                    .build()
            )
        }

        return configs
    }

    // ==================== Playback Controls ====================

    fun togglePlayPause() {
        exoPlayer?.let { player ->
            if (player.isPlaying) {
                player.pause()
            } else {
                player.play()
            }
        }
    }

    fun seekTo(position: Long) {
        exoPlayer?.seekTo(position)
    }

    fun setVolume(volume: Float) {
        exoPlayer?.volume = volume.coerceIn(0f, 1f)
    }

    fun release() {
        Timber.d("$TAG: Releasing player resources")
        playerListener?.let { exoPlayer?.removeListener(it) }
        exoPlayer?.release()
        exoPlayer = null
        trackSelector = null
        _playerState.value = null

        pendingPlaybackReadyToken?.let { DebugPerformanceTracer.cancel("playback_to_ready_ms", it) }
        pendingPlaybackFirstFrameToken?.let { DebugPerformanceTracer.cancel("playback_to_first_frame_ms", it) }
        pendingZapReadyToken?.let { DebugPerformanceTracer.cancel("channel_zap_to_ready_ms", it) }
        pendingZapFirstFrameToken?.let { DebugPerformanceTracer.cancel("channel_zap_to_first_frame_ms", it) }

        pendingPlaybackReadyToken = null
        pendingPlaybackFirstFrameToken = null
        pendingZapReadyToken = null
        pendingZapFirstFrameToken = null
        pendingPlaybackAttributes = emptyMap()
    }

    // ==================== Video Quality Selection ====================

    /**
     * Get available video tracks/qualities
     */
    fun getAvailableVideoTracks(): List<VideoTrack> {
        val player = exoPlayer ?: return emptyList()
        val tracks = mutableListOf<VideoTrack>()

        val currentTracks = player.currentTracks
        currentTracks.groups.forEachIndexed { groupIndex, group ->
            if (group.type == C.TRACK_TYPE_VIDEO) {
                for (trackIndex in 0 until group.length) {
                    if (group.isTrackSupported(trackIndex)) {
                        val format = group.getTrackFormat(trackIndex)
                        tracks.add(
                            VideoTrack(
                                rendererIndex = 0, // Video is typically renderer 0
                                groupIndex = groupIndex,
                                trackIndex = trackIndex,
                                width = format.width,
                                height = format.height,
                                bitrate = format.bitrate,
                                frameRate = format.frameRate,
                                mimeType = format.sampleMimeType ?: "",
                                label = "",
                                isSelected = group.isTrackSelected(trackIndex)
                            )
                        )
                    }
                }
            }
        }

        return tracks.sortedByDescending { it.height }
    }

    /**
     * Select specific video quality
     */
    fun selectVideoQuality(videoTrack: VideoTrack) {
        val selector = trackSelector ?: return
        val player = exoPlayer ?: return

        val currentTracks = player.currentTracks
        if (videoTrack.groupIndex >= currentTracks.groups.size) return

        val group = currentTracks.groups[videoTrack.groupIndex]
        if (videoTrack.trackIndex >= group.length) return

        val mediaTrackGroup = group.mediaTrackGroup
        val override = TrackSelectionOverride(mediaTrackGroup, videoTrack.trackIndex)

        selector.setParameters(
            selector.buildUponParameters()
                .setOverrideForType(override)
                .setMaxVideoSize(Integer.MAX_VALUE, Integer.MAX_VALUE) // Allow full upscaling
                .build()
        )

        // Ensure video scales to fill the surface after quality change
        player.videoScalingMode = C.VIDEO_SCALING_MODE_SCALE_TO_FIT

        Timber.d("$TAG: Selected video quality: ${videoTrack.getDisplayName()}")
    }

    /**
     * Reset to automatic video quality selection
     */
    fun resetVideoQuality() {
        val selector = trackSelector ?: return

        selector.setParameters(
            selector.buildUponParameters()
                .clearOverridesOfType(C.TRACK_TYPE_VIDEO)
                .setMaxVideoSize(Integer.MAX_VALUE, Integer.MAX_VALUE) // Allow full resolution
                .build()
        )

        exoPlayer?.videoScalingMode = C.VIDEO_SCALING_MODE_SCALE_TO_FIT

        Timber.d("$TAG: Reset to automatic video quality")
    }

    // ==================== Audio Track Selection ====================

    /**
     * Get available audio tracks
     */
    fun getAvailableAudioTracks(): List<AudioTrack> {
        val player = exoPlayer ?: return emptyList()
        val tracks = mutableListOf<AudioTrack>()

        val currentTracks = player.currentTracks
        currentTracks.groups.forEachIndexed { groupIndex, group ->
            if (group.type == C.TRACK_TYPE_AUDIO) {
                for (trackIndex in 0 until group.length) {
                    if (group.isTrackSupported(trackIndex)) {
                        val format = group.getTrackFormat(trackIndex)
                        tracks.add(
                            AudioTrack(
                                rendererIndex = 1, // Audio is typically renderer 1
                                groupIndex = groupIndex,
                                trackIndex = trackIndex,
                                language = format.language ?: "und",
                                label = format.label ?: "",
                                isSelected = group.isTrackSelected(trackIndex)
                            )
                        )
                    }
                }
            }
        }

        return tracks
    }

    /**
     * Select specific audio track
     */
    fun selectAudioTrack(audioTrack: AudioTrack) {
        val selector = trackSelector ?: return
        val player = exoPlayer ?: return

        val currentTracks = player.currentTracks
        if (audioTrack.groupIndex >= currentTracks.groups.size) return

        val group = currentTracks.groups[audioTrack.groupIndex]
        if (audioTrack.trackIndex >= group.length) return

        val mediaTrackGroup = group.mediaTrackGroup
        val override = TrackSelectionOverride(mediaTrackGroup, audioTrack.trackIndex)

        selector.setParameters(
            selector.buildUponParameters()
                .setOverrideForType(override)
                .build()
        )

        Timber.d("$TAG: Selected audio track: ${audioTrack.getDisplayName()}")
    }

    /**
     * Reset audio track to auto-selection
     */
    fun resetAudioTrack() {
        val selector = trackSelector ?: return

        selector.setParameters(
            selector.buildUponParameters()
                .clearOverridesOfType(C.TRACK_TYPE_AUDIO)
                .build()
        )

        Timber.d("$TAG: Reset audio track to auto")
    }

    // ==================== Subtitle Selection ====================

    /**
     * Get available subtitle options
     */
    fun getAvailableSubtitleOptions(): List<SubtitleOption> {
        val player = exoPlayer ?: return emptyList()
        val options = mutableListOf<SubtitleOption>()

        val currentTracks = player.currentTracks
        currentTracks.groups.forEachIndexed { groupIndex, group ->
            if (group.type == C.TRACK_TYPE_TEXT) {
                for (trackIndex in 0 until group.length) {
                    if (group.isTrackSupported(trackIndex)) {
                        val format = group.getTrackFormat(trackIndex)
                        options.add(
                            SubtitleOption(
                                rendererIndex = 2, // Text is typically renderer 2
                                groupIndex = groupIndex,
                                trackIndex = trackIndex,
                                language = format.language ?: "und",
                                label = format.label ?: "",
                                isSelected = group.isTrackSelected(trackIndex)
                            )
                        )
                    }
                }
            }
        }

        return options
    }

    /**
     * Select specific subtitle
     */
    fun selectSubtitle(subtitleOption: SubtitleOption) {
        val selector = trackSelector ?: return
        val player = exoPlayer ?: return

        val currentTracks = player.currentTracks
        if (subtitleOption.groupIndex >= currentTracks.groups.size) return

        val group = currentTracks.groups[subtitleOption.groupIndex]
        if (subtitleOption.trackIndex >= group.length) return

        val mediaTrackGroup = group.mediaTrackGroup
        val override = TrackSelectionOverride(mediaTrackGroup, subtitleOption.trackIndex)

        val parametersBuilder = selector.buildUponParameters()
            .clearOverridesOfType(C.TRACK_TYPE_TEXT)
            .setOverrideForType(override)
        setTextRenderersDisabled(parametersBuilder, disabled = false)

        selector.setParameters(
            parametersBuilder.build()
        )

        Timber.d("$TAG: Selected subtitle: ${subtitleOption.getDisplayName()}")
    }

    /**
     * Disable subtitles
     */
    fun disableSubtitles() {
        val selector = trackSelector ?: return

        val parametersBuilder = selector.buildUponParameters()
            .clearOverridesOfType(C.TRACK_TYPE_TEXT)
        setTextRenderersDisabled(parametersBuilder, disabled = true)

        selector.setParameters(
            parametersBuilder.build()
        )

        Timber.d("$TAG: Subtitles disabled")
    }

    private fun setTextRenderersDisabled(
        parametersBuilder: DefaultTrackSelector.Parameters.Builder,
        disabled: Boolean
    ) {
        val selector = trackSelector ?: return
        val mappedTrackInfo = selector.currentMappedTrackInfo ?: return

        for (rendererIndex in 0 until mappedTrackInfo.rendererCount) {
            if (mappedTrackInfo.getRendererType(rendererIndex) == C.TRACK_TYPE_TEXT) {
                parametersBuilder.setRendererDisabled(rendererIndex, disabled)
            }
        }
    }

    // ==================== Private Helpers ====================

    private fun buildMediaItem(
        streamUrl: String,
        subtitleConfigs: List<MediaItem.SubtitleConfiguration>
    ): MediaItem {
        return MediaItem.Builder()
            .setUri(streamUrl)
            .setSubtitleConfigurations(subtitleConfigs)
            .build()
    }

    private fun sanitizeStreamUrl(streamUrl: String): String {
        if (!streamUrl.contains('(') && !streamUrl.contains(')')) return streamUrl
        return streamUrl.replace("(", "%28").replace(")", "%29")
    }

    private fun buildDrmMediaItem(
        streamUrl: String,
        drmConfig: DrmConfig,
        subtitleConfigs: List<MediaItem.SubtitleConfiguration>
    ): MediaItem {
        val builder = MediaItem.Builder()
            .setUri(streamUrl)
            .setSubtitleConfigurations(subtitleConfigs)

        if (drmConfig.isClearKey()) {
            drmConfig.getClearKeyLicenseUri()?.let { licenseUri ->
                builder.setDrmConfiguration(
                    MediaItem.DrmConfiguration.Builder(DrmHelper.CLEARKEY_UUID)
                        .setLicenseUri(licenseUri)
                        .build()
                )
            }
        } else if (drmConfig.requiresLicenseServer()) {
            val drmUuid = if (drmConfig.drmType == DrmConfig.DrmType.WIDEVINE)
                DrmHelper.WIDEVINE_UUID else DrmHelper.PLAYREADY_UUID

            builder.setDrmConfiguration(
                MediaItem.DrmConfiguration.Builder(drmUuid)
                    .setLicenseUri(drmConfig.licenseServerUrl)
                    .apply {
                        drmConfig.drmHeaders?.let { setLicenseRequestHeaders(it) }
                    }
                    .build()
            )
        }

        return builder.build()
    }

    private fun createDataSourceFactory(
        proxyUrl: String? = null,
        dohUrl: String? = null,
        customHeaders: Map<String, String> = emptyMap(),
        userAgent: String? = null,
        requiresAuth: Boolean? = null, // null = auto-detect based on streamUrl
        streamUrl: String? = null
    ): DefaultDataSource.Factory {
        val clientBuilder = OkHttpClient.Builder()
            .apply { NetworkSecurityHelper.applyLenientSsl(this) }
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .followRedirects(true)
            .followSslRedirects(true)
            .retryOnConnectionFailure(true)

        // Configure proxy (Support authenticated proxies like PreviewPlayer)
        proxyUrl?.let { proxy ->
            try {
                // Check if it's an authenticated proxy first (user:pass@host:port)
                val match = AuthProxyRegex.find(proxy)
                
                if (match != null) {
                    val (user, pass, host, portStr) = match.destructured
                    val port = portStr.toIntOrNull() ?: 80
                    clientBuilder.proxy(java.net.Proxy(java.net.Proxy.Type.HTTP, java.net.InetSocketAddress(host, port)))
                        .proxyAuthenticator { _, response ->
                            val credential = okhttp3.Credentials.basic(user, pass)
                            response.request.newBuilder()
                                .header("Proxy-Authorization", credential)
                                .build()
                        }
                    Timber.d("$TAG: Configured authenticated proxy for $host:$port")
                } else {
                    // Standard proxy
                    val uri = Uri.parse(proxy)
                    val host = uri.host ?: return@let
                    val port = uri.port.takeIf { it > 0 } ?: 8080
                    clientBuilder.proxy(java.net.Proxy(java.net.Proxy.Type.HTTP, java.net.InetSocketAddress(host, port)))
                    Timber.d("$TAG: Configured standard proxy for $host:$port")
                }
            } catch (e: Exception) {
                Timber.w("$TAG: Failed to configure proxy: ${e.message}")
            }
        }

        // Configure DoH
        if (!dohUrl.isNullOrBlank()) {
            NetworkSecurityHelper.configureOkHttpClientBuilder(clientBuilder, dohUrl)
        }

        val okHttpClient = clientBuilder.build()
        
        // Build headers with auth token
        val headers = mutableMapOf<String, String>()
        headers.putAll(customHeaders)
        
        // Determine if we should inject JWT: auto-detect based on stream URL if not specified
        val shouldInjectAuth = when (requiresAuth) {
            true -> true
            false -> false
            null -> isLikelyInternalStream(streamUrl)
        }
        
        if (shouldInjectAuth && !headers.containsKey("Authorization")) {
            runBlocking {
                tokenManager.getAccessToken().first()
            }?.let { token ->
                headers["Authorization"] = "Bearer $token"
                Timber.d("$TAG: Auto-injected Authorization token (internal stream)")
            }
        } else if (!shouldInjectAuth) {
            Timber.d("$TAG: Skipping Authorization injection (external stream: ${streamUrl?.take(60)})")
        }

        // Respect per-channel custom User-Agent if provided; otherwise fallback to global UA.
        val uaFromHeaders = headers["User-Agent"]?.trim()?.takeIf { it.isNotEmpty() }
        val uaFromParam = userAgent?.trim()?.takeIf { it.isNotEmpty() }
        val uaFromGlobal = userAgentManager.getCurrentUserAgent()?.trim()?.takeIf { it.isNotEmpty() }

        val (effectiveUa, uaSource) = when {
            uaFromHeaders != null -> uaFromHeaders to "customHeaders"
            uaFromParam != null -> uaFromParam to "param"
            uaFromGlobal != null -> uaFromGlobal to "global"
            else -> "IPTV-Android/1.0" to "default"
        }
        headers["User-Agent"] = effectiveUa

        // Keep factory UA and request-properties UA consistent (OkHttpDataSource can override otherwise).
        val okHttpDataSourceFactory = OkHttpDataSource.Factory(okHttpClient)
            .setUserAgent(effectiveUa)

        // Debug (safe): log which headers will be sent without leaking auth tokens.
        val headerKeysForLog = headers.keys
            .filterNot { it.equals("Authorization", ignoreCase = true) }
            .sorted()
        Timber.d(
            "$TAG: Stream request headers prepared (uaSource=$uaSource, ua=${effectiveUa.take(80)}, " +
                "origin=${headers.containsKey("Origin")}, referer=${headers.containsKey("Referer")}, keys=$headerKeysForLog)"
        )

        okHttpDataSourceFactory.setDefaultRequestProperties(headers)
            

        return DefaultDataSource.Factory(context, okHttpDataSourceFactory)
    }

    private fun setupPlayerListener() {
        playerListener = object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                when (state) {
                    Player.STATE_IDLE -> {
                        Timber.d("$TAG: Playback idle")
                    }
                    Player.STATE_BUFFERING -> {
                        Timber.d("$TAG: Playback buffering")
                    }
                    Player.STATE_READY -> {
                        pendingPlaybackReadyToken?.let { token ->
                            DebugPerformanceTracer.end(
                                metric = "playback_to_ready_ms",
                                token = token,
                                attributes = pendingPlaybackAttributes + ("state" to "ready")
                            )
                            pendingPlaybackReadyToken = null
                        }
                        pendingZapReadyToken?.let { token ->
                            DebugPerformanceTracer.end(
                                metric = "channel_zap_to_ready_ms",
                                token = token,
                                attributes = mapOf("channelId" to token, "state" to "ready")
                            )
                            pendingZapReadyToken = null
                        }
                        onDurationUpdate?.invoke(exoPlayer?.duration ?: 0L)
                    }
                    Player.STATE_ENDED -> {
                        Timber.d("$TAG: Playback ended")
                    }
                }
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                onPlayingStateChanged?.invoke(isPlaying)
            }

            override fun onPlayerError(error: PlaybackException) {
                Timber.e("$TAG: Player error: ${error.message}")
                DebugPerformanceTracer.mark(
                    metric = "playback_error",
                    attributes = mapOf("message" to (error.message ?: "unknown"))
                )
                pendingPlaybackReadyToken?.let { DebugPerformanceTracer.cancel("playback_to_ready_ms", it) }
                pendingPlaybackFirstFrameToken?.let { DebugPerformanceTracer.cancel("playback_to_first_frame_ms", it) }
                pendingZapReadyToken?.let { DebugPerformanceTracer.cancel("channel_zap_to_ready_ms", it) }
                pendingZapFirstFrameToken?.let { DebugPerformanceTracer.cancel("channel_zap_to_first_frame_ms", it) }
                pendingPlaybackReadyToken = null
                pendingPlaybackFirstFrameToken = null
                pendingZapReadyToken = null
                pendingZapFirstFrameToken = null
                onError?.invoke(error)
            }

            override fun onPositionDiscontinuity(
                oldPosition: Player.PositionInfo,
                newPosition: Player.PositionInfo,
                reason: Int
            ) {
                onPositionUpdate?.invoke(newPosition.positionMs)
            }

            override fun onRenderedFirstFrame() {
                pendingPlaybackFirstFrameToken?.let { token ->
                    DebugPerformanceTracer.end(
                        metric = "playback_to_first_frame_ms",
                        token = token,
                        attributes = pendingPlaybackAttributes + ("event" to "first_frame")
                    )
                    pendingPlaybackFirstFrameToken = null
                }
                pendingZapFirstFrameToken?.let { token ->
                    DebugPerformanceTracer.end(
                        metric = "channel_zap_to_first_frame_ms",
                        token = token,
                        attributes = mapOf("channelId" to token, "event" to "first_frame")
                    )
                    pendingZapFirstFrameToken = null
                }
            }
        }

        exoPlayer?.addListener(playerListener!!)
    }

    /**
     * Check if a stream URL points to our own server (internal) vs an external service.
     * JWT should only be sent to internal streams — external URLs (Google, CDNs) would reject it.
     */
    private fun isLikelyInternalStream(streamUrl: String?): Boolean {
        if (streamUrl.isNullOrBlank()) return true // Default to internal if unknown
        return try {
            val uri = Uri.parse(streamUrl)
            val host = uri.host?.lowercase() ?: return false
            val apiHost = try {
                Uri.parse(BuildConfig.API_BASE_URL).host?.lowercase()
            } catch (_: Exception) { null }

            when {
                apiHost != null && host.equals(apiHost, ignoreCase = true) -> true
                host == "localhost" || host == "10.0.2.2" || host == "127.0.0.1" -> true
                host.startsWith("192.168.") || host.startsWith("10.") || host.startsWith("172.") -> true
                else -> false
            }
        } catch (_: Exception) {
            false
        }
    }
}
