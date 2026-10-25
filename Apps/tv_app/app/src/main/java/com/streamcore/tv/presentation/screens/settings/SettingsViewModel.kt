package com.streamcore.tv.presentation.screens.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.streamcore.tv.R
import com.streamcore.tv.core.error.ErrorHandler
import com.streamcore.tv.core.utils.StringProvider
import com.streamcore.tv.core.utils.logd
import com.streamcore.tv.core.utils.loge
import com.streamcore.tv.domain.model.*
import com.streamcore.tv.domain.usecase.auth.LogoutUseCase
import com.streamcore.tv.domain.usecase.user.GetUserPreferencesUseCase
import com.streamcore.tv.domain.usecase.user.UpdateUserPreferencesUseCase
import com.streamcore.tv.data.repository.UserProfileRepository
import com.streamcore.tv.domain.use_case.app.CheckForUpdateUseCase
import com.streamcore.tv.data.remote.dto.VersionCheckResponseDto
import com.streamcore.tv.common.Resource
import com.streamcore.tv.BuildConfig

import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * ViewModel for Settings Screen
 * 
 * Handles user preferences and app settings
 */
@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val getUserPreferencesUseCase: GetUserPreferencesUseCase,
    private val updateUserPreferencesUseCase: UpdateUserPreferencesUseCase,
    private val logoutUseCase: LogoutUseCase,
    private val userProfileRepository: UserProfileRepository,
    private val checkForUpdateUseCase: CheckForUpdateUseCase,
    private val errorHandler: ErrorHandler,
    private val stringProvider: StringProvider
) : ViewModel() {
    
    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()
    
    init {
        logd("SettingsViewModel initialized")
        loadUserPreferences()
        loadUserProfile()
    }
    
    /**
     * Load user preferences
     */
    private fun loadUserPreferences() {
        viewModelScope.launch {
            try {
                getUserPreferencesUseCase().collect { preferences ->
                    _uiState.update { it.copy(preferences = preferences) }
                    logd("User preferences loaded: $preferences")
                }
            } catch (e: Exception) {
                val errorMessage = errorHandler.getErrorMessage(e)
                loge("Failed to load user preferences: $errorMessage", e)
                _uiState.update { it.copy(message = errorMessage) }
            }
        }
    }
    

    

    
    /**
     * Logout user
     */
    fun logout() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            
            try {
                logd("Logging out user")
                
                when (val result = logoutUseCase()) {
                    is Result.Success -> {
                        logd("User logged out successfully")
                        _uiState.update { 
                            it.copy(
                                isLoading = false,
                                isLoggedOut = true,
                                message = stringProvider.getString(R.string.logout_success)
                            ) 
                        }
                    }
                    
                    is Result.Error -> {
                        val errorMessage = errorHandler.getErrorMessage(result.exception)
                        loge("Logout failed: $errorMessage", result.exception)
                        _uiState.update { 
                            it.copy(
                                isLoading = false,
                                message = errorMessage
                            ) 
                        }
                    }
                    
                    is Result.Loading -> {
                        // Should not happen in this use case
                        logd("Unexpected loading state in logout")
                    }
                }
            } catch (e: Exception) {
                val errorMessage = errorHandler.getErrorMessage(e)
                loge("Logout exception: $errorMessage", e)
                _uiState.update { 
                    it.copy(
                        isLoading = false,
                        message = errorMessage
                    ) 
                }
            }
        }
    }
    
    /**
     * Clear message
     */
    fun clearMessage() {
        _uiState.update { it.copy(message = null) }
    }
    
    /**
     * Update user preferences helper
     */
    private fun updatePreferences(update: (UserPreferences) -> UserPreferences) {
        viewModelScope.launch {
            try {
                val currentPreferences = _uiState.value.preferences
                val newPreferences = update(currentPreferences)
                
                when (val result = updateUserPreferencesUseCase(newPreferences)) {
                    is Result.Success -> {
                        _uiState.update { it.copy(preferences = newPreferences) }
                        logd("Preferences updated successfully")
                    }
                    
                    is Result.Error -> {
                        val errorMessage = errorHandler.getErrorMessage(result.exception)
                        loge("Failed to update preferences: $errorMessage", result.exception)
                        _uiState.update { it.copy(message = errorMessage) }
                    }
                    
                    is Result.Loading -> {
                        // Should not happen in this use case
                        logd("Unexpected loading state in preferences update")
                    }
                }
            } catch (e: Exception) {
                val errorMessage = errorHandler.getErrorMessage(e)
                loge("Preferences update exception: $errorMessage", e)
                _uiState.update { it.copy(message = errorMessage) }
            }
        }
    }

    /**
     * Load user profile
     */
    private fun loadUserProfile() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }

            when (val result = userProfileRepository.getUserProfile()) {
                is Result.Success -> {
                    _uiState.update {
                        it.copy(
                            userProfile = result.data,
                            isLoading = false
                        )
                    }
                    logd("User profile loaded successfully")
                }

                is Result.Error -> {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            message = result.exception.message
                        )
                    }
                    loge("Failed to load user profile: ${result.exception.message}")
                }

                is Result.Loading -> {
                    // Already loading
                }
            }
        }
    }

    /**
     * Change user password
     */
    fun changePassword(currentPassword: String, newPassword: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }

            when (val result = userProfileRepository.changePassword(currentPassword, newPassword)) {
                is Result.Success -> {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            message = stringProvider.getString(R.string.password_changed_success)
                        )
                    }
                    logd("Password changed successfully")
                }

                is Result.Error -> {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            message = result.exception.message
                        )
                    }
                    loge("Failed to change password: ${result.exception.message}")
                }

                is Result.Loading -> {
                    // Already loading
                }
            }
        }
    }

    /**
     * Check for app updates
     */
    fun checkForUpdates() {
        viewModelScope.launch {
            _uiState.update { it.copy(isCheckingUpdate = true, isUpToDate = false, updateInfo = null) }
            
            try {
                // Get current version code from BuildConfig
                val currentVersionCode = BuildConfig.VERSION_CODE
                logd("Checking for updates. Current version code: $currentVersionCode")
                
                checkForUpdateUseCase(currentVersionCode).collect { result ->
                    when (result) {
                        is Resource.Success -> {
                            val versionInfo = result.data
                            if (versionInfo != null && versionInfo.hasUpdate) {
                                _uiState.update {
                                    it.copy(
                                        isCheckingUpdate = false,
                                        updateInfo = versionInfo,
                                        showUpdateDialog = true,
                                        isUpToDate = false
                                    )
                                }
                                logd("Update available: ${versionInfo.latestVersion}")
                            } else {
                                _uiState.update {
                                    it.copy(
                                        isCheckingUpdate = false,
                                        isUpToDate = true,
                                        message = stringProvider.getString(R.string.update_up_to_date)
                                    )
                                }
                                logd("App is up to date")
                            }
                        }
                        is Resource.Error -> {
                            _uiState.update {
                                it.copy(
                                    isCheckingUpdate = false,
                                    message = result.message ?: stringProvider.getString(R.string.update_error)
                                )
                            }
                            loge("Error checking for updates: ${result.message}")
                        }
                        is Resource.Loading -> {
                            // Already showing loading state
                        }
                    }
                }
            } catch (e: Exception) {
                val errorMessage = errorHandler.getErrorMessage(e)
                loge("Exception checking for updates: $errorMessage", e)
                _uiState.update {
                    it.copy(
                        isCheckingUpdate = false,
                        message = errorMessage
                    )
                }
            }
        }
    }

    /**
     * Dismiss update dialog
     */
    fun dismissUpdateDialog() {
        _uiState.update { it.copy(showUpdateDialog = false, updateInfo = null) }
    }

    /**
     * Postpone update (will remind later)
     */
    fun postponeUpdate() {
        _uiState.update { 
            it.copy(
                showUpdateDialog = false,
                message = stringProvider.getString(R.string.update_postpone)
            ) 
        }
    }
}

/**
 * UI State for Settings Screen
 */
data class SettingsUiState(
    val preferences: UserPreferences = UserPreferences(),
    val userProfile: UserProfile? = null,
    val isLoading: Boolean = false,
    val isLoggedOut: Boolean = false,
    val message: String? = null,
    // Update check state
    val isCheckingUpdate: Boolean = false,
    val updateInfo: VersionCheckResponseDto? = null,
    val showUpdateDialog: Boolean = false,
    val isUpToDate: Boolean = false
)
