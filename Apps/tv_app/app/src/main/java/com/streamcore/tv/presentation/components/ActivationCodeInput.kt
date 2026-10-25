package com.streamcore.tv.presentation.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R
import com.streamcore.tv.presentation.theme.*

/**
 * Custom activation code input component
 * 
 * Displays 6 individual boxes for activation code digits
 */
@Composable
fun ActivationCodeInput(
    code: String,
    onCodeChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    isError: Boolean = false,
    enabled: Boolean = true
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Code input boxes
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            repeat(6) { index ->
                CodeDigitBox(
                    digit = code.getOrNull(index)?.toString() ?: "",
                    isActive = index == code.length,
                    isError = isError,
                    enabled = enabled
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Visible text field for input handling
        OutlinedTextField(
            value = code,
            onValueChange = { newCode ->
                // Only allow digits and limit to 6 characters
                val filteredCode = newCode.filter { it.isDigit() }.take(6)
                onCodeChange(filteredCode)
            },
            modifier = Modifier.width(200.dp),
            label = { Text(stringResource(R.string.activation_code)) },
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Number
            ),
            enabled = enabled,
            isError = isError,
            singleLine = true
        )
    }
}

@Composable
private fun CodeDigitBox(
    digit: String,
    isActive: Boolean,
    isError: Boolean,
    enabled: Boolean
) {
    // Animation for scale when digit is entered
    val scale by animateFloatAsState(
        targetValue = if (digit.isNotEmpty()) 1.1f else 1f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessHigh
        ),
        label = "digit_scale"
    )

    // Animation for cursor blinking
    val cursorAlpha by animateFloatAsState(
        targetValue = if (isActive && digit.isEmpty()) 1f else 0f,
        animationSpec = infiniteRepeatable(
            animation = tween(500),
            repeatMode = RepeatMode.Reverse
        ),
        label = "cursor_alpha"
    )

    val backgroundColor = when {
        !enabled -> Color.White.copy(alpha = 0.05f)
        isError -> Error.copy(alpha = 0.1f)
        isActive -> Color.White.copy(alpha = 0.15f)
        digit.isNotEmpty() -> Color.White.copy(alpha = 0.1f)
        else -> Color.White.copy(alpha = 0.05f)
    }

    val borderBrush = when {
        !enabled -> Brush.linearGradient(
            colors = listOf(
                Color.White.copy(alpha = 0.1f),
                Color.White.copy(alpha = 0.1f)
            )
        )
        isError -> Brush.linearGradient(
            colors = listOf(Error, Error.copy(alpha = 0.7f))
        )
        isActive -> Brush.linearGradient(
            colors = listOf(Primary, PrimaryLight)
        )
        digit.isNotEmpty() -> Brush.linearGradient(
            colors = listOf(
                Primary.copy(alpha = 0.7f),
                PrimaryLight.copy(alpha = 0.7f)
            )
        )
        else -> Brush.linearGradient(
            colors = listOf(
                Color.White.copy(alpha = 0.2f),
                Color.White.copy(alpha = 0.2f)
            )
        )
    }

    val textColor = when {
        !enabled -> Color.White.copy(alpha = 0.3f)
        isError -> Error
        else -> Color.White
    }

    Box(
        modifier = Modifier
            .size(56.dp)
            .scale(scale)
            .clip(RoundedCornerShape(16.dp))
            .background(backgroundColor)
            .border(
                width = if (isActive || digit.isNotEmpty()) 2.dp else 1.dp,
                brush = borderBrush,
                shape = RoundedCornerShape(16.dp)
            ),
        contentAlignment = Alignment.Center
    ) {
        // Digit text
        AnimatedVisibility(
            visible = digit.isNotEmpty(),
            enter = scaleIn() + fadeIn(),
            exit = scaleOut() + fadeOut()
        ) {
            Text(
                text = digit,
                style = TextStyle(
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                    color = textColor
                )
            )
        }

        // Animated cursor indicator for active box
        if (isActive && digit.isEmpty()) {
            Box(
                modifier = Modifier
                    .width(3.dp)
                    .height(24.dp)
                    .background(
                        brush = Brush.verticalGradient(
                            colors = listOf(Primary, PrimaryLight)
                        ),
                        shape = RoundedCornerShape(2.dp)
                    )
                    .clip(RoundedCornerShape(2.dp))
            ) {
                // Blinking effect
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Color.White.copy(alpha = cursorAlpha),
                            shape = RoundedCornerShape(2.dp)
                        )
                )
            }
        }
    }
}
