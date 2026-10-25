package com.streamcore.tv.presentation.screens.player.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.*
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.*
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.streamcore.tv.domain.model.ContentStream
import com.streamcore.tv.presentation.components.common.GoogleTVFocusIndicator
import com.streamcore.tv.presentation.components.common.ChannelLogo

/**
 * Enhanced Channel Sidebar - Google TV Style
 *
 * Modern channel sidebar with Google TV design specifications
 * for Live TV player with improved focus management and animations
 */
@Composable
fun ChannelSidebar(
    isVisible: Boolean,
    channels: List<ContentStream>,
    currentChannelId: String?,
    onChannelSelected: (ContentStream) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier
) {
    val listState = rememberLazyListState()

    // Auto-scroll to current channel when sidebar opens
    LaunchedEffect(isVisible, currentChannelId) {
        if (isVisible && currentChannelId != null) {
            val currentIndex = channels.indexOfFirst { it.id == currentChannelId }
            if (currentIndex >= 0) {
                listState.animateScrollToItem(currentIndex)
            }
        }
    }

    AnimatedVisibility(
        visible = isVisible,
        enter = slideInHorizontally(initialOffsetX = { -it }),
        exit = slideOutHorizontally(targetOffsetX = { -it }),
        modifier = modifier
    ) {
        Box(
            modifier = Modifier
                .fillMaxHeight()
                .width(320.dp)
                .background(
                    Color.Black.copy(alpha = 0.9f),
                    RoundedCornerShape(topEnd = 8.dp, bottomEnd = 8.dp)
                )

        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp)
            ) {
                // Header
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = stringResource(R.string.live_tv_channels),
                        color = Color.White,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold
                    )
                    
                    Text(
                        text = "${channels.size} ${stringResource(R.string.channels_count)}",
                        color = Color.White.copy(alpha = 0.7f),
                        fontSize = 14.sp
                    )
                }
                
                HorizontalDivider(
                    color = Color.White.copy(alpha = 0.3f),
                    modifier = Modifier.padding(bottom = 16.dp)
                )
                
                // Channels list
                LazyColumn(
                    state = listState,
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(channels) { channel ->
                        ChannelItem(
                            channel = channel,
                            isSelected = channel.id == currentChannelId,
                            onChannelSelected = {
                                onChannelSelected(channel)
                                onDismiss()
                            },
                            modifier = Modifier.padding(horizontal = 16.dp)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ChannelItem(
    channel: ContentStream,
    isSelected: Boolean,
    onChannelSelected: () -> Unit,
    modifier: Modifier = Modifier
) {
    var isFocused by remember { mutableStateOf(false) }

    // Enhanced visual states
    val backgroundColor = when {
        isSelected -> Color(0xFF1976D2).copy(alpha = 0.6f) // More visible for selected channel
        isFocused -> Color(0xFF2196F3).copy(alpha = 0.4f)
        else -> Color(0xFF16213E).copy(alpha = 0.8f)
    }

    val borderColor = when {
        isSelected -> Color(0xFF4CAF50) // Bright green for current channel
        isFocused -> Color(0xFF2196F3)
        else -> Color.Transparent
    }

    // Animation values
    val scale by animateFloatAsState(
        targetValue = if (isFocused) 1.02f else 1.0f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessHigh
        ),
        label = "scale"
    )

    Card(
        modifier = modifier
            .fillMaxWidth()
            .height(80.dp) // Increased height for more content
            .scale(scale)
            .focusable()
            .onFocusChanged { focusState ->
                isFocused = focusState.isFocused
            }
            .onKeyEvent { keyEvent ->
                if (keyEvent.key == Key.DirectionCenter && keyEvent.type == KeyEventType.KeyUp) {
                    onChannelSelected()
                    true
                } else {
                    false
                }
            }
            .clickable { onChannelSelected() },
        colors = CardDefaults.cardColors(
            containerColor = backgroundColor
        ),
        border = BorderStroke(
            width = if (isSelected || isFocused) 2.dp else 0.dp,
            color = borderColor
        ),
        shape = RoundedCornerShape(8.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Channel logo with SVG support
            ChannelLogo(
                imageUrl = channel.imageUrl,
                channelName = channel.title,
                size = 56.dp,
                fontSize = 16.sp,
                backgroundColor = Color(0xFF1E1E1E),
                cornerRadius = 4.dp
            )



            Spacer(modifier = Modifier.width(12.dp))

            // Enhanced channel info
            Column(
                modifier = Modifier.weight(1f)
            ) {
                // Channel number
                Text(
                    text = channel.channelNumber?.toString() ?: "---",
                    color = Color(0xFF4CAF50),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                )

                // Channel name - more visible for selected channel
                Text(
                    text = channel.title,
                    color = if (isSelected) Color(0xFF4CAF50) else Color.White,
                    fontSize = if (isSelected) 17.sp else 16.sp,
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                // Quality indicator
                if (channel.title.contains("HD") || channel.title.contains("4K")) {
                    Box(
                        modifier = Modifier
                            .background(
                                if (isFocused) Color.White else Color(0xFF4CAF50),
                                RoundedCornerShape(4.dp)
                            )
                            .padding(horizontal = 4.dp, vertical = 1.dp)
                    ) {
                        Text(
                            text = if (channel.title.contains("4K")) "4K" else "HD",
                            color = if (isFocused) Color.Black else Color.White,
                            fontSize = 8.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                // Current program info - more visible for selected channel
                Text(
                    text = if (isSelected) {
                        "▶ ${stringResource(R.string.live_tv_now_playing)}"
                    } else {
                        stringResource(R.string.live_tv_current_program)
                    },
                    color = if (isSelected) Color(0xFF4CAF50) else Color.White.copy(alpha = 0.8f),
                    fontSize = 12.sp,
                    fontWeight = if (isSelected) FontWeight.Medium else FontWeight.Normal,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 2.dp)
                )

                // Next program info
                Text(
                    text = stringResource(R.string.live_tv_next_program),
                    color = Color.White.copy(alpha = 0.6f),
                    fontSize = 10.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 1.dp)
                )
            }

            // Status indicators
            Column(
                horizontalAlignment = Alignment.End
            ) {
                // Current playing indicator - more prominent
                if (isSelected) {
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = Color(0xFF4CAF50)
                        ),
                        shape = CircleShape
                    ) {
                        Icon(
                            painter = painterResource(R.drawable.ic_play_arrow),
                            contentDescription = stringResource(R.string.live_tv_now_playing),
                            tint = Color.White,
                            modifier = Modifier
                                .size(24.dp)
                                .padding(4.dp)
                        )
                    }
                }

                // Favorite indicator (mock)
                Icon(
                    imageVector = Icons.Default.FavoriteBorder,
                    contentDescription = stringResource(R.string.content_add_favorite),
                    tint = if (isFocused) Color.White else Color.White.copy(alpha = 0.5f),
                    modifier = Modifier
                        .size(16.dp)
                        .padding(top = 4.dp)
                )
            }
        }
    }
}
