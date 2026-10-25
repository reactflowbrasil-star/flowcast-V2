package com.streamcore.tv.domain.usecase.player

import com.streamcore.tv.data.local.entity.PlaybackProgressEntity
import com.streamcore.tv.domain.repository.PlaybackRepository
import javax.inject.Inject

class SavePlaybackProgressUseCase @Inject constructor(
    private val repository: PlaybackRepository
) {
    suspend operator fun invoke(
        contentId: String,
        position: Long,
        duration: Long,
        title: String? = null,
        imageUrl: String? = null
    ) {
        if (position > 0 && duration > 0) {
            val progress = PlaybackProgressEntity(
                contentId = contentId,
                position = position,
                duration = duration,
                timestamp = System.currentTimeMillis(),
                title = title,
                imageUrl = imageUrl
            )
            repository.saveProgress(progress)
        }
    }
}
