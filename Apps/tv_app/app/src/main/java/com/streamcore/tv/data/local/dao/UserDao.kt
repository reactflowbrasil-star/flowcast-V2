package com.streamcore.tv.data.local.dao

import androidx.room.*
import com.streamcore.tv.data.local.entity.UserEntity
import kotlinx.coroutines.flow.Flow

/**
 * DAO for user-related database operations
 */



@Dao
interface UserDao {
    
    // ========================================
    // USER PROFILE OPERATIONS
    // ========================================
    
    @Query("SELECT * FROM user_profile LIMIT 1")
    fun getUserProfile(): Flow<UserEntity?>
    
    @Query("SELECT * FROM user_profile WHERE id = :userId")
    suspend fun getUserById(userId: String): UserEntity?
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertUser(user: UserEntity)
    
    @Update
    suspend fun updateUser(user: UserEntity)
    
    @Delete
    suspend fun deleteUser(user: UserEntity)
    
    @Query("DELETE FROM user_profile")
    suspend fun clearUserProfile()
    
    // ========================================
    // USER PREFERENCES OPERATIONS
    // ========================================
    
    @Query("UPDATE user_profile SET language = :language WHERE id = :userId")
    suspend fun updateLanguage(userId: String, language: String)
    
    @Query("UPDATE user_profile SET autoplay = :enabled WHERE id = :userId")
    suspend fun updateAutoplay(userId: String, enabled: Boolean)
    
    @Query("UPDATE user_profile SET quality = :quality WHERE id = :userId")
    suspend fun updateQuality(userId: String, quality: String)
    
    @Query("UPDATE user_profile SET subtitles = :enabled WHERE id = :userId")
    suspend fun updateSubtitles(userId: String, enabled: Boolean)
    
    @Query("UPDATE user_profile SET lastUpdated = :timestamp WHERE id = :userId")
    suspend fun updateLastModified(userId: String, timestamp: Long)
}
