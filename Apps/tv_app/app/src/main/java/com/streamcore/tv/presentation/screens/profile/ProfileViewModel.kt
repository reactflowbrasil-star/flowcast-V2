package com.streamcore.tv.presentation.screens.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.streamcore.tv.R
import com.streamcore.tv.core.error.ErrorHandler
import com.streamcore.tv.core.utils.StringProvider
import com.streamcore.tv.core.utils.logd
import com.streamcore.tv.core.utils.loge
import com.streamcore.tv.domain.model.*
import com.streamcore.tv.domain.usecase.auth.LogoutUseCase
import com.streamcore.tv.domain.usecase.user.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * ViewModel for Profile Screen
 * 
 * Handles user profile data and account management
 */
@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val getUserProfileUseCase: GetUserProfileUseCase,
    private val getWatchHistoryUseCase: GetWatchHistoryUseCase,
    private val getFavoritesUseCase: GetFavoritesUseCase,
    private val clearWatchHistoryUseCase: ClearWatchHistoryUseCase,
    private val removeDeviceUseCase: RemoveDeviceUseCase,
    private val updateDeviceNameUseCase: UpdateDeviceNameUseCase,
    private val logoutUseCase: LogoutUseCase,
    private val errorHandler: ErrorHandler,
    private val stringProvider: StringProvider
) : ViewModel() {
    
    private val _uiState = MutableStateFlow(ProfileUiState())
    val uiState: StateFlow<ProfileUiState> = _uiState.asStateFlow()
    
    init {
        logd("ProfileViewModel initialized")
    }
    
    /**
     * Load user profile and related data
     */
    fun loadProfile() {
        viewModelScope.launch {
            _uiState.update { 
                it.copy(
                    profileState = UiState.Loading,
                    message = null
                ) 
            }
            
            try {
                logd("Loading user profile")
                
                // Load user profile
                when (val result = getUserProfileUseCase()) {
                    is Result.Success -> {
                        val profile = result.data
                        logd("User profile loaded: ${profile.username}")
                        
                        _uiState.update { 
                            it.copy(
                                profileState = UiState.Success(profile),
                                message = null
                            ) 
                        }
                        
                        // Load additional data
                        loadAccountStats()
                    }
                    
                    is Result.Error -> {
                        val errorMessage = errorHandler.getErrorMessage(result.exception)
                        loge("Failed to load user profile: $errorMessage", result.exception)
                        _uiState.update { 
                            it.copy(
                                profileState = UiState.Error(errorMessage),
                                message = errorMessage
                            ) 
                        }
                    }
                    
                    is Result.Loading -> {
                        // Should not happen in this use case
                        logd("Unexpected loading state in user profile")
                    }
                }
            } catch (e: Exception) {
                val errorMessage = errorHandler.getErrorMessage(e)
                loge("User profile loading exception: $errorMessage", e)
                _uiState.update { 
                    it.copy(
                        profileState = UiState.Error(errorMessage),
                        message = errorMessage
                    ) 
                }
            }
        }
    }
    
    /**
     * Clear watch history
     */
    fun clearWatchHistory() {
        viewModelScope.launch {
            try {
                logd("Clearing watch history")
                
                when (val result = clearWatchHistoryUseCase()) {
                    is Result.Success -> {
                        _uiState.update { 
                            it.copy(
                                watchHistoryCount = 0,
                                message = stringProvider.getString(R.string.profile_history_cleared)
                            ) 
                        }
                        logd("Watch history cleared successfully")
                    }
                    
                    is Result.Error -> {
                        val errorMessage = errorHandler.getErrorMessage(result.exception)
                        loge("Failed to clear watch history: $errorMessage", result.exception)
                        _uiState.update { it.copy(message = errorMessage) }
                    }
                    
                    is Result.Loading -> {}
                }
            } catch (e: Exception) {
                val errorMessage = errorHandler.getErrorMessage(e)
                loge("Clear watch history exception: $errorMessage", e)
                _uiState.update { it.copy(message = errorMessage) }
            }
        }
    }
    
    /**
     * Remove device
     */
    fun removeDevice(deviceId: String) {
        viewModelScope.launch {
            try {
                logd("Removing device: $deviceId")
                
                when (val result = removeDeviceUseCase(deviceId)) {
                    is Result.Success -> {
                        _uiState.update { 
                            it.copy(message = stringProvider.getString(R.string.profile_device_removed_success))
                        }
                        logd("Device removed successfully")
                        
                        // Reload profile to update device list
                        loadProfile()
                    }
                    
                    is Result.Error -> {
                        val errorMessage = errorHandler.getErrorMessage(result.exception)
                        loge("Failed to remove device: $errorMessage", result.exception)
                        _uiState.update { it.copy(message = errorMessage) }
                    }
                    
                    is Result.Loading -> {}
                }
            } catch (e: Exception) {
                val errorMessage = errorHandler.getErrorMessage(e)
                loge("Remove device exception: $errorMessage", e)
                _uiState.update { it.copy(message = errorMessage) }
            }
        }
    }
    
    /**
     * Rename device
     */
    fun renameDevice(deviceId: String, newName: String) {
        viewModelScope.launch {
            try {
                logd("Renaming device: $deviceId to $newName")
                
                when (val result = updateDeviceNameUseCase(deviceId, newName)) {
                    is Result.Success -> {
                        _uiState.update { 
                            it.copy(message = stringProvider.getString(R.string.name_device_updated))
                        }
                        logd("Device renamed successfully")
                        
                        // Reload profile to update device list
                        loadProfile()
                    }
                    
                    is Result.Error -> {
                        val errorMessage = errorHandler.getErrorMessage(result.exception)
                        loge("Failed to rename device: $errorMessage", result.exception)
                        _uiState.update { it.copy(message = errorMessage) }
                    }
                    
                    is Result.Loading -> {}
                }
            } catch (e: Exception) {
                val errorMessage = errorHandler.getErrorMessage(e)
                loge("Rename device exception: $errorMessage", e)
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
     * Load account statistics
     */
    private fun loadAccountStats() {
        viewModelScope.launch {
            try {
                // Load watch history count
                when (val historyResult = getWatchHistoryUseCase()) {
                    is Result.Success -> {
                        _uiState.update { 
                            it.copy(watchHistoryCount = historyResult.data.size) 
                        }
                        logd("Watch history count: ${historyResult.data.size}")
                    }
                    is Result.Error -> {
                        loge("Failed to load watch history", historyResult.exception)
                    }
                    is Result.Loading -> {}
                }
                
                // Load favorites count
                when (val favoritesResult = getFavoritesUseCase()) {
                    is Result.Success -> {
                        _uiState.update { 
                            it.copy(favoritesCount = favoritesResult.data.size) 
                        }
                        logd("Favorites count: ${favoritesResult.data.size}")
                    }
                    is Result.Error -> {
                        loge("Failed to load favorites", favoritesResult.exception)
                    }
                    is Result.Loading -> {}
                }
            } catch (e: Exception) {
                loge("Load account stats exception", e)
                // Don't show error to user for background operations
            }
        }
    }
}

/**
 * UI State for Profile Screen
 */
data class ProfileUiState(
    val profileState: UiState<UserProfile> = UiState.Loading,
    val watchHistoryCount: Int = 0,
    val favoritesCount: Int = 0,
    val isLoading: Boolean = false,
    val isLoggedOut: Boolean = false,
    val message: String? = null
)
