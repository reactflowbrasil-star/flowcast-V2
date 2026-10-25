package com.streamcore.tv.presentation.screens.season

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.streamcore.tv.domain.model.Result
import com.streamcore.tv.domain.model.EpisodeDetails
import com.streamcore.tv.domain.usecase.series.GetSeasonEpisodesUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

/**
 * ViewModel for Season Detail Screen
 */
@HiltViewModel
class SeasonDetailViewModel @Inject constructor(
    private val getSeasonEpisodesUseCase: GetSeasonEpisodesUseCase
) : ViewModel() {
    
    private val _uiState = MutableStateFlow(SeasonDetailUiState())
    val uiState: StateFlow<SeasonDetailUiState> = _uiState.asStateFlow()
    
    /**
     * Load episodes for a season
     */
    fun loadSeasonEpisodes(seasonId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(episodesState = Result.Loading) }

            val result = getSeasonEpisodesUseCase(seasonId)
            _uiState.update { currentState ->
                currentState.copy(episodesState = result)
            }
        }
    }
    
    /**
     * Retry loading episodes
     */
    fun retryLoadEpisodes(seasonId: String) {
        Timber.d("Retrying episodes load for season: $seasonId")
        loadSeasonEpisodes(seasonId)
    }
    
    /**
     * Refresh episodes
     */
    fun refreshEpisodes(seasonId: String) {
        Timber.d("Refreshing episodes for season: $seasonId")
        loadSeasonEpisodes(seasonId)
    }
}

/**
 * UI State for Season Detail Screen
 */
data class SeasonDetailUiState(
    val episodesState: Result<List<EpisodeDetails>> = Result.Loading,
    val error: String? = null
)
