package com.streamcore.tv.presentation.components.livetv.v2

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.streamcore.tv.domain.model.ContentStream
import com.streamcore.tv.domain.model.EPGData
import com.streamcore.tv.domain.model.EPGProgram
import com.streamcore.tv.domain.model.Result
import com.streamcore.tv.domain.usecase.content.GetLiveTVChannelsUseCase
import com.streamcore.tv.domain.usecase.content.GetLiveTVChannelsByCategoryUseCase
import com.streamcore.tv.domain.usecase.content.GetTvChannelCategoriesUseCase
import com.streamcore.tv.domain.repository.ChannelsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import com.streamcore.tv.data.local.datastore.UserPreferencesManager
import javax.inject.Inject
import java.time.Instant

/**
 * UI state for ChannelSwitcher V2
 */
data class ChannelSwitcherV2UiState(
    val channels: List<ContentStream> = emptyList(),
    val categories: List<String> = emptyList(),
    val selectedCategory: String? = null,
    val favorites: Set<String> = emptySet(),
    val epgData: Map<String, EPGData> = emptyMap(),
    val nowMap: Map<String, EPGProgram?> = emptyMap(),
    val nextMap: Map<String, EPGProgram?> = emptyMap(),
    val isLoading: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class ChannelSwitcherV2ViewModel @Inject constructor(
    private val getLiveTVChannelsUseCase: GetLiveTVChannelsUseCase,
    private val getLiveTVChannelsByCategoryUseCase: GetLiveTVChannelsByCategoryUseCase,
    private val getTvChannelCategoriesUseCase: GetTvChannelCategoriesUseCase,
    private val channelsRepository: ChannelsRepository,
    private val userPreferencesManager: UserPreferencesManager
) : ViewModel() {

    private val _uiState = MutableStateFlow(ChannelSwitcherV2UiState())
    val uiState: StateFlow<ChannelSwitcherV2UiState> = _uiState.asStateFlow()

    init {
        Timber.d("ChannelSwitcherV2ViewModel initialized")
        loadCategories()

        // Observe persisted favorites and keep state in sync
        viewModelScope.launch {
            userPreferencesManager.getFavorites().collect { favs ->
                _uiState.update { it.copy(favorites = favs) }
            }
        }

        // Restore last selected category and trigger channel load when present
        viewModelScope.launch {
            userPreferencesManager.getLastSelectedCategory().collect { cat ->
                if (!cat.isNullOrBlank()) {
                    _uiState.update { it.copy(selectedCategory = cat) }
                    // Load channels for the restored category
                    loadChannels()
                }
            }
        }

        // Observe last viewed channel for diagnostic/UX - no automatic navigation performed here
        viewModelScope.launch {
            userPreferencesManager.getLastViewedChannel().collect { last ->
                if (!last.isNullOrBlank()) {
                    Timber.d("ChannelSwitcherV2ViewModel: Restored last viewed channel $last")
                }
            }
        }
    }

    /**
     * Load available channel categories (All, Sports, News, etc)
     */
    fun loadCategories() {
        viewModelScope.launch {
            try {
                val result = getTvChannelCategoriesUseCase()
                when (result) {
                    is Result.Success -> {
                        _uiState.update { it.copy(categories = result.data) }
                    }
                    is Result.Error -> {
                        Timber.e("Failed to load channel categories: ${result.exception.message}")
                        _uiState.update { it.copy(error = result.exception.message) }
                    }
                    else -> { /* no-op */ }
                }
            } catch (e: Exception) {
                Timber.e(e, "Exception loading categories")
                _uiState.update { it.copy(error = e.message) }
            }
        }
    }

    /**
     * Select a category and refresh the channel list
     */
    fun selectCategory(category: String?) {
        Timber.d("ChannelSwitcherV2ViewModel: selectCategory called with: '$category' (null means ALL)")
        _uiState.update { it.copy(selectedCategory = category) }
        viewModelScope.launch {
            try {
                userPreferencesManager.saveLastSelectedCategory(category)
            } catch (e: Exception) {
                Timber.e(e, "Failed to persist last selected category")
            }
        }
        loadChannels()
    }

    /**
     * Load channels according to the current selectedCategory
     */
    fun loadChannels() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val currentCategory = _uiState.value.selectedCategory
                Timber.d("ChannelSwitcherV2ViewModel: loadChannels - selectedCategory='$currentCategory'")
                
                val result = if (currentCategory.isNullOrBlank()) {
                    Timber.d("ChannelSwitcherV2ViewModel: Loading ALL channels (no category filter)")
                    getLiveTVChannelsUseCase()
                } else {
                    Timber.d("ChannelSwitcherV2ViewModel: Loading channels for category: '$currentCategory'")
                    getLiveTVChannelsByCategoryUseCase(currentCategory)
                }

                when (result) {
                    is Result.Success -> {
                        // Map repository content items into ContentStream (same mapping strategy as PlayerViewModel)
                        val channels = result.data.map { content ->
                            ContentStream(
                                id = content.id,
                                categoryId = "2",
                                title = content.title,
                                description = content.description,
                                imageUrl = content.imageUrl,
                                streamUrl = content.streamUrl ?: "",
                                tmdbId = null,
                                year = content.year,
                                channelNumber = null, // ContentItem may not include channelNumber in list endpoint
                                channelCategory = content.channelCategory,
                                createdAt = content.createdAt,
                                drmKeys = content.drmKeys,
                                drmKeysExo = null
                            )
                        }.sortedWith(compareBy({ it.channelNumber ?: Int.MAX_VALUE }, { it.id.toIntOrNull() ?: Int.MAX_VALUE }))

                        Timber.d("ChannelSwitcherV2ViewModel: Loaded ${channels.size} channels (category='$currentCategory')")
                        _uiState.update { it.copy(channels = channels, isLoading = false) }
                    }
                    is Result.Error -> {
                        Timber.e("Failed to load channels: ${result.exception.message}")
                        _uiState.update { it.copy(isLoading = false, error = result.exception.message) }
                    }
                    else -> {
                        _uiState.update { it.copy(isLoading = false) }
                    }
                }
            } catch (e: Exception) {
                Timber.e(e, "Exception loading channels")
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    /**
     * Toggle favorite and persist via UserPreferencesManager
     */
    fun toggleFavorite(channelId: String) {
        viewModelScope.launch {
            val currentSet = _uiState.value.favorites.toMutableSet()
            if (currentSet.contains(channelId)) {
                try {
                    userPreferencesManager.removeFavorite(channelId)
                    currentSet.remove(channelId)
                } catch (e: Exception) {
                    Timber.e(e, "Failed to remove favorite")
                }
            } else {
                try {
                    userPreferencesManager.addFavorite(channelId)
                    currentSet.add(channelId)
                } catch (e: Exception) {
                    Timber.e(e, "Failed to add favorite")
                }
            }
            _uiState.update { it.copy(favorites = currentSet.toSet()) }
        }
    }

    /**
     * Load multi-channel EPG for the given channel IDs using ChannelsRepository
     */
    fun loadEPGForChannels(channelIds: List<String>, date: String? = null) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val result = channelsRepository.getMultiChannelEPG(channelIds, date)
                when (result) {
                    is Result.Success -> {
                        val now = Instant.now()
                        val filtered = result.data.mapValues { (_, data) ->
                            data.copy(
                                programs = data.programs.filter { p ->
                                    runCatching { Instant.parse(p.endTime) }.getOrNull()?.isAfter(now) ?: true
                                }
                            )
                        }
                        
                        // Compute Now/Next maps asynchronously
                        val nowMap = mutableMapOf<String, EPGProgram?>()
                        val nextMap = mutableMapOf<String, EPGProgram?>()
                        filtered.forEach { (channelId, data) ->
                            val live = data.programs.find { it.isLive }
                            nowMap[channelId] = live
                            val nextProgram = data.programs.filter { !it.isLive }.sortedBy { it.startTime }.firstOrNull()
                            nextMap[channelId] = nextProgram
                        }

                        _uiState.update { 
                            it.copy(
                                epgData = filtered, 
                                nowMap = nowMap,
                                nextMap = nextMap,
                                isLoading = false
                            ) 
                        }
                        Timber.d("Loaded EPG for ${filtered.size} channels")
                    }
                    is Result.Error -> {
                        Timber.e("Failed to load multi-channel EPG: ${result.exception.message}")
                        _uiState.update { it.copy(isLoading = false, error = result.exception.message) }
                    }
                    else -> {
                        _uiState.update { it.copy(isLoading = false) }
                    }
                }
            } catch (e: Exception) {
                Timber.e(e, "Exception loading multi-channel EPG")
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    /**
     * Persist last viewed channel for overlay/LiveTV continuity
     */
    fun saveLastViewedChannel(channelId: String?) {
        viewModelScope.launch {
            try {
                userPreferencesManager.saveLastViewedChannel(channelId)
            } catch (e: Exception) {
                Timber.e(e, "Failed to persist last viewed channel")
            }
        }
    }

    /**
     * Compute Now / Next program maps for the overlay UI
     * Note: This is now handled automatically in loadEPGForChannels and exposed via uiState
     * Kept for compatibility if needed, but returns current state maps
     */
    fun computeNowNext(): Pair<Map<String, EPGProgram?>, Map<String, EPGProgram?>> {
        return Pair(_uiState.value.nowMap, _uiState.value.nextMap)
    }

    /**
     * Quick accessor for channels list
     */
    fun getChannels(): List<ContentStream> = uiState.value.channels
}
