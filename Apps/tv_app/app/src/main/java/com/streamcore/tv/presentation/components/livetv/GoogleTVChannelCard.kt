package com.streamcore.tv.presentation.components.livetv

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.streamcore.tv.R
import com.streamcore.tv.domain.model.ContentItem

/**
 * Google TV Style Channel Card
 * 
 * Modern channel card following Google TV design specifications
 * with focus animations, program information and visual hierarchy
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GoogleTVChannelCard(
    channel: ContentItem,
    currentProgram: String? = null,
    nextProgram: String? = null,
    isLive: Boolean = false,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    var isFocused by remember { mutableStateOf(false) }
    
    // Animation values
    val scale by animateFloatAsState(
        targetValue = if (isFocused) 1.08f else 1.0f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessHigh
        ),
        label = "scale"
    )
    
    val elevation by animateDpAsState(
        targetValue = if (isFocused) 16.dp else 4.dp,
        animationSpec = tween(300, easing = FastOutSlowInEasing),
        label = "elevation"
    )
    
    val borderColor by animateColorAsState(
        targetValue = if (isFocused) Color(0xFF4285F4) else Color.Transparent,
        animationSpec = tween(250, easing = LinearOutSlowInEasing),
        label = "borderColor"
    )

    Card(
        onClick = onClick,
        modifier = modifier
            .size(width = 280.dp, height = 200.dp)
            .scale(scale)
            .onFocusChanged { isFocused = it.isFocused }
            .focusable(),
        shape = RoundedCornerShape(20.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = elevation),
        colors = CardDefaults.cardColors(
            containerColor = Color(0xFF1A1A2E)
        )
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .border(
                    width = if (isFocused) 3.dp else 0.dp,
                    color = borderColor,
                    shape = RoundedCornerShape(20.dp)
                )
        ) {
            // Channel Logo Background
            AsyncImage(
                model = channel.imageUrl,
                contentDescription = channel.title,
                modifier = Modifier
                    .fillMaxSize()
                    .clip(RoundedCornerShape(20.dp)),
                contentScale = ContentScale.Crop
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
                            startY = 0.4f
                        )
                    )
            )
            
            // Live Indicator
            if (isLive) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(12.dp)
                        .background(
                            Color(0xFFFF4444),
                            RoundedCornerShape(8.dp)
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
            
            // Channel Information
            Column(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(16.dp)
                    .fillMaxWidth()
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
                        text = currentProgram,
                        color = Color(0xFFE8EAF6),
                        fontSize = 12.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }
                
                // Next Program
                if (nextProgram != null) {
                    Text(
                        text = stringResource(id = R.string.player_next_with_title, nextProgram),
                        color = Color(0xFFB0BEC5),
                        fontSize = 10.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }
            }
            
            // Focus Glow Effect
            if (isFocused) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Color(0x334285F4),
                            RoundedCornerShape(20.dp)
                        )
                )
            }
        }
    }
}

/**
 * Compact Channel Card for grid layouts
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GoogleTVChannelCardCompact(
    channel: ContentItem,
    isSelected: Boolean = false,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    var isFocused by remember { mutableStateOf(false) }
    
    val scale by animateFloatAsState(
        targetValue = if (isFocused) 1.05f else 1.0f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessHigh
        ),
        label = "scale"
    )
    
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
            .size(width = 120.dp, height = 80.dp)
            .scale(scale)
            .onFocusChanged { isFocused = it.isFocused }
            .focusable(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = Color(0xFF1A1A2E)
        )
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .border(
                    width = if (isFocused || isSelected) 2.dp else 0.dp,
                    color = borderColor,
                    shape = RoundedCornerShape(12.dp)
                )
        ) {
            AsyncImage(
                model = channel.imageUrl,
                contentDescription = channel.title,
                modifier = Modifier
                    .fillMaxSize()
                    .clip(RoundedCornerShape(12.dp)),
                contentScale = ContentScale.Fit
            )
            
            // Channel Name Overlay
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .background(
                        Color.Black.copy(alpha = 0.7f)
                    )
                    .padding(4.dp)
            ) {
                Text(
                    text = channel.title,
                    color = Color.White,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.align(Alignment.Center)
                )
            }
        }
    }
}
