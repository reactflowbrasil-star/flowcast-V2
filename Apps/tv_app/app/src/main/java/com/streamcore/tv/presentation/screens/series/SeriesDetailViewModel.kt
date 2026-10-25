package com.streamcore.tv.presentation.screens.series

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.streamcore.tv.domain.model.SeriesDetails
import com.streamcore.tv.domain.model.Season
import com.streamcore.tv.domain.model.ContentDetails
import com.streamcore.tv.domain.usecase.series.GetSeriesDetailsByContentIdUseCase
import com.streamcore.tv.domain.usecase.content.GetContentDetailsUseCase
import com.streamcore.tv.core.utils.UiState
import com.streamcore.tv.core.utils.logd
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * ViewModel for Series Detail Screen
 */
@HiltViewModel
class SeriesDetailViewModel @Inject constructor(
    private val getSeriesDetailsByContentIdUseCase: GetSeriesDetailsByContentIdUseCase,
    private val getContentDetailsUseCase: GetContentDetailsUseCase
) : ViewModel() {

    private val _uiState = MutableStateFlow(SeriesDetailUiState())
    val uiState: StateFlow<SeriesDetailUiState> = _uiState.asStateFlow()

    /**
     * Load series details with seasons and episodes by content ID
     */
    fun loadSeriesDetailsByContentId(contentId: String) {
        viewModelScope.launch {
            logd("Loading series details for content ID: $contentId")
            _uiState.update { it.copy(seriesState = UiState.Loading) }

            try {
                // Load as series
                loadSeriesDetails(contentId)
            } catch (e: Exception) {
                logd("Exception loading series details: ${e.message}")
                _uiState.update { currentState ->
                    currentState.copy(
                        seriesState = UiState.Error(e.message ?: "Unknown error")
                    )
                }
            }
        }
    }

    /**
     * Load series details (for regular series)
     */
    private suspend fun loadSeriesDetails(contentId: String) {
        try {
            val result = getSeriesDetailsByContentIdUseCase(contentId)
            result.fold(
                onSuccess = { seriesDetails ->
                    logd("Series details loaded successfully: ${seriesDetails.content.title}")
                    _uiState.update { currentState ->
                        currentState.copy(
                            seriesState = UiState.Success(seriesDetails),
                            selectedSeason = seriesDetails.seasons.firstOrNull()
                        )
                    }
                },
                onFailure = { exception ->
                    logd("Failed to load series details: ${exception.message}")
                    _uiState.update { currentState ->
                        currentState.copy(
                            seriesState = UiState.Error(exception.message ?: "Unknown error")
                        )
                    }
                }
            )
        } catch (e: Exception) {
            logd("Exception loading series details: ${e.message}")
            _uiState.update { currentState ->
                currentState.copy(
                    seriesState = UiState.Error(e.message ?: "Unknown error")
                )
            }
        }
    }

    /**
     * Select a season
     */
    fun selectSeason(season: Season) {
        logd("Season selected: ${season.seasonNumber}")
        _uiState.update { currentState ->
            currentState.copy(selectedSeason = season)
        }
    }
}

/**
 * UI State for Series Detail Screen
 */
data class SeriesDetailUiState(
    val seriesState: UiState<SeriesDetails> = UiState.Loading,
    val selectedSeason: Season? = null
)
