package com.streamcore.tv.presentation.screens.livetv

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.streamcore.tv.domain.model.Result
import com.streamcore.tv.domain.model.EPGProgram
import com.streamcore.tv.domain.model.EPGData
import com.streamcore.tv.domain.repository.ChannelsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import java.time.Instant

/**
 * ViewModel for EPG (Electronic Program Guide) functionality
 */
@HiltViewModel
class EPGViewModel @Inject constructor(
    private val channelsRepository: ChannelsRepository,
    private val tokenManager: com.streamcore.tv.data.local.datastore.TokenManager,
    private val userAgentManager: com.streamcore.tv.core.security.DynamicUserAgentManager
) : ViewModel() {
    
    private val _uiState = MutableStateFlow(EPGUiState())
    val uiState: StateFlow<EPGUiState> = _uiState.asStateFlow()
    
    private val _programs = MutableStateFlow<List<EPGProgram>>(emptyList())
    val programs: StateFlow<List<EPGProgram>> = _programs.asStateFlow()
    
    private val _epgData = MutableStateFlow<Map<String, EPGData>>(emptyMap())
    val epgData: StateFlow<Map<String, EPGData>> = _epgData.asStateFlow()
    
    /**
     * Create DrmHelper with injected dependencies
     */
    fun createDrmHelper(): com.streamcore.tv.presentation.player.DrmHelper {
        return com.streamcore.tv.presentation.player.DrmHelper(tokenManager, userAgentManager)
    }

    /**
     * Load EPG data for a specific channel (merges into existing map)
     */
    fun loadEPGForChannel(channelId: String, date: String? = null, hours: Int = 48) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            
            try {
                Timber.d("EPGViewModel: Loading EPG for channel $channelId")
                
                val result = channelsRepository.getEPG(channelId, date, hours)
                
                when (result) {
                    is Result.Success -> {
                        val now = Instant.now()
                        val epgData = result.data.copy(
                            programs = result.data.programs.filter { p ->
                                runCatching { Instant.parse(p.endTime) }.getOrNull()?.isAfter(now) ?: true
                            }
                        )
                        _programs.update { epgData.programs }
                        // MERGE into existing map instead of replacing
                        _epgData.update { currentData ->
                            val newMap = currentData.toMutableMap()
                            newMap[channelId] = epgData
                            Timber.d("EPGViewModel: Merged EPG for $channelId, total channels in map: ${newMap.size}")
                            newMap
                        }
                        _uiState.update { it.copy(isLoading = false) }
                        Timber.d("EPGViewModel: Successfully loaded ${epgData.programs.size} programs for $channelId")
                    }
                    is Result.Error -> {
                        val errorMessage = result.exception.message ?: "Failed to load EPG"
                        _uiState.update { it.copy(isLoading = false, error = errorMessage) }
                        Timber.e("EPGViewModel: Error loading EPG: $errorMessage")
                    }
                    is Result.Loading -> {
                        // Keep loading state
                    }
                }
            } catch (e: Exception) {
                val errorMessage = e.message ?: "Unknown error loading EPG"
                _uiState.update { it.copy(isLoading = false, error = errorMessage) }
                Timber.e(e, "EPGViewModel: Exception loading EPG")
            }
        }
    }
    
    /**
     * Load EPG data for multiple channels (merges into existing map)
     */
    fun loadMultiChannelEPG(channelIds: List<String>, date: String? = null) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            
            try {
                Timber.d("EPGViewModel: Loading EPG for ${channelIds.size} channels")
                
                val result = channelsRepository.getMultiChannelEPG(channelIds, date)
                
                when (result) {
                    is Result.Success -> {
                        val now = Instant.now()
                        val filtered = result.data.mapValues { (cid, data) ->
                            data.copy(
                                programs = data.programs.filter { p ->
                                    runCatching { Instant.parse(p.endTime) }.getOrNull()?.isAfter(now) ?: true
                                }
                            )
                        }
                        // MERGE into existing map instead of replacing
                        _epgData.update { currentData ->
                            val newMap = currentData.toMutableMap()
                            newMap.putAll(filtered)
                            Timber.d("EPGViewModel: Merged multi-channel EPG, loaded ${filtered.size} channels, total in map: ${newMap.size}")
                            newMap
                        }
                        _uiState.update { it.copy(isLoading = false) }
                        Timber.d("EPGViewModel: Successfully loaded EPG for ${filtered.size} channels (past filtered)")
                    }
                    is Result.Error -> {
                        val errorMessage = result.exception.message ?: "Failed to load multi-channel EPG"
                        _uiState.update { it.copy(isLoading = false, error = errorMessage) }
                        Timber.e("EPGViewModel: Error loading multi-channel EPG: $errorMessage")
                    }
                    is Result.Loading -> {
                        // Keep loading state
                    }
                }
            } catch (e: Exception) {
                val errorMessage = e.message ?: "Unknown error loading multi-channel EPG"
                _uiState.update { it.copy(isLoading = false, error = errorMessage) }
                Timber.e(e, "EPGViewModel: Exception loading multi-channel EPG")
            }
        }
    }
    
    /**
     * Get current program for a channel
     */
    fun getCurrentProgram(channelId: String) {
        viewModelScope.launch {
            try {
                val result = channelsRepository.getCurrentProgram(channelId)
                when (result) {
                    is Result.Success -> {
                        _uiState.update { it.copy(currentProgram = result.data) }
                    }
                    is Result.Error -> {
                        Timber.e("EPGViewModel: Error getting current program: ${result.exception.message}")
                    }
                    is Result.Loading -> {
                        // Keep current state
                    }
                }
            } catch (e: Exception) {
                Timber.e(e, "EPGViewModel: Exception getting current program")
            }
        }
    }
    
    /**
     * Get next program for a channel
     */
    fun getNextProgram(channelId: String) {
        viewModelScope.launch {
            try {
                val result = channelsRepository.getNextProgram(channelId)
                when (result) {
                    is Result.Success -> {
                        _uiState.update { it.copy(nextProgram = result.data) }
                    }
                    is Result.Error -> {
                        Timber.e("EPGViewModel: Error getting next program: ${result.exception.message}")
                    }
                    is Result.Loading -> {
                        // Keep current state
                    }
                }
            } catch (e: Exception) {
                Timber.e(e, "EPGViewModel: Exception getting next program")
            }
        }
    }
    
    /**
     * Get programs by time range
     */
    fun getProgramsByTimeRange(channelId: String, startTime: String, endTime: String) {
        viewModelScope.launch {
            try {
                val result = channelsRepository.getProgramsByTimeRange(channelId, startTime, endTime)
                when (result) {
                    is Result.Success -> {
                        _programs.update { result.data }
                        _uiState.update { it.copy(isLoading = false) }
                    }
                    is Result.Error -> {
                        val errorMessage = result.exception.message ?: "Failed to load programs"
                        _uiState.update { it.copy(isLoading = false, error = errorMessage) }
                        Timber.e("EPGViewModel: Error getting programs by time range: $errorMessage")
                    }
                    is Result.Loading -> {
                        _uiState.update { it.copy(isLoading = true) }
                    }
                }
            } catch (e: Exception) {
                val errorMessage = e.message ?: "Unknown error loading programs"
                _uiState.update { it.copy(isLoading = false, error = errorMessage) }
                Timber.e(e, "EPGViewModel: Exception getting programs by time range")
            }
        }
    }
    
    /**
     * Clear EPG cache
     */
    fun clearCache() {
        viewModelScope.launch {
            try {
                channelsRepository.clearEPGCache()
                _programs.update { emptyList() }
                _epgData.update { emptyMap() }
                _uiState.update { EPGUiState() }
                Timber.d("EPGViewModel: Cache cleared")
            } catch (e: Exception) {
                Timber.e(e, "EPGViewModel: Error clearing cache")
            }
        }
    }
    
    /**
     * Refresh EPG data
     */
    fun refresh(channelId: String? = null) {
        if (channelId != null) {
            loadEPGForChannel(channelId)
        } else {
            // Refresh all loaded channels
            val currentChannels = _epgData.value.keys.toList()
            if (currentChannels.isNotEmpty()) {
                loadMultiChannelEPG(currentChannels)
            }
        }
    }

    /**
     * Check EPG configuration status for debugging
     */
    fun checkEPGConfiguration(): String {
        val loadedChannels = _epgData.value.size
        val totalPrograms = _epgData.value.values.sumOf { it.programs.size }
        val hasError = _uiState.value.error != null
        val isLoading = _uiState.value.isLoading

        return "EPG Config: Loaded=$loadedChannels channels, Programs=$totalPrograms, Error=${hasError}, Loading=$isLoading"
    }

    /**
     * Get diagnostic information about EPG state
     */
    fun getEPGDiagnosticInfo(): String {
        val loadedChannels = _epgData.value.keys.joinToString(", ")
        val totalPrograms = _epgData.value.values.sumOf { it.programs.size }
        val currentProgram = _uiState.value.currentProgram?.title ?: "None"
        val nextProgram = _uiState.value.nextProgram?.title ?: "None"
        val selectedDate = _uiState.value.selectedDate

        return "EPG Diagnostics: Date=$selectedDate, Current='$currentProgram', Next='$nextProgram', Channels=[$loadedChannels], TotalPrograms=$totalPrograms"
    }
}

/**
 * UI State for EPG functionality
 */
data class EPGUiState(
    val isLoading: Boolean = false,
    val error: String? = null,
    val currentProgram: EPGProgram? = null,
    val nextProgram: EPGProgram? = null,
    val selectedDate: String = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE)
)
