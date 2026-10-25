package com.streamcore.tv.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.TypeConverter
import androidx.room.TypeConverters
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken

/**
 * Room entities for content data
 */

@Entity(tableName = "content")
@TypeConverters(ContentConverters::class)
data class ContentEntity(
    @PrimaryKey
    val id: String,
    val title: String,
    val description: String?,
    val imageUrl: String?,
    val backdropUrl: String?,
    val duration: Long?,
    val year: Int?,
    val rating: Float?,
    val genres: List<String>,
    val type: String,
    val streamUrl: String?,
    val createdAt: String,
    val updatedAt: String,
    val lastUpdated: Long = System.currentTimeMillis(),
    val cachedAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "categories")
data class CategoryEntity(
    @PrimaryKey
    val id: String,
    val name: String,
    val slug: String,
    val description: String?,
    val imageUrl: String?,
    val contentCount: Int,
    val cachedAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "favorites")
data class FavoriteEntity(
    @PrimaryKey
    val contentId: String,
    val addedAt: String,
    val syncedAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "watch_history")
data class WatchHistoryEntity(
    @PrimaryKey
    val contentId: String,
    val watchedAt: String,
    val progress: Float,
    val duration: Long,
    val lastUpdated: Long = System.currentTimeMillis()
)

@Entity(tableName = "channels")
@TypeConverters(ContentConverters::class)
data class ChannelEntity(
    @PrimaryKey
    val id: String,
    val name: String,
    val logoUrl: String?,
    val streamUrl: String,
    val category: String,
    val isActive: Boolean,
    val cachedAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "epg_programs")
data class EPGProgramEntity(
    @PrimaryKey
    val id: String,
    val channelId: String,
    val title: String,
    val description: String?,
    val startTime: String,
    val endTime: String,
    val category: String?,
    val cachedAt: Long = System.currentTimeMillis()
)

/**
 * Type converters for Room database
 */
class ContentConverters {
    
    private val gson = Gson()
    
    @TypeConverter
    fun fromStringList(value: List<String>): String {
        return gson.toJson(value)
    }
    
    @TypeConverter
    fun toStringList(value: String): List<String> {
        val listType = object : TypeToken<List<String>>() {}.type
        return gson.fromJson(value, listType) ?: emptyList()
    }
}
