package com.streamcore.tv.presentation.screens.player.components

import androidx.compose.animation.*
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.input.key.*
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R
import com.streamcore.tv.domain.model.ContentDetails
import com.streamcore.tv.domain.model.Episode

/**
 * Netflix-style episodic player controls for series
 */
@Composable
fun EpisodicPlayerControls(
    content: ContentDetails,
    currentEpisodeId: String?,
    isPlaying: Boolean,
    currentPosition: Long,
    duration: Long,
    onPlayPause: () -> Unit,
    onSeek: (Long) -> Unit,
    onSeekBackward: () -> Unit,
    onSeekForward: () -> Unit,
    onPreviousEpisode: (Episode) -> Unit,
    onNextEpisode: (Episode) -> Unit,
    onNavigateBack: () -> Unit,
    onToggleControls: () -> Unit,
    controlsVisible: Boolean = true,
    autoPlayNext: Boolean = true,
    onToggleAutoPlay: () -> Unit,
    onToggleAudioSelector: () -> Unit = {},
    hasMultipleAudioTracks: Boolean = false,
    modifier: Modifier = Modifier
) {
    val episodes = content.episodes ?: emptyList()
    val currentEpisodeIndex = episodes.indexOfFirst { it.id.toString() == currentEpisodeId }
    
    if (currentEpisodeIndex == -1) return

    val currentEpisode = episodes[currentEpisodeIndex]
    val hasPrevious = currentEpisodeIndex > 0
    val hasNext = currentEpisodeIndex < episodes.size - 1

    val alpha by animateFloatAsState(
        targetValue = if (controlsVisible) 1f else 0f,
        animationSpec = tween(300)
    )

    Box(
        modifier = modifier
            .alpha(alpha)
            .clickable(
                interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() },
                indication = null
            ) { onToggleControls() }
    ) {
        // Top Controls - Back button, episode info, and audio selector
        TopEpisodicControls(
            content = content,
            currentEpisode = currentEpisode,
            episodeNumber = currentEpisodeIndex + 1,
            totalEpisodes = episodes.size,
            onNavigateBack = onNavigateBack,
            onToggleAudioSelector = onToggleAudioSelector,
            hasMultipleAudioTracks = hasMultipleAudioTracks,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .fillMaxWidth()
        )

        // Center Controls - Play/Pause, Seek, and Episode Navigation
        CenterEpisodicControls(
            isPlaying = isPlaying,
            hasPrevious = hasPrevious,
            hasNext = hasNext,
            onPlayPause = onPlayPause,
            onSeekBackward = onSeekBackward,
            onSeekForward = onSeekForward,
            onPrevious = if (hasPrevious) { { onPreviousEpisode(episodes[currentEpisodeIndex - 1]) } } else null,
            onNext = if (hasNext) { { onNextEpisode(episodes[currentEpisodeIndex + 1]) } } else null,
            modifier = Modifier.align(Alignment.Center)
        )

        // Bottom Controls - Progress, time, and settings
        BottomEpisodicControls(
            currentPosition = currentPosition,
            duration = duration,
            onSeek = onSeek,
            autoPlayNext = autoPlayNext,
            onToggleAutoPlay = onToggleAutoPlay,
            hasNext = hasNext,
            nextEpisode = if (hasNext) episodes[currentEpisodeIndex + 1] else null,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
        )
    }
}

@Composable
private fun TopEpisodicControls(
    content: ContentDetails,
    currentEpisode: Episode,
    episodeNumber: Int,
    totalEpisodes: Int,
    onNavigateBack: () -> Unit,
    onToggleAudioSelector: () -> Unit = {},
    hasMultipleAudioTracks: Boolean = false,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .padding(24.dp)
            .fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Back button with focus effect
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
                            .background(Color.Black.copy(alpha = 0.6f), CircleShape)
                    }
                )
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = stringResource(R.string.nav_back),
                tint = if (backFocused) Color.Black else Color.White,
                modifier = Modifier.size(24.dp)
            )
        }

        Spacer(modifier = Modifier.width(16.dp))

        // Episode info
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = content.title,
                style = MaterialTheme.typography.titleLarge,
                color = Color.White,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            Text(
                text = stringResource(R.string.series_episode_detail_format, episodeNumber, totalEpisodes, currentEpisode.title),
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White.copy(alpha = 0.8f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }

        // Audio Track Button (for dual audio episodes)
        IconButton(
            onClick = onToggleAudioSelector,
            modifier = Modifier
                .size(48.dp)
                .background(
                    Color.Black.copy(alpha = 0.6f),
                    CircleShape
                )
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.VolumeUp,
                contentDescription = stringResource(R.string.player_select_audio),
                tint = if (hasMultipleAudioTracks) Color.White else Color.White.copy(alpha = 0.5f),
                modifier = Modifier.size(24.dp)
            )
        }
    }
}

@Composable
private fun CenterEpisodicControls(
    isPlaying: Boolean,
    hasPrevious: Boolean,
    hasNext: Boolean,
    onPlayPause: () -> Unit,
    onSeekBackward: () -> Unit,
    onSeekForward: () -> Unit,
    onPrevious: (() -> Unit)?,
    onNext: (() -> Unit)?,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(24.dp)
    ) {
        // Previous episode button
        EpisodicControlButton(
            icon = Icons.Default.SkipPrevious,
            contentDescription = stringResource(R.string.player_previous),
            enabled = hasPrevious,
            onClick = onPrevious,
            size = 48.dp
        )

        // Seek backward button
        EpisodicControlButton(
            icon = Icons.Default.Replay10,
            contentDescription = stringResource(R.string.player_backward),
            enabled = true,
            onClick = { onSeekBackward() },
            size = 56.dp
        )

        // Play/Pause button
        EpisodicControlButton(
            icon = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
            contentDescription = if (isPlaying) stringResource(R.string.player_pause) else stringResource(R.string.player_play),
            enabled = true,
            onClick = { onPlayPause() },
            size = 72.dp,
            isPrimary = true
        )

        // Seek forward button
        EpisodicControlButton(
            icon = Icons.Default.Forward10,
            contentDescription = stringResource(R.string.player_forward),
            enabled = true,
            onClick = { onSeekForward() },
            size = 56.dp
        )

        // Next episode button
        EpisodicControlButton(
            icon = Icons.Default.SkipNext,
            contentDescription = stringResource(R.string.player_next_episode),
            enabled = hasNext,
            onClick = onNext,
            size = 48.dp
        )
    }
}

@Composable
private fun EpisodicControlButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String,
    enabled: Boolean,
    onClick: (() -> Unit)?,
    size: androidx.compose.ui.unit.Dp,
    isPrimary: Boolean = false,
    modifier: Modifier = Modifier
) {
    var isFocused by remember { mutableStateOf(false) }

    IconButton(
        onClick = { onClick?.invoke() },
        enabled = enabled,
        modifier = modifier
            .size(size)
            .onFocusChanged { isFocused = it.isFocused }
            .then(
                when {
                    !enabled -> Modifier.background(
                        Color.Black.copy(alpha = 0.3f),
                        CircleShape
                    )
                    isFocused -> Modifier
                        .border(2.dp, Color.Cyan, CircleShape)
                        .background(Color.Cyan.copy(alpha = 0.18f), CircleShape)
                    else -> Modifier.background(
                        if (isPrimary) Color.White.copy(alpha = 0.9f) else Color.Black.copy(alpha = 0.6f),
                        CircleShape
                    )
                }
            )
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = when {
                !enabled -> Color.White.copy(alpha = 0.3f)
                isFocused -> Color.Black
                else -> Color.White
            },
            modifier = Modifier.size(size * 0.5f)
        )
    }
}

@Composable
private fun BottomEpisodicControls(
    currentPosition: Long,
    duration: Long,
    onSeek: (Long) -> Unit,
    autoPlayNext: Boolean,
    onToggleAutoPlay: () -> Unit,
    hasNext: Boolean,
    nextEpisode: Episode?,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.padding(24.dp)
    ) {
        // Enhanced Progress bar with D-pad support
        if (duration > 0) {
            DPadSeekBar(
                currentPosition = currentPosition,
                duration = duration,
                onSeek = onSeek,
                modifier = Modifier.fillMaxWidth()
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Bottom row with time and settings
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Time display
            Text(
                text = stringResource(R.string.player_position_duration, formatTime(currentPosition), formatTime(duration)),
                style = MaterialTheme.typography.bodySmall,
                color = Color.White
            )

            // Auto-play toggle and next episode info
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                if (hasNext && nextEpisode != null) {
                    Text(
                        text = stringResource(R.string.player_next, nextEpisode.title),
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.8f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                // Auto-play toggle
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.clickable { onToggleAutoPlay() }
                ) {
                    Switch(
                        checked = autoPlayNext,
                        onCheckedChange = { onToggleAutoPlay() },
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = Color.Red,
                            checkedTrackColor = Color.Red.copy(alpha = 0.5f)
                        )
                    )
                    
                    Spacer(modifier = Modifier.width(8.dp))
                    
                    Text(
                        text = stringResource(R.string.player_autoplay),
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White
                    )
                }
            }
        }
    }
}

/**
 * Custom seek bar with D-pad support for TV navigation
 */
@Composable
private fun DPadSeekBar(
    currentPosition: Long,
    duration: Long,
    onSeek: (Long) -> Unit,
    modifier: Modifier = Modifier
) {
    var sliderPosition by remember { mutableFloatStateOf(0f) }
    var isDragging by remember { mutableStateOf(false) }
    var isFocused by remember { mutableStateOf(false) }
    var previewPosition by remember { mutableLongStateOf(0L) }
    val focusRequester = remember { FocusRequester() }

    // Update slider position when not dragging
    LaunchedEffect(currentPosition, duration) {
        if (!isDragging && duration > 0) {
            sliderPosition = (currentPosition.toFloat() / duration.toFloat()).coerceIn(0f, 1f)
        }
    }

    Column(modifier = modifier) {
        // Progress Bar with D-pad support
        Slider(
            value = sliderPosition,
            onValueChange = { newValue ->
                sliderPosition = newValue
                isDragging = true
                previewPosition = (newValue * duration).toLong()
            },
            onValueChangeFinished = {
                isDragging = false
                val newPosition = (sliderPosition * duration).toLong()
                onSeek(newPosition)
            },
            colors = SliderDefaults.colors(
                thumbColor = if (isFocused) Color.White else Color.Cyan,
                activeTrackColor = Color.Cyan,
                inactiveTrackColor = Color.White.copy(alpha = 0.3f)
            ),
            modifier = Modifier
                .fillMaxWidth()
                .height(32.dp)
                .focusRequester(focusRequester)
                .onFocusChanged { focusState ->
                    isFocused = focusState.isFocused
                }
                .onKeyEvent { keyEvent ->
                    if (keyEvent.type == KeyEventType.KeyDown && isFocused) {
                        when (keyEvent.key) {
                            Key.DirectionLeft -> {
                                // Seek backward 10 seconds
                                val newPosition = (currentPosition - 10000).coerceAtLeast(0)
                                onSeek(newPosition)
                                true
                            }
                            Key.DirectionRight -> {
                                // Seek forward 10 seconds
                                val newPosition = (currentPosition + 10000).coerceAtMost(duration)
                                onSeek(newPosition)
                                true
                            }
                            else -> false
                        }
                    } else {
                        false
                    }
                }
        )

        Spacer(modifier = Modifier.height(8.dp))

        // Time Display
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = formatTime(if (isDragging) previewPosition else currentPosition),
                color = Color.White,
                fontSize = 14.sp
            )
            Text(
                text = formatTime(duration),
                color = Color.White.copy(alpha = 0.7f),
                fontSize = 14.sp
            )
        }
    }
}

private fun formatTime(timeMs: Long): String {
    val totalSeconds = timeMs / 1000
    val hours = totalSeconds / 3600
    val minutes = (totalSeconds % 3600) / 60
    val seconds = totalSeconds % 60

    return if (hours > 0) {
        String.format(java.util.Locale.getDefault(), "%d:%02d:%02d", hours, minutes, seconds)
    } else {
        String.format(java.util.Locale.getDefault(), "%d:%02d", minutes, seconds)
    }
}
