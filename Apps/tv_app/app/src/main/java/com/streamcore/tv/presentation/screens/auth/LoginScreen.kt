package com.streamcore.tv.presentation.screens.auth

import android.os.Build
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.*
import androidx.compose.ui.text.TextStyle
import kotlin.math.cos
import kotlin.math.sin
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.streamcore.tv.R
import com.streamcore.tv.BuildConfig
import com.streamcore.tv.core.utils.ShowToast
import com.streamcore.tv.presentation.components.DeviceLimitDialog
import com.streamcore.tv.domain.model.UiState
import com.streamcore.tv.presentation.components.IPTVButton
import com.streamcore.tv.presentation.components.IPTVTextField
import com.streamcore.tv.presentation.components.LoadingOverlay
import com.streamcore.tv.presentation.theme.*

/**
 * Device registration screen
 *
 * Allows users to register their device with a custom name
 * This should be called AFTER user login
 */
@Composable
fun DeviceRegistrationScreen(
    onNavigateToHome: () -> Unit,
    viewModel: LoginViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    @Suppress("UNUSED_VARIABLE")
    val context = LocalContext.current

    // Handle navigation to home after successful device registration
    LaunchedEffect(uiState.deviceToken) {
        uiState.deviceToken?.let { _ ->
            // Device registered successfully, go directly to home
            onNavigateToHome()
        }
    }
    
    // Show error messages
    uiState.error?.let { error ->
        ShowToast(message = error)
        // Clear error after showing
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
                ModernDeviceRegistrationFormForLogin(
                    deviceName = uiState.deviceName,
                    onDeviceNameChange = viewModel::updateDeviceName,
                    onRegisterClick = viewModel::registerDevice,
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
                ModernStreamCoreLogoForLogin()
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

    // Device Limit Dialog
    if (uiState.showDeviceLimitDialog) {
        DeviceLimitDialog(
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

@Composable
private fun LogoSection() {
    Card(
        modifier = Modifier.size(120.dp),
        shape = MaterialTheme.shapes.large,
        colors = CardDefaults.cardColors(
            containerColor = Primary
        ),
        elevation = CardDefaults.cardElevation(
            defaultElevation = 8.dp
        )
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Default.Tv,
                contentDescription = stringResource(R.string.cd_logo),
                modifier = Modifier.size(64.dp),
                tint = Color.White
            )
        }
    }
}

@Composable
private fun WelcomeSection() {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = stringResource(R.string.auth_welcome),
            style = MaterialTheme.typography.headlineMedium,
            color = TextPrimary,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Text(
            text = stringResource(R.string.auth_welcome_subtitle),
            style = MaterialTheme.typography.bodyLarge,
            color = TextSecondary,
            textAlign = TextAlign.Center
        )
    }
}

@Composable
private fun DeviceRegistrationForm(
    deviceName: String,
    onDeviceNameChange: (String) -> Unit,
    onRegisterClick: () -> Unit,
    onNavigateToHome: () -> Unit,
    isLoading: Boolean
) {
    val focusManager = LocalFocusManager.current

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = Surface
        ),
        elevation = CardDefaults.cardElevation(
            defaultElevation = 4.dp
        )
    ) {
        Column(
            modifier = Modifier.padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = stringResource(R.string.device_info_title),
                style = MaterialTheme.typography.titleLarge,
                color = TextPrimary,
                fontWeight = FontWeight.SemiBold
            )
            
            IPTVTextField(
                value = deviceName,
                onValueChange = onDeviceNameChange,
                label = stringResource(R.string.auth_device_name),
                placeholder = stringResource(R.string.auth_device_name_hint),
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Text,
                    imeAction = ImeAction.Done
                ),
                keyboardActions = KeyboardActions(
                    onDone = {
                        focusManager.clearFocus()
                        if (deviceName.isNotBlank() && !isLoading) {
                            onRegisterClick()
                        }
                    }
                ),
                enabled = !isLoading
            )
            
            // Device Info Display
            DeviceInfoDisplay()
            
            Spacer(modifier = Modifier.height(8.dp))
            
            IPTVButton(
                text = if (isLoading) {
                    stringResource(R.string.auth_registering)
                } else {
                    stringResource(R.string.auth_register_device)
                },
                onClick = onRegisterClick,
                enabled = !isLoading && deviceName.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
                isLoading = isLoading
            )

            // Temporary skip button (can be removed now that backend is working)
            Spacer(modifier = Modifier.height(16.dp))

            OutlinedButton(
                onClick = { onNavigateToHome() },
                modifier = Modifier.fillMaxWidth(),
                enabled = !isLoading
            ) {
                Text(stringResource(R.string.device_skip_temp))
            }
        }
    }
}

@Composable
private fun DeviceInfoDisplay() {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = SurfaceVariant
        )
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = stringResource(R.string.device_info_title),
                style = MaterialTheme.typography.labelLarge,
                color = TextSecondary
            )
            
            DeviceInfoRow(
                label = stringResource(R.string.device_type_label),
                value = stringResource(R.string.device_type_android_tv)
            )

            DeviceInfoRow(
                label = stringResource(R.string.device_model_label_old),
                value = "${Build.MANUFACTURER} ${Build.MODEL}"
            )

            DeviceInfoRow(
                label = stringResource(R.string.device_android_label_old),
                value = "API ${Build.VERSION.SDK_INT}"
            )
        }
    }
}

@Composable
private fun DeviceInfoRow(
    label: String,
    value: String
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = TextTertiary
        )
        
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = TextSecondary,
            fontWeight = FontWeight.Medium
        )
    }
}

@Composable
private fun ModernStreamCoreLogoForLogin(
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Show the splash_logo which contains the full branding image
        Image(
            painter = androidx.compose.ui.res.painterResource(id = R.drawable.splash_logo),
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

@Composable
private fun ModernDeviceRegistrationFormForLogin(
    deviceName: String,
    onDeviceNameChange: (String) -> Unit,
    onRegisterClick: () -> Unit,
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
                text = stringResource(R.string.device_registration_subtitle),
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
                    value = deviceName,
                    onValueChange = onDeviceNameChange,
                    label = { Text(stringResource(R.string.auth_device_name)) },
                    placeholder = { Text(stringResource(R.string.auth_device_name_hint)) },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.Devices,
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

                Spacer(modifier = Modifier.height(16.dp))

                // Device info display
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = Color(0xFF161B22).copy(alpha = 0.7f)
                    ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp)
                    ) {
                        Text(
                            text = stringResource(R.string.device_system_info_title),
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium,
                            color = Color(0xFF8B949E)
                        )

                        Spacer(modifier = Modifier.height(8.dp))

                        DeviceInfoRowModern(stringResource(R.string.device_model_label), Build.MODEL ?: stringResource(R.string.device_unknown))
                        DeviceInfoRowModern(stringResource(R.string.device_android_label), "API ${Build.VERSION.SDK_INT} (${Build.VERSION.RELEASE})")
                        DeviceInfoRowModern(stringResource(R.string.device_manufacturer_label), Build.MANUFACTURER ?: stringResource(R.string.device_unknown))
                    }
                }
            }

            Spacer(modifier = Modifier.height(32.dp))

            // Register button
            Button(
                onClick = onRegisterClick,
                enabled = !isLoading && deviceName.isNotBlank(),
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

@Composable
private fun DeviceInfoRowModern(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            fontSize = 12.sp,
            color = Color(0xFF8B949E),
            fontWeight = FontWeight.Medium
        )

        Text(
            text = value,
            fontSize = 12.sp,
            color = Color(0xFFE6EDF3),
            fontWeight = FontWeight.Medium
        )
    }
}
