package com.streamcore.tv.presentation.screens.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.streamcore.tv.domain.model.ContentDetails
import com.streamcore.tv.domain.model.UiState
import com.streamcore.tv.domain.repository.ContentRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

/**
 * ViewModel for the detail screen
 */
@HiltViewModel
class DetailViewModel @Inject constructor(
    private val contentRepository: ContentRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(DetailUiState())
    val uiState: StateFlow<DetailUiState> = _uiState.asStateFlow()

    /**
     * Load content details by ID
     */
    fun loadContentDetails(contentId: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                contentState = UiState.Loading
            )
            
            try {
                val result = contentRepository.getContentDetails(contentId)
                when (result) {
                    is com.streamcore.tv.domain.model.Result.Success -> {
                        _uiState.value = _uiState.value.copy(
                            contentState = UiState.Success(result.data)
                        )
                        // After content loads, also load available stream links
                        loadStreamLinks(contentId)
                    }
                    is com.streamcore.tv.domain.model.Result.Error -> {
                        _uiState.value = _uiState.value.copy(
                            contentState = UiState.Error(result.exception.message ?: "Unknown error")
                        )
                    }
                    is com.streamcore.tv.domain.model.Result.Loading -> {
                        _uiState.value = _uiState.value.copy(
                            contentState = UiState.Loading
                        )
                    }
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    contentState = UiState.Error(e.message ?: "Unknown error")
                )
            }
        }
    }

    /**
     * Load available stream links for the content
     */
    private fun loadStreamLinks(contentId: String) {
        viewModelScope.launch {
            try {
                val response = contentRepository.getContentStreams(contentId)
                if (response.isSuccessful) {
                    val streams = response.body() ?: emptyList()
                    if (streams.size > 1) {
                        val streamInfos = streams.mapIndexed { index, dto ->
                            StreamLinkInfo(
                                id = dto.id,
                                label = buildStreamLabel(dto, index + 1),
                                quality = dto.quality,
                                language = dto.language,
                                format = dto.format,
                                isDefault = dto.isDefault,
                                hasDrm = !dto.drmKeys.isNullOrBlank() || !dto.drmType.isNullOrBlank()
                            )
                        }
                        _uiState.value = _uiState.value.copy(availableStreams = streamInfos)
                        Timber.d("Loaded ${streamInfos.size} stream link versions")
                    }
                }
            } catch (e: Exception) {
                Timber.w(e, "Failed to load stream links (non-fatal)")
            }
        }
    }

    private fun buildStreamLabel(dto: com.streamcore.tv.data.remote.dto.StreamPublicDto, index: Int): String {
        val parts = mutableListOf<String>()
        dto.quality?.let { parts.add(it) }
        dto.language?.let { parts.add(it) }
        dto.format?.let { parts.add(it.uppercase()) }
        if (dto.isDefault) parts.add("★")
        return if (parts.isNotEmpty()) parts.joinToString(" · ") else "Version $index"
    }

    fun showStreamPicker() {
        _uiState.value = _uiState.value.copy(showStreamPicker = true)
    }

    fun hideStreamPicker() {
        _uiState.value = _uiState.value.copy(showStreamPicker = false)
    }

    /**
     * Toggle favorite status for content
     * Note: Favorite functionality requires backend API support
     */
    @Suppress("UNUSED_PARAMETER")
    fun toggleFavorite(content: ContentDetails) {
        viewModelScope.launch {
            try {
                // Favorite toggle requires backend API implementation
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    error = e.message ?: "Error toggling favorite"
                )
            }
        }
    }

    /**
     * Clear any error messages
     */
    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }
}

/**
 * UI state for the detail screen
 */
data class DetailUiState(
    val contentState: UiState<ContentDetails> = UiState.Loading,
    val availableStreams: List<StreamLinkInfo> = emptyList(),
    val showStreamPicker: Boolean = false,
    val error: String? = null
) {
    val hasMultipleStreams: Boolean
        get() = availableStreams.size > 1
}

/**
 * Stream link info for the picker dialog
 */
data class StreamLinkInfo(
    val id: Long,
    val label: String,
    val quality: String?,
    val language: String?,
    val format: String?,
    val isDefault: Boolean,
    val hasDrm: Boolean = false
)
