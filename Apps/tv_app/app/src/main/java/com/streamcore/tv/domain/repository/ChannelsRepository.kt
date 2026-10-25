package com.streamcore.tv.domain.repository

import com.streamcore.tv.domain.model.*
import kotlinx.coroutines.flow.Flow

/**
 * Repository interface for live TV channels and EPG operations
 * 
 * Handles:
 * - Live TV channels management
 * - EPG (Electronic Program Guide) data
 * - Channel categories and navigation
 * - Live streaming information
 */
interface ChannelsRepository {
    
    // ========================================
    // CHANNELS
    // ========================================
    
    /**
     * Get all live TV channels
     */
    suspend fun getChannels(
        category: String? = null,
        page: Int = 1,
        limit: Int = 200
    ): Result<List<Channel>>
    
    /**
     * Get channel by ID
     */
    suspend fun getChannel(channelId: String): Result<Channel>
    
    /**
     * Get channels by category
     */
    suspend fun getChannelsByCategory(category: String): Result<List<Channel>>
    
    /**
     * Get channel categories
     */
    suspend fun getChannelCategories(): Result<List<ChannelCategory>>
    
    /**
     * Search channels
     */
    suspend fun searchChannels(query: String): Result<List<Channel>>
    
    /**
     * Get favorite channels
     */
    suspend fun getFavoriteChannels(): Result<List<Channel>>
    
    /**
     * Add channel to favorites
     */
    suspend fun addChannelToFavorites(channelId: String): Result<Unit>
    
    /**
     * Remove channel from favorites
     */
    suspend fun removeChannelFromFavorites(channelId: String): Result<Unit>
    
    // ========================================
    // EPG (Electronic Program Guide)
    // ========================================
    
    /**
     * Get EPG data for a specific channel
     */
    suspend fun getEPG(
        channelId: String,
        date: String? = null,
        hours: Int = 24
    ): Result<EPGData>
    
    /**
     * Get current program for a channel
     */
    suspend fun getCurrentProgram(channelId: String): Result<EPGProgram?>
    
    /**
     * Get next program for a channel
     */
    suspend fun getNextProgram(channelId: String): Result<EPGProgram?>
    
    /**
     * Get EPG for multiple channels
     */
    suspend fun getMultiChannelEPG(
        channelIds: List<String>,
        date: String? = null
    ): Result<Map<String, EPGData>>
    
    /**
     * Get programs by time range
     */
    suspend fun getProgramsByTimeRange(
        channelId: String,
        startTime: String,
        endTime: String
    ): Result<List<EPGProgram>>
    
    // ========================================
    // STREAMING
    // ========================================
    
    /**
     * Get stream info for a channel
     */
    suspend fun getStreamInfo(channelId: String): Result<StreamInfo>
    
    /**
     * Get available stream qualities for a channel
     */
    suspend fun getAvailableQualities(channelId: String): Result<List<VideoQuality>>
    
    /**
     * Update stream quality preference
     */
    suspend fun updateStreamQuality(
        channelId: String,
        quality: VideoQuality
    ): Result<Unit>
    
    // ========================================
    // CACHE AND OFFLINE
    // ========================================
    
    /**
     * Cache channels locally
     */
    suspend fun cacheChannels(channels: List<Channel>): Result<Unit>
    
    /**
     * Get cached channels
     */
    fun getCachedChannels(): Flow<List<Channel>>
    
    /**
     * Cache EPG data locally
     */
    suspend fun cacheEPGData(epgData: List<EPGData>): Result<Unit>
    
    /**
     * Get cached EPG data
     */
    fun getCachedEPGData(channelId: String): Flow<EPGData?>
    
    /**
     * Clear channels cache
     */
    suspend fun clearChannelsCache(): Result<Unit>
    
    /**
     * Clear EPG cache
     */
    suspend fun clearEPGCache(): Result<Unit>
    
    // ========================================
    // LIVE TV STATE
    // ========================================
    
    /**
     * Get current live TV state
     */
    fun getLiveTVState(): Flow<LiveTVState>
    
    /**
     * Update live TV state
     */
    suspend fun updateLiveTVState(state: LiveTVState): Result<Unit>
    
    /**
     * Switch to channel
     */
    suspend fun switchToChannel(channelId: String): Result<Unit>
}
