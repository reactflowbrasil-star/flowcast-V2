package com.streamcore.tv.presentation.components.livetv

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Hd
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.streamcore.tv.R
import com.streamcore.tv.domain.model.ContentStream
import com.streamcore.tv.presentation.components.common.ChannelLogo as CustomChannelLogo
import kotlinx.coroutines.delay

/**
 * Channel Information Overlay
 * 
 * Shows current channel information with program details
 * following Google TV design patterns
 */
@Composable
fun ChannelInfoOverlay(
    isVisible: Boolean,
    channel: ContentStream?,
    currentProgram: EPGProgramInfo?,
    nextProgram: EPGProgramInfo?,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier
) {
    // Auto-dismiss after 5 seconds
    LaunchedEffect(isVisible) {
        if (isVisible) {
            delay(5000)
            onDismiss()
        }
    }

    AnimatedVisibility(
        visible = isVisible && channel != null,
        enter = slideInVertically(
            animationSpec = tween(400, easing = FastOutSlowInEasing),
            initialOffsetY = { -it }
        ) + fadeIn(animationSpec = tween(400)),
        exit = slideOutVertically(
            animationSpec = tween(300, easing = FastOutLinearInEasing),
            targetOffsetY = { -it }
        ) + fadeOut(animationSpec = tween(300)),
        modifier = modifier
    ) {
        channel?.let {
            ChannelInfoCard(
                channel = it,
                currentProgram = currentProgram,
                nextProgram = nextProgram
            )
        }
    }
}

@Composable
private fun ChannelInfoCard(
    channel: ContentStream,
    currentProgram: EPGProgramInfo?,
    nextProgram: EPGProgramInfo?
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = Color.Black.copy(alpha = 0.8f)
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 12.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Channel logo with SVG support
            CustomChannelLogo(
                imageUrl = channel.imageUrl,
                channelName = channel.title,
                size = 80.dp,
                fontSize = 18.sp,
                cornerRadius = 4.dp
            )
            
            Spacer(modifier = Modifier.width(16.dp))
            
            // Channel information
            Column(
                modifier = Modifier.weight(1f)
            ) {
                ChannelHeader(
                    channelName = channel.title,
                    isHD = channel.title.contains("HD") || channel.title.contains("4K")
                )
                
                Spacer(modifier = Modifier.height(8.dp))
                
                currentProgram?.let { program ->
                    CurrentProgramInfo(program = program)
                }
                
                nextProgram?.let { program ->
                    Spacer(modifier = Modifier.height(4.dp))
                    NextProgramInfo(program = program)
                }
            }
        }
    }
}



@Composable
private fun ChannelHeader(
    channelName: String,
    isHD: Boolean
) {
    Row(
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = channelName,
            color = Color.White,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )
        
        if (isHD) {
            Spacer(modifier = Modifier.width(8.dp))
            Box(
                modifier = Modifier
                    .background(
                        Brush.horizontalGradient(
                            colors = listOf(
                                Color(0xFF4CAF50),
                                Color(0xFF8BC34A)
                            )
                        ),
                        RoundedCornerShape(4.dp)
                    )
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Hd,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(12.dp)
                    )
                    Spacer(modifier = Modifier.width(2.dp))
                    Text(
                        text = if (channelName.contains("4K")) "4K" else "HD",
                        color = Color.White,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}

@Composable
private fun CurrentProgramInfo(
    program: EPGProgramInfo
) {
    Column {
        Row(
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = stringResource(R.string.now_label),
                color = Color(0xFF4CAF50),
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold
            )
            
            Spacer(modifier = Modifier.width(8.dp))
            
            Text(
                text = "${program.startTime} - ${program.endTime}",
                color = Color.White.copy(alpha = 0.7f),
                fontSize = 12.sp
            )
        }
        
        Text(
            text = program.title,
            color = Color.White,
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        
        if (program.description.isNotEmpty()) {
            Text(
                text = program.description,
                color = Color.White.copy(alpha = 0.8f),
                fontSize = 14.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun NextProgramInfo(
    program: EPGProgramInfo
) {
    Row(
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = Icons.Default.Schedule,
            contentDescription = null,
            tint = Color(0xFFFF9800),
            modifier = Modifier.size(14.dp)
        )
        
        Spacer(modifier = Modifier.width(6.dp))
        
        Text(
            text = "${stringResource(R.string.live_tv_next_program)} ${program.title} (${program.startTime})",
            color = Color.White.copy(alpha = 0.7f),
            fontSize = 12.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}
