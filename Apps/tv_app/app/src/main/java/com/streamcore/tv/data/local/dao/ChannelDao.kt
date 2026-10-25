package com.streamcore.tv.data.local.dao

import androidx.room.*
import com.streamcore.tv.data.local.entity.ChannelEntity
import com.streamcore.tv.data.local.entity.EPGProgramEntity
import kotlinx.coroutines.flow.Flow

/**
 * DAO for channel and EPG database operations
 */
@Dao
interface ChannelDao {
    
    // ========================================
    // CHANNEL OPERATIONS
    // ========================================
    
    @Query("SELECT * FROM channels WHERE isActive = 1 ORDER BY name ASC")
    fun getAllActiveChannels(): Flow<List<ChannelEntity>>
    
    @Query("SELECT * FROM channels ORDER BY name ASC")
    fun getAllChannels(): Flow<List<ChannelEntity>>
    
    @Query("SELECT * FROM channels WHERE id = :channelId")
    suspend fun getChannelById(channelId: String): ChannelEntity?
    
    @Query("SELECT * FROM channels WHERE category = :category AND isActive = 1 ORDER BY name ASC")
    suspend fun getChannelsByCategory(category: String): List<ChannelEntity>
    
    @Query("SELECT DISTINCT category FROM channels WHERE isActive = 1 ORDER BY category ASC")
    suspend fun getChannelCategories(): List<String>
    
    @Query("SELECT * FROM channels WHERE name LIKE '%' || :query || '%' AND isActive = 1")
    suspend fun searchChannels(query: String): List<ChannelEntity>
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertChannel(channel: ChannelEntity)
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAllChannels(channels: List<ChannelEntity>)
    
    @Delete
    suspend fun deleteChannel(channel: ChannelEntity)
    
    @Query("DELETE FROM channels")
    suspend fun clearAllChannels()
    
    @Query("DELETE FROM channels WHERE cachedAt < :timestamp")
    suspend fun deleteOldChannels(timestamp: Long)
    
    // ========================================
    // EPG OPERATIONS
    // ========================================
    
    @Query("SELECT * FROM epg_programs WHERE channelId = :channelId ORDER BY startTime ASC")
    fun getEPGForChannel(channelId: String): Flow<List<EPGProgramEntity>>
    
    @Query("""
        SELECT * FROM epg_programs 
        WHERE channelId = :channelId 
        AND startTime <= :currentTime 
        AND endTime > :currentTime
        LIMIT 1
    """)
    suspend fun getCurrentProgram(channelId: String, currentTime: String): EPGProgramEntity?
    
    @Query("""
        SELECT * FROM epg_programs 
        WHERE channelId = :channelId 
        AND startTime > :currentTime
        ORDER BY startTime ASC
        LIMIT 1
    """)
    suspend fun getNextProgram(channelId: String, currentTime: String): EPGProgramEntity?
    
    @Query("""
        SELECT * FROM epg_programs 
        WHERE channelId = :channelId 
        AND startTime >= :startTime 
        AND endTime <= :endTime
        ORDER BY startTime ASC
    """)
    suspend fun getProgramsByTimeRange(
        channelId: String,
        startTime: String,
        endTime: String
    ): List<EPGProgramEntity>
    
    @Query("SELECT * FROM epg_programs WHERE channelId IN (:channelIds) ORDER BY startTime ASC")
    suspend fun getEPGForMultipleChannels(channelIds: List<String>): List<EPGProgramEntity>
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertEPGProgram(program: EPGProgramEntity)
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAllEPGPrograms(programs: List<EPGProgramEntity>)
    
    @Delete
    suspend fun deleteEPGProgram(program: EPGProgramEntity)
    
    @Query("DELETE FROM epg_programs WHERE channelId = :channelId")
    suspend fun deleteEPGForChannel(channelId: String)
    
    @Query("DELETE FROM epg_programs")
    suspend fun clearAllEPG()
    
    @Query("DELETE FROM epg_programs WHERE cachedAt < :timestamp")
    suspend fun deleteOldEPG(timestamp: Long)
    
    @Query("DELETE FROM epg_programs WHERE endTime < :currentTime")
    suspend fun deletePastPrograms(currentTime: String)
}
