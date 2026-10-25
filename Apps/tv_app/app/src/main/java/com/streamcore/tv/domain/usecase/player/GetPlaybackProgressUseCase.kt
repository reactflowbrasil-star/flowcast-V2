package com.streamcore.tv.domain.usecase.player

import com.streamcore.tv.data.local.entity.PlaybackProgressEntity
import com.streamcore.tv.domain.repository.PlaybackRepository
import javax.inject.Inject

class GetPlaybackProgressUseCase @Inject constructor(
    private val repository: PlaybackRepository
) {
    suspend operator fun invoke(contentId: String): PlaybackProgressEntity? {
        return repository.getProgress(contentId)
    }
}
