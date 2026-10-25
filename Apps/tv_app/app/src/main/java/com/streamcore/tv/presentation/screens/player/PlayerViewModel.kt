package com.streamcore.tv.presentation.screens.player

import android.net.Uri
import android.view.Surface
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.exoplayer.ExoPlayer
import com.streamcore.tv.domain.model.*
import com.streamcore.tv.domain.usecase.content.GetContentStreamUseCase
import com.streamcore.tv.domain.usecase.content.GetLiveTVChannelsUseCase
import com.streamcore.tv.domain.usecase.content.GetTvChannelCategoriesUseCase
import com.streamcore.tv.presentation.player.ExoPlayerManager
import com.streamcore.tv.presentation.player.MpvPlayerManager
import com.streamcore.tv.core.network.PlaybackHeaderBuilder
import com.streamcore.tv.domain.usecase.player.GetPlaybackProgressUseCase
import com.streamcore.tv.domain.usecase.player.SavePlaybackProgressUseCase
import com.streamcore.tv.data.local.datastore.UserPreferencesManager
import com.streamcore.tv.data.local.datastore.TokenManager
import com.streamcore.tv.BuildConfig
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

/**
 * Player ViewModel for PlayerScreen
 * 
 * Handles both Live TV and VOD content playback with full controls
 */
@HiltViewModel
class PlayerViewModel @Inject constructor(
    private val exoPlayerManager: ExoPlayerManager,
    private val mpvPlayerManager: MpvPlayerManager,
    private val getContentStreamUseCase: GetContentStreamUseCase,
    private val getLiveTVChannelsUseCase: GetLiveTVChannelsUseCase,
    private val getTvChannelCategoriesUseCase: GetTvChannelCategoriesUseCase,
    private val savePlaybackProgressUseCase: SavePlaybackProgressUseCase,
    private val getPlaybackProgressUseCase: GetPlaybackProgressUseCase,
    private val userPreferencesManager: UserPreferencesManager,
    private val tokenManager: TokenManager,
    private val contentRepository: com.streamcore.tv.domain.repository.ContentRepository
) : ViewModel() {

    companion object {
        private const val TAG = "PlayerViewModel"
    }

    // UI State
    private val _uiState = MutableStateFlow(PlayerUiState())
    val uiState: StateFlow<PlayerUiState> = _uiState.asStateFlow()

    // ExoPlayer state
    private val _exoPlayerState = MutableStateFlow<ExoPlayer?>(null)
    val exoPlayerState: StateFlow<ExoPlayer?> = _exoPlayerState.asStateFlow()

    // Live TV channels
    private val _liveTVChannels = MutableStateFlow<List<ContentStream>>(emptyList())
    val liveTVChannels: StateFlow<List<ContentStream>> = _liveTVChannels.asStateFlow()

    // Channel categories
    private val _channelCategories = MutableStateFlow<List<String>>(emptyList())
    val channelCategories: StateFlow<List<String>> = _channelCategories.asStateFlow()

    private val _selectedChannelCategory = MutableStateFlow<String?>(null)
    val selectedChannelCategory: StateFlow<String?> = _selectedChannelCategory.asStateFlow()

    // Sidebar visibility
    private val _isChannelSidebarVisible = MutableStateFlow(false)
    val isChannelSidebarVisible: StateFlow<Boolean> = _isChannelSidebarVisible.asStateFlow()

    // Audio selector visibility
    private val _isAudioSelectorVisible = MutableStateFlow(false)
    val isAudioSelectorVisible: StateFlow<Boolean> = _isAudioSelectorVisible.asStateFlow()

    // Subtitle selector visibility
    private val _isSubtitleSelectorVisible = MutableStateFlow(false)
    val isSubtitleSelectorVisible: StateFlow<Boolean> = _isSubtitleSelectorVisible.asStateFlow()

    // Quality selector visibility
    private val _isQualitySelectorVisible = MutableStateFlow(false)
    val isQualitySelectorVisible: StateFlow<Boolean> = _isQualitySelectorVisible.asStateFlow()

    // Available qualities
    private val _availableQualities = MutableStateFlow<List<VideoTrack>>(emptyList())
    val availableQualities: StateFlow<List<VideoTrack>> = _availableQualities.asStateFlow()

    private val _selectedQuality = MutableStateFlow<VideoTrack?>(null)
    val selectedQuality: StateFlow<VideoTrack?> = _selectedQuality.asStateFlow()

    private val _availableSubtitleOptions = MutableStateFlow<List<SubtitleOption>>(emptyList())
    val availableSubtitleOptions: StateFlow<List<SubtitleOption>> = _availableSubtitleOptions.asStateFlow()

    // Player type (for view recreation on switch)
    private val _playerType = MutableStateFlow("normal")
    val playerType: StateFlow<String> = _playerType.asStateFlow()

    // Surface recreation key — incremented on quality change to force PlayerView destruction/creation
    private val _surfaceKey = MutableStateFlow(0)
    val surfaceKey: StateFlow<Int> = _surfaceKey.asStateFlow()

    // Current channel tracking
    private var currentChannelId: String? = null
    private var currentEpisodeId: String? = null
    // Internal backing field for logic, also syncs to UI State
    private var isLiveTVMode = false
        set(value) {
            field = value
            _uiState.update { it.copy(isLiveTV = value) }
        }

    // Compose Subtitle Overlay State
    private var subtitleCuesLoaded = false
    private var parsedSubtitleCues: List<com.streamcore.tv.presentation.player.SubtitleCue> = emptyList()
    private var composeSubtitlesEnabled = true

    fun toggleComposeSubtitles() {
        composeSubtitlesEnabled = !composeSubtitlesEnabled
        if (!composeSubtitlesEnabled) {
            _uiState.update { it.copy(currentSubtitleText = null) }
        }
        Timber.d("Compose subtitles toggled: $composeSubtitlesEnabled")
    }

    private var preferredPlayerType = "auto"

    init {
        setupPlayerCallbacks()
        observePreferences()
    }

    val preferredPlayerTypeFlow = userPreferencesManager.getPlayerType()
    val hwdecModeFlow = userPreferencesManager.getHwdecMode()

    fun updatePlayerType(type: String) {
        viewModelScope.launch {
            userPreferencesManager.savePlayerType(type)
        }
    }

    fun updateHwdecMode(mode: String) {
        viewModelScope.launch {
            userPreferencesManager.saveHwdecMode(mode)
        }
    }

    private fun observePreferences() {
        viewModelScope.launch {
            userPreferencesManager.getPlayerType().collect {
                preferredPlayerType = it
            }
        }
        viewModelScope.launch {
            userPreferencesManager.getHwdecMode().collect {
                mpvPlayerManager.setHwdecMode(it)
            }
        }
    }

    private fun setupPlayerCallbacks() {
        exoPlayerManager.onError = { error ->
            _uiState.update { it.copy(error = error.message) }
        }

        exoPlayerManager.onPositionUpdate = { position ->
            _uiState.update { it.copy(currentPosition = position) }
            updateSubtitleForPosition(position)
        }

        exoPlayerManager.onDurationUpdate = { duration ->
            _uiState.update { it.copy(duration = duration) }
        }

        exoPlayerManager.onPlayingStateChanged = { playing ->
            _uiState.update { it.copy(isPlaying = playing) }
        }

        // Observe Player State from Manager to ensure we always have the latest instance
        // This fixes race conditions where manager re-inits player but ViewModel keeps old reference
        viewModelScope.launch {
            exoPlayerManager.playerState.collect { player ->
                _exoPlayerState.value = player
            }
        }

        mpvPlayerManager.onError = { error ->
            _uiState.update { it.copy(error = error.message) }
        }
        mpvPlayerManager.onPositionUpdate = { position ->
            _uiState.update { it.copy(currentPosition = position) }
            updateSubtitleForPosition(position)
        }
        mpvPlayerManager.onDurationUpdate = { duration ->
            _uiState.update { it.copy(duration = duration) }
        }
        mpvPlayerManager.onPlayingStateChanged = { playing ->
            _uiState.update { it.copy(isPlaying = playing) }
        }
        mpvPlayerManager.onFileLoaded = {
            viewModelScope.launch {
                kotlinx.coroutines.delay(300)
                updateAvailableTracks()
            }
        }
        mpvPlayerManager.onHwdecFallbackUsed = {
            Timber.w("$TAG: MPV hwdec fallback detected, showing info message")
            _uiState.update { it.copy(infoMessage = "Using software decoding for this file") }
            // Auto-clear after 5 seconds
            viewModelScope.launch {
                kotlinx.coroutines.delay(5000)
                _uiState.update { it.copy(infoMessage = null) }
            }
        }
    }

    /**
     * Load content stream (Live TV or VOD content)
     */
    fun loadContentStream(contentId: String, streamLinkId: Long? = null) {
        viewModelScope.launch {
            _uiState.update { it.copy(contentState = UiState.Loading) }

            try {
                Timber.d("$TAG: Loading content stream for id: $contentId, streamLinkId: $streamLinkId")

                // If a specific stream link ID was requested, try to load it
                if (streamLinkId != null) {
                    val specificStream = loadSpecificStream(contentId, streamLinkId)
                    if (specificStream != null) {
                        currentChannelId = specificStream.id
                        isLiveTVMode = false
                        _uiState.update {
                            it.copy(
                                contentState = UiState.Success(specificStream),
                                subtitleTracks = specificStream.subtitleTracks
                            )
                        }
                        playContentStream(specificStream)
                        val progress = getPlaybackProgressUseCase(contentId)
                        if (progress != null && progress.position > 0 && progress.position < (progress.duration * 0.95)) {
                            if (_playerType.value == "mpv") {
                                mpvPlayerManager.seekTo(progress.position)
                            } else {
                                exoPlayerManager.seekTo(progress.position)
                            }
                        }
                        fetchAndParseSubtitles()
                        return@launch
                    }
                    Timber.w("$TAG: Specific stream $streamLinkId not found, falling back to default")
                }

                // Default: load the default stream
                val result = getContentStreamUseCase(contentId)
                
                when (result) {
                    is Result.Success -> {
                        val stream = result.data
                        currentChannelId = stream.id
                        
                        // Check if this is Live TV content
                        // Improvement: Sticky detection - if we were already in Live TV and loading a new channel, keep it.
                        val wasLiveTV = isLiveTVMode
                        
                        // Also verify usage of "ContentType" enum if available in ContentStream (it's in ContentItem but mapped loosely)
                        val newIsLiveTV = stream.categoryId == "2" || 
                                          stream.channelNumber != null || 
                                          !stream.channelCategory.isNullOrBlank() ||
                                          (isLiveTVMode && stream.streamUrl.isNotEmpty()) // Sticky mode for zapping

                        isLiveTVMode = newIsLiveTV
                        
                        // Load Live TV channels if in Live mode and not already loaded for this category
                        // CRITICAL: Always ensure channels are loaded if we are in LiveTV mode, 
                        // otherwise selector will be empty when reopening it.
                        if (isLiveTVMode && (_liveTVChannels.value.isEmpty() || !wasLiveTV)) {
                            loadLiveTVChannels(stream.categoryId)
                        }

                        // Update UI state
                        _uiState.update { 
                            it.copy(
                                contentState = UiState.Success(stream),
                                subtitleTracks = stream.subtitleTracks
                            ) 
                        }

                        // Prepare and play
                        playContentStream(stream)

                        // Resume playback logic for VOD
                        if (!isLiveTVMode) {
                            val progress = getPlaybackProgressUseCase(contentId)
                            if (progress != null && progress.position > 0 && progress.position < (progress.duration * 0.95)) {
                                Timber.d("$TAG: Resuming playback for $contentId at ${progress.position}ms")
                                if (_playerType.value == "mpv") {
                                    mpvPlayerManager.seekTo(progress.position)
                                } else {
                                    exoPlayerManager.seekTo(progress.position)
                                }
                            }
                        }

                        // Player state is updated via flow collection
                    }
                    is Result.Error -> {
                        _uiState.update { 
                            it.copy(contentState = UiState.Error(result.exception.message ?: "Failed to load stream")) 
                        }
                    }
                    is Result.Loading -> {
                        // Keep loading state
                    }
                }
            } catch (e: Exception) {
                Timber.e(e, "$TAG: Error loading content stream")
                _uiState.update { 
                    it.copy(contentState = UiState.Error(e.message ?: "Unknown error")) 
                }
            }
        }
    }

    /**
     * Load episode stream for VOD series
     */
    fun loadEpisodeStream(episodeId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(contentState = UiState.Loading) }

            try {
                Timber.d("$TAG: Loading episode stream for id: $episodeId")
                currentEpisodeId = episodeId
                isLiveTVMode = false

                // Get episode stream through use case
                // For now, use content stream as fallback
                val result = getContentStreamUseCase(episodeId)

                when (result) {
                    is Result.Success -> {
                        val stream = result.data
                        _uiState.update { 
                            it.copy(
                                contentState = UiState.Success(stream),
                                subtitleTracks = stream.subtitleTracks
                            ) 
                        }
                        playContentStream(stream)
                        
                        // Resume playback logic for Episode
                        val progress = getPlaybackProgressUseCase(episodeId)
                        if (progress != null && progress.position > 0 && progress.position < (progress.duration * 0.95)) {
                             Timber.d("$TAG: Resuming episode $episodeId at ${progress.position}ms")
                             if (_playerType.value == "mpv") {
                                 mpvPlayerManager.seekTo(progress.position)
                             } else {
                                 exoPlayerManager.seekTo(progress.position)
                             }
                        }
                        
                        // Player state is updated via flow collection
                    }
                    is Result.Error -> {
                        _uiState.update { 
                            it.copy(contentState = UiState.Error(result.exception.message ?: "Failed to load episode")) 
                        }
                    }
                    is Result.Loading -> {
                        // Keep loading state
                    }
                }
            } catch (e: Exception) {
                Timber.e(e, "$TAG: Error loading episode stream")
                _uiState.update { 
                    it.copy(contentState = UiState.Error(e.message ?: "Unknown error")) 
                }
            }
        }
    }

    /**
     * Load a specific stream by its link ID from the multi-stream API.
     * Mirrors phone app's playStreamPublicDto approach:
     * 1. Fetch all streams, find the selected one
     * 2. Resolve relative URLs
     * 3. Fetch content details (title, image, subtitles) from default stream
     * 4. Build ContentStream with selected stream's URL + DRM details
     */
    private suspend fun loadSpecificStream(contentId: String, streamLinkId: Long): ContentStream? {
        return try {
            val response = contentRepository.getContentStreams(contentId)
            if (!response.isSuccessful) return null
            val streams = response.body() ?: return null
            val dto = streams.firstOrNull { stream -> stream.id == streamLinkId } ?: return null

            // Resolve relative stream URLs (e.g. /api/content/stream/123 -> full URL)
            val resolvedUrl = if (dto.streamUrl.startsWith("/")) {
                val uri = android.net.Uri.parse(com.streamcore.tv.BuildConfig.API_BASE_URL)
                val origin = "${uri.scheme}://${uri.authority}"
                "$origin${dto.streamUrl}"
            } else {
                dto.streamUrl
            }
            Timber.d("$TAG: loadSpecificStream resolved URL = ${resolvedUrl.take(120)}")

            // Fetch content details from default stream for title/image/subtitles
            var contentTitle = dto.quality ?: dto.language ?: "Stream ${dto.id}"
            var contentImage: String? = null
            var contentDesc: String? = null
            var subtitleUrl: String? = null
            var subtitleTracksList: List<com.streamcore.tv.domain.model.SubtitleTrack> = emptyList()

            val contentResult = getContentStreamUseCase(contentId)
            if (contentResult is Result.Success) {
                val cs = contentResult.data
                contentTitle = cs.title
                contentDesc = cs.description
                contentImage = cs.imageUrl
                subtitleUrl = cs.subtitleUrl
                subtitleTracksList = cs.subtitleTracks
            }

            // Build ContentStream with the SELECTED stream's URL and DRM, 
            // but with the content's display info
            ContentStream(
                id = contentId,
                categoryId = "",
                title = contentTitle,
                description = contentDesc,
                imageUrl = contentImage,
                streamUrl = resolvedUrl,
                tmdbId = null,
                year = null,
                channelNumber = null,
                createdAt = "",
                drmKeys = dto.drmKeys,
                drmKeysExo = dto.drmKeysJson,
                drmType = dto.drmType,
                licenseServerUrl = dto.licenseServerUrl,
                drmHeaders = dto.drmHeaders,
                origin = dto.origin,
                userAgent = dto.userAgent,
                referer = dto.referer,
                proxyUrl = dto.proxyUrl,
                dohUrl = dto.dohUrl,
                subtitleUrl = subtitleUrl,
                subtitleTracks = subtitleTracksList
            )
        } catch (e: Exception) {
            Timber.w(e, "$TAG: Failed to load specific stream $streamLinkId")
            null
        }
    }

    /**
     * Load content by ID (generic)
     */
    fun loadContent(contentId: String, streamLinkId: Long? = null) {
        loadContentStream(contentId, streamLinkId)
    }

    /**
     * Check if currently playing Live TV content
     */
    fun isLiveTV(): Boolean = _uiState.value.isLiveTV

    private fun playContentStream(stream: ContentStream) {
        val streamUrl = stream.streamUrl
        
        val headerResult = PlaybackHeaderBuilder.build(
            userAgent = stream.userAgent,
            referer = stream.referer,
            origin = stream.origin,
            customHeaders = stream.customHeaders,
            fallbackRefererFromUrl = streamUrl
        )
        val headers = headerResult.headers

        // Debug (safe): show what we computed before ExoPlayerManager/DrmHelper build the DataSource.
        val headerKeysForLog = headers.keys
            .filterNot { it.equals("Authorization", ignoreCase = true) }
            .sorted()
        Timber.d(
            "PlayerViewModel: LiveTV headers computed (id=${stream.id}, title=${stream.title}, " +
                "ua=${headerResult.effectiveUserAgent?.take(80)}, origin=${headers["Origin"]}, referer=${headers["Referer"]}, keys=$headerKeysForLog)"
        )

        val hasDrm = !stream.licenseServerUrl.isNullOrBlank() ||
            !stream.drmKeys.isNullOrBlank() ||
            !stream.drmKeysExo.isNullOrBlank()
        
        // Player selection logic:
        // 1. DRM always requires ExoPlayer
        // 2. If User Preference is set, respect it (unless DRM)
        // 3. Default (Auto): Live TV -> ExoPlayer, VOD -> MPV (if supported)
        val shouldUseMpv = when {
            hasDrm -> false
            preferredPlayerType == "mpv" -> mpvPlayerManager.isSupported()
            preferredPlayerType == "exo" -> false
            else -> !isLiveTVMode && mpvPlayerManager.isSupported()
        }

        when {
            // Widevine/PlayReady with license server
            !stream.licenseServerUrl.isNullOrBlank() -> {
                _playerType.value = "normal"
                mpvPlayerManager.release()
                exoPlayerManager.prepareAndPlayWithDrm(
                    streamUrl = streamUrl,
                    drmKeysExo = null, // Use license server instead
                    proxyUrl = stream.proxyUrl,
                    dohUrl = stream.dohUrl,
                    customHeaders = headers,
                    // Pass DRM details strictly
                    drmType = stream.drmType,
                    licenseServerUrl = stream.licenseServerUrl,
                    drmHeaders = stream.drmHeaders,
                    userAgent = stream.userAgent
                )
            }
            // ClearKey DRM
            !stream.drmKeys.isNullOrBlank() -> {
                _playerType.value = "normal"
                mpvPlayerManager.release()
                // Prefer canonical kid:key hex when available.
                exoPlayerManager.prepareAndPlayWithDrm(
                    streamUrl = streamUrl,
                    drmKeysExo = null,
                    drmKeysHex = stream.drmKeys,
                    proxyUrl = stream.proxyUrl,
                    dohUrl = stream.dohUrl,
                    customHeaders = headers,
                    userAgent = stream.userAgent
                )
            }
            !stream.drmKeysExo.isNullOrBlank() -> {
                _playerType.value = "normal"
                mpvPlayerManager.release()
                exoPlayerManager.prepareAndPlayWithDrm(
                    streamUrl = streamUrl,
                    drmKeysExo = stream.drmKeysExo,
                    proxyUrl = stream.proxyUrl,
                    dohUrl = stream.dohUrl,
                    customHeaders = headers,
                    userAgent = stream.userAgent
                )
            }
            shouldUseMpv -> {
                _playerType.value = "mpv"
                exoPlayerManager.release()
                _exoPlayerState.value = null
                // Inject JWT for internal streams only
                val mpvHeaders = headers.toMutableMap()
                if (isLikelyInternalStream(streamUrl) && !mpvHeaders.containsKey("Authorization")) {
                    kotlinx.coroutines.runBlocking {
                        tokenManager.getAccessToken().first()
                    }?.let { token ->
                        mpvHeaders["Authorization"] = "Bearer $token"
                        Timber.d("$TAG: MPV injected JWT for internal stream")
                    }
                } else if (!isLikelyInternalStream(streamUrl)) {
                    Timber.d("$TAG: MPV skipping JWT for external stream: ${streamUrl.take(60)}")
                }
                mpvPlayerManager.prepareAndPlay(streamUrl, mpvHeaders)
            }
            // No DRM fallback path (Live TV non-DRM stays ExoPlayer)
            else -> {
                _playerType.value = "normal"
                mpvPlayerManager.release()
                exoPlayerManager.prepareAndPlayWithAnalysis(
                    streamUrl = streamUrl,
                    proxyUrl = stream.proxyUrl,
                    dohUrl = stream.dohUrl,
                    customHeaders = headers
                )
            }
        }

        // Update available tracks after a short delay
        viewModelScope.launch {
            kotlinx.coroutines.delay(2000) // Wait for tracks to be available
            updateAvailableTracks()
        }
    }

    private fun loadLiveTVChannels(categoryId: String) {
        viewModelScope.launch {
            // Load categories in parallel or sequentially - explicit fetch ensures they persist
            loadChannelCategories()

            try {
                val result = getLiveTVChannelsUseCase()
                when (result) {
                    is Result.Success -> {
                        // Convert ContentItem to ContentStream for compatibility
                        val streams = result.data.map { content ->
                            ContentStream(
                                id = content.id,
                                title = content.title,
                                streamUrl = content.streamUrl ?: "",
                                description = content.description,
                                imageUrl = content.imageUrl,
                                categoryId = categoryId,
                                channelCategory = content.channelCategory,
                                channelNumber = null,
                                tmdbId = null,
                                year = content.year,
                                drmKeys = content.drmKeys,
                                drmKeysExo = null,
                                proxyUrl = content.proxyUrl,
                                dohUrl = content.dohUrl,
                                origin = content.origin,
                                userAgent = content.userAgent,
                                referer = content.referer,
                                customHeaders = content.customHeaders,
                                subtitleUrl = content.subtitleUrl,
                                subtitleTracks = content.subtitleTracks,
                                createdAt = content.createdAt
                            )
                        }.sortedBy { it.id.toIntOrNull() ?: Int.MAX_VALUE }
                        _liveTVChannels.value = streams
                    }
                    is Result.Error -> {
                        Timber.e("$TAG: Failed to load LiveTV channels: ${result.exception.message}")
                    }
                    is Result.Loading -> {}
                }
            } catch (e: Exception) {
                Timber.e(e, "$TAG: Error loading LiveTV channels")
            }
        }
    }

    private fun loadChannelCategories() {
        viewModelScope.launch {
            try {
                val result = getTvChannelCategoriesUseCase()
                when (result) {
                    is Result.Success -> {
                        _channelCategories.value = result.data
                    }
                    is Result.Error -> {
                        Timber.e("$TAG: Failed to load channel categories: ${result.exception.message}")
                    }
                    else -> {}
                }
            } catch (e: Exception) {
                Timber.e(e, "$TAG: Error loading channel categories")
            }
        }
    }

    private fun updateAvailableTracks() {
        val usingMpv = _playerType.value == "mpv"
        val audioTracks = if (usingMpv) {
            mpvPlayerManager.getAvailableAudioTracks()
        } else {
            exoPlayerManager.getAvailableAudioTracks()
        }
        val videoTracks = if (usingMpv) {
            mpvPlayerManager.getAvailableVideoTracks()
        } else {
            exoPlayerManager.getAvailableVideoTracks()
        }
        val subtitleOptions = if (usingMpv) {
            mpvPlayerManager.getAvailableSubtitleOptions()
        } else {
            exoPlayerManager.getAvailableSubtitleOptions()
        }

        _uiState.update { 
            it.copy(
                availableAudioTracks = audioTracks,
                selectedAudioTrack = audioTracks.firstOrNull { track -> track.isSelected }
            ) 
        }

        _availableQualities.value = videoTracks
        _selectedQuality.value = videoTracks.firstOrNull { it.isSelected }
        _availableSubtitleOptions.value = subtitleOptions
        
        // Trigger Compose subtitle parser fetching if not already loaded
        fetchAndParseSubtitles()
    }

    // ==================== Playback Controls ====================

    fun togglePlayPause() {
        if (_playerType.value == "mpv") {
            mpvPlayerManager.togglePlayPause()
        } else {
            exoPlayerManager.togglePlayPause()
        }
    }

    fun seekTo(position: Long) {
        if (_playerType.value == "mpv") {
            mpvPlayerManager.seekTo(position)
        } else {
            exoPlayerManager.seekTo(position)
        }
    }

    fun setVolume(volume: Float) {
        if (_playerType.value == "mpv") {
            mpvPlayerManager.setVolume(volume)
        } else {
            exoPlayerManager.setVolume(volume)
        }
    }

    fun attachMpvSurface(surface: Surface) {
        if (_playerType.value == "mpv") {
            mpvPlayerManager.attachSurface(surface)
        }
    }

    fun detachMpvSurface() {
        if (_playerType.value == "mpv") {
            mpvPlayerManager.detachSurface()
        }
    }

    // ==================== Channel Switching ====================

    fun getCurrentChannelId(): String? = currentChannelId

    fun getCurrentEpisodeId(): String? = currentEpisodeId

    fun switchToChannel(channel: ContentStream) {
        // Hide sidebar immediately regardless of blank streamUrl
        _isChannelSidebarVisible.value = false
        exoPlayerManager.markDebugChannelZapStart(
            channelId = channel.id,
            trigger = "player_viewmodel_switch"
        )
        
        if (channel.streamUrl.isBlank()) {
            Timber.d("$TAG: switchToChannel: Stream URL is blank for channel ${channel.id}, loading properly...")
            loadContentStream(channel.id)
            return
        }
        
        currentChannelId = channel.id
        
        _uiState.update { it.copy(contentState = UiState.Success(channel)) }
        
        // Release current player and start new
        exoPlayerManager.release()
        exoPlayerManager.initializePlayer()
        playContentStream(channel)
        _exoPlayerState.value = exoPlayerManager.exoPlayer
    }

    fun switchToNextChannel() {
        val channels = _liveTVChannels.value
        if (channels.isEmpty()) return

        val currentIndex = channels.indexOfFirst { it.id == currentChannelId }
        val nextIndex = if (currentIndex >= 0) (currentIndex + 1) % channels.size else 0
        switchToChannel(channels[nextIndex])
    }

    fun switchToPreviousChannel() {
        val channels = _liveTVChannels.value
        if (channels.isEmpty()) return

        val currentIndex = channels.indexOfFirst { it.id == currentChannelId }
        val prevIndex = if (currentIndex >= 0) (currentIndex - 1 + channels.size) % channels.size else channels.size - 1
        switchToChannel(channels[prevIndex])
    }

    // ==================== Sidebar Controls ====================

    fun showChannelSidebar() {
        _isChannelSidebarVisible.value = true
    }

    fun hideChannelSidebar() {
        _isChannelSidebarVisible.value = false
    }

    fun toggleChannelSidebar() {
        _isChannelSidebarVisible.update { !it }
    }

    fun selectChannelCategory(category: String?) {
        _selectedChannelCategory.value = category
    }

    // ==================== Audio Track Selection ====================

    fun toggleAudioSelector() {
        _isAudioSelectorVisible.update { !it }
    }

    fun showAudioSelector() {
        _isAudioSelectorVisible.value = true
    }

    fun hideAudioSelector() {
        _isAudioSelectorVisible.value = false
    }

    fun selectAudioTrack(track: AudioTrack) {
        if (_playerType.value == "mpv") {
            mpvPlayerManager.selectAudioTrack(track)
            updateAvailableTracks()
        } else {
            exoPlayerManager.selectAudioTrack(track)
            _uiState.update { it.copy(selectedAudioTrack = track) }
        }
        _isAudioSelectorVisible.value = false
    }

    fun resetAudioTrack() {
        if (_playerType.value == "mpv") {
            mpvPlayerManager.resetAudioTrack()
            updateAvailableTracks()
        } else {
            exoPlayerManager.resetAudioTrack()
            _uiState.update { it.copy(selectedAudioTrack = null) }
        }
    }

    // ==================== Subtitle Selection ====================

    fun toggleSubtitleSelector() {
        _isSubtitleSelectorVisible.update { !it }
    }

    fun showSubtitleSelector() {
        _isSubtitleSelectorVisible.value = true
    }

    fun hideSubtitleSelector() {
        _isSubtitleSelectorVisible.value = false
    }

    // ==================== Quality Selection ====================

    fun toggleQualitySelector() {
        _isQualitySelectorVisible.update { !it }
    }

    fun showQualitySelector() {
        _isQualitySelectorVisible.value = true
    }

    fun hideQualitySelector() {
        _isQualitySelectorVisible.value = false
    }

    fun selectVideoQuality(quality: VideoTrack) {
        if (_playerType.value == "mpv") {
            mpvPlayerManager.selectVideoTrack(quality)
            updateAvailableTracks()
        } else {
            // Clear the surface before switching to avoid ghosting of old resolution
            exoPlayerManager.exoPlayer?.clearVideoSurface()
            exoPlayerManager.selectVideoQuality(quality)
            _selectedQuality.value = quality
            // Force PlayerView recreation so a fresh surface is created at the new resolution
            _surfaceKey.value++
        }
        _isQualitySelectorVisible.value = false
    }

    fun resetVideoQuality() {
        if (_playerType.value == "mpv") {
            mpvPlayerManager.resetVideoTrack()
            updateAvailableTracks()
        } else {
            exoPlayerManager.exoPlayer?.clearVideoSurface()
            exoPlayerManager.resetVideoQuality()
            _selectedQuality.value = null
            _surfaceKey.value++
        }
    }

    // ==================== Subtitle Selection ====================

    fun getAvailableSubtitleOptions(): List<SubtitleOption> {
        return _availableSubtitleOptions.value
    }

    fun selectSubtitleOption(option: SubtitleOption) {
        if (_playerType.value == "mpv") {
            mpvPlayerManager.selectSubtitle(option)
        } else {
            exoPlayerManager.selectSubtitle(option)
        }
        updateAvailableTracks()
    }

    fun disableSubtitles() {
        if (_playerType.value == "mpv") {
            mpvPlayerManager.disableSubtitles()
        } else {
            exoPlayerManager.disableSubtitles()
        }
        updateAvailableTracks()
    }

    // ==================== Episode Navigation ====================

    fun navigateToEpisode(episode: Episode) {
        loadEpisodeStream(episode.id.toString())
    }

    // ==================== Error Handling ====================

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    // ==================== Lifecycle ====================

    fun onPlayerDestroyed() {
        // Save progress before destroying
        saveCurrentProgress()
        
        Timber.d("$TAG: Player destroyed, releasing resources")
        exoPlayerManager.release()
        mpvPlayerManager.release()
        _exoPlayerState.value = null
    }

    override fun onCleared() {
        saveCurrentProgress()
        super.onCleared()
        exoPlayerManager.release()
        mpvPlayerManager.release()
    }

    private fun saveCurrentProgress() {
        // Don't save for Live TV
        if (isLiveTVMode) return

        val position = _uiState.value.currentPosition
        val duration = _uiState.value.duration
        
        // Basic validation: Only save if watched > 10s and < 95%
        if (position > 10_000 && duration > 0 && position < (duration * 0.95)) {
            val contentId = currentEpisodeId ?: currentChannelId
            if (contentId != null) {
                val content = _uiState.value.contentState
                val (title, imageUrl) = if (content is UiState.Success && content.data is ContentStream) {
                    content.data.title to content.data.imageUrl
                } else {
                    null to null
                }

                viewModelScope.launch {
                    Timber.d("$TAG: Saving progress for $contentId: $position / $duration")
                    savePlaybackProgressUseCase(
                        contentId = contentId,
                        position = position,
                        duration = duration,
                        title = title,
                        imageUrl = imageUrl
                    )
                }
            }
        } else if (duration > 0 && position >= (duration * 0.95)) {
            // If finished, maybe remove progress?
            // For now, let's just not save it, or we could delete it?
            // Optional: deleteProgressUseCase(contentId)
        }
    }

    /**
     * Check if a stream URL points to our own server (internal) vs an external service.
     * JWT should only be sent to internal streams — external URLs (Google, CDNs) would reject it.
     */
    private fun isLikelyInternalStream(streamUrl: String?): Boolean {
        if (streamUrl.isNullOrBlank()) return true
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

    /**
     * Fetch and parse external subtitle content for Compose-based rendering.
     * This is a fallback for when MPV's libass cannot render subtitles (e.g., on emulators).
     */
    private fun fetchAndParseSubtitles() {
        if (subtitleCuesLoaded) {
            return
        }
        val subtitleTracks = _availableSubtitleOptions.value
        val fallbackUrl = when (val state = _uiState.value.contentState) {
            is UiState.Success -> {
                val data = state.data
                if (data is ContentStream) data.subtitleUrl
                else null
            }
            else -> null
        }
        
        // Find the URL for the first selected track, or just the first available track, or fallback
        val selectedUrl = subtitleTracks.firstOrNull { it.isSelected }?.label?.takeIf { it.startsWith("http") } // Usually label is not URL, but just in case
        // Wait, standard `ContentStream` mapping only passes `subtitleUrl` to model, not `url` per option.
        // Actually the backend sends `subtitleUrl`.
        val firstUrl = fallbackUrl
        
        if (firstUrl.isNullOrBlank()) {
            return
        }

        Timber.d("fetchAndParseSubtitles: Fetching from $firstUrl")

        viewModelScope.launch {
            try {
                val token = tokenManager.getAccessToken().first()
                val client = okhttp3.OkHttpClient.Builder()
                    .apply { com.streamcore.tv.core.network.NetworkSecurityHelper.applyLenientSsl(this) }
                    .build()
                val requestBuilder = okhttp3.Request.Builder().url(firstUrl)
                if (!token.isNullOrBlank() && isLikelyInternalStream(firstUrl)) {
                    requestBuilder.addHeader("Authorization", "Bearer $token")
                }
                
                val resultBody = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                    val response = client.newCall(requestBuilder.build()).execute()
                    if (response.isSuccessful) {
                        response.body?.string()
                    } else {
                        Timber.w("Failed to fetch subtitle for Compose overlay: HTTP ${response.code}")
                        null
                    }
                }
                
                if (resultBody != null) {
                    parsedSubtitleCues = com.streamcore.tv.presentation.player.WebVttParser.parse(resultBody)
                    subtitleCuesLoaded = true
                    _uiState.update { it.copy(hasExternalSubtitles = parsedSubtitleCues.isNotEmpty()) }
                    Timber.d("Parsed ${parsedSubtitleCues.size} subtitle cues for Compose overlay")
                }
            } catch (e: Exception) {
                Timber.w(e, "Error fetching subtitle for Compose overlay")
            }
        }
    }

    /**
     * Update the Compose subtitle overlay text based on the current playback position.
     */
    private fun updateSubtitleForPosition(posMs: Long) {
        if (!subtitleCuesLoaded || parsedSubtitleCues.isEmpty() || !composeSubtitlesEnabled) return
        val cue = com.streamcore.tv.presentation.player.WebVttParser.findCueAt(parsedSubtitleCues, posMs)
        val currentText = _uiState.value.currentSubtitleText
        val newText = cue?.text
        if (newText != currentText) {
            _uiState.update { it.copy(currentSubtitleText = newText) }
        }
    }
}

/**
 * Player UI State
 */
data class PlayerUiState(
    val contentState: UiState<Any> = UiState.Loading,
    val isPlaying: Boolean = false,
    val currentPosition: Long = 0L,
    val duration: Long = 0L,
    val error: String? = null,
    val infoMessage: String? = null,
    val availableAudioTracks: List<AudioTrack> = emptyList(),
    val selectedAudioTrack: AudioTrack? = null,
    val isLiveTV: Boolean = false,
    val currentSubtitleText: String? = null,
    val hasExternalSubtitles: Boolean = false,
    val subtitleTracks: List<SubtitleTrack> = emptyList()
)

// UiState is defined in EpisodicPlayerScreen.kt and shared across player screens
