package com.streamcore.tv.domain.usecase.device

import com.streamcore.tv.core.device.DeviceIdentifierManager
import com.streamcore.tv.core.utils.StringProvider
import com.streamcore.tv.domain.repository.UserRepository
import com.streamcore.tv.domain.repository.AuthRepository
import com.streamcore.tv.domain.model.DeviceInfo
import com.streamcore.tv.domain.model.DeviceRegistration
import com.streamcore.tv.domain.model.Result
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Temporary storage for credentials to enable device management re-login.
 * This matches web frontend behavior where login doesn't bind to a specific device,
 * allowing device management operations (like DELETE) to work.
 */
object CredentialsStore {
    private var username: String? = null
    private var password: String? = null
    
    fun save(username: String, password: String) {
        this.username = username
        this.password = password
        Timber.d("CredentialsStore: Credentials saved for potential device management")
    }
    
    fun get(): Pair<String, String>? {
        return if (username != null && password != null) {
            Pair(username!!, password!!)
        } else {
            null
        }
    }
    
    fun clear() {
        username = null
        password = null
        Timber.d("CredentialsStore: Credentials cleared")
    }
}

/**
 * Handles device limit exceeded scenarios
 */
@Singleton
class DeviceLimitHandler @Inject constructor(
    private val userRepository: UserRepository,
    private val authRepository: AuthRepository,
    private val deviceIdentifierManager: DeviceIdentifierManager,
    private val stringProvider: StringProvider
) {

    /**
     * Handle device limit exceeded scenario
     * Returns the action that should be taken
     */
    suspend fun handleDeviceLimitExceeded(): DeviceLimitAction {
        return when (val result = userRepository.getUserDevices()) {
            is Result.Success -> {
                val devices = result.data
                Timber.d("DeviceLimitHandler: Got ${devices.size} devices from repository")
                devices.forEach { device ->
                    Timber.d("  - Device: ${device.name} (${device.id}) - isCurrentDevice: ${device.isCurrentDevice}")
                }

                when {
                    devices.isEmpty() -> {
                        Timber.d("DeviceLimitHandler: No devices found, should register current device")
                        DeviceLimitAction.RegisterCurrent
                    }
                    devices.any { it.isCurrentDevice } -> {
                        Timber.d("DeviceLimitHandler: Current device is already registered")
                        DeviceLimitAction.AlreadyRegistered
                    }
                    else -> {
                        Timber.d("DeviceLimitHandler: Need to show device selection dialog with ${devices.size} devices")
                        DeviceLimitAction.ShowDeviceSelection(devices)
                    }
                }
            }
            is Result.Error -> {
                Timber.e("DeviceLimitHandler: Error getting devices: ${result.exception.message}")
                DeviceLimitAction.Error(result.exception.message ?: "Error getting devices")
            }
            is Result.Loading -> {
                Timber.w("DeviceLimitHandler: Unexpected loading state")
                DeviceLimitAction.Error("Unexpected loading state")
            }
        }
    }

    /**
     * Re-login without device binding to enable device management operations.
     * This is required because the initial login creates a token with device_id embedded,
     * and the middleware rejects DELETE requests from unregistered devices.
     * 
     * The web frontend doesn't send device_id at login, so it can manage devices freely.
     * We replicate that behavior here by re-logging in with skipDeviceBinding=true.
     */
    suspend fun reLoginForDeviceManagement(): Result<Unit> {
        val credentials = CredentialsStore.get()
        if (credentials == null) {
            Timber.e("❌ No credentials available for device management re-login")
            return Result.Error(Exception(stringProvider.getNoCredentialsError()))
        }
        
        Timber.d("🔄 Re-logging in without device binding for device management...")
        return when (val result = authRepository.login(
            username = credentials.first,
            password = credentials.second,
            skipDeviceBinding = true
        )) {
            is Result.Success -> {
                Timber.i("✅ Re-login successful - device management operations now allowed")
                Result.Success(Unit)
            }
            is Result.Error -> {
                Timber.e("❌ Re-login failed: ${result.exception.message}")
                Result.Error(Exception(stringProvider.getDeviceManagementFailedError(result.exception.message)))
            }
            is Result.Loading -> {
                Result.Error(Exception(stringProvider.getUnexpectedStateError()))
            }
        }
    }

    /**
     * Remove a device only (without auto-registering)
     */
    suspend fun removeDevice(deviceToRemove: DeviceInfo): Result<Unit> {
        Timber.d("🗑️ DeviceLimitHandler: Removing device ${deviceToRemove.name} (${deviceToRemove.id.take(20)}...)")
        Timber.d("🔍 Device ID info: ${deviceIdentifierManager.getDeviceIdInfo()}")
        return userRepository.removeDevice(deviceToRemove.id)
    }

    /**
     * Remove a device and register the current device
     */
    suspend fun removeDeviceAndRegisterCurrent(deviceToRemove: DeviceInfo, deviceName: String? = null): Result<String> {
        Timber.i("🔄 DeviceLimitHandler: Starting device replacement")
        Timber.d("🗑️ Removing: ${deviceToRemove.name} (${deviceToRemove.id.take(20)}...)")
        Timber.d("🔍 Current device ID: ${deviceIdentifierManager.getDeviceId().take(20)}...")

        // First remove the selected device
        return when (val removeResult = userRepository.removeDevice(deviceToRemove.id)) {
            is Result.Success -> {
                Timber.i("✅ Device removal successful, now registering current device")

                // Use provided device name or default to device model
                val finalDeviceName = deviceName?.takeIf { it.isNotBlank() }
                    ?: android.os.Build.MODEL
                    ?: "Android Device"

                // Now register the current device
                val deviceRegistration = DeviceRegistration(
                    deviceId = deviceIdentifierManager.getDeviceId(),
                    deviceName = finalDeviceName,
                    appVersion = com.streamcore.tv.BuildConfig.VERSION_NAME,
                    osVersion = android.os.Build.VERSION.RELEASE
                )

                Timber.d("📱 Registering new device: $finalDeviceName")
                when (val registerResult = authRepository.registerDevice(deviceRegistration)) {
                    is Result.Success -> {
                        Timber.i("✅ Device replacement completed successfully")
                        Result.Success(registerResult.data) // Return actual token
                    }
                    is Result.Error -> {
                        Timber.e("❌ Failed to register new device: ${registerResult.exception.message}")
                        Result.Error(Exception(stringProvider.getDeviceRegistrationError(registerResult.exception.message)))
                    }
                    is Result.Loading -> {
                        Result.Error(Exception(stringProvider.getUnexpectedDuringRegistrationError()))
                    }
                }
            }
            is Result.Error -> {
                Timber.e("❌ Failed to remove device: ${removeResult.exception.message}")
                Result.Error(Exception(stringProvider.getDeviceRemovalError(removeResult.exception.message)))
            }
            is Result.Loading -> {
                Result.Error(Exception(stringProvider.getUnexpectedDuringRemovalError()))
            }
        }
    }
}

/**
 * Actions that can be taken when device limit is exceeded
 */
sealed class DeviceLimitAction {
    /**
     * Register the current device (should not happen normally)
     */
    object RegisterCurrent : DeviceLimitAction()

    /**
     * Current device is already registered
     */
    object AlreadyRegistered : DeviceLimitAction()

    /**
     * Show device selection dialog with available devices
     */
    data class ShowDeviceSelection(val devices: List<DeviceInfo>) : DeviceLimitAction()

    /**
     * Error occurred while handling device limit
     */
    data class Error(val message: String) : DeviceLimitAction()
}
