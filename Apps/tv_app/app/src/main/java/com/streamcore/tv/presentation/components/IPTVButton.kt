package com.streamcore.tv.presentation.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.streamcore.tv.presentation.navigation.GoogleTVFocusableContainer
import com.streamcore.tv.presentation.theme.*

/**
 * Google TV Style IPTV Button component
 *
 * Provides consistent button styling optimized for TV remote navigation
 * with focus management and Google TV visual design
 */
@Composable
fun IPTVButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    variant: ButtonVariant = ButtonVariant.Primary,
    size: ButtonSize = ButtonSize.Medium,
    icon: ImageVector? = null,
    isLoading: Boolean = false
) {
    val focusRequester = remember { FocusRequester() }
    var isFocused by remember { mutableStateOf(false) }



    // Google TV optimized padding (larger for TV)
    val contentPadding = when (size) {
        ButtonSize.Small -> PaddingValues(horizontal = 16.dp, vertical = 8.dp)
        ButtonSize.Medium -> PaddingValues(horizontal = 24.dp, vertical = 12.dp)
        ButtonSize.Large -> PaddingValues(horizontal = 32.dp, vertical = 16.dp)
    }

    // Google TV optimized border radius (flat design - 50% less rounded)
    val shape = RoundedCornerShape(8.dp)

    // Focus animations
    val scale by animateFloatAsState(
        targetValue = if (isFocused) 1.05f else 1.0f,
        animationSpec = GoogleTVFocus.Animation.BOUNCE_SPRING,
        label = "button_scale"
    )

    // Enhanced colors for focus state with better contrast
    val focusedColors = when (variant) {
        ButtonVariant.Primary -> ButtonDefaults.buttonColors(
            containerColor = if (isFocused) Color(0xFF424242) else Color.White,
            contentColor = if (isFocused) Color.White else Color.Black,
            disabledContainerColor = ButtonDisabled,
            disabledContentColor = TextDisabled
        )
        ButtonVariant.Secondary -> ButtonDefaults.buttonColors(
            containerColor = if (isFocused) ButtonFocusedSecondary else ButtonSecondary,
            contentColor = OnSurface,
            disabledContainerColor = ButtonDisabled,
            disabledContentColor = TextDisabled
        )
        ButtonVariant.Outline -> ButtonDefaults.outlinedButtonColors(
            containerColor = if (isFocused) ButtonFocusedOutline else ButtonOutline,
            contentColor = if (isFocused) Color.White else Primary,
            disabledContentColor = TextDisabled
        )
    }

    GoogleTVFocusableContainer(
        modifier = modifier
            .scale(scale)
            .focusRequester(focusRequester)
            .onFocusChanged { focusState ->
                isFocused = focusState.isFocused
            }
            .focusable(),
        onFocusChanged = { focused ->
            isFocused = focused
        }
    ) {
        when (variant) {
            ButtonVariant.Outline -> {
                OutlinedButton(
                    onClick = onClick,
                    modifier = Modifier.fillMaxWidth(),
                    enabled = enabled && !isLoading,
                    colors = focusedColors,
                    contentPadding = contentPadding,
                    shape = shape,
                    border = BorderStroke(
                        width = if (isFocused) 3.dp else 2.dp,
                        color = if (isFocused) FocusBorder else OnSurfaceVariant
                    )
                ) {
                    ButtonContent(
                        text = text,
                        icon = icon,
                        isLoading = isLoading,
                        size = size
                    )
                }
            }
            else -> {
                Button(
                    onClick = onClick,
                    modifier = Modifier.fillMaxWidth(),
                    enabled = enabled && !isLoading,
                    colors = focusedColors,
                    contentPadding = contentPadding,
                    shape = shape,
                    elevation = ButtonDefaults.buttonElevation(
                        defaultElevation = if (isFocused) 8.dp else 4.dp,
                        pressedElevation = 2.dp,
                        disabledElevation = 0.dp
                    )
                ) {
                    ButtonContent(
                        text = text,
                        icon = icon,
                        isLoading = isLoading,
                        size = size
                    )
                }
            }
        }
    }
}

@Composable
private fun ButtonContent(
    text: String,
    icon: ImageVector?,
    isLoading: Boolean,
    size: ButtonSize
) {
    // Google TV optimized icon sizes (larger for TV viewing)
    val iconSize = when (size) {
        ButtonSize.Small -> 18.dp
        ButtonSize.Medium -> 20.dp
        ButtonSize.Large -> 24.dp
    }

    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp) // Increased spacing for TV
    ) {
        if (isLoading) {
            CircularProgressIndicator(
                modifier = Modifier.size(iconSize),
                strokeWidth = 2.dp,
                color = LocalContentColor.current
            )
        } else {
            icon?.let {
                Icon(
                    imageVector = it,
                    contentDescription = null,
                    modifier = Modifier.size(iconSize)
                )
            }
        }

        Text(
            text = text,
            style = when (size) {
                ButtonSize.Small -> MaterialTheme.typography.labelMedium
                ButtonSize.Medium -> MaterialTheme.typography.labelLarge
                ButtonSize.Large -> MaterialTheme.typography.titleMedium
            },
            fontWeight = FontWeight.Medium
        )
    }
}

/**
 * Google TV specific button variant for quick actions
 */
@Composable
fun GoogleTVQuickActionButton(
    text: String,
    icon: ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true
) {
    IPTVButton(
        text = text,
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        variant = ButtonVariant.Secondary,
        size = ButtonSize.Medium,
        icon = icon
    )
}

/**
 * Google TV specific primary action button
 */
@Composable
fun GoogleTVPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null,
    isLoading: Boolean = false
) {
    IPTVButton(
        text = text,
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        variant = ButtonVariant.Primary,
        size = ButtonSize.Large,
        icon = icon,
        isLoading = isLoading
    )
}

/**
 * Button variants
 */
enum class ButtonVariant {
    Primary,
    Secondary,
    Outline
}

/**
 * Button sizes
 */
enum class ButtonSize {
    Small,
    Medium,
    Large
}
