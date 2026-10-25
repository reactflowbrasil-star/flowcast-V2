package com.streamcore.tv.presentation.components.livetv

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.streamcore.tv.R
import com.streamcore.tv.domain.model.ContentItem
import com.streamcore.tv.domain.model.EPGProgram

/**
 * Channel Preview Component
 * 
 * Shows a preview of the channel with current program information
 * while user navigates through channels (like modern TV apps)
 */
@Composable
fun ChannelPreview(
    channel: ContentItem,
    currentProgram: EPGProgram? = null,
    nextProgram: EPGProgram? = null,
    isPlaying: Boolean = false,
    isMuted: Boolean = false,
    onPlayPause: () -> Unit,
    onMuteToggle: () -> Unit,
    onFullscreen: () -> Unit,
    modifier: Modifier = Modifier,
    showControls: Boolean = true
) {
    @Suppress("UNUSED_VARIABLE")
    var isHovered by remember { mutableStateOf(false) }

    Card(
        modifier = modifier
            .size(width = 320.dp, height = 180.dp),
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 12.dp),
        colors = CardDefaults.cardColors(
            containerColor = Color(0xFF1A1A2E)
        )
    ) {
        Box(
            modifier = Modifier.fillMaxSize()
        ) {
            // Channel Preview Video/Image
            ChannelPreviewContent(
                channel = channel,
                isPlaying = isPlaying,
                modifier = Modifier.fillMaxSize()
            )
            
            // Gradient Overlay
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                Color.Transparent,
                                Color.Black.copy(alpha = 0.7f)
                            ),
                            startY = 0.5f
                        )
                    )
            )
            
            // Channel Info Overlay
            ChannelInfoOverlay(
                channel = channel,
                currentProgram = currentProgram,
                nextProgram = nextProgram,
                modifier = Modifier.align(Alignment.BottomStart)
            )
            
            // Controls Overlay
            if (showControls) {
                ChannelPreviewControls(
                    isPlaying = isPlaying,
                    isMuted = isMuted,
                    onPlayPause = onPlayPause,
                    onMuteToggle = onMuteToggle,
                    onFullscreen = onFullscreen,
                    modifier = Modifier.align(Alignment.TopEnd)
                )
            }
            
            // Live Indicator
            if (currentProgram?.isLive == true) {
                LiveIndicatorBadge(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(12.dp)
                )
            }
        }
    }
}

@Composable
private fun ChannelPreviewContent(
    channel: ContentItem,
    isPlaying: Boolean,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier.clip(RoundedCornerShape(16.dp)),
        contentAlignment = Alignment.Center
    ) {
        // Channel thumbnail/logo
        AsyncImage(
            model = channel.imageUrl,
            contentDescription = channel.title,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop
        )
        
        // Play overlay when not playing
        if (!isPlaying) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.5f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.PlayArrow,
                    contentDescription = stringResource(R.string.play_button),
                    tint = Color.White,
                    modifier = Modifier.size(48.dp)
                )
            }
        }
    }
}

@Composable
private fun ChannelInfoOverlay(
    channel: ContentItem,
    currentProgram: EPGProgram?,
    nextProgram: EPGProgram?,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        // Channel Name
        Text(
            text = channel.title,
            color = Color.White,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        
        // Current Program
        if (currentProgram != null) {
            Text(
                text = currentProgram.title,
                color = Color(0xFFE8EAF6),
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            
            // Program Time
            Text(
                text = "${currentProgram.startTime.take(5)} - ${currentProgram.endTime.take(5)}",
                color = Color(0xFFB0BEC5),
                fontSize = 12.sp
            )
        }
        
        // Next Program
        if (nextProgram != null) {
            Text(
                text = stringResource(id = R.string.player_next_with_title, nextProgram.title),
                color = Color(0xFF9E9E9E),
                fontSize = 11.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Suppress("UNUSED_PARAMETER")
@Composable
private fun ChannelPreviewControls(
    isPlaying: Boolean,
    isMuted: Boolean,
    onPlayPause: () -> Unit,
    onMuteToggle: () -> Unit,
    onFullscreen: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier.padding(12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        // Play/Pause Button
        IconButton(
            onClick = onPlayPause,
            colors = IconButtonDefaults.iconButtonColors(
                containerColor = Color.Black.copy(alpha = 0.6f),
                contentColor = Color.White
            ),
            modifier = Modifier.size(32.dp)
        ) {
        Icon(
            imageVector = if (isPlaying) Icons.Default.PlayArrow else Icons.Default.PlayArrow,
            contentDescription = if (isPlaying) {
                stringResource(id = R.string.pause_button)
            } else {
                stringResource(id = R.string.play_button)
            },
            modifier = Modifier.size(16.dp)
        )
        }
        
        // Mute Button
        IconButton(
            onClick = onMuteToggle,
            colors = IconButtonDefaults.iconButtonColors(
                containerColor = Color.Black.copy(alpha = 0.6f),
                contentColor = Color.White
            ),
            modifier = Modifier.size(32.dp)
        ) {
        Icon(
            imageVector = if (isMuted) Icons.AutoMirrored.Filled.VolumeOff else Icons.AutoMirrored.Filled.VolumeUp,
            contentDescription = if (isMuted) {
                stringResource(id = R.string.action_unmute)
            } else {
                stringResource(id = R.string.action_mute)
            },
            modifier = Modifier.size(16.dp)
        )
        }
    }
}

@Composable
private fun LiveIndicatorBadge(
    modifier: Modifier = Modifier
) {
    val infiniteTransition = rememberInfiniteTransition(label = "live")
    val alpha by infiniteTransition.animateFloat(
        initialValue = 0.5f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "alpha"
    )
    
    Box(
        modifier = modifier
            .background(
                Color(0xFFFF4444).copy(alpha = alpha),
                RoundedCornerShape(6.dp)
            )
            .padding(horizontal = 8.dp, vertical = 4.dp)
    ) {
        Text(
            text = stringResource(id = R.string.live_indicator),
            color = Color.White,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

/**
 * Compact Channel Preview for grid layouts
 */
@Composable
fun CompactChannelPreview(
    channel: ContentItem,
    isSelected: Boolean = false,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    var isFocused by remember { mutableStateOf(false) }
    
    val borderColor by animateColorAsState(
        targetValue = when {
            isSelected -> Color(0xFF34A853)
            isFocused -> Color(0xFF4285F4)
            else -> Color.Transparent
        },
        animationSpec = tween(250),
        label = "borderColor"
    )
    
    Card(
        onClick = onClick,
        modifier = modifier
            .size(width = 160.dp, height = 90.dp)
            .border(
                width = if (isFocused || isSelected) 2.dp else 0.dp,
                color = borderColor,
                shape = RoundedCornerShape(8.dp)
            ),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(
            containerColor = Color(0xFF1A1A2E)
        )
    ) {
        Box(
            modifier = Modifier.fillMaxSize()
        ) {
            AsyncImage(
                model = channel.imageUrl,
                contentDescription = channel.title,
                modifier = Modifier
                    .fillMaxSize()
                    .clip(RoundedCornerShape(8.dp)),
                contentScale = ContentScale.Crop
            )
            
            // Channel name overlay
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                Color.Transparent,
                                Color.Black.copy(alpha = 0.8f)
                            )
                        )
                    )
                    .padding(8.dp)
            ) {
                Text(
                    text = channel.title,
                    color = Color.White,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}
