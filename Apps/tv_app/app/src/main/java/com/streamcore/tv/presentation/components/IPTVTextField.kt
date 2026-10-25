package com.streamcore.tv.presentation.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.ExperimentalComposeUiApi
import android.content.Context
import android.view.inputmethod.InputMethodManager
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope
import com.streamcore.tv.presentation.navigation.GoogleTVFocusableContainer
import com.streamcore.tv.presentation.theme.*

/**
 * Google TV Style IPTV TextField component
 *
 * Provides consistent text field styling optimized for TV remote navigation
 * with enhanced focus management and Google TV visual design
 */
@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun IPTVTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    focusRequester: FocusRequester? = null,
    label: String? = null,
    placeholder: String? = null,
    leadingIcon: ImageVector? = null,
    trailingIcon: ImageVector? = null,
    onTrailingIconClick: (() -> Unit)? = null,
    isError: Boolean = false,
    errorMessage: String? = null,
    enabled: Boolean = true,
    readOnly: Boolean = false,
    singleLine: Boolean = true,
    maxLines: Int = if (singleLine) 1 else Int.MAX_VALUE,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None
) {
    val effectiveFocusRequester = focusRequester ?: remember { FocusRequester() }
    val keyboardController = LocalSoftwareKeyboardController.current
    val context = LocalContext.current
    var isFocused by remember { mutableStateOf(false) }
    val coroutineScope = rememberCoroutineScope() // Use lifecycle-aware scope instead of GlobalScope

    // Function to show keyboard automatically for Android TV
    val showKeyboard = {
        try {
            val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
            // Use SHOW_IMPLICIT instead of SHOW_FORCED to prevent conflicts
            imm.showSoftInput(null, InputMethodManager.SHOW_IMPLICIT)
            keyboardController?.show()
        } catch (e: Exception) {
            keyboardController?.show()
        }
    }

    // Google TV focus animations
    val scale by animateFloatAsState(
        targetValue = if (isFocused) 1.02f else 1.0f,
        animationSpec = GoogleTVFocus.Animation.SMOOTH_SPRING,
        label = "textfield_scale"
    )

    val borderColor by animateColorAsState(
        targetValue = when {
            isError -> Error
            isFocused -> Primary
            else -> SurfaceVariant
        },
        animationSpec = tween(200),
        label = "textfield_border_color"
    )

    Column(modifier = modifier) {
        GoogleTVFocusableContainer(
            modifier = Modifier
                .fillMaxWidth()
                .scale(scale)
                .focusRequester(effectiveFocusRequester)
                .onFocusChanged { focusState ->
                    isFocused = focusState.isFocused
                    // Only handle visual focus state, let OutlinedTextField handle keyboard
                }
                .focusable(),
            onFocusChanged = { focused ->
                isFocused = focused
                // Don't show keyboard here to avoid conflicts
            }
        ) {
            OutlinedTextField(
                value = value,
                onValueChange = onValueChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .onFocusChanged { textFieldFocusState ->
                        // Handle focus specifically for the text field
                        if (textFieldFocusState.isFocused && enabled) {
                            // Show keyboard when text field itself gets focus
                            // Use lifecycle-aware scope instead of GlobalScope
                            coroutineScope.launch {
                                kotlinx.coroutines.delay(50)
                                showKeyboard()
                            }
                        }
                    },
                label = label?.let {
                    {
                        Text(
                            text = it,
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                },
                placeholder = placeholder?.let {
                    {
                        Text(
                            text = it,
                            style = MaterialTheme.typography.bodyMedium,
                            color = TextTertiary
                        )
                    }
                },
                leadingIcon = leadingIcon?.let {
                    {
                        Icon(
                            imageVector = it,
                            contentDescription = null,
                            tint = if (isError) Error else if (isFocused) Primary else TextTertiary
                        )
                    }
                },
                trailingIcon = trailingIcon?.let {
                    {
                        IconButton(
                            onClick = onTrailingIconClick ?: {}
                        ) {
                            Icon(
                                imageVector = it,
                                contentDescription = null,
                                tint = if (isError) Error else if (isFocused) Primary else TextTertiary
                            )
                        }
                    }
                },
                isError = isError,
                enabled = enabled,
                readOnly = readOnly,
                singleLine = singleLine,
                maxLines = maxLines,
                keyboardOptions = keyboardOptions,
                keyboardActions = keyboardActions,
                visualTransformation = visualTransformation,
                shape = RoundedCornerShape(16.dp), // Google TV optimized border radius
                colors = OutlinedTextFieldDefaults.colors(
                    // Google TV optimized colors
                    focusedBorderColor = borderColor,
                    unfocusedBorderColor = SurfaceVariant,
                    errorBorderColor = Error,
                    focusedLabelColor = Primary,
                    unfocusedLabelColor = TextTertiary,
                    errorLabelColor = Error,
                    focusedTextColor = TextPrimary,
                    unfocusedTextColor = TextSecondary,
                    disabledTextColor = TextDisabled,
                    errorTextColor = TextPrimary,
                    cursorColor = Primary,
                    errorCursorColor = Error,
                    // Enhanced container colors for TV
                    focusedContainerColor = Surface1,
                    unfocusedContainerColor = Surface,
                    disabledContainerColor = Surface,
                    errorContainerColor = Surface1
                )
            )
        }

        // Error message with improved spacing for TV
        if (isError && errorMessage != null) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = errorMessage,
                color = Error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}

/**
 * Google TV specific search text field
 */
@Composable
fun GoogleTVSearchField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "Search...",
    enabled: Boolean = true
) {
    IPTVTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier,
        placeholder = placeholder,
        enabled = enabled,
        singleLine = true,
        keyboardOptions = KeyboardOptions.Default
    )
}
