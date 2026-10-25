package com.streamcore.tv.presentation.screens.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.streamcore.tv.R
import com.streamcore.tv.core.utils.StringProvider
import com.streamcore.tv.data.remote.dto.ScanFolderRequestDto
import com.streamcore.tv.data.remote.dto.ScanFolderResultDto
import com.streamcore.tv.domain.repository.ContentRepository
import com.streamcore.tv.core.error.ErrorHandler
import com.streamcore.tv.core.utils.logd
import com.streamcore.tv.core.utils.loge
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import okhttp3.ResponseBody
import retrofit2.Response
import javax.inject.Inject

@HiltViewModel
class ScanFoldersViewModel @Inject constructor(
    private val contentRepository: ContentRepository,
    private val errorHandler: ErrorHandler,
    private val stringProvider: StringProvider
) : ViewModel() {

    private val _uiState = MutableStateFlow(ScanFoldersUiState())
    val uiState: StateFlow<ScanFoldersUiState> = _uiState

    fun updateRootPath(path: String) {
        _uiState.value = _uiState.value.copy(rootPath = path)
    }

    fun updateMedia(media: String) {
        _uiState.value = _uiState.value.copy(media = media)
    }

    fun updateDuplicatePolicy(policy: String) {
        _uiState.value = _uiState.value.copy(duplicatePolicy = policy)
    }

    fun updateAddSubs(enabled: Boolean) {
        _uiState.value = _uiState.value.copy(addSubs = enabled)
    }

    fun scan() {
        val state = _uiState.value
        if (state.rootPath.isBlank()) {
            _uiState.value = state.copy(message = stringProvider.getString(R.string.scan_root_path_required))
            return
        }

        viewModelScope.launch {
            _uiState.value = state.copy(isScanning = true, message = null, lastResult = null, logs = emptyList())
            try {
                val req = ScanFolderRequestDto(
                    rootPath = state.rootPath,
                    media = state.media,
                    duplicatePolicy = state.duplicatePolicy,
                    addSubs = state.addSubs
                )
                val resp: Response<ScanFolderResultDto> = contentRepository.scanFolderIngest(req)
                if (resp.isSuccessful && resp.body() != null) {
                    val body = resp.body()!!
                    _uiState.value = _uiState.value.copy(
                        isScanning = false,
                        lastResult = body,
                        logs = body.logs,
                        message = stringProvider.getString(
                            R.string.scan_completed_items,
                            body.moviesCreated + body.seriesCreated
                        )
                    )
                    logd("Scan completed: $body")
                } else {
                    val errorMsg = try {
                        resp.errorBody()?.string() ?: "HTTP ${resp.code()} - ${resp.message()}"
                    } catch (e: Exception) {
                        "HTTP ${resp.code()} - ${resp.message()}"
                    }
                    _uiState.value = _uiState.value.copy(
                        isScanning = false,
                        message = errorMsg
                    )
                    loge("Scan API failed: $errorMsg")
                }
            } catch (e: Exception) {
                val err = errorHandler.getErrorMessage(e)
                _uiState.value = _uiState.value.copy(isScanning = false, message = err)
                loge("Scan exception: $err", e)
            }
        }
    }
}

data class ScanFoldersUiState(
    val rootPath: String = "",
    val media: String? = "mixed", // "movies" | "series" | "mixed"
    val duplicatePolicy: String? = "omit", // "omit" | "replace" | "allow"
    val addSubs: Boolean = true,
    val isScanning: Boolean = false,
    val lastResult: ScanFolderResultDto? = null,
    val logs: List<String> = emptyList(),
    val message: String? = null
)
