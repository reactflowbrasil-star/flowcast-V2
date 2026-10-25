package com.streamcore.tv.presentation.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.streamcore.tv.presentation.theme.*
import kotlinx.coroutines.delay

/**
 * Streamflix-style cinematic effects and micro-interactions
 * 
 * Collection of visual effects that enhance the streaming experience
 * with premium animations and transitions
 */

/**
 * Floating particles effect for background ambiance
 */
@Composable
fun StreamflixFloatingParticles(
    modifier: Modifier = Modifier,
    particleCount: Int = 8,
    animationDuration: Int = 8000
) {
    Box(modifier = modifier.fillMaxSize()) {
        repeat(particleCount) { index ->
            val delay = (index * 1000).toLong()
            val particleSize = remember(index) { (20..40).random() }
            val randomX = remember(index) { (0..300).random() }
            
            var isVisible by remember { mutableStateOf(false) }
            val alpha by animateFloatAsState(
                targetValue = if (isVisible) 0.15f else 0f,
                animationSpec = tween(durationMillis = 2000),
                label = "particle_alpha_$index"
            )
            
            val offsetY by animateFloatAsState(
                targetValue = if (isVisible) -200f else 200f,
                animationSpec = infiniteRepeatable(
                    animation = tween(
                        durationMillis = animationDuration,
                        easing = LinearEasing
                    ),
                    repeatMode = RepeatMode.Restart
                ),
                label = "particle_offset_$index"
            )
            
            LaunchedEffect(Unit) {
                delay(delay)
                isVisible = true
            }
            
            Box(
                modifier = Modifier
                    .size(particleSize.dp)
                    .offset { IntOffset(x = randomX.dp.roundToPx(), y = offsetY.dp.roundToPx()) }
                    .alpha(alpha)
                    .background(
                        brush = Brush.radialGradient(
                            colors = listOf(
                                Secondary.copy(alpha = 0.6f),
                                Color.Transparent
                            )
                        ),
                        shape = CircleShape
                    )
                    .blur(radius = 2.dp)
            )
        }
    }
}

/**
 * Cinematic glow effect for focused elements
 */
@Composable
fun StreamflixGlowEffect(
    modifier: Modifier = Modifier,
    isActive: Boolean = false,
    glowColor: Color = Secondary,
    intensity: Float = 1.0f
) {
    val glowAlpha by animateFloatAsState(
        targetValue = if (isActive) 0.8f * intensity else 0f,
        animationSpec = tween(durationMillis = 300),
        label = "glow_alpha"
    )
    
    val glowScale by animateFloatAsState(
        targetValue = if (isActive) 1.2f else 1.0f,
        animationSpec = tween(durationMillis = 300),
        label = "glow_scale"
    )
    
    Box(
        modifier = modifier
            .scale(glowScale)
            .alpha(glowAlpha)
            .background(
                brush = Brush.radialGradient(
                    colors = listOf(
                        glowColor.copy(alpha = 0.4f),
                        glowColor.copy(alpha = 0.1f),
                        Color.Transparent
                    )
                ),
                shape = RoundedCornerShape(16.dp)
            )
            .blur(radius = 8.dp)
    )
}

/**
 * Streamflix-style shimmer loading effect
 */
@Composable
fun StreamflixShimmerEffect(
    modifier: Modifier = Modifier,
    isLoading: Boolean = true
) {
    val transition = rememberInfiniteTransition(label = "shimmer")
    
    val translateAnim by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1000f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "shimmer_translate"
    )
    
    if (isLoading) {
        Box(
            modifier = modifier
                .background(
                    brush = Brush.linearGradient(
                        colors = listOf(
                            Surface1.copy(alpha = 0.9f),
                            Surface2.copy(alpha = 0.5f),
                            Surface1.copy(alpha = 0.9f)
                        ),
                        start = androidx.compose.ui.geometry.Offset(translateAnim - 200f, 0f),
                        end = androidx.compose.ui.geometry.Offset(translateAnim, 0f)
                    )
                )
        )
    }
}

/**
 * Pulsing effect for important elements
 */
@Composable
fun StreamflixPulseEffect(
    modifier: Modifier = Modifier,
    isActive: Boolean = false,
    pulseColor: Color = Primary,
    duration: Int = 1500
) {
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    
    val scale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = if (isActive) 1.05f else 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(duration, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulse_scale"
    )
    
    val alpha by infiniteTransition.animateFloat(
        initialValue = 0.7f,
        targetValue = if (isActive) 1f else 0.7f,
        animationSpec = infiniteRepeatable(
            animation = tween(duration, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulse_alpha"
    )
    
    Box(
        modifier = modifier
            .scale(scale)
            .alpha(alpha)
            .background(
                color = pulseColor.copy(alpha = 0.1f),
                shape = RoundedCornerShape(8.dp)
            )
    )
}

/**
 * Streamflix-style ripple effect for interactions
 */
@Composable
fun StreamflixRippleEffect(
    modifier: Modifier = Modifier,
    isTriggered: Boolean = false,
    rippleColor: Color = Secondary,
    onAnimationEnd: () -> Unit = {}
) {
    var animationPlaying by remember { mutableStateOf(false) }
    
    val scale by animateFloatAsState(
        targetValue = if (animationPlaying) 2f else 0f,
        animationSpec = tween(durationMillis = 600, easing = FastOutSlowInEasing),
        finishedListener = {
            if (animationPlaying) {
                animationPlaying = false
                onAnimationEnd()
            }
        },
        label = "ripple_scale"
    )
    
    val alpha by animateFloatAsState(
        targetValue = if (animationPlaying) 0f else 0.6f,
        animationSpec = tween(durationMillis = 600, easing = FastOutSlowInEasing),
        label = "ripple_alpha"
    )
    
    LaunchedEffect(isTriggered) {
        if (isTriggered) {
            animationPlaying = true
        }
    }
    
    Box(
        modifier = modifier
            .scale(scale)
            .alpha(alpha)
            .background(
                color = rippleColor,
                shape = CircleShape
            )
    )
}

/**
 * Cinematic background gradient with subtle animation
 */
@Composable
fun StreamflixAnimatedBackground(
    modifier: Modifier = Modifier
) {
    val infiniteTransition = rememberInfiniteTransition(label = "background")
    
    val gradientOffset by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 20000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "gradient_offset"
    )
    
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(
                brush = Brush.linearGradient(
                    colors = listOf(
                        Background,
                        BackgroundVariant,
                        Background
                    ),
                    start = androidx.compose.ui.geometry.Offset(
                        x = gradientOffset * 1000f,
                        y = 0f
                    ),
                    end = androidx.compose.ui.geometry.Offset(
                        x = (gradientOffset + 0.5f) * 1000f,
                        y = 1000f
                    )
                )
            )
    )
}

/**
 * Streamflix-style focus indicator with glow
 */
@Composable
fun StreamflixFocusIndicator(
    modifier: Modifier = Modifier,
    isFocused: Boolean = false,
    borderColor: Color = Primary,
    glowColor: Color = Primary
) {
    val borderAlpha by animateFloatAsState(
        targetValue = if (isFocused) 1f else 0f,
        animationSpec = tween(durationMillis = 200),
        label = "border_alpha"
    )
    
    val glowAlpha by animateFloatAsState(
        targetValue = if (isFocused) 0.6f else 0f,
        animationSpec = tween(durationMillis = 200),
        label = "glow_alpha"
    )
    
    Box(
        modifier = modifier
            .graphicsLayer {
                // Outer glow
                shadowElevation = if (isFocused) 12.dp.toPx() else 0f
                ambientShadowColor = glowColor.copy(alpha = glowAlpha)
                spotShadowColor = glowColor.copy(alpha = glowAlpha)
            }
            .background(
                color = borderColor.copy(alpha = borderAlpha * 0.2f),
                shape = RoundedCornerShape(8.dp)
            )
    )
}
