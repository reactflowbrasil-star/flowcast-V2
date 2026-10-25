package com.streamcore.tv.domain.repository

import com.streamcore.tv.data.local.entity.PlaybackProgressEntity
import kotlinx.coroutines.flow.Flow

interface PlaybackRepository {
    suspend fun saveProgress(progress: PlaybackProgressEntity)
    suspend fun getProgress(contentId: String): PlaybackProgressEntity?
    fun getProgressFlow(contentId: String): Flow<PlaybackProgressEntity?>
    fun getAllProgress(): Flow<List<PlaybackProgressEntity>>
    suspend fun deleteProgress(contentId: String)
}
