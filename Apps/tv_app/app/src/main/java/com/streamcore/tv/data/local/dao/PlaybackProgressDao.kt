package com.streamcore.tv.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.streamcore.tv.data.local.entity.PlaybackProgressEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface PlaybackProgressDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveProgress(progress: PlaybackProgressEntity)

    @Query("SELECT * FROM playback_progress WHERE contentId = :contentId")
    suspend fun getProgress(contentId: String): PlaybackProgressEntity?

    @Query("SELECT * FROM playback_progress WHERE contentId = :contentId")
    fun getProgressFlow(contentId: String): Flow<PlaybackProgressEntity?>

    @Query("SELECT * FROM playback_progress ORDER BY timestamp DESC")
    fun getAllProgress(): Flow<List<PlaybackProgressEntity>>

    @Query("DELETE FROM playback_progress WHERE contentId = :contentId")
    suspend fun deleteProgress(contentId: String)
    
    @Query("DELETE FROM playback_progress WHERE timestamp < :timestamp")
    suspend fun deleteOldProgress(timestamp: Long)
}
