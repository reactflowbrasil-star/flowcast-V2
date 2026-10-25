package com.streamcore.tv.presentation.theme

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusState
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Google TV Focus System
 * 
 * Provides consistent focus management and visual indicators
 * optimized for TV remote navigation
 */

object GoogleTVFocus {
    
    // ===== FOCUS ANIMATION SPECIFICATIONS =====
    
    object Animation {
        const val FOCUS_DURATION = 200
        const val SCALE_DURATION = 150
        const val COLOR_DURATION = 250
        
        val FOCUS_EASING = FastOutSlowInEasing
        val SCALE_EASING = LinearOutSlowInEasing
        val COLOR_EASING = LinearOutSlowInEasing
        
        val BOUNCE_SPRING = spring<Float>(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessHigh
        )
        
        val SMOOTH_SPRING = spring<Float>(
            dampingRatio = Spring.DampingRatioNoBouncy,
            stiffness = Spring.StiffnessMedium
        )
    }
    
    // ===== FOCUS VISUAL SPECIFICATIONS =====
    
    object Visual {
        // Scale values
        const val DEFAULT_SCALE = 1.0f
        const val FOCUS_SCALE_SMALL = 1.02f
        const val FOCUS_SCALE_MEDIUM = 1.05f
        const val FOCUS_SCALE_LARGE = 1.08f
        const val PRESSED_SCALE = 0.95f
        
        // Border specifications
        val BORDER_WIDTH = 3.dp
        val BORDER_RADIUS = 16.dp
        val BORDER_OFFSET = 4.dp
        
        // Elevation specifications
        val DEFAULT_ELEVATION = 4.dp
        val FOCUS_ELEVATION = 12.dp
        val PRESSED_ELEVATION = 2.dp
        
        // Glow specifications
        val GLOW_RADIUS = 8.dp
        const val GLOW_ALPHA = 0.3f
    }
    
    // ===== FOCUS STATES =====
    
    enum class FocusLevel {
        None,       // No focus
        Focused,    // Has focus
        Pressed,    // Being pressed
        Disabled    // Disabled state
    }
    
    data class FocusColors(
        val border: Color,
        val glow: Color,
        val background: Color
    )
    
    // ===== FOCUS MODIFIERS =====
    
    /**
     * Apply Google TV focus styling to any composable
     * 
     * @param scaleType The scale level to apply on focus
     * @param borderRadius The border radius for focus indicator
     * @param elevation Whether to apply elevation changes
     */
    @Composable
    fun Modifier.googleTVFocus(
        scaleType: FocusScaleType = FocusScaleType.Medium,
        borderRadius: Dp = Visual.BORDER_RADIUS,
        elevation: Boolean = true
    ): Modifier {
        var isFocused by remember { mutableStateOf(false) }
        var isPressed by remember { mutableStateOf(false) }
        
        val scale by animateFloatAsState(
            targetValue = when {
                isPressed -> Visual.PRESSED_SCALE
                isFocused -> scaleType.scale
                else -> Visual.DEFAULT_SCALE
            },
            animationSpec = Animation.BOUNCE_SPRING,
            label = "focus_scale"
        )
        
        val elevationValue by animateDpAsState(
            targetValue = when {
                isPressed -> Visual.PRESSED_ELEVATION
                isFocused -> Visual.FOCUS_ELEVATION
                else -> Visual.DEFAULT_ELEVATION
            },
            animationSpec = tween(
                durationMillis = Animation.FOCUS_DURATION,
                easing = Animation.FOCUS_EASING
            ),
            label = "focus_elevation"
        )
        
        val borderColor by animateColorAsState(
            targetValue = if (isFocused) FocusBorder else Color.Transparent,
            animationSpec = tween(
                durationMillis = Animation.COLOR_DURATION,
                easing = Animation.COLOR_EASING
            ),
            label = "focus_border_color"
        )
        
        return this
            .onFocusChanged { focusState ->
                isFocused = focusState.isFocused
            }
            .scale(scale)
            .then(
                if (elevation) {
                    Modifier.shadow(
                        elevation = elevationValue,
                        shape = RoundedCornerShape(borderRadius)
                    )
                } else Modifier
            )
            .border(
                BorderStroke(
                    width = if (isFocused) 4.dp else 0.dp, // Thicker and more visible border
                    color = borderColor
                ),
                shape = RoundedCornerShape(borderRadius)
            )
            .padding(Visual.BORDER_OFFSET)
    }
    
    /**
     * Apply focus glow effect
     */
    @Composable
    fun Modifier.googleTVGlow(
        focused: Boolean = false,
        glowColor: Color = FocusGlow
    ): Modifier {
        val glowAlpha by animateFloatAsState(
            targetValue = if (focused) Visual.GLOW_ALPHA else 0f,
            animationSpec = tween(
                durationMillis = Animation.COLOR_DURATION,
                easing = Animation.COLOR_EASING
            ),
            label = "glow_alpha"
        )

        return this.graphicsLayer {
            shadowElevation = if (focused) Visual.GLOW_RADIUS.toPx() else 0f
            ambientShadowColor = glowColor.copy(alpha = glowAlpha)
            spotShadowColor = glowColor.copy(alpha = glowAlpha)
        }
    }

    /**
     * Apply premium holographic shimmer effect for focused cards
     */
    @Composable
    fun Modifier.googleTVShimmer(
        focused: Boolean = false,
        shimmerColor: Color = Color.White.copy(alpha = 0.08f) // Extremely subtle
    ): Modifier {
        val infiniteTransition = rememberInfiniteTransition(label = "shimmer")

        val shimmerOffset by infiniteTransition.animateFloat(
            initialValue = -2f,
            targetValue = 2f,
            animationSpec = infiniteRepeatable(
                animation = tween(
                    durationMillis = 3500, // Slow and elegant
                    easing = CubicBezierEasing(0.4f, 0.0f, 0.2f, 1.0f) // Premium easing
                ),
                repeatMode = RepeatMode.Restart
            ),
            label = "shimmer_offset"
        )

        val shimmerAlpha by animateFloatAsState(
            targetValue = if (focused) 1f else 0f,
            animationSpec = tween(
                durationMillis = Animation.COLOR_DURATION,
                easing = Animation.COLOR_EASING
            ),
            label = "shimmer_alpha"
        )

        return this.drawWithContent {
            drawContent()

            if (focused && shimmerAlpha > 0f) {
                val shimmerWidth = size.width * 0.25f // Narrower and more elegant
                val shimmerHeight = size.height

                // Shimmer position with a stronger angle
                val shimmerStart = (size.width + shimmerWidth * 1.5f) * shimmerOffset - shimmerWidth
                val angleOffset = shimmerHeight * 0.4f // Stronger angle

                // Simple, safe linear gradient for glow
                val shimmerGradient = Brush.linearGradient(
                    colors = listOf(
                        Color.Transparent,
                        Color.Transparent,
                        shimmerColor.copy(alpha = shimmerAlpha * 0.08f), // Very subtle start
                        shimmerColor.copy(alpha = shimmerAlpha * 0.15f), // Center
                        shimmerColor.copy(alpha = shimmerAlpha * 0.20f), // Peak
                        shimmerColor.copy(alpha = shimmerAlpha * 0.15f), // Center
                        shimmerColor.copy(alpha = shimmerAlpha * 0.08f), // Subtle end
                        Color.Transparent,
                        Color.Transparent
                    ),
                    start = Offset(shimmerStart - angleOffset * 0.2f, -angleOffset * 0.2f),
                    end = Offset(shimmerStart + shimmerWidth + angleOffset * 0.2f, shimmerHeight + angleOffset * 0.2f)
                )

                // Draw shimmer with safe linear gradient
                drawRect(
                    brush = shimmerGradient,
                    topLeft = Offset(shimmerStart, 0f),
                    size = Size(shimmerWidth, shimmerHeight)
                )
            }
        }
    }
    
    // ===== FOCUS SCALE TYPES =====
    
    enum class FocusScaleType(val scale: Float) {
        Small(Visual.FOCUS_SCALE_SMALL),
        Medium(Visual.FOCUS_SCALE_MEDIUM),
        Large(Visual.FOCUS_SCALE_LARGE)
    }
    
    // ===== FOCUS COLORS =====
    
    @Composable
    fun focusColors(): FocusColors {
        return FocusColors(
            border = FocusBorder,
            glow = FocusGlow,
            background = FocusBackground
        )
    }
    
    // ===== FOCUS UTILITIES =====
    
    /**
     * Create a focus-aware modifier that combines all Google TV focus effects
     */
    @Composable
    fun Modifier.googleTVFocusable(
        scaleType: FocusScaleType = FocusScaleType.Medium,
        borderRadius: Dp = Visual.BORDER_RADIUS,
        elevation: Boolean = true,
        glow: Boolean = true,
        shimmer: Boolean = true
    ): Modifier {
        var isFocused by remember { mutableStateOf(false) }

        return this
            .onFocusChanged { focusState ->
                isFocused = focusState.isFocused
            }
            .googleTVFocusInternal(scaleType, borderRadius, elevation, isFocused)
            .then(
                if (glow) {
                    Modifier.googleTVGlow(isFocused)
                } else Modifier
            )
            .then(
                if (shimmer) {
                    Modifier.googleTVShimmer(isFocused)
                } else Modifier
            )
    }

    /**
     * Internal focus function that doesn't add onFocusChanged
     */
    @Composable
    private fun Modifier.googleTVFocusInternal(
        scaleType: FocusScaleType = FocusScaleType.Medium,
        borderRadius: Dp = Visual.BORDER_RADIUS,
        elevation: Boolean = true,
        isFocused: Boolean = false
    ): Modifier {
        var isPressed by remember { mutableStateOf(false) }

        val scale by animateFloatAsState(
            targetValue = when {
                isPressed -> Visual.PRESSED_SCALE
                isFocused -> scaleType.scale
                else -> Visual.DEFAULT_SCALE
            },
            animationSpec = Animation.BOUNCE_SPRING,
            label = "focus_scale"
        )

        val elevationValue by animateDpAsState(
            targetValue = when {
                isPressed -> Visual.PRESSED_ELEVATION
                isFocused -> Visual.FOCUS_ELEVATION
                else -> Visual.DEFAULT_ELEVATION
            },
            animationSpec = tween(
                durationMillis = Animation.FOCUS_DURATION,
                easing = Animation.FOCUS_EASING
            ),
            label = "focus_elevation"
        )

        val borderColor by animateColorAsState(
            targetValue = if (isFocused) FocusBorder else Color.Transparent,
            animationSpec = tween(
                durationMillis = Animation.COLOR_DURATION,
                easing = Animation.COLOR_EASING
            ),
            label = "focus_border_color"
        )

        return this
            .scale(scale)
            .then(
                if (elevation) {
                    Modifier.shadow(
                        elevation = elevationValue,
                        shape = RoundedCornerShape(borderRadius)
                    )
                } else Modifier
            )
            .border(
                BorderStroke(
                    width = if (isFocused) 4.dp else 0.dp, // Thicker and more visible border
                    color = borderColor
                ),
                shape = RoundedCornerShape(borderRadius)
            )
            .padding(Visual.BORDER_OFFSET)
    }
}

/**
 * Focus Direction for D-pad navigation
 */
enum class FocusDirection {
    Up, Down, Left, Right, Next, Previous
}

/**
 * Focus Group for managing focus within sections
 */
data class FocusGroup(
    val id: String,
    val priority: Int,
    val isDefault: Boolean = false,
    val trapFocus: Boolean = false
)

/**
 * Focus Manager interface for TV navigation
 */
interface GoogleTVFocusManager {
    fun requestFocus(componentId: String): Boolean
    fun moveFocus(direction: FocusDirection): Boolean
    fun saveFocusState(groupId: String)
    fun restoreFocusState(groupId: String): Boolean
    fun trapFocus(groupId: String)
    fun releaseFocusTrap()
    fun setFocusGroup(group: FocusGroup)
    fun getCurrentFocus(): String?
}
