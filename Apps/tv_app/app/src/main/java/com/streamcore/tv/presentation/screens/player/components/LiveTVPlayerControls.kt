package com.streamcore.tv.presentation.screens.player.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ClosedCaption
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.HighQuality
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.input.key.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import com.streamcore.tv.R
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.streamcore.tv.domain.model.ContentDetails
import kotlinx.coroutines.delay

/**
 * Live TV Player Controls - Simplified controls for live content
 * Only includes play/pause and basic navigation
 */
@Composable
fun LiveTVPlayerControls(
    content: ContentDetails,
    isPlaying: Boolean,
    onPlayPause: () -> Unit,
    onNavigateBack: () -> Unit,
    onToggleChannelSidebar: () -> Unit = {},
    isChannelSidebarVisible: Boolean = false,
    controlsVisible: Boolean = true,
    onToggleAudioSelector: () -> Unit = {},
    onToggleQualitySelector: () -> Unit = {},
    onToggleSubtitleSelector: () -> Unit = {},
    hasMultipleAudioTracks: Boolean = false,
    hasMultipleQualities: Boolean = false,
    hasSubtitles: Boolean = false,
    onShowSettings: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val alpha by animateFloatAsState(
        targetValue = if (controlsVisible) 1f else 0f,
        animationSpec = tween(300)
    )

    Box(
        modifier = modifier.alpha(alpha)
    ) {
        // Top Controls - Title and Back Button
        LiveTVTopControls(
            title = content.title,
            onNavigateBack = onNavigateBack,
            isChannelSidebarVisible = isChannelSidebarVisible,
            modifier = Modifier
                .align(Alignment.TopStart)
                .fillMaxWidth()
        )

        // Center controls removed: play/pause moved to bottom-left vertical stack

        // Live TV Indicator - Moved to top right corner
        LiveTVIndicator(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(end = 16.dp, top = 16.dp)
        )

        // Bottom Controls - Vertical stack: Play/Pause, Channels, Language, Quality
        LiveTVBottomControls(
            isPlaying = isPlaying,
            onPlayPause = onPlayPause,
            onToggleChannelSidebar = onToggleChannelSidebar,
            onToggleAudioSelector = onToggleAudioSelector,
            onToggleSubtitleSelector = onToggleSubtitleSelector,
            onToggleQualitySelector = onToggleQualitySelector,
            hasMultipleAudioTracks = hasMultipleAudioTracks,
            hasMultipleQualities = hasMultipleQualities,
            hasSubtitles = hasSubtitles,
            onShowSettings = onShowSettings,
            isChannelSidebarVisible = isChannelSidebarVisible,
            controlsVisible = controlsVisible,
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
        )
    }
}

/**
 * Top controls for Live TV
 */
@Composable
private fun LiveTVTopControls(
    title: String,
    onNavigateBack: () -> Unit,
    isChannelSidebarVisible: Boolean,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(
                brush = androidx.compose.ui.graphics.Brush.verticalGradient(
                    colors = listOf(
                        Color.Black.copy(alpha = 0.8f),
                        Color.Transparent
                    )
                )
            )
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Back Button with focus effect
        if (!isChannelSidebarVisible) {
            var backFocused by remember { mutableStateOf(false) }
            IconButton(
                onClick = onNavigateBack,
                modifier = Modifier
                    .size(48.dp)
                    .onFocusChanged { backFocused = it.isFocused }
                    .then(
                        if (backFocused) {
                            Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .border(2.dp, Color.Cyan, RoundedCornerShape(8.dp))
                                .background(Color.Cyan.copy(alpha = 0.18f), RoundedCornerShape(8.dp))
                        } else {
                            Modifier
                        }
                    )
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = stringResource(R.string.cd_back),
                    tint = if (backFocused) Color.Black else Color.White,
                    modifier = Modifier.size(24.dp)
                )
            }
        }

        Spacer(modifier = Modifier.width(8.dp))

        // Title
        Text(
            text = title,
            color = Color.White,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.weight(1f)
        )

        // Spacer to push title to center (audio controls moved to bottom)
        Spacer(modifier = Modifier.width(48.dp))
    }
}

/**
 * Bottom controls for Live TV - vertical stack (bottom-left):
 * Play/Pause, Channels, Language, Quality
 */
@Composable
private fun LiveTVBottomControls(
    isPlaying: Boolean,
    onPlayPause: () -> Unit,
    onToggleChannelSidebar: () -> Unit,
    onToggleAudioSelector: () -> Unit,
    onToggleSubtitleSelector: () -> Unit,
    onToggleQualitySelector: () -> Unit,
    hasMultipleAudioTracks: Boolean,
    hasMultipleQualities: Boolean,
    hasSubtitles: Boolean,
    onShowSettings: () -> Unit,
    isChannelSidebarVisible: Boolean,
    controlsVisible: Boolean,
    modifier: Modifier = Modifier
) {
    val controlFocusRequesters = remember { List(6) { FocusRequester() } }
    var lastFocusedControl by rememberSaveable { mutableIntStateOf(0) }
    val audioEnabled = !isChannelSidebarVisible && hasMultipleAudioTracks
    val subtitleEnabled = !isChannelSidebarVisible && hasSubtitles
    val qualityEnabled = !isChannelSidebarVisible && hasMultipleQualities
    val settingsEnabled = !isChannelSidebarVisible
    val controlEnabledStates = listOf(
        !isChannelSidebarVisible,
        !isChannelSidebarVisible,
        audioEnabled,
        subtitleEnabled,
        qualityEnabled,
        settingsEnabled
    )

    LaunchedEffect(controlsVisible, isChannelSidebarVisible, hasMultipleAudioTracks, hasSubtitles, hasMultipleQualities) {
        if (!controlsVisible || isChannelSidebarVisible) return@LaunchedEffect
        val fallbackIndex = controlEnabledStates.indexOfFirst { it }.takeIf { it >= 0 } ?: return@LaunchedEffect
        val targetIndex = if (controlEnabledStates.getOrNull(lastFocusedControl) == true) lastFocusedControl else fallbackIndex
        lastFocusedControl = targetIndex
        delay(120)
        controlFocusRequesters[targetIndex].requestFocus()
    }

    // Full-width gradient at bottom for readability
    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(
                brush = androidx.compose.ui.graphics.Brush.verticalGradient(
                    colors = listOf(
                        Color.Transparent,
                        Color.Black.copy(alpha = 0.8f)
                    )
                )
            )
            .padding(16.dp)
    ) {
        // Shared focus/hover effect reused for each icon
        @Composable
        fun FocusableIconButton(
            onClick: () -> Unit,
            enabled: Boolean,
            focusRequester: FocusRequester,
            onFocused: () -> Unit,
            content: @Composable () -> Unit
        ) {
            var isFocused by remember { mutableStateOf(false) }
            val scale by animateFloatAsState(
                targetValue = if (isFocused) 1.1f else 1f,
                animationSpec = tween(180), label = "bottomIconScale"
            )
            IconButton(
                onClick = onClick,
                enabled = enabled,
                modifier = Modifier
                    .size(56.dp)
                    .focusRequester(focusRequester)
                    .onFocusChanged {
                        isFocused = it.isFocused
                        if (it.isFocused) onFocused()
                    }
                    .onKeyEvent { keyEvent ->
                        if (!enabled) return@onKeyEvent false
                        when {
                            (keyEvent.key == Key.DirectionCenter || keyEvent.key == Key.Enter) &&
                                keyEvent.type == KeyEventType.KeyDown -> {
                                onClick()
                                true
                            }
                            (keyEvent.key == Key.DirectionCenter || keyEvent.key == Key.Enter) &&
                                keyEvent.type == KeyEventType.KeyUp -> true
                            else -> false
                        }
                    }
                    .clip(RoundedCornerShape(8.dp))
                    .then(
                        if (isFocused) {
                            Modifier
                                .border(2.dp, Color.Cyan, RoundedCornerShape(8.dp))
                                .background(Color.Cyan.copy(alpha = 0.18f), RoundedCornerShape(8.dp))
                        } else {
                            Modifier
                                .border(0.dp, Color.Transparent, RoundedCornerShape(8.dp))
                                .background(Color.Black.copy(alpha = 0.6f), RoundedCornerShape(8.dp))
                        }
                    )
                    .graphicsLayer {
                        scaleX = scale
                        scaleY = scale
                    }
            ) {
                content()
            }
        }

        // Vertical icons column anchored bottom-left
        Column(
            modifier = Modifier.align(Alignment.BottomStart),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            horizontalAlignment = Alignment.Start
        ) {
            // Play / Pause
            FocusableIconButton(
                onClick = onPlayPause,
                enabled = !isChannelSidebarVisible,
                focusRequester = controlFocusRequesters[0],
                onFocused = { lastFocusedControl = 0 }
            ) {
                Icon(
                    imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                    contentDescription = if (isPlaying) stringResource(R.string.player_pause) else stringResource(R.string.player_play),
                    tint = Color.White,
                    modifier = Modifier.size(28.dp)
                )
            }

            // Channels
            FocusableIconButton(
                onClick = onToggleChannelSidebar,
                enabled = !isChannelSidebarVisible,
                focusRequester = controlFocusRequesters[1],
                onFocused = { lastFocusedControl = 1 }
            ) {
                Icon(
                    imageVector = Icons.Default.GridView,
                    contentDescription = stringResource(R.string.open_channel_list),
                    tint = Color.White,
                    modifier = Modifier.size(28.dp)
                )
            }

            // Language / Audio
            FocusableIconButton(
                onClick = onToggleAudioSelector,
                enabled = audioEnabled,
                focusRequester = controlFocusRequesters[2],
                onFocused = { lastFocusedControl = 2 }
            ) {
                Icon(
                    imageVector = Icons.Default.Language,
                    contentDescription = stringResource(R.string.player_select_language),
                    tint = if (audioEnabled) Color.White else Color.White.copy(alpha = 0.5f),
                    modifier = Modifier.size(28.dp)
                )
            }

            // Subtitles
            FocusableIconButton(
                onClick = onToggleSubtitleSelector,
                enabled = subtitleEnabled,
                focusRequester = controlFocusRequesters[3],
                onFocused = { lastFocusedControl = 3 }
            ) {
                Icon(
                    imageVector = Icons.Default.ClosedCaption,
                    contentDescription = stringResource(R.string.player_subtitle_settings),
                    tint = if (subtitleEnabled) Color.White else Color.White.copy(alpha = 0.5f),
                    modifier = Modifier.size(28.dp)
                )
            }

            // Quality
            FocusableIconButton(
                onClick = onToggleQualitySelector,
                enabled = qualityEnabled,
                focusRequester = controlFocusRequesters[4],
                onFocused = { lastFocusedControl = 4 }
            ) {
                Icon(
                    imageVector = Icons.Default.HighQuality,
                    contentDescription = stringResource(R.string.player_select_quality),
                    tint = if (qualityEnabled) Color.White else Color.White.copy(alpha = 0.5f),
                    modifier = Modifier.size(28.dp)
                )
            }

            // Settings
            FocusableIconButton(
                onClick = onShowSettings,
                enabled = settingsEnabled,
                focusRequester = controlFocusRequesters[5],
                onFocused = { lastFocusedControl = 5 }
            ) {
                Icon(
                    imageVector = Icons.Default.Settings,
                    contentDescription = stringResource(R.string.player_settings),
                    tint = if (settingsEnabled) Color.White else Color.White.copy(alpha = 0.5f),
                    modifier = Modifier.size(28.dp)
                )
            }
        }
    }
}

/**
 * Live TV indicator badge
 */
@Composable
private fun LiveTVIndicator(
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(
            containerColor = Color.Red
        ),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            // Live dot indicator
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .background(Color.White, CircleShape)
            )
            
            Text(
                text = stringResource(R.string.live_indicator),
                color = Color.White,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold
            )
        }
    }
}
