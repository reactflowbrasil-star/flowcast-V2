package com.streamcore.tv.presentation.screens.player

import android.net.Uri
import android.view.Surface
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.streamcore.tv.domain.model.ContentDetails
import com.streamcore.tv.domain.model.Episode
import com.streamcore.tv.domain.model.AudioTrack
import com.streamcore.tv.domain.model.SubtitleOption
import com.streamcore.tv.domain.model.VideoTrack
import com.streamcore.tv.domain.usecase.content.GetContentDetailsUseCase
import com.streamcore.tv.domain.usecase.series.GetSeriesDetailsByContentIdUseCase
import com.streamcore.tv.domain.usecase.series.GetEpisodeStreamUseCase
import com.streamcore.tv.domain.usecase.user.UpdateWatchProgressUseCase
import com.streamcore.tv.data.local.datastore.UserPreferencesManager
import com.streamcore.tv.data.local.datastore.TokenManager
import com.streamcore.tv.BuildConfig
import com.streamcore.tv.presentation.player.ExoPlayerManager
import com.streamcore.tv.presentation.player.MpvPlayerManager
import timber.log.Timber
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import javax.inject.Inject

/**
 * ViewModel for episodic content player (Series and Anime)
 * Handles episode navigation, auto-play, and player state
 */
@HiltViewModel
class EpisodicPlayerViewModel @Inject constructor(
    private val getContentDetailsUseCase: GetContentDetailsUseCase,
    private val getSeriesDetailsUseCase: GetSeriesDetailsByContentIdUseCase,
    private val getEpisodeStreamUseCase: GetEpisodeStreamUseCase,
    private val updateWatchProgressUseCase: UpdateWatchProgressUseCase,
    private val exoPlayerManager: ExoPlayerManager,
    private val mpvPlayerManager: MpvPlayerManager,
    private val userPreferencesManager: UserPreferencesManager,
    private val tokenManager: TokenManager
) : ViewModel() {

    private val _uiState = MutableStateFlow(EpisodicPlayerUiState())
    val uiState: StateFlow<EpisodicPlayerUiState> = _uiState.asStateFlow()

    private var currentContent: ContentDetails? = null
    private var currentEpisode: Episode? = null
    private var usingMpv: Boolean = true
    private var lastProgressSaveMs: Long = 0L
    private var preferredPlayerType = "auto"

    init {
        // Initialize player state monitoring
        observePlayerState()
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

    /**
     * Load content and optionally start playing a specific episode
     */
    fun loadContent(contentId: String, episodeId: String? = null) {
        viewModelScope.launch {
            try {
                Timber.d("EpisodicPlayerViewModel: Loading content $contentId, episode $episodeId")
                
                _uiState.value = _uiState.value.copy(
                    contentState = UiState.Loading
                )

                // Load series details (handles series)
                val seriesResult = getSeriesDetailsUseCase(contentId)
                
                seriesResult.fold(
                    onSuccess = { seriesDetails ->
                        // Convert SeriesDetails to ContentDetails for UI
                        val contentDetails = ContentDetails(
                            id = seriesDetails.content.id.toString(),
                            title = seriesDetails.content.title,
                            description = seriesDetails.content.description,
                            imageUrl = seriesDetails.content.imageUrl,
                            posterUrl = seriesDetails.content.imageUrl,
                            backdropUrl = seriesDetails.backdropUrl,
                            duration = null,
                            year = seriesDetails.content.year,
                            rating = null,
                            genres = emptyList(),
                            type = com.streamcore.tv.domain.model.ContentType.SERIES,
                            originalType = null, // Not available from SeriesDetails
                            streamUrl = null,

                            cast = null,
                            director = null,
                            trailer = null,
                            episodes = seriesDetails.seasons.flatMap { it.episodes },
                            seasons = seriesDetails.seasons,
                            relatedContent = null,
                            createdAt = seriesDetails.createdAt,
                            updatedAt = seriesDetails.createdAt
                        )
                        
                        currentContent = contentDetails
                        
                        _uiState.value = _uiState.value.copy(
                            contentState = UiState.Success(contentDetails)
                        )
                        
                        // Play specific episode or first episode
                        val targetEpisode = if (episodeId != null) {
                            contentDetails.episodes?.find { it.id.toString() == episodeId }
                        } else {
                            contentDetails.episodes?.firstOrNull()
                        }
                        
                        targetEpisode?.let { episode ->
                            playEpisode(episode)
                        }
                        
                        Timber.d("EpisodicPlayerViewModel: Successfully loaded ${contentDetails.title}")
                    },
                    onFailure = { exception ->
                        Timber.d("EpisodicPlayerViewModel: Failed to load content: ${exception.message}")
                        _uiState.value = _uiState.value.copy(
                            contentState = UiState.Error("Error al cargar el contenido: ${exception.message}")
                        )
                    }
                )
                
            } catch (e: Exception) {
                Timber.d("EpisodicPlayerViewModel: Exception loading content: ${e.message}")
                _uiState.value = _uiState.value.copy(
                    contentState = UiState.Error("Error inesperado: ${e.message}")
                )
            }
        }
    }

    /**
     * Play a specific episode
     */
    fun playEpisode(episode: Episode) {
        viewModelScope.launch {
            try {
                Timber.d("EpisodicPlayerViewModel: Playing episode ${episode.title}")
                
                currentEpisode = episode
                _uiState.value = _uiState.value.copy(
                    currentEpisodeId = episode.id.toString(),
                    playerState = UiState.Loading
                )

                // Get episode stream
                val streamResult = getEpisodeStreamUseCase(episode.id.toString())
                
                when (streamResult) {
                    is com.streamcore.tv.domain.model.Result.Success -> {
                        val episodeStream = streamResult.data
                        
                        // Determine player based on preference
                        usingMpv = when(preferredPlayerType) {
                            "mpv" -> mpvPlayerManager.isSupported()
                            "exo" -> false
                            else -> mpvPlayerManager.isSupported() // Default to MPV for VOD
                        }
                        
                        // Setup player callbacks BEFORE preparing stream
                        setupPlayerCallbacks()

                        if (usingMpv) {
                            exoPlayerManager.release()
                            // Inject JWT for internal streams only
                            val mpvHeaders = mutableMapOf<String, String>()
                            if (isLikelyInternalStream(episodeStream.streamUrl)) {
                                kotlinx.coroutines.runBlocking {
                                    tokenManager.getAccessToken().first()
                                }?.let { token ->
                                    mpvHeaders["Authorization"] = "Bearer $token"
                                    Timber.d("EpisodicPlayerViewModel: MPV injected JWT for internal stream")
                                }
                            } else {
                                Timber.d("EpisodicPlayerViewModel: MPV skipping JWT for external stream: ${episodeStream.streamUrl.take(60)}")
                            }
                            mpvPlayerManager.prepareAndPlay(episodeStream.streamUrl, mpvHeaders)
                            _uiState.value = _uiState.value.copy(
                                playerState = UiState.Success(Unit),
                                duration = episodeStream.duration ?: 0L
                            )
                        } else {
                            val subtitleConfigs = exoPlayerManager.createSubtitleConfigurations(
                                episodeStream.subtitleTracks,
                                episodeStream.subtitleUrl
                            )
                            mpvPlayerManager.release()
                            exoPlayerManager.prepareAndPlay(episodeStream.streamUrl, subtitleConfigs)
                            val player = exoPlayerManager.exoPlayer
                            if (player != null) {
                                _uiState.value = _uiState.value.copy(
                                    playerState = UiState.Success(player),
                                    duration = episodeStream.duration ?: 0L
                                )
                            } else {
                                _uiState.value = _uiState.value.copy(
                                    playerState = UiState.Error("Error al inicializar el reproductor")
                                )
                            }
                        }

                        refreshAvailableTracksDeferred()
                        Timber.d("EpisodicPlayerViewModel: Successfully started playing ${episode.title}")
                    }
                    is com.streamcore.tv.domain.model.Result.Error -> {
                        Timber.d("EpisodicPlayerViewModel: Failed to get episode stream: ${streamResult.exception.message}")
                        _uiState.value = _uiState.value.copy(
                            playerState = UiState.Error("Error al cargar el episodio: ${streamResult.exception.message}")
                        )
                    }
                    is com.streamcore.tv.domain.model.Result.Loading -> {
                        // Keep loading state
                        Timber.d("EpisodicPlayerViewModel: Loading episode stream...")
                    }
                }
                
            } catch (e: Exception) {
                Timber.d("EpisodicPlayerViewModel: Exception playing episode: ${e.message}")
                _uiState.value = _uiState.value.copy(
                    playerState = UiState.Error("Error inesperado: ${e.message}")
                )
            }
        }
    }

    /**
     * Navigate to next episode
     */
    fun playNextEpisode() {
        val content = currentContent ?: return
        val current = currentEpisode ?: return
        val episodes = content.episodes ?: return
        
        val currentIndex = episodes.indexOfFirst { it.id == current.id }
        if (currentIndex >= 0 && currentIndex < episodes.size - 1) {
            val nextEpisode = episodes[currentIndex + 1]
            playEpisode(nextEpisode)
        }
    }

    /**
     * Navigate to previous episode
     */
    fun playPreviousEpisode() {
        val content = currentContent ?: return
        val current = currentEpisode ?: return
        val episodes = content.episodes ?: return
        
        val currentIndex = episodes.indexOfFirst { it.id == current.id }
        if (currentIndex > 0) {
            val previousEpisode = episodes[currentIndex - 1]
            playEpisode(previousEpisode)
        }
    }

    /**
     * Toggle play/pause
     */
    fun togglePlayPause() {
        when (_uiState.value.playerState) {
            is UiState.Success -> {
                if (usingMpv) {
                    mpvPlayerManager.togglePlayPause()
                } else {
                    exoPlayerManager.togglePlayPause()
                }
            }
            else -> Timber.d("EpisodicPlayerViewModel: Player not ready for play/pause")
        }
    }

    /**
     * Seek to position
     */
    fun seekTo(position: Long) {
        when (_uiState.value.playerState) {
            is UiState.Success -> {
                if (usingMpv) {
                    mpvPlayerManager.seekTo(position)
                } else {
                    exoPlayerManager.seekTo(position)
                }
            }
            else -> Timber.d("EpisodicPlayerViewModel: Player not ready for seeking")
        }
    }

    /**
     * Toggle auto-play next episode
     */
    fun toggleAutoPlay() {
        _uiState.value = _uiState.value.copy(
            autoPlayNext = !_uiState.value.autoPlayNext
        )
    }

    /**
     * Setup player callbacks for state observation
     */
    private fun setupPlayerCallbacks() {
        if (usingMpv) {
            mpvPlayerManager.onError = { exception ->
                val errorMessage = "Playback error: ${exception.message}"
                Timber.d("EpisodicPlayerViewModel: $errorMessage")
                _uiState.value = _uiState.value.copy(
                    playerState = UiState.Error(errorMessage)
                )
            }
            mpvPlayerManager.onPositionUpdate = { position ->
                _uiState.value = _uiState.value.copy(
                    currentPosition = position
                )
                if (System.currentTimeMillis() - lastProgressSaveMs >= 15_000L) {
                    lastProgressSaveMs = System.currentTimeMillis()
                    updateWatchProgress()
                }
            }
            mpvPlayerManager.onDurationUpdate = { duration ->
                _uiState.value = _uiState.value.copy(duration = duration)
            }
            mpvPlayerManager.onPlayingStateChanged = { playing ->
                val wasPlaying = _uiState.value.isPlaying
                _uiState.value = _uiState.value.copy(isPlaying = playing)
                if (!playing && wasPlaying) {
                    updateWatchProgress()
                } else if (playing && !wasPlaying) {
                    updateWatchProgress()
                }
            }
            mpvPlayerManager.onFileLoaded = {
                viewModelScope.launch {
                    delay(300)
                    updateAvailableTracks()
                }
            }
            mpvPlayerManager.onHwdecFallbackUsed = {
                Timber.w("EpisodicPlayerViewModel: MPV hwdec fallback detected, showing info message")
                _uiState.value = _uiState.value.copy(
                    infoMessage = "Using software decoding for this file"
                )
                viewModelScope.launch {
                    delay(5000)
                    _uiState.value = _uiState.value.copy(infoMessage = null)
                }
            }
            Timber.d("EpisodicPlayerViewModel: MPV callbacks setup complete")
            return
        }

        // Setup error callback
        exoPlayerManager.onError = { exception ->
            val errorMessage = "Playback error: ${exception.message}"
            Timber.d("EpisodicPlayerViewModel: $errorMessage")
            _uiState.value = _uiState.value.copy(
                playerState = UiState.Error(errorMessage)
            )
        }

        // Setup position update callback
        exoPlayerManager.onPositionUpdate = { position ->
            _uiState.value = _uiState.value.copy(
                currentPosition = position
            )

            // Update watch progress periodically (every 5 seconds)
            if (System.currentTimeMillis() - lastProgressSaveMs >= 15_000L) {
                lastProgressSaveMs = System.currentTimeMillis()
                updateWatchProgress()
            }
        }

        // Setup duration update callback
        exoPlayerManager.onDurationUpdate = { duration ->
            _uiState.value = _uiState.value.copy(
                duration = duration
            )
        }

        // Setup playing state callback
        exoPlayerManager.onPlayingStateChanged = { playing ->
            val wasPlaying = _uiState.value.isPlaying
            _uiState.value = _uiState.value.copy(
                isPlaying = playing
            )

            // Save progress immediately when pausing or starting playback
            if (!playing && wasPlaying) {
                // Pausing - save progress
                updateWatchProgress()
            } else if (playing && !wasPlaying) {
                // Starting - save progress
                updateWatchProgress()
            }
        }

        Timber.d("EpisodicPlayerViewModel: Player callbacks setup complete")
    }

    /**
     * Observe player state changes
     */
    private fun observePlayerState() {
        // Player state observation is now handled through callbacks in setupPlayerCallbacks()
        Timber.d("EpisodicPlayerViewModel: Player state observation initialized")
    }

    /**
     * Update watch progress for episodic content
     */
    private fun updateWatchProgress() {
        val currentState = _uiState.value
        val episode = currentEpisode ?: return

        if (currentState.duration > 0) {
            val progress = currentState.currentPosition.toFloat() / currentState.duration.toFloat()

            viewModelScope.launch {
                try {
                    // Use episode ID for watch progress, not content ID
                    updateWatchProgressUseCase(
                        contentId = episode.id.toString(),
                        progress = progress,
                        duration = currentState.duration
                    )
                    Timber.d("Episodic watch progress updated: episode ${episode.id}, progress: $progress")
                } catch (e: Exception) {
                    Timber.e("Failed to update episodic watch progress", e)
                }
            }
        }
    }

    private fun refreshAvailableTracksDeferred() {
        viewModelScope.launch {
            delay(1500)
            updateAvailableTracks()
        }
    }

    private fun updateAvailableTracks() {
        val audioTracks = if (usingMpv) {
            mpvPlayerManager.getAvailableAudioTracks()
        } else {
            exoPlayerManager.getAvailableAudioTracks()
        }
        val subtitleOptions = if (usingMpv) {
            mpvPlayerManager.getAvailableSubtitleOptions()
        } else {
            exoPlayerManager.getAvailableSubtitleOptions()
        }
        val qualityOptions = if (usingMpv) {
            mpvPlayerManager.getAvailableVideoTracks()
        } else {
            exoPlayerManager.getAvailableVideoTracks()
        }

        _uiState.value = _uiState.value.copy(
            availableAudioTracks = audioTracks,
            selectedAudioTrack = audioTracks.firstOrNull { it.isSelected },
            availableSubtitleOptions = subtitleOptions,
            selectedSubtitleOption = subtitleOptions.firstOrNull { it.isSelected },
            availableQualities = qualityOptions,
            selectedQuality = qualityOptions.firstOrNull { it.isSelected }
        )
    }

    // Audio/Subtitle/Quality Track Management Methods

    /**
     * Toggle audio track selector
     */
    fun toggleAudioSelector() {
        Timber.d("EpisodicPlayerViewModel: Audio selector toggle requested")
        updateAvailableTracks()
    }

    /**
     * Get available audio tracks
     */
    fun getAvailableAudioTracks() =
        if (usingMpv) mpvPlayerManager.getAvailableAudioTracks() else exoPlayerManager.getAvailableAudioTracks()

    /**
     * Select audio track
     */
    fun selectAudioTrack(audioTrack: com.streamcore.tv.domain.model.AudioTrack) {
        if (usingMpv) {
            mpvPlayerManager.selectAudioTrack(audioTrack)
        } else {
            exoPlayerManager.selectAudioTrack(audioTrack)
        }
        Timber.d("EpisodicPlayerViewModel: Audio track selected: ${audioTrack.label}")
        updateAvailableTracks()
    }

    fun resetAudioTrack() {
        if (usingMpv) {
            mpvPlayerManager.resetAudioTrack()
        } else {
            exoPlayerManager.resetAudioTrack()
        }
        Timber.d("EpisodicPlayerViewModel: Audio track reset to auto")
        updateAvailableTracks()
    }

    fun selectSubtitleOption(option: SubtitleOption) {
        if (usingMpv) {
            mpvPlayerManager.selectSubtitle(option)
        } else {
            exoPlayerManager.selectSubtitle(option)
        }
        updateAvailableTracks()
    }

    fun disableSubtitles() {
        if (usingMpv) {
            mpvPlayerManager.disableSubtitles()
        } else {
            exoPlayerManager.disableSubtitles()
        }
        updateAvailableTracks()
    }

    fun selectVideoQuality(quality: VideoTrack) {
        if (usingMpv) {
            mpvPlayerManager.selectVideoTrack(quality)
        } else {
            exoPlayerManager.selectVideoQuality(quality)
        }
        updateAvailableTracks()
    }

    fun resetVideoQuality() {
        if (usingMpv) {
            mpvPlayerManager.resetVideoTrack()
        } else {
            exoPlayerManager.resetVideoQuality()
        }
        updateAvailableTracks()
    }

    override fun onCleared() {
        super.onCleared()
        // Release player resources
        exoPlayerManager.release()
        mpvPlayerManager.release()
    }

    fun attachMpvSurface(surface: Surface) {
        if (usingMpv) {
            mpvPlayerManager.attachSurface(surface)
        }
    }

    fun detachMpvSurface() {
        if (usingMpv) {
            mpvPlayerManager.detachSurface()
        }
    }

    fun isUsingMpv(): Boolean = usingMpv

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
}
