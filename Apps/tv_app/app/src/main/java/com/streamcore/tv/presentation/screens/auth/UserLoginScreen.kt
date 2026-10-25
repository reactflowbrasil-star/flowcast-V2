package com.streamcore.tv.presentation.screens.auth

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Login
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.res.colorResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R
import com.streamcore.tv.BuildConfig
import androidx.compose.foundation.Image
import androidx.compose.ui.text.TextStyle
import kotlin.math.cos
import kotlin.math.sin
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.streamcore.tv.core.utils.ShowToast
import com.streamcore.tv.presentation.components.GoogleTVPrimaryButton
import com.streamcore.tv.presentation.components.IPTVTextField
import com.streamcore.tv.presentation.theme.*

/**
 * Simple login screen for Android TV
 */
@Composable
fun UserLoginScreen(
    onNavigateToDeviceRegistration: () -> Unit,
    viewModel: UserLoginViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var passwordVisible by remember { mutableStateOf(false) }

    // Focus management for keyboard navigation
    val passwordFocusRequester = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current

    // Handle navigation after successful login
    LaunchedEffect(uiState.isLoginSuccessful) {
        if (uiState.isLoginSuccessful) {
            onNavigateToDeviceRegistration()
        }
    }

    // Show error messages
    uiState.error?.let { error ->
        ShowToast(message = error)
        viewModel.clearError()
    }

    // Modern dark gradient background
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                brush = Brush.radialGradient(
                    colors = listOf(
                        Color(0xFF0D1117), // GitHub dark
                        Color(0xFF161B22), // Darker gray
                        Color(0xFF21262D), // Medium dark
                        Color(0xFF000000)  // Pure black
                    ),
                    radius = 1500f,
                    center = Offset(0.3f, 0.2f)
                )
            )
    ) {
        // Subtle animated background elements
        ModernBackgroundElements()

        // Main content
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(48.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Left side - Modern StreamCore Logo
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(end = 48.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                ModernStreamCoreLogo()
            }

            // Right side - Modern glassmorphism form
            Column(
                modifier = Modifier.weight(1f),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
            Card(
                modifier = Modifier
                    .widthIn(max = 420.dp)
                    .clip(RoundedCornerShape(16.dp)),
                colors = CardDefaults.cardColors(
                    containerColor = Color(0xFF161B22).copy(alpha = 0.85f)
                ),
                elevation = CardDefaults.cardElevation(defaultElevation = 16.dp),
                shape = RoundedCornerShape(16.dp)
            ) {
                Column(
                    modifier = Modifier.padding(32.dp),
                    verticalArrangement = Arrangement.spacedBy(20.dp)
                ) {
                    // Form header
                    Text(
                        text = stringResource(R.string.auth_sign_in),
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFFF0F6FC)
                    )
                    Text(
                        text = stringResource(R.string.auth_enter_credentials),
                        fontSize = 14.sp,
                        color = Color(0xFF8B949E)
                    )
                    HorizontalDivider(color = Color(0xFF30363D))
                    // Username with modern styling
                    OutlinedTextField(
                        value = uiState.username,
                        onValueChange = viewModel::updateUsername,
                        placeholder = { Text(stringResource(R.string.user_label), color = Color(0xFF8B949E)) },
                        leadingIcon = { Icon(Icons.Default.Person, contentDescription = null, tint = Color(0xFF8B949E)) },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !uiState.isLoading,
                        textStyle = TextStyle(color = Color(0xFFF0F6FC)),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = Color(0xFF58A6FF),
                            unfocusedBorderColor = Color(0xFF30363D),
                            focusedTextColor = Color(0xFFF0F6FC),
                            unfocusedTextColor = Color(0xFFE6EDF3),
                            unfocusedContainerColor = Color(0xFF0D1117).copy(alpha = 0.5f),
                            focusedContainerColor = Color(0xFF0D1117).copy(alpha = 0.5f)
                        ),
                        shape = RoundedCornerShape(12.dp),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Text,
                            imeAction = ImeAction.Next
                        ),
                        keyboardActions = KeyboardActions(
                            onNext = {
                                passwordFocusRequester.requestFocus()
                            }
                        )
                    )

                    // Password with modern styling
                    OutlinedTextField(
                        value = uiState.password,
                        onValueChange = viewModel::updatePassword,
                        placeholder = { Text(stringResource(R.string.auth_password), color = Color(0xFF8B949E)) },
                        leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null, tint = Color(0xFF8B949E)) },
                        visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                        trailingIcon = {
                            IconButton(onClick = { passwordVisible = !passwordVisible }) {
                                Icon(
                                    imageVector = if (passwordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                    contentDescription = null,
                                    tint = Color(0xFF58A6FF)
                                )
                            }
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .focusRequester(passwordFocusRequester),
                        enabled = !uiState.isLoading,
                        textStyle = TextStyle(color = Color(0xFFF0F6FC)),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = Color(0xFF58A6FF),
                            unfocusedBorderColor = Color(0xFF30363D),
                            focusedTextColor = Color(0xFFF0F6FC),
                            unfocusedTextColor = Color(0xFFE6EDF3),
                            unfocusedContainerColor = Color(0xFF0D1117).copy(alpha = 0.5f),
                            focusedContainerColor = Color(0xFF0D1117).copy(alpha = 0.5f)
                        ),
                        shape = RoundedCornerShape(12.dp),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            imeAction = ImeAction.Done
                        ),
                        keyboardActions = KeyboardActions(
                            onDone = {
                                focusManager.clearFocus()
                                if (uiState.username.isNotBlank() && uiState.password.isNotBlank() && !uiState.isLoading) {
                                    viewModel.login()
                                }
                            }
                        )
                    )

                    // Sign in button with clean gradient
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(
                                brush = if (uiState.username.isNotBlank() && uiState.password.isNotBlank() && !uiState.isLoading) {
                                    Brush.horizontalGradient(
                                        colors = listOf(
                                            Color(0xFF3B82F6),
                                            Color(0xFF2563EB)
                                        )
                                    )
                                } else {
                                    Brush.horizontalGradient(
                                        colors = listOf(
                                            Color(0xFF30363D),
                                            Color(0xFF30363D)
                                        )
                                    )
                                }
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Button(
                            onClick = viewModel::login,
                            modifier = Modifier.fillMaxSize(),
                            enabled = uiState.username.isNotBlank() && uiState.password.isNotBlank() && !uiState.isLoading,
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color.Transparent,
                                disabledContainerColor = Color.Transparent
                            ),
                            shape = RoundedCornerShape(12.dp),
                            elevation = null
                        ) {
                            if (uiState.isLoading) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(20.dp),
                                    color = Color.White,
                                    strokeWidth = 2.dp
                                )
                            } else {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Icon(
                                        Icons.AutoMirrored.Filled.Login,
                                        contentDescription = null,
                                        tint = Color.White
                                    )
                                    Text(
                                        text = stringResource(R.string.auth_sign_in_button),
                                        fontSize = 16.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = Color.White
                                    )
                                }
                            }
                        }
                    }
                }
            }
            }
        }
    }
}

@Composable
private fun ModernBackgroundElements() {
    // Subtle floating elements for visual interest
    Box(modifier = Modifier.fillMaxSize()) {
        // Top-left gradient circle
        Box(
            modifier = Modifier
                .size(300.dp)
                .offset((-100).dp, (-100).dp)
                .background(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            Color(0xFF58A6FF).copy(alpha = 0.1f),
                            Color.Transparent
                        ),
                        radius = 150f
                    ),
                    shape = androidx.compose.foundation.shape.CircleShape
                )
        )

        // Bottom-right gradient circle
        Box(
            modifier = Modifier
                .size(400.dp)
                .align(Alignment.BottomEnd)
                .offset(100.dp, 100.dp)
                .background(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            Color(0xFF1F6FEB).copy(alpha = 0.08f),
                            Color.Transparent
                        ),
                        radius = 200f
                    ),
                    shape = androidx.compose.foundation.shape.CircleShape
                )
        )
    }
}

@Composable
private fun ModernStreamCoreLogo(
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Show the splash_logo which contains the full branding image
        Image(
            painter = painterResource(id = R.drawable.splash_logo),
            contentDescription = stringResource(R.string.cd_logo),
            modifier = Modifier
                .fillMaxWidth(0.8f)
                .heightIn(max = 200.dp),
            contentScale = androidx.compose.ui.layout.ContentScale.Fit
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        // Subtitle
        Text(
            text = stringResource(id = R.string.splash_premium_content_platform),
            fontSize = 16.sp,
            color = Color(0xFF94A3B8),
            fontWeight = FontWeight.Medium,
            letterSpacing = 1.2.sp
        )
    }
}
