package com.streamcore.tv.presentation.screens.auth

import android.app.Application
import android.os.Build
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.streamcore.tv.BuildConfig
import com.streamcore.tv.R
import com.streamcore.tv.core.device.DeviceIdentifierManager
import com.streamcore.tv.core.error.ErrorHandler
import com.streamcore.tv.core.utils.logd
import com.streamcore.tv.core.utils.loge
import com.streamcore.tv.domain.model.DeviceRegistration
import com.streamcore.tv.domain.model.Result
import com.streamcore.tv.domain.usecase.auth.RegisterDeviceUseCase
import com.streamcore.tv.domain.usecase.auth.GetDeviceStatusUseCase
import com.streamcore.tv.domain.model.Device
import com.streamcore.tv.domain.model.DeviceInfo
import com.streamcore.tv.domain.usecase.device.DeviceLimitHandler
import com.streamcore.tv.core.constants.AppConstants
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.*
import javax.inject.Inject

/**
 * ViewModel for Login Screen
 * 
 * Handles device registration logic
 */
@HiltViewModel
class LoginViewModel @Inject constructor(
    application: Application,
    private val registerDeviceUseCase: RegisterDeviceUseCase,
    private val getDeviceStatusUseCase: GetDeviceStatusUseCase,
    private val deviceIdentifierManager: DeviceIdentifierManager,
    private val deviceLimitHandler: DeviceLimitHandler,
    private val errorHandler: ErrorHandler
) : AndroidViewModel(application) {
    
    private fun getString(resId: Int): String = getApplication<Application>().getString(resId)
    
    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()
    
    init {
        // Set default device name
        val defaultDeviceName = generateDefaultDeviceName()
        _uiState.update { it.copy(deviceName = defaultDeviceName) }
        logd("LoginViewModel initialized with device name: $defaultDeviceName")
        // Check device status
        checkDeviceStatus()
    }
    
    /**
     * Update device name
     */
    fun updateDeviceName(name: String) {
        _uiState.update { it.copy(deviceName = name) }
        logd("Device name updated: $name")
    }
    
    /**
     * Register device with IPTV service
     */
    fun registerDevice() {
        val currentState = _uiState.value
        
        if (currentState.deviceName.isBlank()) {
            _uiState.update {
                it.copy(error = getString(R.string.name_device_empty))
            }
            return
        }
        
        if (currentState.deviceName.length < 3) {
            _uiState.update {
                it.copy(error = getString(R.string.name_device_min_length))
            }
            return
        }
        
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }

            try {
                logd("Starting device registration")

                // Check if device is already registered
                if (isCurrentDeviceRegistered()) {
                    logd("Device is already registered, skipping registration")
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            deviceToken = "device_already_registered_${System.currentTimeMillis()}",
                            error = null
                        )
                    }
                    return@launch
                }
                
                val deviceRegistration = DeviceRegistration(
                    deviceName = currentState.deviceName.trim(),
                    deviceType = "android",
                    deviceId = deviceIdentifierManager.getDeviceId(),
                    appVersion = BuildConfig.VERSION_NAME,
                    osVersion = "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})"
                )
                
                logd("Device registration data: $deviceRegistration")
                
                when (val result = registerDeviceUseCase(deviceRegistration)) {
                    is Result.Success -> {
                        logd("Device registration successful, token: ${result.data}")
                        _uiState.update { 
                            it.copy(
                                isLoading = false,
                                deviceToken = result.data,
                                error = null
                            ) 
                        }
                    }
                    
                    is Result.Error -> {
                        val errorMessage = errorHandler.getErrorMessage(result.exception)
                        loge("Device registration failed: $errorMessage", result.exception)

                        // Check if this is a device limit exceeded error
                        if (errorMessage.contains("device_limit_exceeded", ignoreCase = true) ||
                            errorMessage.contains("Device limit exceeded", ignoreCase = true) ||
                            errorMessage.contains("409") && errorMessage.contains("Conflict")) {

                            logd("Device limit exceeded - showing device selection dialog")
                            handleDeviceLimitExceeded()
                        } else {
                            _uiState.update {
                                it.copy(
                                    isLoading = false,
                                    error = errorMessage
                                )
                            }
                        }
                    }
                    
                    is Result.Loading -> {
                        // Should not happen in this use case
                        logd("Unexpected loading state in device registration")
                    }
                }
            } catch (e: Exception) {
                val errorMessage = errorHandler.getErrorMessage(e)
                loge("Device registration exception: $errorMessage", e)
                _uiState.update { 
                    it.copy(
                        isLoading = false,
                        error = errorMessage
                    ) 
                }
            }
        }
    }
    
    /**
     * Clear error message
     */
    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    /**
     * Handle device limit exceeded scenario
     */
    fun handleDeviceLimitExceeded() {
        viewModelScope.launch {
            try {
                logd("Handling device limit exceeded")

                when (val action = deviceLimitHandler.handleDeviceLimitExceeded()) {
                    is com.streamcore.tv.domain.usecase.device.DeviceLimitAction.ShowDeviceSelection -> {
                        logd("Showing device selection dialog with ${action.devices.size} devices")

                        // action.devices is already List<DeviceInfo>, no conversion needed
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                showDeviceLimitDialog = true,
                                deviceInfoList = action.devices,
                                error = null
                            )
                        }
                    }

                    is com.streamcore.tv.domain.usecase.device.DeviceLimitAction.AlreadyRegistered -> {
                        logd("Device already registered")
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                deviceToken = "already_registered",
                                error = null
                            )
                        }
                    }

                    is com.streamcore.tv.domain.usecase.device.DeviceLimitAction.RegisterCurrent -> {
                        logd("Should register current device")
                        // This shouldn't happen normally, but handle it
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                error = getString(R.string.error_unexpected_try_again)
                            )
                        }
                    }

                    is com.streamcore.tv.domain.usecase.device.DeviceLimitAction.Error -> {
                        loge("Error handling device limit: ${action.message}")
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                error = action.message
                            )
                        }
                    }
                }
            } catch (e: Exception) {
                loge("Exception handling device limit", e)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = "Failed to verify devices. Please try again."
                    )
                }
            }
        }
    }

    /**
     * Close device limit dialog
     */
    fun closeDeviceLimitDialog() {
        _uiState.update {
            it.copy(
                showDeviceLimitDialog = false,
                deviceLimitError = null
            )
        }
    }

    /**
     * Remove device and register current device automatically
     */
    fun removeDeviceAndRegisterCurrent(deviceToRemove: DeviceInfo) {
        viewModelScope.launch {
            try {
                logd("Starting device replacement: ${deviceToRemove.name}")

                val currentState = _uiState.value

                _uiState.update { it.copy(isLoading = true, deviceLimitError = null) }

                // CRITICAL FIX: Re-login without device binding BEFORE device operations
                // This is required because the initial login creates a token with device_id embedded,
                // and the backend middleware rejects DELETE requests from unregistered devices.
                // The web frontend doesn't send device_id at login, so it can manage devices freely.
                // We replicate that behavior here.
                logd("Re-logging in without device binding for device management...")
                when (val reLoginResult = deviceLimitHandler.reLoginForDeviceManagement()) {
                    is Result.Success -> {
                        logd("Re-login successful, proceeding with device replacement")
                    }
                    is Result.Error -> {
                        val errorMessage = errorHandler.getErrorMessage(reLoginResult.exception)
                        loge("Re-login for device management failed: $errorMessage", reLoginResult.exception)
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                deviceLimitError = errorMessage
                            )
                        }
                        return@launch
                    }
                    is Result.Loading -> {
                        // Should not happen
                    }
                }

                // Now we have a token without device_id binding - DELETE will work
                // Use the DeviceLimitHandler to remove and register in one operation
                // Pass the current device name from UI state
                when (val result = deviceLimitHandler.removeDeviceAndRegisterCurrent(deviceToRemove, currentState.deviceName.trim())) {
                    is Result.Success -> {
                        logd("Device replacement successful")
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                showDeviceLimitDialog = false,
                                deviceLimitError = null,
                                shouldShowReplaceButton = false,
                                deviceToken = result.data // Set the device token to indicate success
                            )
                        }

                        // Refresh device status to ensure UI consistency
                        logd("Refreshing device status after successful replacement")
                        checkDeviceStatus()
                    }

                    is Result.Error -> {
                        val errorMessage = errorHandler.getErrorMessage(result.exception)
                        loge("Device replacement failed: $errorMessage", result.exception)
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                deviceLimitError = errorMessage
                            )
                        }
                    }

                    is Result.Loading -> {
                        // Keep loading state
                    }
                }
            } catch (e: Exception) {
                loge("Exception during device replacement", e)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        deviceLimitError = getString(R.string.error_unexpected_try_again)
                    )
                }
            }
        }
    }

    /**
     * Reset replace button state
     */
    fun resetReplaceButtonState() {
        _uiState.update { it.copy(shouldShowReplaceButton = false) }
    }

    /**
     * Refresh device status to get current devices
     */
    fun refreshDeviceStatus() {
        checkDeviceStatus()
    }

    /**
     * Check if current device is already registered
     */
    private suspend fun isCurrentDeviceRegistered(): Boolean {
        return try {
            when (val result = getDeviceStatusUseCase()) {
                is Result.Success -> {
                    val currentDeviceId = deviceIdentifierManager.getDeviceId()
                    val isRegistered = result.data.devices.any { it.deviceId == currentDeviceId }
                    logd("Current device registered: $isRegistered")
                    isRegistered
                }
                is Result.Error -> {
                    logd("Could not check device registration status")
                    false
                }
                is Result.Loading -> false
            }
        } catch (e: Exception) {
            loge("Error checking device registration", e)
            false
        }
    }

    /**
     * Replace a specific device with the new one
     */
    fun replaceSpecificDevice(deviceToReplace: Device) {
        viewModelScope.launch {
            try {
                _uiState.update { it.copy(isLoading = true, error = null) }
                logd("Replacing specific device: ${deviceToReplace.name}")

                when (val result = registerDeviceUseCase(uiState.value.deviceName, deviceToReplace.deviceId)) {
                    is Result.Success -> {
                        logd("Device replacement successful")
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                deviceToken = result.data
                            )
                        }
                    }

                    is Result.Error -> {
                        val errorMessage = errorHandler.getErrorMessage(result.exception)
                        loge("Device replacement failed: $errorMessage", result.exception)
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                error = errorMessage
                            )
                        }
                    }

                    is Result.Loading -> {
                        // Already handled above
                    }
                }
            } catch (e: Exception) {
                loge("Unexpected error during device replacement", e)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = getString(R.string.error_unexpected_try_again)
                    )
                }
            }
        }
    }

    /**
     * Check device status to determine if user has reached limit
     */
    private fun checkDeviceStatus() {
        viewModelScope.launch {
            try {
                logd("Checking device status")

                when (val result = getDeviceStatusUseCase()) {
                    is Result.Success -> {
                        val deviceStatus = result.data
                        logd("Device status: ${deviceStatus.currentDevices}/${deviceStatus.maxDevices}, hasSpace: ${deviceStatus.hasSpace}")

                        val shouldShowReplace = !deviceStatus.hasSpace
                        logd("Setting shouldShowReplaceButton to: $shouldShowReplace")

                        _uiState.update {
                            it.copy(
                                shouldShowReplaceButton = shouldShowReplace,
                                devices = deviceStatus.devices,
                                deviceInfoList = deviceStatus.devices.map { device ->
                                    com.streamcore.tv.domain.model.DeviceInfo(
                                        id = device.deviceId,
                                        name = device.name,
                                        type = device.type,
                                        lastActive = device.lastUsed ?: device.registeredAt,
                                        isCurrentDevice = device.isCurrentDevice
                                    )
                                },
                                maxDevices = deviceStatus.maxDevices
                            )
                        }

                        logd("UI State updated. shouldShowReplaceButton: ${_uiState.value.shouldShowReplaceButton}")
                    }

                    is Result.Error -> {
                        val errorMessage = errorHandler.getErrorMessage(result.exception)
                        loge("Failed to get device status: $errorMessage", result.exception)

                        // If we can't get status, check if we have a device token
                        // If we do, it means we're already registered
                        val currentState = _uiState.value
                        if (!currentState.deviceToken.isNullOrBlank()) {
                            logd("Device token exists, assuming device is registered")
                            _uiState.update {
                                it.copy(shouldShowReplaceButton = false)
                            }
                        } else {
                            // No device token, assume normal registration
                            _uiState.update {
                                it.copy(shouldShowReplaceButton = false)
                            }
                        }
                    }

                    is Result.Loading -> {
                        // Loading state, do nothing for now
                        logd("Device status loading...")
                    }
                }
            } catch (e: Exception) {
                loge("Unexpected error checking device status", e)
                // If we can't get status, assume normal registration
                _uiState.update {
                    it.copy(shouldShowReplaceButton = false)
                }
            }
        }
    }

    /**
     * Generate default device name based on device info
     */
    private fun generateDefaultDeviceName(): String {
        val manufacturer = Build.MANUFACTURER.replaceFirstChar { 
            if (it.isLowerCase()) it.titlecase(Locale.getDefault()) else it.toString() 
        }
        val model = Build.MODEL
        
        return when {
            model.startsWith(manufacturer, ignoreCase = true) -> model
            else -> "$manufacturer $model"
        }.take(30) // Limit length
    }
    

}

/**
 * UI State for Login Screen
 */
data class LoginUiState(
    val deviceName: String = "",
    val isLoading: Boolean = false,
    val error: String? = null,
    val deviceToken: String? = null,
    val shouldShowReplaceButton: Boolean = false,
    val devices: List<Device> = emptyList(),
    val showDeviceLimitDialog: Boolean = false,
    val deviceLimitError: String? = null,
    val maxDevices: Int = AppConstants.DEFAULT_MAX_DEVICES,
    val deviceInfoList: List<DeviceInfo> = emptyList()
)
