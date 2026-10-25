package com.streamcore.tv.presentation.player

import androidx.annotation.OptIn
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import com.streamcore.tv.core.error.ErrorHandler
import com.streamcore.tv.core.network.PlaybackHeaderBuilder
import com.streamcore.tv.domain.model.*
import com.streamcore.tv.domain.usecase.content.GetContentDetailsUseCase
import com.streamcore.tv.domain.usecase.content.GetContentStreamUseCase
import com.streamcore.tv.domain.usecase.user.UpdateWatchProgressUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

enum class PlayerType { EXO }

/**
 * Advanced ViewModel for Player Screen with ExoPlayer integration
 * 
 * Handles video playback with advanced features like quality selection,
 * subtitles, playback speed, and progress tracking
 */
@HiltViewModel
class AdvancedPlayerViewModel @Inject constructor(
    private val getContentDetailsUseCase: GetContentDetailsUseCase,
    private val getContentStreamUseCase: GetContentStreamUseCase,
    private val updateWatchProgressUseCase: UpdateWatchProgressUseCase,
    private val exoPlayerManager: ExoPlayerManager,
    private val errorHandler: ErrorHandler
) : ViewModel() {

    private val _uiState = MutableStateFlow(AdvancedPlayerUiState())
    val uiState: StateFlow<AdvancedPlayerUiState> = _uiState.asStateFlow()

    // Quality monitoring job
    private var qualityMonitoringJob: Job? = null
    private var lastProgressSaveMs: Long = 0L

    init {
        Timber.d("AdvancedPlayerViewModel initialized")
        setupPlayerCallbacks()
        startQualityMonitoring()
    }

    /**
     * Get ExoPlayer instance
     */
    val exoPlayerState: StateFlow<ExoPlayer?>
        get() = exoPlayerManager.playerState

    fun getExoPlayer(): ExoPlayer? = exoPlayerManager.exoPlayer



    /**
     * Load content for playback
     */
    fun loadContent(contentId: String) {
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    contentState = UiState.Loading,
                    error = null
                )
            }

            try {
                Timber.d("Loading content for playback: $contentId")

                // For encrypted content, use getContentStream to get decrypted URL
                // Otherwise, use getContentDetails for regular content
                when (val result = getContentStreamUseCase(contentId)) {
                    is Result.Success -> {
                        val contentStream = result.data
                        Timber.d("Content stream loaded successfully: ${contentStream.title}")

                        // Convert ContentStream to ContentDetails for UI compatibility
                        val contentDetails = contentStream.toContentDetails()
                        _uiState.update {
                            it.copy(
                                contentState = UiState.Success(contentDetails),
                                error = null
                            )
                        }

                        // Start playback with LiveTV headers support
                        startPlaybackWithContentStream(contentStream)
                    }

                    is Result.Error -> {
                        val errorMessage = errorHandler.getErrorMessage(result.exception)
                        Timber.e("Failed to load content stream: $errorMessage", result.exception)

                        // Fallback to getContentDetails if getContentStream fails
                        Timber.d("Falling back to getContentDetails...")
                        when (val fallbackResult = getContentDetailsUseCase(contentId)) {
                            is Result.Success -> {
                                val content = fallbackResult.data
                                Timber.d("Content details loaded successfully: ${content.title}")

                                _uiState.update {
                                    it.copy(
                                        contentState = UiState.Success(content),
                                        error = null
                                    )
                                }

                                // Start playback with LiveTV headers support
                                startPlaybackWithContent(content.toContentItem())
                            }

                            is Result.Error -> {
                                val fallbackErrorMessage = errorHandler.getErrorMessage(fallbackResult.exception)
                                Timber.e("Failed to load content details: $fallbackErrorMessage", fallbackResult.exception)
                                _uiState.update {
                                    it.copy(
                                        contentState = UiState.Error(fallbackErrorMessage),
                                        error = fallbackErrorMessage
                                    )
                                }
                            }

                            is Result.Loading -> {
                                Timber.d("Unexpected loading state in content details fallback")
                            }
                        }
                    }

                    is Result.Loading -> {
                        // Should not happen in this use case
                        Timber.d("Unexpected loading state in content stream loading")
                    }
                }
            } catch (e: Exception) {
                val errorMessage = errorHandler.getErrorMessage(e)
                Timber.e("Content loading exception: $errorMessage", e)
                _uiState.update {
                    it.copy(
                        contentState = UiState.Error(errorMessage),
                        error = errorMessage
                    )
                }
            }
        }
    }

    /**
     * Start playback with stream URL
     */
    private fun startPlayback(
        streamUrl: String,
        subtitleConfigs: List<MediaItem.SubtitleConfiguration> = emptyList()
    ) {
        viewModelScope.launch {
            try {
                Timber.d("▶ Using ExoPlayer for playback")
                _uiState.update { it.copy(playerType = PlayerType.EXO) }
                exoPlayerManager.prepareAndPlayWithAnalysis(streamUrl, subtitleConfigs = subtitleConfigs)
                
                // Update available qualities after a short delay
                delay(1500)
                updateAvailableQualities()
            } catch (e: Exception) {
                val errorMessage = errorHandler.getErrorMessage(e)
                Timber.e("Playback start exception: $errorMessage", e)
                _uiState.update {
                    it.copy(
                        contentState = UiState.Error(errorMessage),
                        error = errorMessage
                    )
                }
            }
        }
    }

    /**
     * Start playback with ContentStream (supports DRM and encryption)
     */
    private fun startPlaybackWithContentStream(contentStream: ContentStream) {
        viewModelScope.launch {
            try {
                Timber.d("🎬 Starting playback with ContentStream: ${contentStream.title}")

                // Media3 (ExoPlayer) handle everything now
                _uiState.update { 
                    it.copy(
                        playerType = PlayerType.EXO,
                        error = null
                    ) 
                }

                // Fallback to ExoPlayer logic
                _uiState.update { it.copy(playerType = PlayerType.EXO) }
                
                val subtitleConfigs = exoPlayerManager.createSubtitleConfigurations(
                    contentStream.subtitleTracks,
                    contentStream.subtitleUrl
                )

                // Build per-channel headers (origin, referer, user-agent, custom)
                // so they are applied to ALL playback paths, not just the non-DRM path.
                val headerResult = PlaybackHeaderBuilder.build(
                    userAgent = contentStream.userAgent,
                    referer = contentStream.referer,
                    origin = contentStream.origin,
                    customHeaders = contentStream.customHeaders,
                    fallbackRefererFromUrl = contentStream.streamUrl
                )
                val channelHeaders = headerResult.headers

                when {
                    !contentStream.drmKeys.isNullOrBlank() -> {
                        // Prefer canonical kid:key hex over JSON when available.
                        Timber.d("🔐 Using ClearKey DRM playback (hex keys)")
                        exoPlayerManager.prepareAndPlayWithDrm(
                            streamUrl = contentStream.streamUrl,
                            drmKeysExo = null,
                            drmKeysHex = contentStream.drmKeys,
                            proxyUrl = contentStream.proxyUrl,
                            subtitleConfigs = subtitleConfigs,
                            dohUrl = contentStream.dohUrl,
                            customHeaders = channelHeaders,
                            drmType = contentStream.drmType,
                            licenseServerUrl = contentStream.licenseServerUrl,
                            drmHeaders = contentStream.drmHeaders,
                            userAgent = contentStream.userAgent
                        )
                    }
                    !contentStream.drmKeysExo.isNullOrBlank() -> {
                        // Fallback to drm_keys_exo when hex keys are not available
                        Timber.d("🔐 Using DRM playback (ExoPlayer JSON)")
                        exoPlayerManager.prepareAndPlayWithDrm(
                            streamUrl = contentStream.streamUrl,
                            drmKeysExo = contentStream.drmKeysExo,
                            proxyUrl = contentStream.proxyUrl,
                            subtitleConfigs = subtitleConfigs,
                            dohUrl = contentStream.dohUrl,
                            customHeaders = channelHeaders,
                            drmType = contentStream.drmType,
                            licenseServerUrl = contentStream.licenseServerUrl,
                            drmHeaders = contentStream.drmHeaders,
                            userAgent = contentStream.userAgent
                        )
                    }
                    else -> {
                        val hasHeaders = channelHeaders.isNotEmpty()

                        if (hasHeaders) {
                            Timber.d("🔧 Using LiveTV headers for content: ${contentStream.title}")
                            val contentItem = ContentItem(
                                id = contentStream.id,
                                title = contentStream.title,
                                description = contentStream.description,
                                imageUrl = contentStream.imageUrl,
                                backdropUrl = null,
                                duration = null,
                                year = contentStream.year,
                                rating = null,
                                genres = emptyList(),
                                type = ContentType.MOVIE,
                                streamUrl = contentStream.streamUrl,

                                createdAt = contentStream.createdAt,
                                updatedAt = contentStream.createdAt,
                                isLive = false,
                                drmKeys = contentStream.drmKeys,
                                origin = contentStream.origin,
                                userAgent = contentStream.userAgent,
                                referer = contentStream.referer,
                                customHeaders = contentStream.customHeaders,
                                proxyUrl = contentStream.proxyUrl,
                                dohUrl = contentStream.dohUrl,
                                subtitleUrl = contentStream.subtitleUrl,
                                subtitleTracks = contentStream.subtitleTracks
                            )
                            exoPlayerManager.prepareAndPlayWithContent(contentItem)
                        } else {
                            Timber.d("📺 Using regular playback with analysis")
                            exoPlayerManager.prepareAndPlayWithAnalysis(
                                streamUrl = contentStream.streamUrl,
                                subtitleConfigs = subtitleConfigs,
                                proxyUrl = contentStream.proxyUrl,
                                dohUrl = contentStream.dohUrl
                            )
                        }
                    }
                }

                // Update available qualities after a short delay
                delay(1500)
                updateAvailableQualities()

                // Update available audio tracks
                delay(1000)
                val audioTracks = getAvailableAudioTracks()
                _uiState.update {
                    it.copy(
                        availableAudioTracks = audioTracks,
                        selectedAudioTrack = audioTracks.firstOrNull { track -> track.isSelected }
                    )
                }
                Timber.d("🎵 Updated audio tracks: ${audioTracks.size} tracks available")
            } catch (e: Exception) {
                val errorMessage = errorHandler.getErrorMessage(e)
                Timber.e("ContentStream playback start exception: $errorMessage", e)
                _uiState.update {
                    it.copy(
                        contentState = UiState.Error(errorMessage),
                        error = errorMessage
                    )
                }
            }
        }
    }

    /**
     * Start playback with ContentItem (supports LiveTV headers)
     */
    private fun startPlaybackWithContent(content: ContentItem) {
        viewModelScope.launch {
            try {
                Timber.d("🎬 Starting playback with LiveTV headers support: ${content.title}")
                
                _uiState.update { it.copy(playerType = PlayerType.EXO) }

                // Check if this is LiveTV content with headers configured
                val hasHeaders = content.origin != null ||
                        content.userAgent != null ||
                        content.referer != null ||
                        content.customHeaders != null

                if (hasHeaders) {
                    Timber.d("🔧 Using LiveTV headers for content: ${content.title}")
                    exoPlayerManager.prepareAndPlayWithContent(content)
                } else {
                    // Fall back to regular playback
                    Timber.d("📺 No LiveTV headers configured, using regular playback")
                    content.streamUrl?.let { url ->
                        val subtitleConfigs = exoPlayerManager.createSubtitleConfigurations(
                            content.subtitleTracks,
                            content.subtitleUrl
                        )
                        exoPlayerManager.prepareAndPlayWithAnalysis(
                            url,
                            subtitleConfigs = subtitleConfigs,
                            proxyUrl = content.proxyUrl,
                            dohUrl = content.dohUrl
                        )
                    }
                }

                // Update available qualities after a short delay
                delay(1500)
                updateAvailableQualities()

                // Update available audio tracks
                delay(1000)
                val audioTracks = getAvailableAudioTracks()
                _uiState.update {
                    it.copy(
                        availableAudioTracks = audioTracks,
                        selectedAudioTrack = audioTracks.firstOrNull { track -> track.isSelected }
                    )
                }
                Timber.d("🎵 Updated audio tracks: ${audioTracks.size} tracks available")
            } catch (e: Exception) {
                val errorMessage = errorHandler.getErrorMessage(e)
                Timber.e("Playback start exception: $errorMessage", e)
                _uiState.update {
                    it.copy(
                        contentState = UiState.Error(errorMessage),
                        error = errorMessage
                    )
                }
            }
        }
    }

    /**
     * Toggle play/pause
     */
    fun togglePlayPause() {
        exoPlayerManager.togglePlayPause()
        Timber.d("Play/pause toggled")
    }

    /**
     * Seek to position
     */
    fun seekTo(position: Long) {
        exoPlayerManager.seekTo(position)
        _uiState.update { it.copy(currentPosition = position) }
        Timber.d("Seeked to position: $position")

        // Update watch progress
        updateWatchProgress()
    }

    /**
     * Set volume
     */
    fun setVolume(volume: Float) {
        exoPlayerManager.setVolume(volume)
        _uiState.update { it.copy(volume = volume) }
        Timber.d("Volume set to: $volume")
    }

    /**
     * Set playback speed
     */
    fun setPlaybackSpeed(speed: Float) {
        exoPlayerManager.exoPlayer?.setPlaybackSpeed(speed)
        _uiState.update { it.copy(playbackSpeed = speed) }
        Timber.d("Playback speed set to: $speed")
    }

    /**
     * Toggle subtitles
     */
    fun toggleSubtitles() {
        val newState = !_uiState.value.subtitlesEnabled
        _uiState.update { it.copy(subtitlesEnabled = newState) }
        Timber.d("Subtitles toggled: $newState")
        
        // If enabling, keep currently selected or default subtitle. If disabling, disable renderer.
        if (!newState) {
            try { exoPlayerManager.disableSubtitles() } catch (_: Exception) {}
        }
    }

    /**
     * Change video quality
     */
    fun changeQuality(quality: String) {
        Timber.d("AdvancedPlayerViewModel: Changing quality to: $quality")

        // Update UI state
        _uiState.update { it.copy(selectedQuality = quality) }

        // If it's "Auto", reset to automatic selection
        if (quality == "Auto") {
            exoPlayerManager.resetVideoQuality()
            Timber.d("AdvancedPlayerViewModel: Reset to automatic video quality selection")
            return
        }

        // Find the corresponding VideoTrack and select it
        val availableQualities = getAvailableVideoTracks()
        val selectedTrack = availableQualities.find { it.getDisplayName() == quality }

        if (selectedTrack != null) {
            exoPlayerManager.selectVideoQuality(selectedTrack)
            Timber.d("AdvancedPlayerViewModel: Selected video quality: ${selectedTrack.getDisplayName()}")
        } else {
            Timber.e("AdvancedPlayerViewModel: Could not find video track for quality: $quality")
        }
    }

    /**
     * Update current position
     */
    fun updatePosition() {
        val currentPos = exoPlayerManager.currentPosition
        val duration = exoPlayerManager.duration
        val buffered = exoPlayerManager.bufferedPercentage

        _uiState.update {
            it.copy(
                currentPosition = currentPos,
                duration = duration,
                bufferedPercentage = buffered
                // isPlaying is now handled by onPlayingStateChanged callback
            )
        }

        // Periodically update watch progress (every 15 seconds)
        if (System.currentTimeMillis() - lastProgressSaveMs >= 15_000L) {
            lastProgressSaveMs = System.currentTimeMillis()
            updateWatchProgress()
        }
    }

    /**
     * Clear error message
     */
    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    /**
     * Release player resources
     */
    fun releasePlayer() {
        Timber.d("Releasing player resources")
        updateWatchProgress() // Save final progress
        
        try {
            exoPlayerManager.release()
        } catch (e: Exception) {
            Timber.e(e, "Error releasing ExoPlayer")
        }
    }

    /**
     * Start quality monitoring to log current video quality every 2 seconds
     */
    private fun startQualityMonitoring() {
        stopQualityMonitoring() // Stop any existing monitoring

        qualityMonitoringJob = viewModelScope.launch {
            while (isActive) {
                try {
                    logCurrentVideoQuality()
                } catch (e: Exception) {
                    Timber.e("Error monitoring video quality: ${e.message}", e)
                }
                delay(2000) // Log every 2 seconds
            }
        }
    }

    /**
     * Stop quality monitoring
     */
    private fun stopQualityMonitoring() {
        qualityMonitoringJob?.cancel()
        qualityMonitoringJob = null
    }

    /**
     * Log current video quality information with detailed diagnostics
     */
    @OptIn(UnstableApi::class)
    private fun logCurrentVideoQuality() {
        val player = getExoPlayer() ?: run {
            Timber.d("🎥 CURRENT VIDEO QUALITY: ExoPlayer is null")
            return
        }

        try {
            // Get current track information
            val videoFormat = player.videoFormat
            if (videoFormat != null) {
                val width = videoFormat.width
                val height = videoFormat.height
                val bitrate = videoFormat.bitrate
                val frameRate = videoFormat.frameRate
                val mimeType = videoFormat.sampleMimeType ?: "unknown"
                val codec = videoFormat.codecs ?: "unknown"

                // Calculate bitrate in Mbps
                val bitrateMbps = if (bitrate > 0) {
                    String.format(java.util.Locale.getDefault(), "%.2f", bitrate.toDouble() / (1024 * 1024))
                } else {
                    "unknown"
                }

                // Get quality label
                val qualityLabel = when {
                    width >= 3840 && height >= 2160 -> "4K UHD"
                    width >= 1920 && height >= 1080 -> "1080p FHD"
                    width >= 1280 && height >= 720 -> "720p HD"
                    width >= 854 && height >= 480 -> "480p"
                    width >= 640 && height >= 360 -> "360p"
                    else -> "${width}x${height}"
                }

                // Get playback statistics
                val playbackStats = player.playbackState
                val isPlaying = player.isPlaying

                // Get track selector information
                val trackSelector = exoPlayerManager.trackSelector
                val mappedTrackInfo = trackSelector?.currentMappedTrackInfo

                // Check if we have track selection info
                val trackSelectionInfo = if (mappedTrackInfo != null) {
                    val videoRendererIndex = (0 until mappedTrackInfo.rendererCount)
                        .firstOrNull { renderer -> mappedTrackInfo.getRendererType(renderer) == androidx.media3.common.C.TRACK_TYPE_VIDEO }

                    if (videoRendererIndex != null) {
                        @Suppress("DEPRECATION")
                        val currentTrackSelection = player.currentTrackSelections.get(videoRendererIndex)
                        if (currentTrackSelection != null && currentTrackSelection.length() > 0) {
                            val selectedTrackIndex = currentTrackSelection.getIndexInTrackGroup(0)
                            "Selected track: renderer=$videoRendererIndex, track=$selectedTrackIndex"
                        } else {
                            "No track selection found"
                        }
                    } else {
                        "No video renderer found"
                    }
                } else {
                    "TrackSelector not available"
                }

                Timber.d("🎥 CURRENT VIDEO QUALITY: $qualityLabel (${width}x${height}) | ${bitrateMbps} Mbps | ${String.format(java.util.Locale.getDefault(), "%.1f", frameRate)} fps | $mimeType | Codec: $codec | Playing: $isPlaying | State: $playbackStats")
                Timber.d("🎥 TRACK INFO: $trackSelectionInfo")

                // Also log selected quality from UI state
                val selectedQuality = _uiState.value.selectedQuality
                if (selectedQuality != "Auto") {
                    Timber.d("🎯 UI SELECTED QUALITY: $selectedQuality")

                    // Check if the current format matches what we expect for the selected quality
                    val expectedQuality = when (selectedQuality) {
                        "720p HD" -> width >= 1280 && height >= 720
                        "360p" -> width >= 640 && height >= 360
                        "480p" -> width >= 854 && height >= 480
                        "1080p FHD" -> width >= 1920 && height >= 1080
                        "4K UHD" -> width >= 3840 && height >= 2160
                        else -> true
                    }

                    if (!expectedQuality) {
                        Timber.e("❌ QUALITY MISMATCH: UI shows '$selectedQuality' but current format is ${width}x${height}!")
                    } else {
                        Timber.d("✅ QUALITY MATCH: UI selection matches current format")
                    }
                } else {
                    Timber.d("🎯 UI QUALITY: Auto (Adaptive)")
                }

                // Log available qualities for debugging
                val availableQualities = getAvailableVideoTracks()
                if (availableQualities.isNotEmpty()) {
                    Timber.d("🎯 AVAILABLE QUALITIES: ${availableQualities.joinToString(", ") { track -> "${track.getDisplayName()} (${track.width}x${track.height})" }}")
                }

            } else {
                Timber.d("🎥 CURRENT VIDEO QUALITY: No video format available - player may not be prepared yet")
            }
        } catch (e: Exception) {
            Timber.e("Error getting video quality info: ${e.message}", e)
        }
    }

    /**
     * Clean up resources when ViewModel is cleared
     */
    override fun onCleared() {
        super.onCleared()
        Timber.d("AdvancedPlayerViewModel cleared, releasing player resources")
        stopQualityMonitoring()
        releasePlayer()
    }

    /**
     * Setup player callbacks
     */
    private fun setupPlayerCallbacks() {
        exoPlayerManager.onError = { exception ->
            val errorMessage = errorHandler.getErrorMessage(exception)
            Timber.e("Player error: $errorMessage", exception)
            _uiState.update {
                it.copy(
                    contentState = UiState.Error(errorMessage),
                    error = errorMessage,
                    isPlaying = false
                )
            }
        }

        exoPlayerManager.onPositionUpdate = { position ->
            _uiState.update { it.copy(currentPosition = position) }
        }

        exoPlayerManager.onPlayingStateChanged = { playing ->
            _uiState.update { it.copy(isPlaying = playing) }
        }
    }

    /**
     * Update watch progress in background
     */
    private fun updateWatchProgress() {
        val currentState = _uiState.value
        val content = (currentState.contentState as? UiState.Success)?.data ?: return

        if (currentState.duration > 0) {
            val progress = currentState.currentPosition.toFloat() / currentState.duration.toFloat()

            viewModelScope.launch {
                try {
                    updateWatchProgressUseCase(
                        contentId = content.id,
                        progress = progress,
                        duration = currentState.duration
                    )
                    Timber.d("Watch progress updated for content: $progress")
                } catch (e: Exception) {
                    Timber.e("Failed to update watch progress", e)
                    // Don't show error to user for background operation
                }
            }
        }
    }

    // Audio Track Management Methods

    /**
     * Toggle audio track selector
     */
    fun toggleAudioSelector() {
        Timber.d("AdvancedPlayerViewModel: Audio selector toggle requested")

        // Ensure audio tracks are loaded when selector is opened
        val availableTracks = getAvailableAudioTracks()
        _uiState.update {
            it.copy(
                availableAudioTracks = availableTracks,
                selectedAudioTrack = availableTracks.find { track -> track.isSelected } ?: availableTracks.firstOrNull()
            )
        }
    }

    /**
     * Get available audio tracks
     */
    fun getAvailableAudioTracks() = exoPlayerManager.getAvailableAudioTracks()

    /**
     * Get available video qualities
     */
    fun getAvailableVideoTracks() = exoPlayerManager.getAvailableVideoTracks()

    /**
     * Update available qualities from current video tracks
     */
    private fun updateAvailableQualities() {
        try {
            val videoQualities = getAvailableVideoTracks()
            val qualityNames = mutableListOf("Auto") // Always include Auto option

            // Add actual quality names from video tracks
            videoQualities.forEach { track ->
                val displayName = track.getDisplayName()
                if (!qualityNames.contains(displayName)) {
                    qualityNames.add(displayName)
                }
            }

            _uiState.update {
                it.copy(
                    availableQualities = qualityNames,
                    availableVideoQualities = videoQualities,
                    selectedQuality = "Auto" // Reset to Auto when updating available qualities
                )
            }

            Timber.d("AdvancedPlayerViewModel: Updated available qualities: ${qualityNames.joinToString(", ")}")
        } catch (e: Exception) {
            Timber.e("AdvancedPlayerViewModel: Error updating available qualities: ${e.message}", e)
            // Fallback to basic qualities
            _uiState.update {
                it.copy(
                    availableQualities = listOf("Auto", "1080p", "720p", "480p"),
                    availableVideoQualities = emptyList(),
                    selectedQuality = "Auto"
                )
            }
        }
    }

    /**
     * Select audio track
     */
    fun selectAudioTrack(audioTrack: com.streamcore.tv.domain.model.AudioTrack) {
        exoPlayerManager.selectAudioTrack(audioTrack)
        Timber.d("AdvancedPlayerViewModel: Audio track selected: ${audioTrack.label}")

        // Update UI state
        val availableTracks = getAvailableAudioTracks()
        _uiState.update {
            it.copy(
                availableAudioTracks = availableTracks,
                selectedAudioTrack = audioTrack
            )
        }
    }

    fun resetAudioTrack() {
        exoPlayerManager.resetAudioTrack()
        Timber.d("AdvancedPlayerViewModel: Audio track reset to auto")

        // Update UI state
        val availableTracks = getAvailableAudioTracks()
        _uiState.update {
            it.copy(
                availableAudioTracks = availableTracks,
                selectedAudioTrack = null
            )
        }
    }

    // Subtitle helpers (selection via ExoPlayerManager)

    fun getAvailableSubtitleOptions() = exoPlayerManager.getAvailableSubtitleOptions()

    fun selectSubtitleOption(option: com.streamcore.tv.domain.model.SubtitleOption) {
        exoPlayerManager.selectSubtitle(option)
        Timber.d("AdvancedPlayerViewModel: Subtitle selected: ${option.label}")
    }

    fun resetSubtitles() {
        exoPlayerManager.disableSubtitles()
        Timber.d("AdvancedPlayerViewModel: Subtitles disabled")
    }
}

/**
 * Extension function to convert ContentStream to ContentDetails for UI compatibility
 */
private fun ContentStream.toContentDetails(): ContentDetails {
    return ContentDetails(
        id = this.id,
        title = this.title,
        description = this.description ?: "",
        imageUrl = this.imageUrl ?: "",
        posterUrl = this.imageUrl ?: "",
        backdropUrl = null,
        duration = null,
        year = this.year,
        rating = null,
        genres = emptyList(),
        type = ContentType.MOVIE, // Default to MOVIE for encrypted content
        originalType = null,
        streamUrl = this.streamUrl,

        cast = null,
        director = null,
        trailer = null,
        episodes = null,
        seasons = null,
        relatedContent = null,
        createdAt = this.createdAt,
        updatedAt = this.createdAt,
        origin = this.origin,
        userAgent = this.userAgent,
        referer = this.referer,
        customHeaders = this.customHeaders,
        subtitleUrl = this.subtitleUrl,
        subtitleTracks = this.subtitleTracks
    )
}

/**
 * UI State for Advanced Player Screen
 */
data class AdvancedPlayerUiState(
    val contentState: UiState<ContentDetails> = UiState.Loading,
    val isPlaying: Boolean = false,
    val currentPosition: Long = 0L,
    val duration: Long = 0L,
    val bufferedPercentage: Int = 0,
    val volume: Float = 1.0f,
    val playbackSpeed: Float = 1.0f,
    val subtitlesEnabled: Boolean = false,
    val availableQualities: List<String> = emptyList(),
    val availableVideoQualities: List<VideoTrack> = emptyList(),
    val selectedQuality: String = "Auto",
    val availableAudioTracks: List<AudioTrack> = emptyList(),
    val selectedAudioTrack: AudioTrack? = null,
    val error: String? = null,
    val playerType: PlayerType = PlayerType.EXO
)
