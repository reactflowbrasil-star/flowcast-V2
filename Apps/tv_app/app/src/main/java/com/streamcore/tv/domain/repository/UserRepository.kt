package com.streamcore.tv.domain.repository

import com.streamcore.tv.domain.model.*
import kotlinx.coroutines.flow.Flow

/**
 * Repository interface for user operations
 * 
 * Handles:
 * - User profile management
 * - Favorites and watch history
 * - User preferences
 * - Device management
 */
interface UserRepository {
    
    // ========================================
    // USER PROFILE
    // ========================================
    
    /**
     * Get user profile
     */
    suspend fun getUserProfile(): Result<UserProfile>
    
    /**
     * Update user profile
     */
    suspend fun updateUserProfile(profile: UserProfile): Result<UserProfile>
    
    /**
     * Get user preferences as Flow
     */
    fun getUserPreferences(): Flow<UserPreferences>
    
    /**
     * Update user preferences
     */
    suspend fun updateUserPreferences(preferences: UserPreferences): Result<Unit>
    
    // ========================================
    // FAVORITES
    // ========================================
    
    /**
     * Get user favorites
     */
    suspend fun getFavorites(): Result<List<FavoriteItem>>
    
    /**
     * Add content to favorites
     */
    suspend fun addToFavorites(contentId: String): Result<Unit>
    
    /**
     * Remove content from favorites
     */
    suspend fun removeFromFavorites(contentId: String): Result<Unit>
    
    /**
     * Check if content is in favorites
     */
    suspend fun isFavorite(contentId: String): Result<Boolean>
    
    /**
     * Get favorites as Flow for real-time updates
     */
    fun getFavoritesFlow(): Flow<List<FavoriteItem>>
    
    // ========================================
    // WATCH HISTORY
    // ========================================
    
    /**
     * Get watch history
     */
    suspend fun getWatchHistory(): Result<List<WatchHistoryItem>>
    
    /**
     * Update watch progress for content
     */
    suspend fun updateWatchProgress(
        contentId: String,
        progress: Float,
        duration: Long
    ): Result<Unit>
    
    /**
     * Get watch progress for specific content
     */
    suspend fun getWatchProgress(contentId: String): Result<WatchProgress?>
    
    /**
     * Get continue watching list from server
     */
    suspend fun getContinueWatching(): Result<List<WatchHistoryItem>>
    
    /**
     * Clear watch history
     */
    suspend fun clearWatchHistory(): Result<Unit>
    
    // ========================================
    // DEVICE MANAGEMENT
    // ========================================
    
    /**
     * Get user devices
     */
    suspend fun getUserDevices(): Result<List<DeviceInfo>>
    
    /**
     * Remove a device
     */
    suspend fun removeDevice(deviceId: String): Result<Unit>
    
    /**
     * Update device name
     */
    suspend fun updateDeviceName(deviceId: String, name: String): Result<Unit>
    
    // ========================================
    // LOCAL CACHE
    // ========================================

    /**
     * Cache user data locally
     */
    suspend fun cacheUserData(profile: UserProfile): Result<Unit>

    /**
     * Get cached user data
     */
    fun getCachedUserData(): Flow<UserProfile?>

    /**
     * Clear user cache
     */
    suspend fun clearUserCache(): Result<Unit>
}
