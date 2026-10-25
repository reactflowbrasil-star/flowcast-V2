package com.streamcore.tv.presentation.screens.events

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.streamcore.tv.domain.model.ContentItem
import com.streamcore.tv.domain.model.Result
import com.streamcore.tv.domain.usecase.content.GetCategoriesUseCase
import com.streamcore.tv.domain.usecase.content.GetContentByCategoryUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

@HiltViewModel
class EventsViewModel @Inject constructor(
    private val getCategoriesUseCase: GetCategoriesUseCase,
    private val getContentByCategoryUseCase: GetContentByCategoryUseCase
) : ViewModel() {

    private val _uiState = MutableStateFlow(EventsUiState())
    val uiState: StateFlow<EventsUiState> = _uiState.asStateFlow()

    fun loadEvents() {
        viewModelScope.launch {
            _uiState.update { it.copy(eventsState = Result.Loading) }

            try {
                // Find Events category ID
                val categories = getCategoriesUseCase()
                val categoryId = when (categories) {
                    is Result.Success -> {
                        categories.data.firstOrNull { category ->
                            val slug = category.slug.lowercase()
                            val name = category.name.lowercase()
                            slug == "events" || slug == "event" || name.contains("event")
                        }?.id
                    }
                    is Result.Error -> null
                    else -> null
                }

                if (categoryId == null) {
                    Timber.w("EventsViewModel: events category not found")
                    _uiState.update { it.copy(eventsState = Result.Success(emptyList())) }
                    return@launch
                }

                // Load events content from category
                when (val page = getContentByCategoryUseCase(categoryId, page = 1, limit = 500)) {
                    is Result.Success -> {
                        val items: List<ContentItem> = page.data.content
                        Timber.d("EventsViewModel: Loaded ${items.size} events")
                        _uiState.update { it.copy(eventsState = Result.Success(items)) }
                    }
                    is Result.Error -> {
                        _uiState.update { it.copy(eventsState = Result.Error(page.exception)) }
                    }
                    else -> {
                        _uiState.update { it.copy(eventsState = Result.Success(emptyList())) }
                    }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(eventsState = Result.Error(e)) }
            }
        }
    }
}

data class EventsUiState(
    val eventsState: Result<List<ContentItem>> = Result.Loading
)
