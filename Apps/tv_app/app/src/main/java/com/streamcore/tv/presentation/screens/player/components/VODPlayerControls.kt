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
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R
import com.streamcore.tv.domain.model.ContentDetails
import com.streamcore.tv.domain.model.ContentType
import com.streamcore.tv.domain.model.Episode
import com.streamcore.tv.domain.model.AudioTrack
import com.streamcore.tv.presentation.components.player.AudioTrackSelector
import com.streamcore.tv.presentation.components.player.SubtitleSelector
import com.streamcore.tv.domain.model.SubtitleOption
import com.streamcore.tv.presentation.theme.*

/**
 * VOD Player Controls - Full controls for Video On Demand content
 * Includes play/pause, seek, progress bar, forward/backward, and audio selector
 */
@Composable
fun VODPlayerControls(
    content: ContentDetails,
    isPlaying: Boolean,
    currentPosition: Long,
    duration: Long,
    onPlayPause: () -> Unit,
    onSeek: (Long) -> Unit,
    onSeekBackward: () -> Unit,
    onSeekForward: () -> Unit,
    onNavigateBack: () -> Unit,
    currentEpisodeId: String? = null,
    onPreviousEpisode: (Episode) -> Unit = {},
    onNextEpisode: (Episode) -> Unit = {},
    controlsVisible: Boolean = true,
    availableAudioTracks: List<AudioTrack> = emptyList(),
    selectedAudioTrack: AudioTrack? = null,
    onToggleAudioSelector: () -> Unit = {},
    onAudioTrackSelected: (AudioTrack) -> Unit = {},
    onResetAudioTrack: () -> Unit = {},
    availableSubtitleOptions: List<SubtitleOption> = emptyList(),
    selectedSubtitleOption: SubtitleOption? = null,
    onSubtitleSelected: (SubtitleOption) -> Unit = {},
    onDisableSubtitles: () -> Unit = {},
    hasMultipleAudioTracks: Boolean = false,
    hasMultipleQualities: Boolean = false,
    hasMultipleSubtitles: Boolean = false,
    onToggleQualitySelector: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val alpha by animateFloatAsState(
        targetValue = if (controlsVisible) 1f else 0f,
        animationSpec = tween(300)
    )

    // Audio/Subtitle selector state
    var showAudioSelector by remember { mutableStateOf(false) }
    var showSubtitleSelector by remember { mutableStateOf(false) }

    Box(
        modifier = modifier.alpha(alpha)
    ) {
        // Top Controls - Title, Back Button, Audio Selector, Quality Selector, and Subtitle Selector
        VODTopControls(
            title = content.title,
            onNavigateBack = onNavigateBack,
            onToggleAudioSelector = { showAudioSelector = !showAudioSelector },
            hasMultipleAudioTracks = hasMultipleAudioTracks,
            onToggleQualitySelector = onToggleQualitySelector,
            hasMultipleQualities = hasMultipleQualities,
            onToggleSubtitleSelector = { showSubtitleSelector = !showSubtitleSelector },
            hasMultipleSubtitles = hasMultipleSubtitles,
            modifier = Modifier
                .align(Alignment.TopStart)
                .fillMaxWidth()
        )

        // Center Controls - Play/Pause, Forward, Backward
        VODCenterControls(
            isPlaying = isPlaying,
            onPlayPause = onPlayPause,
            onSeekBackward = onSeekBackward,
            onSeekForward = onSeekForward,
            modifier = Modifier.align(Alignment.Center)
        )

        // Bottom Controls - Progress bar and time
        VODBottomControls(
            currentPosition = currentPosition,
            duration = duration,
            onSeek = onSeek,
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
        )

        // Episode Navigation Controls (only for series content)
        EpisodeNavigationControls(
            content = content,
            currentEpisodeId = currentEpisodeId,
            onPreviousEpisode = onPreviousEpisode,
            onNextEpisode = onNextEpisode,
            controlsVisible = controlsVisible,
            modifier = Modifier.fillMaxSize()
        )

        // Small Episode Hint (only for series content)
        if (content.type == ContentType.SERIES && !content.episodes.isNullOrEmpty() && currentEpisodeId != null) {
            EpisodeHint(
                content = content,
                currentEpisodeId = currentEpisodeId,
                controlsVisible = controlsVisible,
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 80.dp) // Below the back button
            )
        }

        // Audio Track Selector
        AudioTrackSelector(
            isVisible = showAudioSelector,
            audioTracks = availableAudioTracks,
            selectedTrack = selectedAudioTrack,
            onTrackSelected = { track ->
                onAudioTrackSelected(track)
                showAudioSelector = false
            },
            onResetToAuto = {
                onResetAudioTrack()
                showAudioSelector = false
            },
            onDismiss = { showAudioSelector = false }
        )

        // Subtitle Selector
        SubtitleSelector(
            isVisible = showSubtitleSelector,
            subtitleOptions = availableSubtitleOptions,
            selectedSubtitle = selectedSubtitleOption,
            onSubtitleSelected = { opt ->
                onSubtitleSelected(opt)
                showSubtitleSelector = false
            },
            onDisableSubtitles = {
                onDisableSubtitles()
                showSubtitleSelector = false
            },
            onDismiss = { showSubtitleSelector = false }
        )
    }
}

/**
 * Top controls for VOD - includes audio selector
 */
@Composable
private fun VODTopControls(
    title: String,
    onNavigateBack: () -> Unit,
    onToggleAudioSelector: () -> Unit = {},
    hasMultipleAudioTracks: Boolean = false,
    onToggleQualitySelector: () -> Unit = {},
    hasMultipleQualities: Boolean = false,
    onToggleSubtitleSelector: () -> Unit = {},
    hasMultipleSubtitles: Boolean = false,
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
                contentDescription = stringResource(R.string.nav_back),
                tint = if (backFocused) Color.Black else Color.White,
                modifier = Modifier.size(24.dp)
            )
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

        // Right side action buttons (only when available)
        if (hasMultipleAudioTracks) {
            var audioFocused by remember { mutableStateOf(false) }
            IconButton(
                onClick = onToggleAudioSelector,
                modifier = Modifier
                    .size(48.dp)
                    .onFocusChanged { audioFocused = it.isFocused }
                    .then(
                        if (audioFocused) {
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
                    imageVector = Icons.AutoMirrored.Filled.VolumeUp,
                    contentDescription = stringResource(R.string.player_select_audio),
                    tint = if (audioFocused) Color.Black else Color.White,
                    modifier = Modifier.size(24.dp)
                )
            }
        }

        if (hasMultipleQualities) {
            var qualityFocused by remember { mutableStateOf(false) }
            IconButton(
                onClick = onToggleQualitySelector,
                modifier = Modifier
                    .size(48.dp)
                    .onFocusChanged { qualityFocused = it.isFocused }
                    .then(
                        if (qualityFocused) {
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
                    imageVector = Icons.Default.HighQuality,
                    contentDescription = stringResource(R.string.player_select_quality),
                    tint = if (qualityFocused) Color.Black else Color.White,
                    modifier = Modifier.size(24.dp)
                )
            }
        }

        if (hasMultipleSubtitles) {
            var subsFocused by remember { mutableStateOf(false) }
            IconButton(
                onClick = onToggleSubtitleSelector,
                modifier = Modifier
                    .size(48.dp)
                    .onFocusChanged { subsFocused = it.isFocused }
                    .then(
                        if (subsFocused) {
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
                    imageVector = Icons.Default.Subtitles,
                    contentDescription = stringResource(R.string.player_select_subtitles),
                    tint = if (subsFocused) Color.Black else Color.White,
                    modifier = Modifier.size(24.dp)
                )
            }
        }
    }
}

/**
 * Center controls for VOD - Play/Pause, Forward, Backward
 */
@Composable
private fun VODCenterControls(
    isPlaying: Boolean,
    onPlayPause: () -> Unit,
    onSeekBackward: () -> Unit,
    onSeekForward: () -> Unit,
    modifier: Modifier = Modifier
) {
    var playPauseFocused by remember { mutableStateOf(false) }
    var backwardFocused by remember { mutableStateOf(false) }
    var forwardFocused by remember { mutableStateOf(false) }

    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(24.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Seek Backward
        IconButton(
            onClick = onSeekBackward,
            modifier = Modifier
                .size(56.dp)
                .onFocusChanged { backwardFocused = it.isFocused }
                .then(
                    if (backwardFocused) {
                        Modifier
                            .clip(CircleShape)
                            .border(
                                width = 2.dp,
                                color = Color.Cyan,
                                shape = CircleShape
                            )
                            .background(
                                Color.Cyan.copy(alpha = 0.18f),
                                CircleShape
                            )
                    } else {
                        Modifier
                    }
                )
        ) {
            Icon(
                imageVector = Icons.Default.Replay10,
                contentDescription = stringResource(R.string.player_backward),
                tint = if (backwardFocused) Color.Black else Color.White,
                modifier = Modifier.size(32.dp)
            )
        }

        // Play/Pause
        IconButton(
            onClick = onPlayPause,
            modifier = Modifier
                .size(72.dp)
                .onFocusChanged { playPauseFocused = it.isFocused }
                .then(
                    if (playPauseFocused) {
                        Modifier
                            .clip(CircleShape)
                            .border(
                                width = 2.dp,
                                color = Color.Cyan,
                                shape = CircleShape
                            )
                            .background(
                                Color.Cyan.copy(alpha = 0.18f),
                                CircleShape
                            )
                    } else {
                        Modifier
                    }
                )
        ) {
            Icon(
                imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                contentDescription = if (isPlaying) stringResource(R.string.player_pause) else stringResource(R.string.player_play),
                tint = if (playPauseFocused) Color.Black else Color.White,
                modifier = Modifier.size(56.dp)
            )
        }

        // Seek Forward
        IconButton(
            onClick = onSeekForward,
            modifier = Modifier
                .size(56.dp)
                .onFocusChanged { forwardFocused = it.isFocused }
                .then(
                    if (forwardFocused) {
                        Modifier
                            .clip(CircleShape)
                            .border(
                                width = 2.dp,
                                color = Color.Cyan,
                                shape = CircleShape
                            )
                            .background(
                                Color.Cyan.copy(alpha = 0.18f),
                                CircleShape
                            )
                    } else {
                        Modifier
                    }
                )
        ) {
            Icon(
                imageVector = Icons.Default.Forward10,
                contentDescription = stringResource(R.string.player_forward),
                tint = if (forwardFocused) Color.Black else Color.White,
                modifier = Modifier.size(32.dp)
            )
        }
    }
}

/**
 * Bottom controls for VOD - Progress bar and time display
 */
@Composable
private fun VODBottomControls(
    currentPosition: Long,
    duration: Long,
    onSeek: (Long) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
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
        // Progress Bar
        var sliderPosition by remember { mutableFloatStateOf(0f) }
        var isDragging by remember { mutableStateOf(false) }
        var previewPosition by remember { mutableLongStateOf(0L) }

        // Update slider position when not dragging
        LaunchedEffect(currentPosition, duration) {
            if (!isDragging && duration > 0) {
                sliderPosition = (currentPosition.toFloat() / duration.toFloat()).coerceIn(0f, 1f)
            }
        }

        // Progress Bar with enhanced styling
        Slider(
            value = sliderPosition,
            onValueChange = { newValue ->
                sliderPosition = newValue
                isDragging = true
                // Calculate preview position for immediate feedback
                previewPosition = (newValue * duration).toLong()
            },
            onValueChangeFinished = {
                isDragging = false
                val newPosition = (sliderPosition * duration).toLong()
                onSeek(newPosition)
            },
            colors = SliderDefaults.colors(
                thumbColor = Color.Cyan,
                activeTrackColor = Color.Cyan,
                inactiveTrackColor = Color.White.copy(alpha = 0.3f)
            ),
            modifier = Modifier
                .fillMaxWidth()
                .height(24.dp) // Make it easier to interact with
        )

        Spacer(modifier = Modifier.height(8.dp))

        // Time Display
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            // Current time (show preview when dragging)
            Text(
                text = formatTime(if (isDragging) previewPosition else currentPosition),
                color = if (isDragging) Color.Cyan else Color.White,
                fontSize = 14.sp,
                fontWeight = if (isDragging) FontWeight.Bold else FontWeight.Normal
            )

            // Duration
            Text(
                text = formatTime(duration),
                color = Color.White,
                fontSize = 14.sp
            )
        }
    }
}

/**
 * Small episode hint - compact info without buttons
 */
@Composable
private fun EpisodeHint(
    content: ContentDetails,
    currentEpisodeId: String,
    controlsVisible: Boolean,
    modifier: Modifier = Modifier
) {
    val episodes = content.episodes ?: return
    val currentEpisodeIndex = episodes.indexOfFirst { it.id.toString() == currentEpisodeId }

    if (currentEpisodeIndex == -1) return

    val currentEpisode = episodes[currentEpisodeIndex]
    val episodeNumber = currentEpisodeIndex + 1
    val totalEpisodes = episodes.size

    val alpha by animateFloatAsState(
        targetValue = if (controlsVisible) 1f else 0f,
        animationSpec = tween(300)
    )

    Card(
        modifier = modifier
            .alpha(alpha)
            .padding(horizontal = 16.dp),
        colors = CardDefaults.cardColors(
            containerColor = Color.Black.copy(alpha = 0.7f)
        ),
        shape = RoundedCornerShape(8.dp)
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = stringResource(R.string.player_episode_count, episodeNumber, totalEpisodes),
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.8f),
                fontSize = 12.sp
            )

            Text(
                text = currentEpisode.title,
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center
            )
        }
    }
}

/**
 * Format time in milliseconds to HH:MM:SS or MM:SS format
 */
private fun formatTime(timeMs: Long): String {
    val totalSeconds = timeMs / 1000
    val hours = totalSeconds / 3600
    val minutes = (totalSeconds % 3600) / 60
    val seconds = totalSeconds % 60

    return if (hours > 0) {
        String.format(java.util.Locale.getDefault(), "%d:%02d:%02d", hours, minutes, seconds)
    } else {
        String.format(java.util.Locale.getDefault(), "%02d:%02d", minutes, seconds)
    }
}
