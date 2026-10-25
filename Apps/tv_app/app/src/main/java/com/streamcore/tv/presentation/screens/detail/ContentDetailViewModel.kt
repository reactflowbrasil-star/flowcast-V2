package com.streamcore.tv.presentation.screens.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.streamcore.tv.core.error.ErrorHandler
import com.streamcore.tv.core.utils.logd
import com.streamcore.tv.core.utils.loge
import com.streamcore.tv.domain.model.*
import com.streamcore.tv.domain.usecase.content.GetContentDetailsUseCase
import com.streamcore.tv.domain.usecase.user.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * ViewModel for Content Detail Screen
 * 
 * Handles content details loading and user interactions
 */
@HiltViewModel
class ContentDetailViewModel @Inject constructor(
    private val getContentDetailsUseCase: GetContentDetailsUseCase,
    private val isFavoriteUseCase: IsFavoriteUseCase,
    private val addToFavoritesUseCase: AddToFavoritesUseCase,
    private val removeFromFavoritesUseCase: RemoveFromFavoritesUseCase,
    private val getWatchProgressUseCase: GetWatchProgressUseCase,
    private val errorHandler: ErrorHandler
) : ViewModel() {
    
    private val _uiState = MutableStateFlow(ContentDetailUiState())
    val uiState: StateFlow<ContentDetailUiState> = _uiState.asStateFlow()
    
    init {
        logd("ContentDetailViewModel initialized")
    }
    
    /**
     * Load content details
     */
    fun loadContent(contentId: String) {
        viewModelScope.launch {
            _uiState.update { 
                it.copy(
                    contentState = UiState.Loading,
                    error = null
                ) 
            }
            
            try {
                logd("Loading content details: $contentId")
                
                // Load content details
                when (val result = getContentDetailsUseCase(contentId)) {
                    is Result.Success -> {
                        val content = result.data
                        logd("Content details loaded: ${content.title}")
                        
                        _uiState.update { 
                            it.copy(
                                contentState = UiState.Success(content),
                                error = null
                            ) 
                        }
                        
                        // Load additional data
                        loadFavoriteStatus(contentId)
                        loadWatchProgress(contentId)
                    }
                    
                    is Result.Error -> {
                        val errorMessage = errorHandler.getErrorMessage(result.exception)
                        loge("Failed to load content details: $errorMessage", result.exception)
                        _uiState.update { 
                            it.copy(
                                contentState = UiState.Error(errorMessage),
                                error = errorMessage
                            ) 
                        }
                    }
                    
                    is Result.Loading -> {
                        // Should not happen in this use case
                        logd("Unexpected loading state in content details")
                    }
                }
            } catch (e: Exception) {
                val errorMessage = errorHandler.getErrorMessage(e)
                loge("Content details loading exception: $errorMessage", e)
                _uiState.update { 
                    it.copy(
                        contentState = UiState.Error(errorMessage),
                        error = errorMessage
                    ) 
                }
            }
        }
    }
    
    /**
     * Toggle favorite status
     */
    fun toggleFavorite() {
        val currentState = _uiState.value
        val content = (currentState.contentState as? UiState.Success)?.data ?: return
        
        viewModelScope.launch {
            try {
                if (currentState.isFavorite) {
                    // Remove from favorites
                    when (val result = removeFromFavoritesUseCase(content.id)) {
                        is Result.Success -> {
                            _uiState.update { it.copy(isFavorite = false) }
                            logd("Removed from favorites: ${content.title}")
                        }
                        is Result.Error -> {
                            val errorMessage = errorHandler.getErrorMessage(result.exception)
                            loge("Failed to remove from favorites: $errorMessage", result.exception)
                            _uiState.update { it.copy(error = errorMessage) }
                        }
                        is Result.Loading -> {}
                    }
                } else {
                    // Add to favorites
                    when (val result = addToFavoritesUseCase(content.id)) {
                        is Result.Success -> {
                            _uiState.update { it.copy(isFavorite = true) }
                            logd("Added to favorites: ${content.title}")
                        }
                        is Result.Error -> {
                            val errorMessage = errorHandler.getErrorMessage(result.exception)
                            loge("Failed to add to favorites: $errorMessage", result.exception)
                            _uiState.update { it.copy(error = errorMessage) }
                        }
                        is Result.Loading -> {}
                    }
                }
            } catch (e: Exception) {
                val errorMessage = errorHandler.getErrorMessage(e)
                loge("Toggle favorite exception: $errorMessage", e)
                _uiState.update { it.copy(error = errorMessage) }
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
     * Load favorite status
     */
    private fun loadFavoriteStatus(contentId: String) {
        viewModelScope.launch {
            try {
                when (val result = isFavoriteUseCase(contentId)) {
                    is Result.Success -> {
                        _uiState.update { it.copy(isFavorite = result.data) }
                        logd("Favorite status loaded: ${result.data}")
                    }
                    is Result.Error -> {
                        loge("Failed to load favorite status", result.exception)
                        // Don't show error to user for this background operation
                    }
                    is Result.Loading -> {}
                }
            } catch (e: Exception) {
                loge("Load favorite status exception", e)
                // Don't show error to user for this background operation
            }
        }
    }
    
    /**
     * Load watch progress
     */
    private fun loadWatchProgress(contentId: String) {
        viewModelScope.launch {
            try {
                when (val result = getWatchProgressUseCase(contentId)) {
                    is Result.Success -> {
                        _uiState.update { it.copy(watchProgress = result.data) }
                        logd("Watch progress loaded: ${result.data?.progress}")
                    }
                    is Result.Error -> {
                        loge("Failed to load watch progress", result.exception)
                        // Don't show error to user for this background operation
                    }
                    is Result.Loading -> {}
                }
            } catch (e: Exception) {
                loge("Load watch progress exception", e)
                // Don't show error to user for this background operation
            }
        }
    }
}

/**
 * UI State for Content Detail Screen
 */
data class ContentDetailUiState(
    val contentState: UiState<ContentDetails> = UiState.Loading,
    val isFavorite: Boolean = false,
    val watchProgress: WatchProgress? = null,
    val error: String? = null
)
