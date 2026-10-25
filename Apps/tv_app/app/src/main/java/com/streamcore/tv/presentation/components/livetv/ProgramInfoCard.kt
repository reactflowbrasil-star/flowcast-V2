package com.streamcore.tv.presentation.components.livetv

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.streamcore.tv.domain.model.ContentItem
import com.streamcore.tv.domain.model.EPGProgram
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

/**
 * Program Info Card Component
 * 
 * Shows detailed information about a TV program
 * with modern Google TV styling
 */
@Composable
fun ProgramInfoCard(
    channel: ContentItem,
    currentProgram: EPGProgram?,
    nextProgram: EPGProgram?,
    onWatchNow: () -> Unit,
    onSetReminder: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
    isExpanded: Boolean = false
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp)),
        colors = CardDefaults.cardColors(
            containerColor = Color(0xFF1A1A2E)
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Channel Header
            ChannelHeader(
                channel = channel,
                isLive = currentProgram?.isLive ?: false
            )
            
            // Current Program
            if (currentProgram != null) {
                CurrentProgramSection(
                    program = currentProgram,
                    onWatchNow = onWatchNow,
                    isExpanded = isExpanded
                )
            }
            
            // Next Program
            if (nextProgram != null) {
                NextProgramSection(
                    program = nextProgram,
                    onSetReminder = onSetReminder
                )
            }
            
            // Program Progress (if current program)
            if (currentProgram?.isLive == true) {
                ProgramProgressBar(
                    progress = currentProgram.progress
                )
            }
        }
    }
}

@Composable
private fun ChannelHeader(
    channel: ContentItem,
    isLive: Boolean
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Channel Logo Placeholder
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .background(
                        Color(0xFF4285F4),
                        RoundedCornerShape(8.dp)
                    ),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = channel.title.take(2).uppercase(),
                    color = Color.White,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )
            }
            
            Column {
                Text(
                    text = channel.title,
                    color = Color.White,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold
                )
                
                if (channel.description != null) {
                    Text(
                        text = channel.description,
                        color = Color(0xFFB0BEC5),
                        fontSize = 12.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
        
        // Live Indicator
        if (isLive) {
            LiveIndicator()
        }
    }
}

@Composable
private fun CurrentProgramSection(
    program: EPGProgram,
    onWatchNow: () -> Unit,
    isExpanded: Boolean
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top
        ) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(
                    text = stringResource(R.string.epg_now),
                    color = Color(0xFF4285F4),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium
                )
                
                Text(
                    text = program.title,
                    color = Color.White,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = if (isExpanded) Int.MAX_VALUE else 2,
                    overflow = TextOverflow.Ellipsis
                )
                
                if (program.description != null) {
                    Text(
                        text = program.description,
                        color = Color(0xFFE8EAF6),
                        fontSize = 14.sp,
                        maxLines = if (isExpanded) Int.MAX_VALUE else 3,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                
                // Time and Category
                Row(
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Schedule,
                            contentDescription = null,
                            tint = Color(0xFFB0BEC5),
                            modifier = Modifier.size(16.dp)
                        )
                        Text(
                            text = "${program.startTime.take(5)} - ${program.endTime.take(5)}",
                            color = Color(0xFFB0BEC5),
                            fontSize = 12.sp
                        )
                    }
                    
                    if (program.category != null) {
                        Text(
                            text = program.category,
                            color = Color(0xFF34A853),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }
            
            // Watch Now Button
            Button(
                onClick = onWatchNow,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFF4285F4)
                ),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.padding(start = 16.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.PlayArrow,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = stringResource(R.string.program_watch_now),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

@Composable
private fun NextProgramSection(
    program: EPGProgram,
    onSetReminder: (() -> Unit)?
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(
                modifier = Modifier.weight(1f)
            ) {
                Text(
                    text = stringResource(R.string.program_up_next),
                    color = Color(0xFFFF6B35),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium
                )
                
                Text(
                    text = program.title,
                    color = Color.White,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                
                Text(
                    text = "${program.startTime.take(5)} - ${program.endTime.take(5)}",
                    color = Color(0xFFB0BEC5),
                    fontSize = 12.sp
                )
            }
            
            // Reminder Button
            if (onSetReminder != null) {
                IconButton(
                    onClick = onSetReminder,
                    colors = IconButtonDefaults.iconButtonColors(
                        contentColor = Color(0xFFFF6B35)
                    )
                ) {
                    Icon(
                        imageVector = Icons.Default.Star,
                        contentDescription = stringResource(R.string.program_remind)
                    )
                }
            }
        }
    }
}

@Composable
private fun ProgramProgressBar(
    progress: Float
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = stringResource(R.string.program_progress),
                color = Color(0xFFB0BEC5),
                fontSize = 12.sp
            )
            Text(
                text = "${(progress * 100).toInt()}%",
                color = Color(0xFFB0BEC5),
                fontSize = 12.sp
            )
        }
        
        LinearProgressIndicator(
            progress = { progress },
            modifier = Modifier
                .fillMaxWidth()
                .height(4.dp)
                .clip(RoundedCornerShape(2.dp)),
            color = Color(0xFF4285F4),
            trackColor = Color(0xFF16213E)
        )
    }
}

@Composable
private fun LiveIndicator() {
    val infiniteTransition = rememberInfiniteTransition(label = "live")
    val alpha by infiniteTransition.animateFloat(
        initialValue = 0.3f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "alpha"
    )
    
    Box(
        modifier = Modifier
            .background(
                Color(0xFFFF4444).copy(alpha = alpha),
                RoundedCornerShape(8.dp)
            )
            .padding(horizontal = 12.dp, vertical = 6.dp)
    ) {
        Text(
                                text = stringResource(R.string.live_indicator),
            color = Color.White,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold
        )
    }
}
