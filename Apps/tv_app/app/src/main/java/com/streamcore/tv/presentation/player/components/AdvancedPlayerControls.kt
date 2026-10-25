package com.streamcore.tv.presentation.player.components

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.streamcore.tv.domain.model.ContentDetails
import com.streamcore.tv.presentation.theme.*
import kotlinx.coroutines.delay
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R
import com.streamcore.tv.presentation.components.player.AudioTrackSelector
import com.streamcore.tv.presentation.components.player.SubtitleSelector
import com.streamcore.tv.domain.model.AudioTrack
import com.streamcore.tv.domain.model.SubtitleOption

/**
 * Advanced player controls with full feature set
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdvancedPlayerControls(
    content: ContentDetails,
    isPlaying: Boolean,
    currentPosition: Long,
    duration: Long,
    bufferedPercentage: Int,
    volume: Float,
    playbackSpeed: Float,
    subtitlesEnabled: Boolean,
    qualityOptions: List<String>,
    selectedQuality: String,
    availableAudioTracks: List<AudioTrack> = emptyList(),
    selectedAudioTrack: AudioTrack? = null,
    availableSubtitleOptions: List<SubtitleOption> = emptyList(),
    selectedSubtitleOption: SubtitleOption? = null,
    onPlayPause: () -> Unit,
    onSeek: (Long) -> Unit,
    onVolumeChange: (Float) -> Unit,
    onSpeedChange: (Float) -> Unit,
    onToggleSubtitles: () -> Unit,
    onQualityChange: (String) -> Unit,
    onNavigateBack: () -> Unit,
    onToggleAudioSelector: () -> Unit = {},
    onAudioTrackSelected: (AudioTrack) -> Unit = {},
    onResetAudioTrack: () -> Unit = {},
    onSubtitleSelected: (SubtitleOption) -> Unit = {},
    onDisableSubtitles: () -> Unit = {},
    hasMultipleAudioTracks: Boolean = false,
    modifier: Modifier = Modifier
) {
    var controlsVisible by remember { mutableStateOf(true) }
    var showSettings by remember { mutableStateOf(false) }
    var showAudioSelector by remember { mutableStateOf(false) }
    var showSubtitleSelector by remember { mutableStateOf(false) }
    
    // Auto-hide controls after 3 seconds
    LaunchedEffect(controlsVisible, isPlaying) {
        if (controlsVisible && isPlaying) {
            delay(3000)
            controlsVisible = false
        }
    }
    
    Box(
        modifier = modifier.clickable { controlsVisible = !controlsVisible }
    ) {
        AnimatedVisibility(
            visible = controlsVisible,
            enter = fadeIn(),
            exit = fadeOut()
        ) {
            Box(modifier = Modifier.fillMaxSize()) {
                // Top Controls
                TopPlayerControls(
                    title = content.title,
                    onNavigateBack = onNavigateBack,
                    onSettingsClick = { showSettings = true },
                    onToggleAudioSelector = { showAudioSelector = !showAudioSelector },
                    onToggleSubtitleSelector = { showSubtitleSelector = !showSubtitleSelector },
                    hasMultipleAudioTracks = hasMultipleAudioTracks,
                    hasSubtitles = availableSubtitleOptions.isNotEmpty(),
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .fillMaxWidth()
                )
                
                // Bottom-left quick actions (vertical): Play/Pause, Language, Quality
                Column(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(start = 16.dp, bottom = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    horizontalAlignment = Alignment.Start
                ) {
                    // Play/Pause
                    IconButton(
                        onClick = onPlayPause,
                        modifier = Modifier.size(56.dp)
                    ) {
                        Icon(
                            imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                            contentDescription = if (isPlaying) stringResource(R.string.player_pause) else stringResource(R.string.player_play),
                            tint = Color.White
                        )
                    }
                    // Language/Audio selector
                    IconButton(
                        onClick = { showAudioSelector = true },
                        modifier = Modifier.size(56.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Language,
                            contentDescription = stringResource(R.string.player_select_audio),
                            tint = Color.White
                        )
                    }
                    // Subtitles selector
                    if (availableSubtitleOptions.isNotEmpty()) {
                        IconButton(
                            onClick = { showSubtitleSelector = true },
                            modifier = Modifier.size(56.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Subtitles,
                                contentDescription = stringResource(R.string.player_select_subtitles),
                                tint = Color.White
                            )
                        }
                    }
                    // Quality selector (open settings panel)
                    IconButton(
                        onClick = { showSettings = true },
                        modifier = Modifier.size(56.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.HighQuality,
                            contentDescription = stringResource(R.string.player_select_quality),
                            tint = Color.White
                        )
                    }
                }
                
                // Bottom Controls
                BottomPlayerControls(
                    currentPosition = currentPosition,
                    duration = duration,
                    bufferedPercentage = bufferedPercentage,
                    onSeek = onSeek,
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .fillMaxWidth()
                )
            }
        }
        
        // Settings Panel
        if (showSettings) {
            PlayerSettingsPanel(
                volume = volume,
                playbackSpeed = playbackSpeed,
                subtitlesEnabled = subtitlesEnabled,
                qualityOptions = qualityOptions,
                selectedQuality = selectedQuality,
                onVolumeChange = onVolumeChange,
                onSpeedChange = onSpeedChange,
                onToggleSubtitles = onToggleSubtitles,
                onQualityChange = onQualityChange,
                onDismiss = { showSettings = false },
                modifier = Modifier.align(Alignment.CenterEnd)
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

@Composable
private fun TopPlayerControls(
    title: String,
    onNavigateBack: () -> Unit,
    onSettingsClick: () -> Unit,
    onToggleAudioSelector: () -> Unit = {},
    onToggleSubtitleSelector: () -> Unit = {},
    hasMultipleAudioTracks: Boolean = false,
    hasSubtitles: Boolean = false,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        Color.Black.copy(alpha = 0.7f),
                        Color.Transparent
                    )
                )
            )
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            IconButton(onClick = onNavigateBack) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = stringResource(R.string.cd_back),
                    tint = Color.White,
                    modifier = Modifier.size(24.dp)
                )
            }
            
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                color = Color.White,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f)
            )
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Audio Track Button
            IconButton(onClick = onToggleAudioSelector) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.VolumeUp,
                    contentDescription = stringResource(R.string.player_select_audio),
                    tint = if (hasMultipleAudioTracks) Primary else Color.White.copy(alpha = 0.5f),
                    modifier = Modifier.size(24.dp)
                )
            }

            // Subtitle Button
            if (hasSubtitles) {
                IconButton(onClick = onToggleSubtitleSelector) {
                    Icon(
                        imageVector = Icons.Default.Subtitles,
                        contentDescription = stringResource(R.string.player_select_subtitles),
                        tint = Color.White,
                        modifier = Modifier.size(24.dp)
                    )
                }
            }

            // Settings Button
            IconButton(onClick = onSettingsClick) {
                Icon(
                    imageVector = Icons.Default.Settings,
                    contentDescription = stringResource(R.string.settings_title),
                    tint = Color.White,
                    modifier = Modifier.size(24.dp)
                )
            }
        }
    }
}

@Composable
private fun CenterPlayerControls(
    isPlaying: Boolean,
    onPlayPause: () -> Unit,
    onSeekBackward: () -> Unit,
    onSeekForward: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(32.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Seek Backward
        IconButton(
            onClick = onSeekBackward,
            modifier = Modifier.size(56.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Replay10,
                contentDescription = stringResource(R.string.player_backward),
                tint = Color.White,
                modifier = Modifier.size(40.dp)
            )
        }
        
        // Play/Pause
        IconButton(
            onClick = onPlayPause,
            modifier = Modifier.size(72.dp)
        ) {
            Icon(
                imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                contentDescription = if (isPlaying) stringResource(R.string.player_pause) else stringResource(R.string.player_play),
                tint = Color.White,
                modifier = Modifier.size(56.dp)
            )
        }
        
        // Seek Forward
        IconButton(
            onClick = onSeekForward,
            modifier = Modifier.size(56.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Forward10,
                contentDescription = stringResource(R.string.player_forward),
                tint = Color.White,
                modifier = Modifier.size(40.dp)
            )
        }
    }
}

@Composable
private fun BottomPlayerControls(
    currentPosition: Long,
    duration: Long,
    bufferedPercentage: Int,
    onSeek: (Long) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        Color.Transparent,
                        Color.Black.copy(alpha = 0.7f)
                    )
                )
            )
            .padding(16.dp)
    ) {
        // Progress Bar with Buffer
        Box(modifier = Modifier.fillMaxWidth()) {
            // Buffer Bar
            LinearProgressIndicator(
                progress = { bufferedPercentage / 100f },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(4.dp)
                    .clip(RoundedCornerShape(2.dp)),
                color = Color.White.copy(alpha = 0.3f),
                trackColor = Color.White.copy(alpha = 0.1f)
            )
            
            // Progress Bar
            if (duration > 0) {
                Slider(
                    value = currentPosition.toFloat(),
                    onValueChange = { onSeek(it.toLong()) },
                    valueRange = 0f..duration.toFloat(),
                    colors = SliderDefaults.colors(
                        thumbColor = Primary,
                        activeTrackColor = Primary,
                        inactiveTrackColor = Color.Transparent
                    ),
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
        
        // Time Display
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = formatTime(currentPosition),
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White
            )
            
            Text(
                text = formatTime(duration),
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White
            )
        }
    }
}

@Composable
private fun PlayerSettingsPanel(
    volume: Float,
    playbackSpeed: Float,
    subtitlesEnabled: Boolean,
    qualityOptions: List<String>,
    selectedQuality: String,
    onVolumeChange: (Float) -> Unit,
    onSpeedChange: (Float) -> Unit,
    onToggleSubtitles: () -> Unit,
    onQualityChange: (String) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .width(300.dp)
            .padding(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = Color.Black.copy(alpha = 0.9f)
        ),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = stringResource(R.string.settings_title),
                    style = MaterialTheme.typography.titleMedium,
                    color = Color.White,
                    fontWeight = FontWeight.Bold
                )
                
                IconButton(onClick = onDismiss) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = stringResource(R.string.close_button),
                        tint = Color.White
                    )
                }
            }
            
            // Volume Control
            SettingItem(
                title = stringResource(R.string.player_volume),
                value = "${(volume * 100).toInt()}%"
            ) {
                Slider(
                    value = volume,
                    onValueChange = onVolumeChange,
                    colors = SliderDefaults.colors(
                        thumbColor = Primary,
                        activeTrackColor = Primary
                    )
                )
            }
            
            // Playback Speed
            SettingItem(
                title = stringResource(R.string.player_speed),
                value = playbackSpeed.toString()
            ) {
                val speeds = listOf(0.5f, 0.75f, 1.0f, 1.25f, 1.5f, 2.0f)
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(speeds) { speed ->
                        FilterChip(
                            selected = playbackSpeed == speed,
                            onClick = { onSpeedChange(speed) },
                            label = { Text(speed.toString()) }
                        )
                    }
                }
            }
            
            // Subtitles
            SettingItem(
                title = stringResource(R.string.player_subtitles),
                value = if (subtitlesEnabled) stringResource(R.string.enabled) else stringResource(R.string.disabled)
            ) {
                Switch(
                    checked = subtitlesEnabled,
                    onCheckedChange = { onToggleSubtitles() },
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = Primary,
                        checkedTrackColor = Primary.copy(alpha = 0.5f)
                    )
                )
            }
            
            // Quality
            SettingItem(
                title = stringResource(R.string.player_quality),
                value = selectedQuality
            ) {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(qualityOptions) { quality ->
                        FilterChip(
                            selected = selectedQuality == quality,
                            onClick = { onQualityChange(quality) },
                            label = { Text(quality) },
                            colors = FilterChipDefaults.filterChipColors(
                                containerColor = Surface2,
                                labelColor = Color.White,
                                selectedContainerColor = Surface3,
                                selectedLabelColor = Color.White
                            ),
                            border = FilterChipDefaults.filterChipBorder(
                                enabled = true,
                                selected = selectedQuality == quality,
                                borderColor = SurfaceVariant,
                                selectedBorderColor = Primary,
                                borderWidth = if (selectedQuality == quality) 2.dp else 1.dp
                            )
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SettingItem(
    title: String,
    value: String,
    content: @Composable () -> Unit
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White
            )
            
            Text(
                text = value,
                style = MaterialTheme.typography.bodyMedium,
                color = Primary
            )
        }
        
        content()
    }
}

/**
 * Format time in milliseconds to MM:SS format
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
