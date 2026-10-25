package com.streamcore.tv.presentation.components.common

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Google TV Focus Indicator
 * 
 * Provides consistent focus behavior across all focusable components
 * following Google TV design specifications
 */
@Composable
fun GoogleTVFocusIndicator(
    isFocused: Boolean,
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(16.dp),
    borderWidth: Dp = 3.dp,
    borderColor: Color = Color(0xFF4285F4),
    glowColor: Color = Color(0x334285F4),
    scaleOnFocus: Float = 1.05f,
    animationDuration: Int = 200,
    content: @Composable BoxScope.() -> Unit
) {
    // Animation values
    val scale by animateFloatAsState(
        targetValue = if (isFocused) scaleOnFocus else 1.0f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessHigh
        ),
        label = "scale"
    )
    
    val borderColorAnimated by animateColorAsState(
        targetValue = if (isFocused) borderColor else Color.Transparent,
        animationSpec = tween(animationDuration, easing = LinearOutSlowInEasing),
        label = "borderColor"
    )
    
    val glowAlpha by animateFloatAsState(
        targetValue = if (isFocused) 1.0f else 0.0f,
        animationSpec = tween(animationDuration, easing = LinearOutSlowInEasing),
        label = "glowAlpha"
    )

    Box(
        modifier = modifier
            .scale(scale)
    ) {
        // Glow Effect Background
        if (isFocused) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .offset(x = 4.dp, y = 4.dp)
                    .background(
                        glowColor.copy(alpha = glowAlpha * 0.3f),
                        shape
                    )
            )
        }
        
        // Main Content with Border
        Box(
            modifier = Modifier
                .fillMaxSize()
                .border(
                    width = if (isFocused) borderWidth else 0.dp,
                    color = borderColorAnimated,
                    shape = shape
                )
                .clip(shape),
            content = content
        )
    }
}

/**
 * Focusable Container with Google TV Focus Behavior
 */
@Composable
fun GoogleTVFocusableContainer(
    onClick: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(16.dp),
    borderWidth: Dp = 3.dp,
    borderColor: Color = Color(0xFF4285F4),
    glowColor: Color = Color(0x334285F4),
    scaleOnFocus: Float = 1.05f,
    scaleOnPress: Float = 0.95f,
    animationDuration: Int = 200,
    enabled: Boolean = true,
    content: @Composable BoxScope.(isFocused: Boolean, isPressed: Boolean) -> Unit
) {
    var isFocused by remember { mutableStateOf(false) }
    var isPressed by remember { mutableStateOf(false) }
    
    // Animation values
    val scale by animateFloatAsState(
        targetValue = when {
            isPressed -> scaleOnPress
            isFocused -> scaleOnFocus
            else -> 1.0f
        },
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessHigh
        ),
        label = "scale"
    )
    
    val borderColorAnimated by animateColorAsState(
        targetValue = if (isFocused && enabled) borderColor else Color.Transparent,
        animationSpec = tween(animationDuration, easing = LinearOutSlowInEasing),
        label = "borderColor"
    )
    
    val glowAlpha by animateFloatAsState(
        targetValue = if (isFocused && enabled) 1.0f else 0.0f,
        animationSpec = tween(animationDuration, easing = LinearOutSlowInEasing),
        label = "glowAlpha"
    )

    Box(
        modifier = modifier
            .scale(scale)
            .onFocusChanged { 
                isFocused = it.isFocused 
            }
    ) {
        // Glow Effect Background
        if (isFocused && enabled) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .offset(x = 4.dp, y = 4.dp)
                    .background(
                        glowColor.copy(alpha = glowAlpha * 0.3f),
                        shape
                    )
            )
        }
        
        // Main Content with Border
        if (onClick != null) {
            Card(
                onClick = {
                    if (enabled) {
                        isPressed = true
                        onClick()
                        // Reset pressed state after a short delay
                        kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Main).launch {
                            delay(100)
                            isPressed = false
                        }
                    }
                },
                modifier = Modifier
                    .fillMaxSize()
                    .border(
                        width = if (isFocused && enabled) borderWidth else 0.dp,
                        color = borderColorAnimated,
                        shape = shape
                    ),
                shape = shape,
                colors = CardDefaults.cardColors(
                    containerColor = Color.Transparent
                ),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
            ) {
                Box(
                    modifier = Modifier.fillMaxSize()
                ) {
                    content(isFocused, isPressed)
                }
            }
        } else {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .border(
                        width = if (isFocused && enabled) borderWidth else 0.dp,
                        color = borderColorAnimated,
                        shape = shape
                    )
                    .clip(shape)
            ) {
                content(isFocused, isPressed)
            }
        }
    }
}

/**
 * Focus State Data Class
 */
data class FocusState(
    val isFocused: Boolean = false,
    val isPressed: Boolean = false,
    val isEnabled: Boolean = true
)

/**
 * Google TV Focus Colors
 */
object GoogleTVFocusColors {
    val Primary = Color(0xFF4285F4)
    val PrimaryGlow = Color(0x334285F4)
    val Secondary = Color(0xFF34A853)
    val SecondaryGlow = Color(0x3334A853)
    val Accent = Color(0xFFFF6B35)
    val AccentGlow = Color(0x33FF6B35)
    val Error = Color(0xFFFF4444)
    val ErrorGlow = Color(0x33FF4444)
}

/**
 * Google TV Focus Animations
 */
object GoogleTVFocusAnimations {
    fun fastScale() = spring<Float>(
        dampingRatio = Spring.DampingRatioMediumBouncy,
        stiffness = Spring.StiffnessHigh
    )

    fun smoothScale() = spring<Float>(
        dampingRatio = Spring.DampingRatioNoBouncy,
        stiffness = Spring.StiffnessMedium
    )
    
    fun colorTransition() = tween<Color>(
        durationMillis = 250,
        easing = LinearOutSlowInEasing
    )

    fun alphaTransition() = tween<Float>(
        durationMillis = 200,
        easing = LinearOutSlowInEasing
    )
}
