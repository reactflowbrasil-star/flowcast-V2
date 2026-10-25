package com.streamcore.tv.data.local.dao

import androidx.room.*
import com.streamcore.tv.data.local.entity.*
import kotlinx.coroutines.flow.Flow

/**
 * DAO for content-related database operations
 */
@Dao
interface ContentDao {
    
    // ========================================
    // CONTENT OPERATIONS
    // ========================================
    
    @Query("SELECT * FROM content ORDER BY cachedAt DESC")
    fun getAllContent(): Flow<List<ContentEntity>>
    
    @Query("SELECT * FROM content WHERE id = :contentId")
    suspend fun getContentById(contentId: String): ContentEntity?
    
    @Query("SELECT * FROM content WHERE type = :type ORDER BY cachedAt DESC")
    suspend fun getContentByType(type: String): List<ContentEntity>
    
    @Query(
        "SELECT * FROM content " +
            "WHERE LOWER(title) LIKE '%' || LOWER(:query) || '%' " +
            "OR LOWER(IFNULL(description, '')) LIKE '%' || LOWER(:query) || '%'"
    )
    suspend fun searchContent(query: String): List<ContentEntity>
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertContent(content: ContentEntity)
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAllContent(content: List<ContentEntity>)
    
    @Delete
    suspend fun deleteContent(content: ContentEntity)
    
    @Query("DELETE FROM content")
    suspend fun clearAllContent()
    
    @Query("DELETE FROM content WHERE cachedAt < :timestamp")
    suspend fun deleteOldContent(timestamp: Long)
    
    // ========================================
    // CATEGORY OPERATIONS
    // ========================================
    
    @Query("SELECT * FROM categories ORDER BY name ASC")
    fun getAllCategories(): Flow<List<CategoryEntity>>
    
    @Query("SELECT * FROM categories WHERE id = :categoryId")
    suspend fun getCategoryById(categoryId: String): CategoryEntity?
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCategory(category: CategoryEntity)
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAllCategories(categories: List<CategoryEntity>)
    
    @Delete
    suspend fun deleteCategory(category: CategoryEntity)
    
    @Query("DELETE FROM categories")
    suspend fun clearAllCategories()
    
    // ========================================
    // FAVORITES OPERATIONS
    // ========================================
    
    @Query("""
        SELECT c.* FROM content c 
        INNER JOIN favorites f ON c.id = f.contentId 
        ORDER BY f.addedAt DESC
    """)
    fun getFavoriteContent(): Flow<List<ContentEntity>>
    
    @Query("SELECT * FROM favorites ORDER BY addedAt DESC")
    fun getAllFavorites(): Flow<List<FavoriteEntity>>
    
    @Query("SELECT * FROM favorites WHERE contentId = :contentId")
    suspend fun getFavorite(contentId: String): FavoriteEntity?
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertFavorite(favorite: FavoriteEntity)
    
    @Delete
    suspend fun deleteFavorite(favorite: FavoriteEntity)
    
    @Query("DELETE FROM favorites WHERE contentId = :contentId")
    suspend fun deleteFavoriteByContentId(contentId: String)
    
    @Query("DELETE FROM favorites")
    suspend fun clearAllFavorites()
    
    // ========================================
    // WATCH HISTORY OPERATIONS
    // ========================================
    
    @Query("""
        SELECT c.* FROM content c 
        INNER JOIN watch_history w ON c.id = w.contentId 
        WHERE w.progress > 0.01 AND w.progress < 0.95
        ORDER BY w.watchedAt DESC
    """)
    fun getContinueWatchingContent(): Flow<List<ContentEntity>>
    
    @Query("SELECT * FROM watch_history ORDER BY watchedAt DESC")
    fun getAllWatchHistory(): Flow<List<WatchHistoryEntity>>
    
    @Query("SELECT * FROM watch_history WHERE contentId = :contentId")
    suspend fun getWatchHistory(contentId: String): WatchHistoryEntity?
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertWatchHistory(watchHistory: WatchHistoryEntity)
    
    @Delete
    suspend fun deleteWatchHistory(watchHistory: WatchHistoryEntity)
    
    @Query("DELETE FROM watch_history WHERE contentId = :contentId")
    suspend fun deleteWatchHistoryByContentId(contentId: String)
    
    @Query("DELETE FROM watch_history")
    suspend fun clearAllWatchHistory()
    
    @Query("DELETE FROM watch_history WHERE lastUpdated < :timestamp")
    suspend fun deleteOldWatchHistory(timestamp: Long)
}
