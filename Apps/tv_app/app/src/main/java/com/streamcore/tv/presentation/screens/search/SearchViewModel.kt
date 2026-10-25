package com.streamcore.tv.presentation.screens.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.streamcore.tv.core.error.ErrorHandler
import com.streamcore.tv.core.utils.logd
import com.streamcore.tv.core.utils.loge
import com.streamcore.tv.domain.model.*
import com.streamcore.tv.domain.usecase.content.SearchContentUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * ViewModel for Search Screen
 * 
 * Handles search functionality with filters and suggestions
 */
@OptIn(FlowPreview::class)
@HiltViewModel
class SearchViewModel @Inject constructor(
    private val searchContentUseCase: SearchContentUseCase,
    private val errorHandler: ErrorHandler
) : ViewModel() {
    
    private val _uiState = MutableStateFlow(SearchUiState())
    val uiState: StateFlow<SearchUiState> = _uiState.asStateFlow()
    
    // Search query flow with debounce
    private val searchQueryFlow = _uiState
        .map { it.query }
        .distinctUntilChanged()
        .debounce(500) // Wait 500ms after user stops typing
        .filter { it.isNotBlank() }
    
    init {
        logd("SearchViewModel initialized")
        
        // Auto-search when query changes
        viewModelScope.launch {
            searchQueryFlow.collect { query ->
                if (query.isNotBlank()) {
                    performSearch()
                }
            }
        }
        
        // No initial suggestions needed
    }
    
    /**
     * Update search query
     */
    fun updateQuery(query: String) {
        _uiState.update { it.copy(query = query) }
        logd("Search query updated: $query")
        
        if (query.isBlank()) {
            _uiState.update { it.copy(searchState = UiState.Success(SearchResult(emptyList(), PaginationInfo(0, 0, 0, false, false), emptyList()))) }
        }
    }
    
    /**
     * Clear search query
     */
    fun clearQuery() {
        _uiState.update {
            it.copy(
                query = "",
                searchState = UiState.Success(SearchResult(emptyList(), PaginationInfo(0, 0, 0, false, false), emptyList()))
            )
        }
        logd("Search query cleared")
    }
    

    
    /**
     * Perform search
     */
    fun search() {
        val currentState = _uiState.value
        
        if (currentState.query.isBlank()) {
            return
        }
        
        performSearch()
    }
    
    /**
     * Clear error message
     */
    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
    


    /**
     * Load search suggestions - Disabled for simple search
     */
    private fun loadSuggestions() {
        // Simple search - no predefined suggestions
        _uiState.update { it.copy(suggestions = emptyList()) }
        logd("Search suggestions disabled for simple search")
    }
    
    /**
     * Perform the actual search operation
     */
    private fun performSearch() {
        val currentState = _uiState.value
        
        viewModelScope.launch {
            _uiState.update { it.copy(searchState = UiState.Loading, error = null) }
            
            try {
                logd("Performing search: ${currentState.query}")
                
                // Search in all categories except Live TV (2)
                val searchQuery = SearchQuery(
                    query = currentState.query,
                    type = null, // Search all types
                    category = null, // Will be filtered in use case
                    year = null,
                    genre = null,
                    country = null,
                    page = 1,
                    limit = 200,
                    excludeCategories = listOf("2") // Exclude Live TV
                )
                
                when (val result = searchContentUseCase(searchQuery)) {
                    is Result.Success -> {
                        logd("Search completed: ${result.data.results.size} results")
                        _uiState.update { 
                            it.copy(
                                searchState = UiState.Success(result.data),
                                error = null
                            ) 
                        }
                    }
                    
                    is Result.Error -> {
                        val errorMessage = errorHandler.getErrorMessage(result.exception)
                        loge("Search failed: $errorMessage", result.exception)
                        _uiState.update { 
                            it.copy(
                                searchState = UiState.Error(errorMessage),
                                error = errorMessage
                            ) 
                        }
                    }
                    
                    is Result.Loading -> {
                        // Should not happen in this use case
                        logd("Unexpected loading state in search")
                    }
                }
            } catch (e: Exception) {
                val errorMessage = errorHandler.getErrorMessage(e)
                loge("Search exception: $errorMessage", e)
                _uiState.update { 
                    it.copy(
                        searchState = UiState.Error(errorMessage),
                        error = errorMessage
                    ) 
                }
            }
        }
    }
}

/**
 * UI State for Search Screen - Simplified without filters
 */
data class SearchUiState(
    val query: String = "",
    val searchState: UiState<SearchResult> = UiState.Success(SearchResult(emptyList(), PaginationInfo(0, 0, 0, false, false), emptyList())),
    val suggestions: List<String> = emptyList(),
    val error: String? = null
)
