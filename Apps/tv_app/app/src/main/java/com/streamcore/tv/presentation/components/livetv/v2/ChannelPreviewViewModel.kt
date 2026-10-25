package com.streamcore.tv.presentation.components.livetv.v2

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.streamcore.tv.domain.model.ContentStream
import com.streamcore.tv.domain.model.Result
import com.streamcore.tv.domain.usecase.content.GetContentStreamUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

@HiltViewModel
class ChannelPreviewViewModel @Inject constructor(
    private val getContentStreamUseCase: GetContentStreamUseCase
) : ViewModel() {

    private val _previewStream = MutableStateFlow<ContentStream?>(null)
    val previewStream: StateFlow<ContentStream?> = _previewStream.asStateFlow()

    /**
     * Load full stream info for preview when channel list item doesn't include streamUrl.
     */
    fun loadPreview(channelId: String) {
        Timber.d("ChannelPreviewViewModel: loadPreview called for channelId=$channelId")
        viewModelScope.launch {
            try {
                Timber.d("ChannelPreviewViewModel: Calling getContentStreamUseCase for $channelId")
                when (val res = getContentStreamUseCase(channelId)) {
                    is Result.Success -> {
                        val stream = res.data
                        Timber.d("ChannelPreviewViewModel: ✅ SUCCESS - Loaded preview for $channelId")
                        Timber.d("ChannelPreviewViewModel:    title=${stream.title}")
                        Timber.d("ChannelPreviewViewModel:    streamUrl=${stream.streamUrl.take(80)}")
                        Timber.d("ChannelPreviewViewModel:    drmType=${stream.drmType}")
                        _previewStream.value = stream
                    }
                    is Result.Error -> {
                        Timber.e(res.exception, "ChannelPreviewViewModel: ❌ ERROR - Failed to load preview for $channelId")
                    }
                    else -> {
                        Timber.d("ChannelPreviewViewModel: Loading state for $channelId")
                    }
                }
            } catch (e: Exception) {
                Timber.e(e, "ChannelPreviewViewModel: ❌ EXCEPTION loading preview for $channelId")
            }
        }
    }
}