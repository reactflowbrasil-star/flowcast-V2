package com.streamcore.tv.presentation.screens.splash

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.streamcore.tv.core.perf.DebugPerformanceTracer
import com.streamcore.tv.data.local.datastore.TokenManager
import com.streamcore.tv.core.security.DynamicUserAgentManager
import com.streamcore.tv.domain.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

/**
 * ViewModel for splash screen
 * 
 * Handles:
 * - Authentication status checking
 * - Token validation
 * - Navigation decision making
 */
@HiltViewModel
class SplashViewModel @Inject constructor(
    private val tokenManager: TokenManager,
    private val dynamicUserAgentManager: DynamicUserAgentManager,
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(SplashUiState())
    val uiState: StateFlow<SplashUiState> = _uiState.asStateFlow()

    init {
        checkAuthenticationStatus()
    }

    /**
     * Check if user is authenticated and device is registered by verifying stored tokens
     */
    private fun checkAuthenticationStatus() {
        viewModelScope.launch {
            DebugPerformanceTracer.start(
                metric = "startup.auth_gate_check_ms",
                token = "splash"
            )

            try {
                Timber.d("Checking authentication and device registration status...")

                // Check if access token exists
                val accessToken = tokenManager.getAccessToken().first()
                val isAuthenticated = !accessToken.isNullOrEmpty()

                // Check if device token exists (indicates device is registered)
                val deviceToken = tokenManager.getDeviceToken().first()
                val isDeviceRegistered = !deviceToken.isNullOrEmpty()

                // Load User-Agent from storage if authenticated
                if (isAuthenticated) {
                    dynamicUserAgentManager.loadFromStorage()
                    Timber.d("🔐 User-Agent loaded from storage")
                    
                    // Only renew when the app actually uses a renewable UA. On TV builds we use a static UA.
                    if (dynamicUserAgentManager.needsRenewal()) {
                        try {
                            val result = authRepository.renewUserAgent()
                            if (result is com.streamcore.tv.domain.model.Result.Success) {
                                Timber.d("🔐 User-Agent successfully renewed on startup")
                            }
                        } catch (e: Exception) {
                            Timber.w(e, "Failed to renew User-Agent on startup")
                        }
                    } else {
                        Timber.d("🔐 Skipping User-Agent renewal on startup (static UA)")
                    }
                }

                Timber.d("Status check complete. Authenticated: $isAuthenticated, Device Registered: $isDeviceRegistered")
                Timber.d("Access Token: ${accessToken?.take(20)}..., Device Token: ${deviceToken?.take(20)}...")

                _uiState.value = _uiState.value.copy(
                    isAuthenticated = isAuthenticated,
                    isDeviceRegistered = isDeviceRegistered,
                    isCheckComplete = true
                )

                DebugPerformanceTracer.end(
                    metric = "startup.auth_gate_check_ms",
                    token = "splash",
                    attributes = mapOf(
                        "result" to "success",
                        "authenticated" to isAuthenticated.toString(),
                        "deviceRegistered" to isDeviceRegistered.toString()
                    )
                )

            } catch (e: Exception) {
                Timber.e(e, "Error checking authentication status")

                // On error, assume not authenticated and not registered
                _uiState.value = _uiState.value.copy(
                    isAuthenticated = false,
                    isDeviceRegistered = false,
                    isCheckComplete = true
                )

                DebugPerformanceTracer.end(
                    metric = "startup.auth_gate_check_ms",
                    token = "splash",
                    attributes = mapOf("result" to "error")
                )
            }
        }
    }
}

/**
 * UI State for splash screen
 */
data class SplashUiState(
    val isAuthenticated: Boolean = false,
    val isDeviceRegistered: Boolean = false,
    val isCheckComplete: Boolean = false,
    val needsUserAgentRenewal: Boolean = false
)
