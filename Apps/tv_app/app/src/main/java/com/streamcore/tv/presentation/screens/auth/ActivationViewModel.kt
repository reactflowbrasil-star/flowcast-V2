package com.streamcore.tv.presentation.screens.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.streamcore.tv.R
import com.streamcore.tv.core.error.ErrorHandler
import com.streamcore.tv.core.utils.isValidActivationCode
import com.streamcore.tv.core.utils.logd
import com.streamcore.tv.core.utils.loge
import com.streamcore.tv.core.utils.StringProvider
import com.streamcore.tv.domain.model.DeviceActivation
import com.streamcore.tv.domain.model.Result
import com.streamcore.tv.domain.usecase.auth.ActivateDeviceUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * ViewModel for Activation Screen
 * 
 * Handles device activation with activation code
 */
@HiltViewModel
class ActivationViewModel @Inject constructor(
    private val activateDeviceUseCase: ActivateDeviceUseCase,
    private val errorHandler: ErrorHandler,
    private val stringProvider: StringProvider
) : ViewModel() {
    
    private val _uiState = MutableStateFlow(ActivationUiState())
    val uiState: StateFlow<ActivationUiState> = _uiState.asStateFlow()
    
    init {
        logd("ActivationViewModel initialized")
    }
    
    /**
     * Set device token from previous screen
     */
    fun setDeviceToken(token: String) {
        _uiState.update { it.copy(deviceToken = token) }
        logd("Device token set: $token")
    }
    
    /**
     * Update activation code
     */
    fun updateActivationCode(code: String) {
        // Only allow digits and limit to 6 characters
        val filteredCode = code.filter { it.isDigit() }.take(6)
        _uiState.update { it.copy(activationCode = filteredCode) }
        logd("Activation code updated: $filteredCode")
    }
    
    /**
     * Activate device with activation code
     */
    fun activateDevice() {
        val currentState = _uiState.value
        
        // Validate inputs
        if (currentState.deviceToken.isBlank()) {
            _uiState.update { 
                it.copy(error = stringProvider.getString(R.string.error_unexpected_state))
            }
            return
        }
        
        if (!currentState.activationCode.isValidActivationCode()) {
            _uiState.update { 
                it.copy(error = stringProvider.getString(R.string.error_invalid_code))
            }
            return
        }
        
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            
            try {
                logd("Starting device activation")
                
                val deviceActivation = DeviceActivation(
                    deviceToken = currentState.deviceToken,
                    activationCode = currentState.activationCode
                )
                
                logd("Device activation data: $deviceActivation")
                
                when (val result = activateDeviceUseCase(deviceActivation)) {
                    is Result.Success -> {
                        logd("Device activation successful")
                        _uiState.update { 
                            it.copy(
                                isLoading = false,
                                isActivated = true,
                                error = null
                            ) 
                        }
                    }
                    
                    is Result.Error -> {
                        val errorMessage = errorHandler.getErrorMessage(result.exception)
                        loge("Device activation failed: $errorMessage", result.exception)
                        _uiState.update { 
                            it.copy(
                                isLoading = false,
                                error = errorMessage
                            ) 
                        }
                    }
                    
                    is Result.Loading -> {
                        // Should not happen in this use case
                        logd("Unexpected loading state in device activation")
                    }
                }
            } catch (e: Exception) {
                val errorMessage = errorHandler.getErrorMessage(e)
                loge("Device activation exception: $errorMessage", e)
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
     * Reset activation state (for retry)
     */
    fun resetActivation() {
        _uiState.update { 
            it.copy(
                activationCode = "",
                isActivated = false,
                error = null
            ) 
        }
        logd("Activation state reset")
    }
}

/**
 * UI State for Activation Screen
 */
data class ActivationUiState(
    val deviceToken: String = "",
    val activationCode: String = "",
    val isLoading: Boolean = false,
    val isActivated: Boolean = false,
    val error: String? = null
)
