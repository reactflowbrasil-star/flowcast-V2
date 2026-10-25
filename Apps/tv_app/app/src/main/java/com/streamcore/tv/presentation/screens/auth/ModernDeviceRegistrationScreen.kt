package com.streamcore.tv.presentation.screens.auth


import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.*
import androidx.compose.foundation.Image
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R
import com.streamcore.tv.BuildConfig
import com.streamcore.tv.core.utils.ShowToast
import com.streamcore.tv.presentation.components.ModernDeviceLimitDialog
import kotlin.math.cos
import kotlin.math.sin

/**
 * Modern device registration screen with improved layout and device information
 */
@Composable
fun ModernDeviceRegistrationScreen(
    onNavigateToHome: () -> Unit,
    viewModel: LoginViewModel = hiltViewModel(),
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsState()

    // Handle navigation to home after successful device registration
    LaunchedEffect(uiState.deviceToken) {
        uiState.deviceToken?.let { _ ->
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
        modifier = modifier
            .fillMaxSize()
            .background(
                brush = Brush.radialGradient(
                    colors = listOf(
                        Color(0xFF181818), // Background from theme
                        Color(0xFF1E2129), // BackgroundVariant from theme
                        Color(0xFF242831)  // Surface2 from theme
                    ),
                    radius = 1500f
                )
            )
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(32.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Left side - Registration Form
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .padding(end = 32.dp),
                contentAlignment = Alignment.Center
            ) {
                ModernRegistrationForm(
                    deviceName = uiState.deviceName,
                    onDeviceNameChange = viewModel::updateDeviceName,
                    onRegisterClick = viewModel::registerDevice,
                    isLoading = uiState.isLoading,
                    isError = uiState.error != null,
                    deviceInfo = uiState.deviceInfoList,
                    maxDevices = uiState.maxDevices
                )
            }

            // Right side - Modern Logo and Branding
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .padding(start = 32.dp),
                contentAlignment = Alignment.Center
            ) {
                ModernBrandingSection()
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
                Card(
                    modifier = Modifier.padding(32.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surface
                    ),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(32.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        CircularProgressIndicator(
                            color = MaterialTheme.colorScheme.primary,
                            strokeWidth = 3.dp,
                            modifier = Modifier.size(48.dp)
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = stringResource(R.string.registering_device_long),
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }
        }
    }

    // Device Limit Dialog
    if (uiState.showDeviceLimitDialog) {
        ModernDeviceLimitDialog(
            devices = uiState.deviceInfoList,
            maxDevices = uiState.maxDevices,
            onDeviceSelected = { deviceToRemove ->
                viewModel.removeDeviceAndRegisterCurrent(deviceToRemove)
            },
            onDismiss = {
                viewModel.closeDeviceLimitDialog()
            },
            isLoading = uiState.isLoading
        )
    }
}

/**
 * Modern registration form with device information
 */
@Composable
private fun ModernRegistrationForm(
    deviceName: String,
    onDeviceNameChange: (String) -> Unit,
    onRegisterClick: () -> Unit,
    isLoading: Boolean,
    isError: Boolean,
    deviceInfo: List<com.streamcore.tv.domain.model.DeviceInfo>,
    maxDevices: Int
) {
    val usedDevices = deviceInfo.size
    @Suppress("UNUSED_VARIABLE")
    val availableDevices = maxDevices - usedDevices
    val isAtLimit = usedDevices >= maxDevices

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(24.dp)),
        colors = CardDefaults.cardColors(
            containerColor = Color(0xFF1E2129) // BackgroundVariant from theme
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 16.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(40.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Header
            Text(
                                            text = stringResource(R.string.device_registration_title),
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = Color(0xFFFFFFFF), // White text for dark theme
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                                            text = stringResource(R.string.device_registration_subtitle),
                style = MaterialTheme.typography.bodyLarge,
                color = Color(0xFFB0BEC5), // Light gray for dark theme
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(32.dp))

            // Device Limit Status
            DeviceLimitStatusCard(
                usedDevices = usedDevices,
                maxDevices = maxDevices,
                isAtLimit = isAtLimit
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Device Name Input
            OutlinedTextField(
                value = deviceName,
                onValueChange = onDeviceNameChange,
                label = { Text(stringResource(R.string.auth_device_name)) },
                placeholder = { Text(stringResource(R.string.auth_device_name_hint)) },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Outlined.Smartphone,
                        contentDescription = null
                    )
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = !isLoading,
                isError = isError,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Color(0xFF4285F4), // Primary blue from theme
                    unfocusedBorderColor = Color(0xFF424242), // Dark gray for dark theme
                    focusedTextColor = Color(0xFFFFFFFF), // White text
                    unfocusedTextColor = Color(0xFFE8EAF6) // Light text
                )
            )

            Spacer(modifier = Modifier.height(24.dp))

            // Register Button
            Button(
                onClick = onRegisterClick,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                enabled = !isLoading && deviceName.isNotBlank() && !isAtLimit,
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isAtLimit) Color(0xFFEA4335) else Color(0xFF4285F4), // Theme colors
                    disabledContainerColor = Color(0xFF424242), // Dark gray for disabled
                    contentColor = Color(0xFFFFFFFF) // White text
                )
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = Color.White,
                        strokeWidth = 2.dp
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = stringResource(R.string.auth_registering),
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                } else {
                    Icon(
                        imageVector = if (isAtLimit) Icons.Default.SwapHoriz else Icons.Default.Add,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (isAtLimit) stringResource(R.string.replace_device_button) else stringResource(R.string.device_register_button),
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
    }
}

/**
 * Device limit status card showing usage information
 */
@Composable
private fun DeviceLimitStatusCard(
    usedDevices: Int,
    maxDevices: Int,
    isAtLimit: Boolean
) {
    val progress = if (maxDevices > 0) usedDevices.toFloat() / maxDevices.toFloat() else 0f
    val progressColor = when {
        progress >= 1f -> Color(0xFFEF4444) // red-500
        progress >= 0.8f -> Color(0xFFF59E0B) // amber-500
        else -> Color(0xFF10B981) // emerald-500
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (isAtLimit) {
                Color(0xFF2A1F1F) // Dark red background
            } else {
                Color(0xFF1F2A1F) // Dark green background
            }
        ),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = if (isAtLimit) Icons.Default.Warning else Icons.Default.CheckCircle,
                        contentDescription = null,
                        tint = if (isAtLimit) Color(0xFFEF4444) else Color(0xFF10B981),
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = stringResource(R.string.devices_label),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Medium,
                        color = Color(0xFFFFFFFF) // White text for dark theme
                    )
                }

                Text(
                    text = stringResource(R.string.devices_count, usedDevices, maxDevices),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = progressColor
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Progress bar
            LinearProgressIndicator(
                progress = { progress },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .clip(RoundedCornerShape(3.dp)),
                color = progressColor,
                trackColor = Color(0xFF424242) // Dark gray track for dark theme
            )

            Spacer(modifier = Modifier.height(6.dp))

            Text(
                text = if (isAtLimit) {
                    stringResource(R.string.device_limit_reached_message)
                } else {
                    stringResource(R.string.device_spaces_available, maxDevices - usedDevices)
                },
                style = MaterialTheme.typography.bodySmall,
                color = if (isAtLimit) Color(0xFFDC2626) else Color(0xFF059669)
            )
        }
    }
}



/**
 * Modern branding section with logo image
 */
@Composable
private fun ModernBrandingSection() {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Show the splash_logo which contains the full branding image
        Image(
            painter = painterResource(id = R.drawable.splash_logo),
            contentDescription = stringResource(R.string.cd_logo),
            modifier = Modifier
                .fillMaxWidth(0.8f)
                .heightIn(max = 200.dp),
            contentScale = ContentScale.Fit
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

        Spacer(modifier = Modifier.height(24.dp))

        // Feature highlights
        FeatureHighlights()
    }
}

/**
 * Professional logo component using app launcher icon
 */
@Composable
private fun AnimatedLogo() {
    Card(
        modifier = Modifier.size(120.dp),
        colors = CardDefaults.cardColors(
            containerColor = Color(0xFF1E293B) // slate-800 background
        ),
        elevation = CardDefaults.cardElevation(
            defaultElevation = 20.dp
        ),
        shape = RoundedCornerShape(24.dp)
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Image(
                painter = painterResource(id = R.mipmap.ic_launcher_foreground),
                contentDescription = stringResource(R.string.device_registration_logo_description),
                modifier = Modifier
                    .size(100.dp)
                    .clip(RoundedCornerShape(16.dp)),
                contentScale = ContentScale.Fit
            )
        }
    }
}

/**
 * Feature highlights
 */
@Composable
private fun FeatureHighlights() {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        FeatureItem(Icons.Default.Hd, stringResource(R.string.device_registration_feature_hd))
        FeatureItem(Icons.Default.Devices, stringResource(R.string.device_registration_feature_devices))
        FeatureItem(Icons.Default.Security, stringResource(R.string.device_registration_feature_security))
    }
}

/**
 * Individual feature item
 */
@Composable
private fun FeatureItem(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = Color(0xFF3B82F6),
            modifier = Modifier.size(16.dp)
        )
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            color = Color(0xFFB0BEC5), // Light gray for dark theme
            fontWeight = FontWeight.Medium
        )
    }
}
