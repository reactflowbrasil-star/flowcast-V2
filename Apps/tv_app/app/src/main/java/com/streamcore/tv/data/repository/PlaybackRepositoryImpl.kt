package com.streamcore.tv.data.repository

import com.streamcore.tv.data.local.dao.PlaybackProgressDao
import com.streamcore.tv.data.local.entity.PlaybackProgressEntity
import com.streamcore.tv.domain.repository.PlaybackRepository
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

class PlaybackRepositoryImpl @Inject constructor(
    private val playbackProgressDao: PlaybackProgressDao
) : PlaybackRepository {

    override suspend fun saveProgress(progress: PlaybackProgressEntity) {
        playbackProgressDao.saveProgress(progress)
    }

    override suspend fun getProgress(contentId: String): PlaybackProgressEntity? {
        return playbackProgressDao.getProgress(contentId)
    }

    override fun getProgressFlow(contentId: String): Flow<PlaybackProgressEntity?> {
        return playbackProgressDao.getProgressFlow(contentId)
    }

    override fun getAllProgress(): Flow<List<PlaybackProgressEntity>> {
        return playbackProgressDao.getAllProgress()
    }

    override suspend fun deleteProgress(contentId: String) {
        playbackProgressDao.deleteProgress(contentId)
    }
}
