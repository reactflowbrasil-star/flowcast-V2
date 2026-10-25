package com.streamcore.tv.presentation.screens.auth

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Help
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import kotlin.math.cos
import kotlin.math.sin
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.streamcore.tv.R
import com.streamcore.tv.BuildConfig
import com.streamcore.tv.core.utils.ShowToast
import com.streamcore.tv.core.utils.isValidActivationCode
import com.streamcore.tv.presentation.components.IPTVButton
import com.streamcore.tv.presentation.components.LoadingOverlay
import com.streamcore.tv.presentation.components.ActivationCodeInput
import com.streamcore.tv.presentation.theme.*

/**
 * Activation screen for device activation with code
 */
@Composable
fun ActivationScreen(
    deviceToken: String,
    onNavigateToHome: () -> Unit,
    viewModel: ActivationViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    
    // Set device token when screen loads
    LaunchedEffect(deviceToken) {
        viewModel.setDeviceToken(deviceToken)
    }
    
    // Handle navigation to home screen
    LaunchedEffect(uiState.isActivated) {
        if (uiState.isActivated) {
            onNavigateToHome()
        }
    }
    
    // Show error messages
    uiState.error?.let { error ->
        ShowToast(message = error)
        LaunchedEffect(error) {
            viewModel.clearError()
        }
    }
    
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                brush = Brush.radialGradient(
                    colors = listOf(
                        Color(0xFF0D1117), // GitHub dark
                        Color(0xFF161B22), // GitHub darker
                        Color(0xFF21262D)  // GitHub darkest
                    ),
                    radius = 1200f
                )
            )
    ) {
        // Professional two-column layout (inverted) - responsive
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 32.dp, vertical = 24.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Left side - Device Registration Form
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .padding(end = 24.dp),
                contentAlignment = Alignment.Center
            ) {
                ModernDeviceRegistrationForm(
                    activationCode = uiState.activationCode,
                    onCodeChange = viewModel::updateActivationCode,
                    onActivateClick = viewModel::activateDevice,
                    isLoading = uiState.isLoading,
                    isError = uiState.error != null
                )
            }

            // Right side - Professional StreamCore Logo (centered)
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .padding(start = 24.dp),
                contentAlignment = Alignment.Center
            ) {
                ModernStreamCoreLogo()
            }
        }

        // Loading Overlay
        if (uiState.isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.7f)),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(
                    color = Color(0xFF58A6FF),
                    strokeWidth = 3.dp
                )
            }
        }
    }
}

@Composable
private fun AnimatedBackgroundElements() {
    val infiniteTransition = rememberInfiniteTransition(label = "background")

    @Suppress("UNUSED_VARIABLE")
    val rotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(20000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "rotation"
    )

    val scale by infiniteTransition.animateFloat(
        initialValue = 0.8f,
        targetValue = 1.2f,
        animationSpec = infiniteRepeatable(
            animation = tween(4000, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "scale"
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .blur(50.dp)
    ) {
        // Floating gradient circles
        Box(
            modifier = Modifier
                .size(200.dp)
                .offset(x = (-50).dp, y = (-100).dp)
                .scale(scale)
                .background(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            Primary.copy(alpha = 0.3f),
                            Color.Transparent
                        )
                    ),
                    shape = RoundedCornerShape(50)
                )
        )

        Box(
            modifier = Modifier
                .size(150.dp)
                .offset(x = 250.dp, y = 400.dp)
                .scale(scale * 0.7f)
                .background(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            Secondary.copy(alpha = 0.2f),
                            Color.Transparent
                        )
                    ),
                    shape = RoundedCornerShape(50)
                )
        )
    }
}

@Composable
private fun AnimatedLogoSection() {
    val scale by animateFloatAsState(
        targetValue = 1f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessLow
        ),
        label = "logo_scale"
    )

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.scale(scale)
    ) {
        // Modern TV Icon with gradient
        Box(
            modifier = Modifier
                .size(120.dp)
                .background(
                    brush = Brush.linearGradient(
                        colors = listOf(Primary, PrimaryLight)
                    ),
                    shape = RoundedCornerShape(24.dp)
                )
                .clip(RoundedCornerShape(24.dp)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Default.Tv,
                contentDescription = null,
                modifier = Modifier.size(64.dp),
                tint = Color.White
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        // App Name with gradient text effect
        Text(
            text = BuildConfig.BRANDING_NAME,
            style = MaterialTheme.typography.headlineLarge.copy(
                fontSize = 32.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 2.sp
            ),
            color = Color.White
        )
    }
}

@Composable
private fun ModernActivationHeader() {
    val slideIn by animateFloatAsState(
        targetValue = 1f,
        animationSpec = tween(800, delayMillis = 300),
        label = "slide_in"
    )

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .fillMaxWidth()
            .offset { IntOffset(x = 0, y = (20 * (1 - slideIn)).dp.roundToPx()) }
    ) {
        Text(
            text = stringResource(R.string.welcome_to_iptv),
            style = MaterialTheme.typography.headlineLarge.copy(
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold
            ),
            color = Color.White,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(12.dp))

        Text(
            text = stringResource(R.string.register_device_to_continue),
            style = MaterialTheme.typography.bodyLarge.copy(
                fontSize = 16.sp
            ),
            color = Color.White.copy(alpha = 0.8f),
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 24.dp)
        )

        Spacer(modifier = Modifier.height(8.dp))

        // Device info card
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            colors = CardDefaults.cardColors(
                containerColor = Color.White.copy(alpha = 0.1f)
            ),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = stringResource(R.string.device_info_title),
                    style = MaterialTheme.typography.titleMedium,
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold
                )

                Spacer(modifier = Modifier.height(12.dp))

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.DeviceHub,
                        contentDescription = null,
                        tint = PrimaryLight,
                        modifier = Modifier.size(20.dp)
                    )
                    Text(
                        text = stringResource(R.string.device_type_android_tv),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.9f)
                    )
                }
            }
        }
    }
}

@Composable
private fun EnhancedActivationCodeSection(
    activationCode: String,
    onCodeChange: (String) -> Unit,
    onActivateClick: () -> Unit,
    isLoading: Boolean,
    isError: Boolean
) {
    val slideUp by animateFloatAsState(
        targetValue = 1f,
        animationSpec = tween(800, delayMillis = 600),
        label = "slide_up"
    )

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .offset { IntOffset(x = 0, y = (30 * (1 - slideUp)).dp.roundToPx()) },
        colors = CardDefaults.cardColors(
            containerColor = Color.White.copy(alpha = 0.05f)
        ),
        shape = RoundedCornerShape(24.dp),
        border = androidx.compose.foundation.BorderStroke(
            1.dp,
            Color.White.copy(alpha = 0.1f)
        )
    ) {
        Column(
            modifier = Modifier.padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(28.dp)
        ) {
            // Enhanced title with icon
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Security,
                    contentDescription = null,
                    tint = PrimaryLight,
                    modifier = Modifier.size(24.dp)
                )
                Text(
                    text = stringResource(R.string.activation_code_title),
                    style = MaterialTheme.typography.titleLarge.copy(
                        fontWeight = FontWeight.Bold
                    ),
                    color = Color.White
                )
            }

            // Enhanced Activation Code Input
            ActivationCodeInput(
                code = activationCode,
                onCodeChange = onCodeChange,
                isError = isError,
                enabled = !isLoading
            )

            // Enhanced Activate Button
            EnhancedActivateButton(
                isLoading = isLoading,
                enabled = !isLoading && activationCode.isValidActivationCode(),
                onClick = onActivateClick
            )
        }
    }
}

@Composable
private fun EnhancedActivateButton(
    isLoading: Boolean,
    enabled: Boolean,
    onClick: () -> Unit
) {
    val buttonScale by animateFloatAsState(
        targetValue = if (enabled) 1f else 0.95f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy),
        label = "button_scale"
    )

    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .scale(buttonScale),
        colors = ButtonDefaults.buttonColors(
            containerColor = Color.Transparent,
            disabledContainerColor = Color.Transparent
        ),
        shape = RoundedCornerShape(16.dp),
        contentPadding = PaddingValues(0.dp)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    brush = if (enabled) {
                        Brush.horizontalGradient(
                            colors = listOf(Primary, PrimaryLight)
                        )
                    } else {
                        Brush.horizontalGradient(
                            colors = listOf(
                                Color.Gray.copy(alpha = 0.3f),
                                Color.Gray.copy(alpha = 0.3f)
                            )
                        )
                    },
                    shape = RoundedCornerShape(16.dp)
                ),
            contentAlignment = Alignment.Center
        ) {
            if (isLoading) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = Color.White,
                        strokeWidth = 2.dp
                    )
                    Text(
                        text = stringResource(R.string.activating_device),
                        style = MaterialTheme.typography.titleMedium,
                        color = Color.White,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            } else {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.PlayArrow,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(20.dp)
                    )
                    Text(
                        text = stringResource(R.string.activate_device_button),
                        style = MaterialTheme.typography.titleMedium,
                        color = Color.White,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
    }
}

@Composable
private fun ModernHelpSection() {
    @Suppress("UNUSED_VARIABLE")
    val fadeIn by animateFloatAsState(
        targetValue = 1f,
        animationSpec = tween(800, delayMillis = 900),
        label = "fade_in"
    )

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Help title with icon
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.Help,
                contentDescription = null,
                tint = PrimaryLight,
                modifier = Modifier.size(20.dp)
            )
            Text(
                text = stringResource(R.string.need_help),
                style = MaterialTheme.typography.titleMedium,
                color = Color.White,
                fontWeight = FontWeight.SemiBold
            )
        }

        // Help items with modern styling
        Column(
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            HelpItem(
                icon = Icons.Default.Pin,
                text = stringResource(R.string.activation_code_info)
            )
            HelpItem(
                icon = Icons.Default.Verified,
                text = stringResource(R.string.verify_code_correct)
            )
            HelpItem(
                icon = Icons.Default.Support,
                text = stringResource(R.string.contact_support_if_issues)
            )
        }
    }
}

@Composable
private fun HelpItem(
    icon: ImageVector,
    text: String
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = PrimaryLight.copy(alpha = 0.7f),
            modifier = Modifier.size(16.dp)
        )
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            color = Color.White.copy(alpha = 0.8f)
        )
    }
}

@Composable
private fun EnhancedLoadingOverlay() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.7f)),
        contentAlignment = Alignment.Center
    ) {
        Card(
            colors = CardDefaults.cardColors(
                containerColor = Color.White.copy(alpha = 0.1f)
            ),
            shape = RoundedCornerShape(20.dp)
        ) {
            Column(
                modifier = Modifier.padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(48.dp),
                    color = PrimaryLight,
                    strokeWidth = 4.dp
                )
                Text(
                    text = stringResource(R.string.activating_device_long),
                    style = MaterialTheme.typography.titleMedium,
                    color = Color.White,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = stringResource(R.string.please_wait),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.White.copy(alpha = 0.7f)
                )
            }
        }
    }
}

@Composable
private fun ModernStreamCoreLogo(
    modifier: Modifier = Modifier
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = modifier
    ) {
        // Professional hexagonal logo
        Card(
            modifier = Modifier.size(120.dp),
            colors = CardDefaults.cardColors(
                containerColor = Color.Transparent
            ),
            elevation = CardDefaults.cardElevation(
                defaultElevation = 20.dp
            ),
            shape = RoundedCornerShape(24.dp)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        brush = Brush.radialGradient(
                            colors = listOf(
                                Color(0xFF4F46E5), // indigo-600
                                Color(0xFF3730A3), // indigo-800
                                Color(0xFF1E1B4B)  // indigo-950
                            ),
                            radius = 200f
                        )
                    ),
                contentAlignment = Alignment.Center
            ) {
                // Professional streaming icon
                Canvas(modifier = Modifier.size(64.dp)) {
                    val centerX = size.width / 2
                    val centerY = size.height / 2
                    val radius = size.width * 0.35f

                    // Draw hexagonal background
                    val hexPath = Path().apply {
                        val angles = (0..5).map { it * 60f }
                        angles.forEachIndexed { index, angle ->
                            val radian = Math.toRadians(angle.toDouble())
                            val x = centerX + radius * cos(radian).toFloat()
                            val y = centerY + radius * sin(radian).toFloat()
                            if (index == 0) moveTo(x, y) else lineTo(x, y)
                        }
                        close()
                    }

                    drawPath(
                        path = hexPath,
                        color = Color.White.copy(alpha = 0.1f)
                    )

                    // Draw play button
                    val playSize = size.width * 0.25f
                    val playPath = Path().apply {
                        moveTo(centerX - playSize * 0.3f, centerY - playSize * 0.4f)
                        lineTo(centerX - playSize * 0.3f, centerY + playSize * 0.4f)
                        lineTo(centerX + playSize * 0.5f, centerY)
                        close()
                    }

                    drawPath(
                        path = playPath,
                        color = Color.White
                    )

                    // Draw streaming waves
                    val waveStartX = centerX + playSize * 0.7f
                    for (i in 0..2) {
                        val waveY = centerY + (i - 1) * 8f
                        val alpha = 1f - (i * 0.3f)
                        drawLine(
                            color = Color.White.copy(alpha = alpha),
                            start = androidx.compose.ui.geometry.Offset(waveStartX, waveY),
                            end = androidx.compose.ui.geometry.Offset(waveStartX + 16f, waveY),
                            strokeWidth = 3f,
                            cap = StrokeCap.Round
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        // StreamCore text with professional styling
        Text(
            text = BuildConfig.BRANDING_NAME,
            fontSize = 36.sp,
            fontWeight = FontWeight.ExtraBold,
            style = TextStyle(
                brush = Brush.linearGradient(
                    colors = listOf(
                        Color(0xFFF8FAFC), // slate-50
                        Color(0xFFE2E8F0), // slate-200
                        Color(0xFFCBD5E1)  // slate-300
                    )
                )
            ),
            letterSpacing = 2.sp
        )

        Spacer(modifier = Modifier.height(12.dp))

        // Professional subtitle
        Text(
            text = stringResource(R.string.auth_brand_description),
            fontSize = 16.sp,
            color = Color(0xFF94A3B8), // slate-400
            fontWeight = FontWeight.Medium,
            letterSpacing = 1.2.sp
        )
    }
}

@Composable
private fun ModernDeviceRegistrationForm(
    activationCode: String,
    onCodeChange: (String) -> Unit,
    onActivateClick: () -> Unit,
    isLoading: Boolean,
    isError: Boolean
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .widthIn(max = 500.dp),
        colors = CardDefaults.cardColors(
            containerColor = Color(0xFF21262D).copy(alpha = 0.85f)
        ),
        elevation = CardDefaults.cardElevation(
            defaultElevation = 16.dp
        ),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Header section
            Text(
                text = stringResource(R.string.device_registration_title),
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFFF0F6FC)
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = stringResource(R.string.register_device_to_continue),
                fontSize = 14.sp,
                color = Color(0xFF8B949E),
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(24.dp))

            HorizontalDivider(
                color = Color(0xFF30363D),
                thickness = 1.dp
            )

            Spacer(modifier = Modifier.height(32.dp))

            // Device info section
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.Start
            ) {
                Text(
                    text = stringResource(R.string.device_info_title),
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Color(0xFFF0F6FC)
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Device name field
                OutlinedTextField(
                    value = "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}",
                    onValueChange = { },
                    label = { Text(stringResource(R.string.auth_device_name)) },
                    enabled = false,
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        disabledTextColor = Color(0xFFE6EDF3),
                        disabledBorderColor = Color(0xFF30363D),
                        disabledLabelColor = Color(0xFF8B949E)
                    ),
                    shape = RoundedCornerShape(12.dp)
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Activation code field
                OutlinedTextField(
                    value = activationCode,
                    onValueChange = onCodeChange,
                    label = { Text(stringResource(R.string.activation_code_title)) },
                    placeholder = { Text(stringResource(R.string.auth_activation_code_hint)) },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.Key,
                            contentDescription = null,
                            tint = Color(0xFF58A6FF)
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color(0xFFE6EDF3),
                        unfocusedTextColor = Color(0xFFE6EDF3),
                        focusedBorderColor = Color(0xFF58A6FF),
                        unfocusedBorderColor = Color(0xFF30363D),
                        focusedLabelColor = Color(0xFF58A6FF),
                        unfocusedLabelColor = Color(0xFF8B949E),
                        cursorColor = Color(0xFF58A6FF)
                    ),
                    shape = RoundedCornerShape(12.dp),
                    isError = isError
                )
            }

            Spacer(modifier = Modifier.height(32.dp))

            // Activate button
            Button(
                onClick = onActivateClick,
                enabled = !isLoading && activationCode.isNotBlank(),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFF3B82F6),
                    disabledContainerColor = Color(0xFF30363D)
                ),
                shape = RoundedCornerShape(12.dp)
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        color = Color.White,
                        strokeWidth = 2.dp
                    )
                } else {
                    Icon(
                        imageVector = Icons.Default.DeviceHub,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = stringResource(R.string.device_register_button),
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 16.sp
                    )
                }
            }
        }
    }
}
