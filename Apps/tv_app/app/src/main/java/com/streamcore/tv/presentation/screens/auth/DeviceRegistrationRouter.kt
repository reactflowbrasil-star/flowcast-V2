package com.streamcore.tv.presentation.screens.auth

import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import com.streamcore.tv.presentation.login.LoginScreen
import timber.log.Timber

/**
 * Router that decides which device registration screen to show
 * based on device availability
 */
@Composable
fun DeviceRegistrationRouter(
    modifier: Modifier = Modifier,
    onNavigateToHome: () -> Unit,
    viewModel: LoginViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var showDeviceSelection by remember { mutableStateOf(false) }

    // Log for debugging
    Timber.tag("DeviceRegistrationRouter")
        .d("shouldShowReplaceButton: %s", uiState.shouldShowReplaceButton)

    when {
        showDeviceSelection -> {
            // Show device selection screen
            DeviceSelectionScreen(
                modifier = modifier,
                onDeviceSelected = { device ->
                    // Replace the selected device
                    viewModel.replaceSpecificDevice(device)
                    showDeviceSelection = false
                },
                onNavigateBack = {
                    showDeviceSelection = false
                },
                viewModel = viewModel
            )
        }

        uiState.shouldShowReplaceButton -> {
            // User has reached device limit - trigger device selection dialog
            LaunchedEffect(Unit) {
                viewModel.handleDeviceLimitExceeded()
            }

            // Show the login screen with device limit dialog
            LoginScreen(
                modifier = modifier,
                goToHomeScreen = onNavigateToHome,
                viewModel = viewModel
            )
        }

        else -> {
            // User has space for new devices - show modern registration screen
            ModernDeviceRegistrationScreen(
                onNavigateToHome = onNavigateToHome,
                viewModel = viewModel
            )
        }
    }

    // Navigate to home when device token is received
    LaunchedEffect(uiState.deviceToken) {
        if (uiState.deviceToken != null) {
            onNavigateToHome()
        }
    }
}

/**
 * Beautiful device registration screen for when user has space
 * @deprecated Use ModernDeviceRegistrationScreen instead
 */
@Composable
fun DeviceRegistrationBeautifulScreen(
    modifier: Modifier = Modifier,
    onNavigateToHome: () -> Unit,
    viewModel: LoginViewModel = hiltViewModel()
) {
    // Redirect to modern screen
    ModernDeviceRegistrationScreen(
        onNavigateToHome = onNavigateToHome,
        viewModel = viewModel,
        modifier = modifier
    )
}
