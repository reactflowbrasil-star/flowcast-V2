package com.streamcore.tv.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * User entity for Room database
 */
@Entity(tableName = "user_profile")
data class UserEntity(
    @PrimaryKey
    val id: String,
    val username: String,
    val email: String?,
    val displayName: String?,
    val avatarUrl: String?,
    val isActive: Boolean = true,
    val createdAt: Long = System.currentTimeMillis(),
    val lastLoginAt: Long? = null,
    val preferences: String? = null, // JSON string for user preferences
    val language: String? = null,
    val autoplay: Boolean = true,
    val quality: String? = null,
    val subtitles: Boolean = false,
    val lastUpdated: Long = System.currentTimeMillis()
)
