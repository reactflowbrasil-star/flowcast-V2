package com.streamcore.tv.presentation.screens.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.streamcore.tv.core.error.ErrorHandler
import com.streamcore.tv.core.utils.logd
import com.streamcore.tv.core.utils.loge
import com.streamcore.tv.domain.model.*
import com.streamcore.tv.domain.usecase.auth.GetDeviceStatusUseCase
import com.streamcore.tv.domain.usecase.device.DeviceLimitHandler
import com.streamcore.tv.domain.repository.UserRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * ViewModel for Device Management Screen
 * 
 * Handles device listing, removal, and management
 */
@HiltViewModel
class DeviceManagementViewModel @Inject constructor(
    private val getDeviceStatusUseCase: GetDeviceStatusUseCase,
    private val deviceLimitHandler: DeviceLimitHandler,
    private val userRepository: UserRepository,
    private val errorHandler: ErrorHandler
) : ViewModel() {
    
    private val _uiState = MutableStateFlow(DeviceManagementUiState())
    val uiState: StateFlow<DeviceManagementUiState> = _uiState.asStateFlow()
    
    init {
        logd("DeviceManagementViewModel initialized")
        loadDevices()
    }
    
    /**
     * Load user devices
     */
    fun loadDevices() {
        viewModelScope.launch {
            try {
                logd("Loading user devices")
                _uiState.update { it.copy(isLoading = true, error = null) }
                
                when (val result = getDeviceStatusUseCase()) {
                    is Result.Success -> {
                        val deviceStatus = result.data
                        logd("Loaded ${deviceStatus.devices.size} devices")
                        
                        val deviceInfoList = deviceStatus.devices.map { device ->
                            DeviceInfo(
                                id = device.id,
                                name = device.name,
                                type = device.type,
                                lastActive = device.lastUsed ?: "Desconocido",
                                isCurrentDevice = device.isCurrentDevice
                            )
                        }
                        
                        _uiState.update { 
                            it.copy(
                                isLoading = false,
                                devices = deviceInfoList,
                                maxDevices = deviceStatus.maxDevices,
                                currentDeviceCount = deviceStatus.currentDevices,
                                error = null
                            ) 
                        }
                    }
                    
                    is Result.Error -> {
                        val errorMessage = errorHandler.getErrorMessage(result.exception)
                        loge("Failed to load devices: $errorMessage", result.exception)
                        _uiState.update { 
                            it.copy(
                                isLoading = false,
                                error = errorMessage
                            ) 
                        }
                    }
                    
                    is Result.Loading -> {
                        // Keep loading state
                        logd("Device loading in progress")
                    }
                }
            } catch (e: Exception) {
                val errorMessage = errorHandler.getErrorMessage(e)
                loge("Exception loading devices: $errorMessage", e)
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
     * Remove a specific device
     */
    fun removeDevice(device: DeviceInfo) {
        viewModelScope.launch {
            try {
                logd("Removing device: ${device.name}")
                _uiState.update { it.copy(isLoading = true, error = null) }
                
                when (val result = userRepository.removeDevice(device.id)) {
                    is Result.Success -> {
                        logd("Device removed successfully")
                        _uiState.update { it.copy(isLoading = false) }
                        // Reload devices to get updated list
                        loadDevices()
                    }
                    
                    is Result.Error -> {
                        val errorMessage = errorHandler.getErrorMessage(result.exception)
                        loge("Failed to remove device: $errorMessage", result.exception)
                        _uiState.update { 
                            it.copy(
                                isLoading = false,
                                error = errorMessage
                            ) 
                        }
                    }
                    
                    is Result.Loading -> {
                        // Keep loading state
                        logd("Device removal in progress")
                    }
                }
            } catch (e: Exception) {
                val errorMessage = errorHandler.getErrorMessage(e)
                loge("Exception removing device: $errorMessage", e)
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
     * Show device removal confirmation
     */
    fun showRemoveConfirmation(device: DeviceInfo) {
        _uiState.update { 
            it.copy(
                deviceToRemove = device,
                showRemoveConfirmation = true
            ) 
        }
    }
    
    /**
     * Hide device removal confirmation
     */
    fun hideRemoveConfirmation() {
        _uiState.update { 
            it.copy(
                deviceToRemove = null,
                showRemoveConfirmation = false
            ) 
        }
    }
    
    /**
     * Confirm device removal
     */
    fun confirmRemoveDevice() {
        val deviceToRemove = _uiState.value.deviceToRemove
        if (deviceToRemove != null) {
            hideRemoveConfirmation()
            removeDevice(deviceToRemove)
        }
    }
    
    /**
     * Clear error message
     */
    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
    
    /**
     * Refresh devices
     */
    fun refresh() {
        loadDevices()
    }
}

/**
 * UI State for Device Management Screen
 */
data class DeviceManagementUiState(
    val devices: List<DeviceInfo> = emptyList(),
    val maxDevices: Int = 0,
    val currentDeviceCount: Int = 0,
    val isLoading: Boolean = false,
    val error: String? = null,
    val deviceToRemove: DeviceInfo? = null,
    val showRemoveConfirmation: Boolean = false
)
