package com.streamcore.tv.presentation.screens.livetv

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.streamcore.tv.domain.model.Result
import com.streamcore.tv.domain.model.ContentItem
import com.streamcore.tv.domain.usecase.content.GetLiveTVChannelsUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

/**
 * ViewModel for Live TV Screen
 */
@HiltViewModel
class LiveTVViewModel @Inject constructor(
    private val getLiveTVChannelsUseCase: GetLiveTVChannelsUseCase
) : ViewModel() {
    
    private val _uiState = MutableStateFlow(LiveTVUiState())
    val uiState: StateFlow<LiveTVUiState> = _uiState.asStateFlow()
    
    /**
     * Load live TV channels
     */
    fun loadChannels() {
        viewModelScope.launch {
            _uiState.update { it.copy(channelsState = Result.Loading) }

            val result = getLiveTVChannelsUseCase()

            // Debug log to check how many channels reach the ViewModel
            when (result) {
                is Result.Success -> {
                    Timber.d("LiveTVViewModel: Received ${result.data.size} channels from UseCase")
                }
                is Result.Error -> {
                    Timber.e("LiveTVViewModel: Error loading channels: ${result.exception.message}")
                }
                else -> {
                    Timber.d("LiveTVViewModel: Loading state")
                }
            }

            _uiState.update { currentState ->
                currentState.copy(channelsState = result)
            }
        }
    }
    
    /**
     * Retry loading channels
     */
    fun retryLoadChannels() {
        Timber.d("Retrying channels load")
        loadChannels()
    }
    
    /**
     * Refresh channels
     */
    fun refreshChannels() {
        Timber.d("Refreshing channels")
        loadChannels()
    }
}

/**
 * UI State for Live TV Screen
 */
data class LiveTVUiState(
    val channelsState: Result<List<ContentItem>> = Result.Loading,
    val error: String? = null
)
