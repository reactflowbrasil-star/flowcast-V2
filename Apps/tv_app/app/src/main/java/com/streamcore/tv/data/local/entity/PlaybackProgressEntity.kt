package com.streamcore.tv.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Entity to store playback progress for VOD content
 */
@Entity(tableName = "playback_progress")
data class PlaybackProgressEntity(
    @PrimaryKey
    val contentId: String,
    val position: Long,
    val duration: Long,
    val timestamp: Long, // When this progress was saved
    val title: String? = null,
    val imageUrl: String? = null,
    val seasonId: String? = null,
    val episodeId: String? = null
)
