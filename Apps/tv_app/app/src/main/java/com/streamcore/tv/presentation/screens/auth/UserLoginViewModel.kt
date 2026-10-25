package com.streamcore.tv.presentation.screens.auth

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.streamcore.tv.R
import com.streamcore.tv.domain.model.Result
import com.streamcore.tv.domain.usecase.auth.LoginUserUseCase
import com.streamcore.tv.core.utils.ErrorHandler
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

/**
 * ViewModel for user login screen
 */
@HiltViewModel
class UserLoginViewModel @Inject constructor(
    application: Application,
    private val loginUserUseCase: LoginUserUseCase,
    private val errorHandler: ErrorHandler
) : AndroidViewModel(application) {
    
    private val _uiState = MutableStateFlow(UserLoginUiState())
    val uiState: StateFlow<UserLoginUiState> = _uiState.asStateFlow()
    
    private fun getString(resId: Int): String = getApplication<Application>().getString(resId)
    
    /**
     * Update username
     */
    fun updateUsername(username: String) {
        _uiState.value = _uiState.value.copy(
            username = username,
            error = null
        )
    }
    
    /**
     * Update password
     */
    fun updatePassword(password: String) {
        _uiState.value = _uiState.value.copy(
            password = password,
            error = null
        )
    }
    
    /**
     * Perform user login
     */
    fun login() {
        val currentState = _uiState.value
        
        if (currentState.username.isBlank() || currentState.password.isBlank()) {
            _uiState.value = currentState.copy(
                error = getString(R.string.auth_enter_credentials)
            )
            return
        }
        
        viewModelScope.launch {
            _uiState.value = currentState.copy(
                isLoading = true,
                error = null
            )
            
            try {
                Timber.d("Attempting user login for: ${currentState.username}")
                
                val result = loginUserUseCase(
                    username = currentState.username,
                    password = currentState.password
                )
                
                when (result) {
                    is Result.Success -> {
                        Timber.d("User login successful")
                        // Save credentials for potential device management re-login
                        // This is needed because if device limit is exceeded, we need to
                        // re-login without device binding to manage devices (like web does)
                        com.streamcore.tv.domain.usecase.device.CredentialsStore.save(
                            currentState.username,
                            currentState.password
                        )
                        _uiState.value = currentState.copy(
                            isLoading = false,
                            isLoginSuccessful = true,
                            error = null
                        )
                    }
                    is Result.Error -> {
                        Timber.e("User login failed: ${result.exception.message}")
                        val errorMessage = errorHandler.getErrorMessage(result.exception)
                        _uiState.value = currentState.copy(
                            isLoading = false,
                            error = errorMessage
                        )
                    }
                    is Result.Loading -> {
                        // This shouldn't happen in this context, but handle it
                        Timber.w("Unexpected loading state in login result")
                        _uiState.value = currentState.copy(
                            isLoading = true,
                            error = null
                        )
                    }
                }
            } catch (e: Exception) {
                Timber.e(e, "Unexpected error during login")
                val errorMessage = errorHandler.getErrorMessage(e)
                _uiState.value = currentState.copy(
                    isLoading = false,
                    error = errorMessage
                )
            }
        }
    }
    
    /**
     * Clear error message
     */
    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }
    
    /**
     * Reset login success state
     */
    fun resetLoginSuccess() {
        _uiState.value = _uiState.value.copy(isLoginSuccessful = false)
    }
}

/**
 * UI state for user login screen
 */
data class UserLoginUiState(
    val username: String = "",
    val password: String = "",
    val isLoading: Boolean = false,
    val isLoginSuccessful: Boolean = false,
    val error: String? = null
) {
    val isFormValid: Boolean
        get() = username.isNotBlank() && password.isNotBlank()
}
