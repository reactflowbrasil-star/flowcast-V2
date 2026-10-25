package com.streamcore.tv.presentation.player

import android.app.Activity
import android.content.ContextWrapper
import android.view.WindowManager
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.media3.ui.PlayerView
import com.streamcore.tv.R
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import com.streamcore.tv.core.utils.ShowToast
import com.streamcore.tv.domain.model.UiState
import com.streamcore.tv.presentation.components.LoadingIndicator
import com.streamcore.tv.presentation.components.ErrorScreen
import com.streamcore.tv.presentation.player.components.AdvancedPlayerControls
import com.streamcore.tv.presentation.theme.*
import kotlinx.coroutines.delay

/**
 * Advanced player screen with full ExoPlayer integration
 * 
 * Supports HLS, DASH, progressive streams with advanced controls
 */
@OptIn(UnstableApi::class)
@Composable
fun AdvancedPlayerScreen(
    contentId: String,
    onNavigateBack: () -> Unit,
    viewModel: AdvancedPlayerViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val exoPlayer by viewModel.exoPlayerState.collectAsState()
    @Suppress("UNUSED_VARIABLE")
    val context = LocalContext.current
    
    // Keep screen on at the window level while this screen is visible
    DisposableEffect(Unit) {
        val activity = context.findActivity()
        activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose {
            activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    // Initialize player with content
    LaunchedEffect(contentId) {
        viewModel.loadContent(contentId)
    }
    
    // Position updates
    LaunchedEffect(uiState.isPlaying) {
        if (uiState.isPlaying) {
            while (true) {
                delay(1000) // Update every second
                viewModel.updatePosition()
            }
        }
    }
    
    // Show error messages
    uiState.error?.let { error ->
        ShowToast(message = error)
        LaunchedEffect(error) {
            viewModel.clearError()
        }
    }
    
    // Cleanup on dispose
    DisposableEffect(Unit) {
        onDispose {
            viewModel.releasePlayer()
        }
    }
    
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
    ) {
        when (val contentState = uiState.contentState) {
            is UiState.Loading -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        LoadingIndicator(color = Color.White)
                        Text(
                            text = stringResource(R.string.player_loading),
                            color = Color.White,
                            style = MaterialTheme.typography.bodyLarge
                        )
                    }
                }
            }
            
            is UiState.Success -> {
                val content = contentState.data
                
                // ExoPlayer View handled natively by AndroidView
                AndroidView(
                    factory = { context ->
                        PlayerView(context).apply {
                            player = exoPlayer
                            useController = false // We'll use custom controls
                            setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING)
                            // Prevent screen dimming/screensaver while the player is visible
                            keepScreenOn = true
                        }
                    },
                    modifier = Modifier.fillMaxSize(),
                    update = { playerView ->
                        playerView.player = exoPlayer
                        // Ensure flag remains while this view is attached
                        playerView.keepScreenOn = true
                    }
                )
                
                // Custom Player Controls Overlay
                AdvancedPlayerControls(
                    content = content,
                    isPlaying = uiState.isPlaying,
                    currentPosition = uiState.currentPosition,
                    duration = uiState.duration,
                    bufferedPercentage = uiState.bufferedPercentage,
                    volume = uiState.volume,
                    playbackSpeed = uiState.playbackSpeed,
                    subtitlesEnabled = uiState.subtitlesEnabled,
                    qualityOptions = uiState.availableQualities,
                    selectedQuality = uiState.selectedQuality,
                    onPlayPause = viewModel::togglePlayPause,
                    onSeek = viewModel::seekTo,
                    onVolumeChange = viewModel::setVolume,
                    onSpeedChange = viewModel::setPlaybackSpeed,
                    onToggleSubtitles = viewModel::toggleSubtitles,
                    onQualityChange = viewModel::changeQuality,
                    onNavigateBack = onNavigateBack,
                    availableAudioTracks = uiState.availableAudioTracks,
                    selectedAudioTrack = uiState.selectedAudioTrack,
                    onToggleAudioSelector = viewModel::toggleAudioSelector,
                    onAudioTrackSelected = viewModel::selectAudioTrack,
                    onResetAudioTrack = viewModel::resetAudioTrack,
                    availableSubtitleOptions = viewModel.getAvailableSubtitleOptions(),
                    selectedSubtitleOption = viewModel.getAvailableSubtitleOptions().firstOrNull { it.isSelected },
                    onSubtitleSelected = viewModel::selectSubtitleOption,
                    onDisableSubtitles = viewModel::resetSubtitles,
                    hasMultipleAudioTracks = uiState.availableAudioTracks.isNotEmpty(),
                    modifier = Modifier.fillMaxSize()
                )
            }
            
            is UiState.Error -> {
                ErrorScreen(
                    message = contentState.message,
                    onRetry = { viewModel.loadContent(contentId) }
                )
                
                // Back button for error state
                IconButton(
                    onClick = onNavigateBack,
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(16.dp)
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = stringResource(R.string.cd_back),
                        tint = Color.White
                    )
                }
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
