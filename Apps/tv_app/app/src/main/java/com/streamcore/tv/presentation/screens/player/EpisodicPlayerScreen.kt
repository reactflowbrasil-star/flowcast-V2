package com.streamcore.tv.presentation.screens.player

import android.app.Activity
import android.content.ContextWrapper
import android.graphics.SurfaceTexture
import android.view.Surface
import android.view.TextureView
import android.view.WindowManager
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.*
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.streamcore.tv.R
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import com.streamcore.tv.domain.model.ContentDetails
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import com.streamcore.tv.domain.model.ContentType
import com.streamcore.tv.domain.model.SubtitleOption
import com.streamcore.tv.domain.model.VideoTrack
import com.streamcore.tv.presentation.components.player.QualitySelector
import com.streamcore.tv.presentation.screens.player.components.VODPlayerControls
import com.streamcore.tv.core.utils.logd
import kotlinx.coroutines.delay

/**
 * Specialized player screen for episodic content (Series and Anime)
 * Similar to Netflix's episode player with next/previous navigation
 */
@OptIn(UnstableApi::class)
@Composable
fun EpisodicPlayerScreen(
    contentId: String,
    episodeId: String? = null,
    onNavigateBack: () -> Unit,
    viewModel: EpisodicPlayerViewModel = hiltViewModel()
) {
    @Suppress("UNUSED_VARIABLE")
    val context = LocalContext.current
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    
    // Keep screen on at the window level while this screen is visible
    DisposableEffect(Unit) {
        val activity = context.findActivity()
        activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose {
            activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    // Auto-hide controls
    var controlsVisible by remember { mutableStateOf(true) }
    var isQualitySelectorVisible by remember { mutableStateOf(false) }
    
    LaunchedEffect(controlsVisible) {
        if (controlsVisible) {
            delay(5000) // Hide after 5 seconds
            controlsVisible = false
        }
    }
    
    // Load content when screen starts
    LaunchedEffect(contentId, episodeId) {
        viewModel.loadContent(contentId, episodeId)
    }
    
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .onKeyEvent { keyEvent ->
                when {
                    // D-pad navigation - show controls (same as PlayerScreen)
                    keyEvent.type == KeyEventType.KeyUp && (
                        keyEvent.key == Key.DirectionUp ||
                        keyEvent.key == Key.DirectionDown ||
                        keyEvent.key == Key.DirectionLeft ||
                        keyEvent.key == Key.DirectionRight ||
                        keyEvent.key == Key.DirectionCenter ||
                        keyEvent.key == Key.Enter
                    ) -> {
                        controlsVisible = true
                        false // Let the event continue to be processed
                    }
                    else -> false
                }
            }
            .pointerInput(Unit) {
                detectTapGestures {
                    controlsVisible = !controlsVisible
                }
            }
    ) {
        when (val contentState = uiState.contentState) {
            is UiState.Loading -> {
                CircularProgressIndicator(
                    modifier = Modifier.align(Alignment.Center),
                    color = MaterialTheme.colorScheme.primary
                )
            }
            
            is UiState.Success -> {
                val content = contentState.data
                
                // Validate content type
                if (content.type != ContentType.SERIES || content.episodes.isNullOrEmpty()) {
                    ErrorMessage(
                        message = "Este contenido no es compatible con el reproductor de episodios",
                        onNavigateBack = onNavigateBack,
                        modifier = Modifier.align(Alignment.Center)
                    )
                    return@Box
                }
                
                // ExoPlayer Video View
                when (val playerState = uiState.playerState) {
                    is UiState.Success -> {
                        if (viewModel.isUsingMpv()) {
                            AndroidView(
                                factory = { ctx ->
                                    TextureView(ctx).apply {
                                        keepScreenOn = true
                                        surfaceTextureListener = object : TextureView.SurfaceTextureListener {
                                            override fun onSurfaceTextureAvailable(st: SurfaceTexture, width: Int, height: Int) {
                                                viewModel.attachMpvSurface(Surface(st))
                                            }

                                            override fun onSurfaceTextureSizeChanged(st: SurfaceTexture, width: Int, height: Int) = Unit

                                            override fun onSurfaceTextureDestroyed(st: SurfaceTexture): Boolean {
                                                viewModel.detachMpvSurface()
                                                return true
                                            }

                                            override fun onSurfaceTextureUpdated(st: SurfaceTexture) = Unit
                                        }
                                    }
                                },
                                modifier = Modifier.fillMaxSize()
                            )
                        } else {
                            AndroidView(
                                factory = { ctx ->
                                    PlayerView(ctx).apply {
                                        player = playerState.data as? ExoPlayer
                                        useController = false // We use custom controls
                                        setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING)
                                        // Prevent screen dimming/screensaver while the player is visible
                                        keepScreenOn = true
                                    }
                                },
                                modifier = Modifier.fillMaxSize()
                            ) { playerView ->
                                playerView.player = playerState.data as? ExoPlayer
                                // Ensure flag remains while this view is attached
                                playerView.keepScreenOn = true
                            }
                        }
                    }
                    
                    is UiState.Error -> {
                        ErrorMessage(
                            message = "Error al cargar el reproductor: ${playerState.message}",
                            onNavigateBack = onNavigateBack,
                            modifier = Modifier.align(Alignment.Center)
                        )
                    }
                    
                    is UiState.Loading -> {
                        CircularProgressIndicator(
                            modifier = Modifier.align(Alignment.Center),
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
                
                // Use VOD Player Controls (that work with D-pad) + Episode Navigation
                VODPlayerControls(
                    content = content,
                    isPlaying = uiState.isPlaying,
                    currentPosition = uiState.currentPosition,
                    duration = uiState.duration,
                    onPlayPause = { viewModel.togglePlayPause() },
                    onSeek = { position -> viewModel.seekTo(position) },
                    onSeekBackward = {
                        val newPosition = (uiState.currentPosition - 10000).coerceAtLeast(0)
                        viewModel.seekTo(newPosition)
                        controlsVisible = true
                    },
                    onSeekForward = {
                        val newPosition = (uiState.currentPosition + 10000).coerceAtMost(uiState.duration)
                        viewModel.seekTo(newPosition)
                        controlsVisible = true
                    },
                    onNavigateBack = onNavigateBack,
                    currentEpisodeId = uiState.currentEpisodeId,
                    onPreviousEpisode = { episode ->
                        viewModel.playEpisode(episode)
                        controlsVisible = true
                    },
                    onNextEpisode = { episode ->
                        viewModel.playEpisode(episode)
                        controlsVisible = true
                    },
                    controlsVisible = controlsVisible,
                    availableAudioTracks = uiState.availableAudioTracks,
                    selectedAudioTrack = uiState.selectedAudioTrack,
                    onToggleAudioSelector = {
                        viewModel.toggleAudioSelector()
                        controlsVisible = true
                    },
                    onAudioTrackSelected = { track ->
                        viewModel.selectAudioTrack(track)
                        controlsVisible = true
                    },
                    onResetAudioTrack = {
                        viewModel.resetAudioTrack()
                        controlsVisible = true
                    },
                    availableSubtitleOptions = uiState.availableSubtitleOptions,
                    selectedSubtitleOption = uiState.selectedSubtitleOption,
                    onSubtitleSelected = { option ->
                        viewModel.selectSubtitleOption(option)
                        controlsVisible = true
                    },
                    onDisableSubtitles = {
                        viewModel.disableSubtitles()
                        controlsVisible = true
                    },
                    hasMultipleAudioTracks = uiState.availableAudioTracks.isNotEmpty(),
                    hasMultipleSubtitles = uiState.availableSubtitleOptions.isNotEmpty(),
                    hasMultipleQualities = if (viewModel.isUsingMpv()) {
                        uiState.availableQualities.isNotEmpty()
                    } else {
                        uiState.availableQualities.size > 1
                    },
                    onToggleQualitySelector = {
                        isQualitySelectorVisible = !isQualitySelectorVisible
                        controlsVisible = true
                    },
                    modifier = Modifier.fillMaxSize()
                )

                QualitySelector(
                    isVisible = isQualitySelectorVisible,
                    qualities = uiState.availableQualities,
                    selectedQuality = uiState.selectedQuality,
                    onQualitySelected = { quality ->
                        viewModel.selectVideoQuality(quality)
                        isQualitySelectorVisible = false
                        controlsVisible = true
                    },
                    onResetToAuto = {
                        viewModel.resetVideoQuality()
                        isQualitySelectorVisible = false
                        controlsVisible = true
                    },
                    onDismiss = { isQualitySelectorVisible = false }
                )
            }
            
            is UiState.Error -> {
                ErrorMessage(
                    message = "Error al cargar el contenido: ${contentState.message}",
                    onNavigateBack = onNavigateBack,
                    modifier = Modifier.align(Alignment.Center)
                )
            }
        }
    }
}

// Helper to find the hosting Activity from a Compose LocalContext
private tailrec fun android.content.Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

@Composable
private fun ErrorMessage(
    message: String,
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.padding(32.dp),
        colors = CardDefaults.cardColors(
            containerColor = Color.Black.copy(alpha = 0.8f)
        )
    ) {
        Column(
            modifier = Modifier.padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = stringResource(R.string.player_error),
                style = MaterialTheme.typography.headlineSmall,
                color = Color.White
            )
            
            Spacer(modifier = Modifier.height(16.dp))
            
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White.copy(alpha = 0.8f)
            )
            
            Spacer(modifier = Modifier.height(24.dp))
            
            Button(
                onClick = onNavigateBack,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary
                )
            ) {
                Text(stringResource(R.string.player_back))
            }
        }
    }
}

/**
 * UI State for episodic player
 */
data class EpisodicPlayerUiState(
    val contentState: UiState<ContentDetails> = UiState.Loading,
    val playerState: UiState<Any> = UiState.Loading,
    val currentEpisodeId: String? = null,
    val isPlaying: Boolean = false,
    val currentPosition: Long = 0L,
    val duration: Long = 0L,
    val autoPlayNext: Boolean = true,
    val isBuffering: Boolean = false,
    val playbackSpeed: Float = 1.0f,
    val infoMessage: String? = null,
    val availableAudioTracks: List<com.streamcore.tv.domain.model.AudioTrack> = emptyList(),
    val selectedAudioTrack: com.streamcore.tv.domain.model.AudioTrack? = null,
    val availableSubtitleOptions: List<SubtitleOption> = emptyList(),
    val selectedSubtitleOption: SubtitleOption? = null,
    val availableQualities: List<VideoTrack> = emptyList(),
    val selectedQuality: VideoTrack? = null
)

/**
 * Generic UI State sealed class
 */
sealed class UiState<out T> {
    object Loading : UiState<Nothing>()
    data class Success<T>(val data: T) : UiState<T>()
    data class Error(val message: String, val exception: Throwable? = null) : UiState<Nothing>()
}
