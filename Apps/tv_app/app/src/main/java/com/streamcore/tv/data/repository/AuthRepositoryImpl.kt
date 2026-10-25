package com.streamcore.tv.data.repository

import com.streamcore.tv.core.network.BackendHandler
import com.streamcore.tv.core.security.DynamicUserAgentManager
import com.streamcore.tv.data.local.datastore.TokenManager
import com.streamcore.tv.data.local.datastore.UserPreferencesManager
import com.streamcore.tv.data.mapper.toDomainModel
import com.streamcore.tv.data.remote.api.IPTVApiService
import com.streamcore.tv.data.remote.dto.DeviceRegistrationRequestDto
import com.streamcore.tv.data.remote.dto.LoginRequestDto
import com.streamcore.tv.domain.model.*
import com.streamcore.tv.domain.repository.AuthRepository
import com.streamcore.tv.core.device.DeviceIdentifierManager
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Implementation of AuthRepository
 * 
 * Handles authentication operations with both remote API and local storage
 */
@Singleton
class AuthRepositoryImpl @Inject constructor(
    private val apiService: IPTVApiService,
    private val tokenManager: TokenManager,
    private val deviceIdentifierManager: DeviceIdentifierManager,
    private val userPreferencesManager: UserPreferencesManager,
    private val dynamicUserAgentManager: DynamicUserAgentManager,
    private val backendHandler: BackendHandler
) : AuthRepository {

    override suspend fun login(
        username: String,
        password: String,
        skipDeviceBinding: Boolean
    ): Result<User> {
        return try {
            Timber.d("Attempting login for user: $username, skipDeviceBinding: $skipDeviceBinding")

            // When skipDeviceBinding is true, don't send device_id (matches web behavior)
            // This allows device management operations like DELETE to work
            val deviceId = if (skipDeviceBinding) {
                Timber.d("🔐 Login WITHOUT device binding (device management mode)")
                null
            } else {
                deviceIdentifierManager.getDeviceId()
            }

            val loginRequest = LoginRequestDto(
                username = username,
                password = password,
                deviceId = deviceId
            )

            if (deviceId != null) {
                Timber.d("🔐 Login request with device ID: $deviceId")
            }
            val response = apiService.login(loginRequest)

            if (response.isSuccessful) {
                val body = response.body()
                if (body?.user != null && body.token != null) {
                    // Clear any previous user's data when logging in as a new user
                    // This ensures that user-specific data doesn't persist between different user accounts
                    userPreferencesManager.clearUserSpecificData()

                    // Save authentication tokens
                    tokenManager.saveAccessToken(body.token)
                    body.refreshToken?.let { refreshToken ->
                        tokenManager.saveRefreshToken(refreshToken)
                    }

                    // Initialize User-Agent: Priority to backend response, fallback to static
                    if (!body.userAgent.isNullOrBlank()) {
                        dynamicUserAgentManager.initialize(body.userAgent)
                        Timber.d("🔐 User-Agent initialized from backend: ${body.userAgent}")
                    } else {
                        // Fallback to static User-Agent using username (branding+username)
                        dynamicUserAgentManager.initialize("${com.streamcore.tv.BuildConfig.BRANDING_NAME.lowercase().replace(" ", "")}+${username}")
                        Timber.d("🔐 Static User-Agent initialized: ${com.streamcore.tv.BuildConfig.BRANDING_NAME.lowercase().replace(" ", "")}+${username}")
                    }

                    // Save credentials for potential device management re-login
                    // This is needed because if device limit is exceeded, we need to
                    // re-login without device binding to manage devices (matching web behavior)
                    com.streamcore.tv.domain.usecase.device.CredentialsStore.save(username, password)
                    Timber.d("📝 CredentialsStore: Saved credentials for user: $username")

                    Timber.d("User login successful")
                    Result.Success(body.user.toDomainModel())
                } else {
                    val errorMessage = body?.message ?: "Login failed - missing user or token"
                    Timber.w("Login failed: $errorMessage")
                    Result.Error(Exception(errorMessage))
                }
            } else {
                // Parse error body to get the actual error message from server
                val errorMessage = try {
                    val errorBody = response.errorBody()?.string()
                    if (!errorBody.isNullOrEmpty()) {
                        // Try to parse JSON error response
                        val jsonObject = org.json.JSONObject(errorBody)
                        sequenceOf("error", "details", "message")
                            .map { key -> jsonObject.optString(key).trim() }
                            .firstOrNull { it.isNotEmpty() && it != "null" }
                            ?: "HTTP ${response.code()}: ${response.message()}"
                    } else {
                        "HTTP ${response.code()}: ${response.message()}"
                    }
                } catch (e: Exception) {
                    Timber.w(e, "Failed to parse error body")
                    "HTTP ${response.code()}: ${response.message()}"
                }
                Timber.e("Login API error: $errorMessage")
                Result.Error(Exception(errorMessage))
            }
        } catch (e: Exception) {
            Timber.e(e, "Login error")
            Result.Error(e)
        }
    }

    override suspend fun registerDevice(deviceName: String): Result<String> {
        // Use consistent device ID for proper device identification
        val deviceId = deviceIdentifierManager.getDeviceId()
        val deviceRegistration = DeviceRegistration(
            deviceName = deviceName,
            deviceType = "android",
            deviceId = deviceId,
            appVersion = com.streamcore.tv.BuildConfig.VERSION_NAME,
            osVersion = "Android ${android.os.Build.VERSION.RELEASE} (API ${android.os.Build.VERSION.SDK_INT})"
        )
        return registerDevice(deviceRegistration)
    }

    override suspend fun replaceDevice(deviceName: String, deviceIdToReplace: String): Result<String> {
        // Use consistent device ID for proper device identification
        val deviceId = deviceIdentifierManager.getDeviceId()
        val deviceRegistration = DeviceRegistration(
            deviceName = deviceName,
            deviceType = "android",
            deviceId = deviceId,
            appVersion = com.streamcore.tv.BuildConfig.VERSION_NAME,
            osVersion = "Android ${android.os.Build.VERSION.RELEASE} (API ${android.os.Build.VERSION.SDK_INT})"
        )
        return replaceExistingDevice(deviceRegistration, deviceIdToReplace)
    }

    override suspend fun registerDevice(
        deviceRegistration: DeviceRegistration
    ): Result<String> {
        return try {
            Timber.d("Registering device: ${deviceRegistration.deviceName}")
            
            val requestDto = DeviceRegistrationRequestDto(
                deviceId = deviceRegistration.deviceId,
                deviceName = deviceRegistration.deviceName
            )
            val response = apiService.registerDevice(requestDto)
            
            if (response.isSuccessful) {
                val body = response.body()
                if (body?.success == true) {
                    Timber.d("Device registered successfully: ${body.message}")

                    // Generate and save device token to indicate successful registration
                    val deviceToken = "device_registered_${System.currentTimeMillis()}"
                    tokenManager.saveDeviceToken(deviceToken)

                    Timber.d("Device token saved successfully")
                    Result.Success(body.message)
                } else {
                    val errorMessage = body?.message ?: "Device registration failed"
                    Timber.w("Device registration failed: $errorMessage")
                    Result.Error(Exception(errorMessage))
                }
            } else {
                // For 409 conflicts, try to extract the error message from response body
                val errorMessage = if (response.code() == 409) {
                    try {
                        val errorBody = response.errorBody()?.string()
                        if (errorBody?.contains("device_limit_exceeded") == true) {
                            // Device limit exceeded, try to replace existing device
                            Timber.d("Device limit exceeded, attempting to replace existing device")
                            return replaceExistingDevice(deviceRegistration, null)
                        } else {
                            "HTTP ${response.code()}: ${response.message()}"
                        }
                    } catch (e: Exception) {
                        "HTTP ${response.code()}: ${response.message()}"
                    }
                } else {
                    "HTTP ${response.code()}: ${response.message()}"
                }

                Timber.e("Device registration API error: $errorMessage")
                Result.Error(Exception(errorMessage))
            }
        } catch (e: Exception) {
            Timber.e(e, "Device registration exception")
            Result.Error(e)
        }
    }
    
    override suspend fun activateDevice(
        _deviceActivation: DeviceActivation
    ): Result<AuthTokens> {
        Timber.w("Device activation requested, but backend does not expose /api/auth/device/activate")
        return Result.Error(
            UnsupportedOperationException(
                "Device activation is not supported by this backend. Use username/password login."
            )
        )
    }
    
    override suspend fun refreshToken(): Result<AuthTokens> {
        return try {
            // Backend reads current JWT from Authorization header (added by AuthInterceptor).
            // No body payload is needed for the refresh endpoint.
            Timber.d("Attempting to refresh token")

            val response = apiService.refreshToken()

            if (response.isSuccessful) {
                val refreshResponse = response.body()
                val newToken = refreshResponse?.token
                if (!newToken.isNullOrBlank()) {
                    // Save the new access token, keep current refresh token
                    val currentRefreshToken = tokenManager.getRefreshToken().first() ?: ""
                    tokenManager.saveTokens(
                        accessToken = newToken,
                        refreshToken = currentRefreshToken,
                        expiryTime = (System.currentTimeMillis() + (86400L * 1000)).toString()
                    )

                    val authTokens = AuthTokens(
                        accessToken = newToken,
                        refreshToken = currentRefreshToken,
                        expiresIn = 86400L
                    )

                    Timber.d("Token refreshed successfully")
                    Result.Success(authTokens)
                } else {
                    Timber.w("Token refresh failed: Empty token in response")
                    Result.Error(Exception("Token refresh failed"))
                }
            } else {
                val errorMessage = response.errorBody()?.string() ?: "Token refresh failed"
                Timber.w("Token refresh failed with code ${response.code()}: $errorMessage")
                Result.Error(Exception("Token refresh failed: $errorMessage"))
            }
        } catch (e: Exception) {
            Timber.e(e, "Token refresh exception")
            Result.Error(e)
        }
    }
    
    override suspend fun logout(): Result<Unit> {
        return try {
            Timber.d("Logging out user")
            
            // Try to call logout API (best effort)
            try {
                val response = apiService.logout()
                if (!response.isSuccessful) {
                    Timber.w("Logout API call failed: ${response.code()}")
                }
            } catch (e: Exception) {
                Timber.w(e, "Logout API call failed, continuing with local cleanup")
            }
            
            // Always clear local tokens
            tokenManager.clearTokens()

            // Clear session device ID but keep last login ID for next session
            deviceIdentifierManager.clearSession()

            // Clear dynamic User-Agent
            dynamicUserAgentManager.clear()

            Timber.d("User logged out successfully")
            Result.Success(Unit)
        } catch (e: Exception) {
            Timber.e(e, "Logout exception")
            Result.Error(e)
        }
    }
    
    override fun isAuthenticated(): Flow<Boolean> {
        return tokenManager.isAuthenticated()
    }
    
    override fun getAccessToken(): Flow<String?> {
        return tokenManager.getAccessToken()
    }
    
    override fun getRefreshToken(): Flow<String?> {
        return tokenManager.getRefreshToken()
    }
    
    override suspend fun saveTokens(tokens: AuthTokens): Result<Unit> {
        return try {
            Timber.d("Saving authentication tokens")
            
            tokenManager.saveTokens(
                accessToken = tokens.accessToken,
                refreshToken = tokens.refreshToken,
                expiryTime = (System.currentTimeMillis() + (tokens.expiresIn * 1000)).toString()
            )
            
            // Clear device token after successful activation
            tokenManager.clearDeviceToken()
            
            Timber.d("Authentication tokens saved successfully")
            Result.Success(Unit)
        } catch (e: Exception) {
            Timber.e(e, "Failed to save authentication tokens")
            Result.Error(e)
        }
    }
    
    override suspend fun clearAuthData(): Result<Unit> {
        return try {
            Timber.d("Clearing all authentication data")
            tokenManager.clearTokens()
            Timber.d("Authentication data cleared successfully")
            Result.Success(Unit)
        } catch (e: Exception) {
            Timber.e(e, "Failed to clear authentication data")
            Result.Error(e)
        }
    }

    override suspend fun getDeviceStatus(): Result<DeviceStatus> {
        return try {
            Timber.d("Getting device status from /api/devices endpoint with max_devices")

            // Use the endpoint that returns devices with max_devices
            val response = apiService.getUserDevicesWithLimit()

            if (response.isSuccessful) {
                val body = response.body()
                if (body?.devices != null) {
                    val backendDevices = body.devices
                    val currentDeviceId = deviceIdentifierManager.getDeviceId()
                    val currentDevices = backendDevices.size
                    val maxDevices = if (body.maxDevices > 0) {
                        body.maxDevices
                    } else {
                        getUserMaxDevices() ?: currentDevices
                    }
                    val hasSpace = currentDevices < maxDevices

                    Timber.d("Device status from API: $currentDevices/$maxDevices, hasSpace: $hasSpace")

                    // Convert backend devices to domain devices
                    val deviceList = backendDevices.map { backendDevice ->
                        val resolvedDeviceId = backendDevice.deviceId ?: backendDevice.id?.toString() ?: "unknown"
                        val resolvedName = backendDevice.deviceName ?: "Unknown device"
                        val isCurrentDevice = resolvedDeviceId == currentDeviceId
                        Device(
                            id = backendDevice.id?.toString() ?: resolvedDeviceId,
                            name = resolvedName,
                            type = "android", // Default type since backend doesn't provide it
                            registeredAt = backendDevice.createdAt ?: "",
                            lastUsed = backendDevice.lastActive,
                            isCurrentDevice = isCurrentDevice,
                            deviceId = resolvedDeviceId,
                            appVersion = null,
                            osVersion = null
                        )
                    }

                    val deviceStatus = DeviceStatus(
                        currentDevices = currentDevices,
                        maxDevices = maxDevices,
                        hasSpace = hasSpace,
                        devices = deviceList
                    )

                    Result.Success(deviceStatus)
                } else {
                    val errorMessage = "No devices data in response"
                    Timber.w("Get device status failed: $errorMessage")
                    Result.Error(Exception(errorMessage))
                }
            } else {
                val errorMessage = "HTTP ${response.code()}: ${response.message()}"
                Timber.e("Get device status API error: $errorMessage")
                Result.Error(Exception(errorMessage))
            }
        } catch (e: Exception) {
            Timber.e(e, "Get device status exception")
            Result.Error(e)
        }
    }

    /**
     * Get user's max devices from profile
     */
    private suspend fun getUserMaxDevices(): Int? {
        return try {
            val response = apiService.getUserProfile()
            if (response.isSuccessful) {
                response.body()?.maxDevices
            } else {
                null
            }
        } catch (e: Exception) {
            Timber.w(e, "Failed to get user max devices")
            null
        }
    }

    /**
     * Replace existing device when limit is exceeded
     */
    private suspend fun replaceExistingDevice(deviceRegistration: DeviceRegistration, specificDeviceId: String? = null): Result<String> {
        return try {
            Timber.d("Starting device replacement process")

            // Step 1: Determine which device to remove
            val deviceIdToRemove = if (specificDeviceId != null) {
                // Use the specific device ID provided
                Timber.d("Using specific device ID to remove: $specificDeviceId")
                specificDeviceId
            } else {
                // Get current devices and remove the first one (oldest)
                val devicesResponse = apiService.getUserDevicesBackend()
                if (!devicesResponse.isSuccessful) {
                    Timber.e("Failed to get current devices")
                    return Result.Error(Exception("Failed to get current devices"))
                }

                val devices = devicesResponse.body()?.devices
                if (devices.isNullOrEmpty()) {
                    Timber.e("No devices found to replace")
                    return Result.Error(Exception("No devices found to replace"))
                }

                val deviceToRemove = devices.first()
                val resolvedDeviceId = deviceToRemove.deviceId
                    ?: return Result.Error(Exception("Device replacement failed: selected device has no device_id"))
                Timber.d(
                    "Auto-selecting device to remove: ${deviceToRemove.deviceName ?: "Unknown device"} (ID: $resolvedDeviceId)"
                )
                resolvedDeviceId
            }

            // Step 2: Remove the selected device
            Timber.d("Removing device with ID: $deviceIdToRemove")

            val removeResponse = apiService.removeDevice(deviceIdToRemove)
            if (!removeResponse.isSuccessful) {
                Timber.e("Failed to remove existing device")
                return Result.Error(Exception("Failed to remove existing device"))
            }

            Timber.d("Device removed successfully, now registering new device")

            // Step 3: Register the new device
            val requestDto = DeviceRegistrationRequestDto(
                deviceId = deviceRegistration.deviceId,
                deviceName = deviceRegistration.deviceName
            )

            val registerResponse = apiService.registerDevice(requestDto)
            if (registerResponse.isSuccessful) {
                val body = registerResponse.body()
                if (body?.success == true) {
                    Timber.d("Device replacement successful: ${body.message}")

                    // Generate and save device token
                    val deviceToken = "device_registered_${System.currentTimeMillis()}"
                    tokenManager.saveDeviceToken(deviceToken)

                    Result.Success(body.message)
                } else {
                    val errorMessage = body?.message ?: "Device replacement failed"
                    Timber.w("Device replacement failed: $errorMessage")
                    Result.Error(Exception(errorMessage))
                }
            } else {
                val errorMessage = "HTTP ${registerResponse.code()}: ${registerResponse.message()}"
                Timber.e("Device replacement API error: $errorMessage")
                Result.Error(Exception(errorMessage))
            }

        } catch (e: Exception) {
            Timber.e(e, "Device replacement exception")
            Result.Error(e)
        }
    }

    override suspend fun renewUserAgent(): Result<String> {
        return try {
            val userAgent = dynamicUserAgentManager.getCurrentUserAgent()
                ?: dynamicUserAgentManager.loadFromStorage()

            if (!userAgent.isNullOrBlank()) {
                Timber.d("Using locally managed User-Agent (renew endpoint not available)")
                Result.Success(userAgent)
            } else {
                Result.Error(Exception("User-Agent not initialized"))
            }
        } catch (e: Exception) {
            Timber.e(e, "Renew User-Agent fallback exception")
            Result.Error(e)
        }
    }

}
