package com.streamcore.tv.presentation.login

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Devices
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.streamcore.tv.core.utils.ShowToast
import com.streamcore.tv.presentation.theme.IPTVTheme
import com.streamcore.tv.presentation.screens.auth.LoginViewModel
import com.streamcore.tv.presentation.screens.auth.LoginUiState
import com.streamcore.tv.presentation.components.ModernDeviceLimitDialog
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R
import timber.log.Timber

@Composable
fun LoginScreen(
    modifier: Modifier = Modifier,
    goToHomeScreen: () -> Unit,
    viewModel: LoginViewModel = hiltViewModel()
) {
    // Log to verify this screen is being shown
    Timber.tag("LoginScreen").d("LoginScreen is being rendered")

    val uiState by viewModel.uiState.collectAsState()

    // Handle device registration completion
    LaunchedEffect(uiState.deviceToken) {
        if (uiState.deviceToken != null) {
            goToHomeScreen()
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        LoginPageContent(
            uiState = uiState,
            onRegisterDevice = {
                if (uiState.shouldShowReplaceButton) {
                    // Show device selection dialog to replace existing device
                    viewModel.handleDeviceLimitExceeded()
                } else {
                    viewModel.registerDevice()
                }
            },
            onUpdateDeviceName = viewModel::updateDeviceName,
            onClearError = viewModel::clearError
        )
    }

    // Show device limit dialog when needed
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

@Composable
private fun LoginPageContent(
    uiState: LoginUiState,
    onRegisterDevice: () -> Unit,
    onUpdateDeviceName: (String) -> Unit,
    onClearError: () -> Unit
) {

    // Show error messages
    uiState.error?.let { error ->
        ShowToast(message = error)
        LaunchedEffect(error) {
            onClearError()
        }
    }

    Card(
        modifier = Modifier
            .fillMaxWidth(0.4f)
            .padding(24.dp),
        colors = CardDefaults.cardColors(
            containerColor = Color(0xFF161B22).copy(alpha = 0.9f)
        ),
        elevation = CardDefaults.cardElevation(
            defaultElevation = 16.dp
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(32.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Header
            Text(
                text = stringResource(id = R.string.device_registration_title),
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = stringResource(id = R.string.register_device_to_continue),
                fontSize = 14.sp,
                color = Color.Gray,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(24.dp))

            // Device name input
            OutlinedTextField(
                value = uiState.deviceName,
                onValueChange = onUpdateDeviceName,
                label = { Text(stringResource(R.string.name_device)) },
                modifier = Modifier.fillMaxWidth(),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Color(0xFF4285F4),
                    unfocusedBorderColor = Color.Gray,
                    focusedLabelColor = Color(0xFF4285F4),
                    unfocusedLabelColor = Color.Gray,
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White
                )
            )

            Spacer(modifier = Modifier.height(24.dp))

            // Register button
            Button(
                onClick = onRegisterDevice,
                enabled = uiState.deviceName.isNotBlank() && !uiState.isLoading,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFF4285F4)
                )
            ) {
                if (uiState.isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        color = Color.White,
                        strokeWidth = 2.dp
                    )
                } else {
                    val buttonText = if (uiState.shouldShowReplaceButton) {
                        stringResource(id = R.string.replace_device_button)
                    } else {
                        stringResource(id = R.string.device_register_button)
                    }

                    // Log for debugging
                    Timber.tag("LoginScreen").d(
                        "shouldShowReplaceButton: %s, buttonText: %s",
                        uiState.shouldShowReplaceButton,
                        buttonText
                    )

                    Text(buttonText)
                }
            }
        }
    }
}

@Preview(device = Devices.TV_1080p)
@Composable
fun LoginScreenPrev() {
    IPTVTheme {
        LoginScreen(
            modifier = Modifier.fillMaxSize(),
            goToHomeScreen = {}
        )
    }
}
