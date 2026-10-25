package com.streamcore.tv.data.remote.dto

import com.google.gson.annotations.SerializedName

/**
 * Data Transfer Objects for User API
 */

// ========================================
// USER PROFILE
// ========================================

data class UserProfileDto(
    @SerializedName("id")
    val id: String,
    @SerializedName("username")
    val username: String?,
    @SerializedName("email")
    val email: String?,
    @SerializedName("preferences")
    val preferences: UserPreferencesDto,
    @SerializedName("subscription")
    val subscription: SubscriptionInfoDto?,
    @SerializedName("devices")
    val devices: List<DeviceInfoDto>
)

data class UserPreferencesDto(
    @SerializedName("language")
    val language: String = "es",
    @SerializedName("autoplay")
    val autoplay: Boolean = true,
    @SerializedName("quality")
    val quality: String = "AUTO",
    @SerializedName("subtitles")
    val subtitles: Boolean = false
)

data class UserProfileResponseDto(
    @SerializedName("id")
    val id: Long,
    @SerializedName("username")
    val username: String,
    @SerializedName("email")
    val email: String?,
    @SerializedName("role")
    val role: String,
    @SerializedName("max_devices")
    val maxDevices: Int,
    @SerializedName("expires_at")
    val expiresAt: String?,
    @SerializedName("active")
    val active: Boolean,
    @SerializedName("created_at")
    val createdAt: String,
    @SerializedName("device_count")
    val deviceCount: Int,
    @SerializedName("subscribed_categories")
    val subscribedCategories: List<Long>?
)

data class ChangePasswordRequestDto(
    @SerializedName("current_password")
    val currentPassword: String,
    @SerializedName("new_password")
    val newPassword: String
)

data class UpdateProfileRequestDto(
    @SerializedName("email")
    val email: String?
)

data class SubscriptionInfoDto(
    @SerializedName("plan")
    val plan: String,
    @SerializedName("isActive")
    val isActive: Boolean,
    @SerializedName("expiresAt")
    val expiresAt: String?,
    @SerializedName("features")
    val features: List<String>
)

data class DeviceInfoDto(
    @SerializedName("id")
    val id: String,
    @SerializedName("name")
    val name: String,
    @SerializedName("type")
    val type: String,
    @SerializedName("lastActive")
    val lastActive: String,
    @SerializedName("isCurrentDevice")
    val isCurrentDevice: Boolean
)

data class UpdateUserProfileRequestDto(
    @SerializedName("username")
    val username: String?,
    @SerializedName("preferences")
    val preferences: UserPreferencesDto?
)

// ========================================
// FAVORITES
// ========================================

/**
 * Backend GET /api/user/favorites returns:
 * { success: true, data: { movies: [...], series: [...], channels: [...], ... } }
 */
data class FavoritesResponseDto(
    @SerializedName("success")
    val success: Boolean,
    @SerializedName("data")
    val data: FavoritesDataDto?
)

data class AddFavoriteRequestDto(
    @SerializedName("content_type")
    val contentType: String,
    @SerializedName("content_id")
    val contentId: String
)

data class FavoritesDataDto(
    @SerializedName("movies")
    val movies: List<String> = emptyList(),
    @SerializedName("series")
    val series: List<String> = emptyList(),
    @SerializedName("channels")
    val channels: List<String> = emptyList(),
    @SerializedName("music_tracks")
    val musicTracks: List<String> = emptyList(),
    @SerializedName("music_albums")
    val musicAlbums: List<String> = emptyList(),
    @SerializedName("music_artists")
    val musicArtists: List<String> = emptyList()
) {
    fun allIds(): List<String> = typedIds().map { it.contentId }

    fun typedIds(): List<TypedFavoriteIdDto> {
        return buildList {
            movies.forEach { add(TypedFavoriteIdDto(contentType = "movie", contentId = it)) }
            series.forEach { add(TypedFavoriteIdDto(contentType = "series", contentId = it)) }
            channels.forEach { add(TypedFavoriteIdDto(contentType = "channel", contentId = it)) }
            musicTracks.forEach { add(TypedFavoriteIdDto(contentType = "music_track", contentId = it)) }
            musicAlbums.forEach { add(TypedFavoriteIdDto(contentType = "music_album", contentId = it)) }
            musicArtists.forEach { add(TypedFavoriteIdDto(contentType = "music_artist", contentId = it)) }
        }
    }
}

data class TypedFavoriteIdDto(
    val contentType: String,
    val contentId: String
)

// ========================================
// WATCH HISTORY
// ========================================

// Backend response format for /api/user/history (confirmed in logs)
data class WatchHistoryItemDto(
    @SerializedName("id")
    val id: Long,
    @SerializedName("content_id")
    val contentId: Long? = null,
    @SerializedName("content_title")
    val contentTitle: String?,
    @SerializedName("content_type")
    val contentType: String?, // "movie", "series", "live_tv", etc.
    @SerializedName("episode_title")
    val episodeTitle: String?,
    @SerializedName("season_number")
    val seasonNumber: Int?,
    @SerializedName("episode_number")
    val episodeNumber: Int?,
    @SerializedName("start_timestamp")
    val startTimestamp: String?,
    @SerializedName("series_title")
    val seriesTitle: String?
)

data class WatchHistoryResponseDto(
    @SerializedName("success")
    val success: Boolean,
    @SerializedName("history")
    val history: List<WatchHistoryItemDto>,
    @SerializedName("total")
    val total: Int? = null,
    @SerializedName("page")
    val page: Int? = null,
    @SerializedName("limit")
    val limit: Int? = null,
    @SerializedName("total_pages")
    val totalPages: Int? = null
)

data class UpdateWatchProgressRequestDto(
    @SerializedName("contentId")
    val contentId: String,
    @SerializedName("progress")
    val progress: Float,
    @SerializedName("duration")
    val duration: Long
)

// ========================================
// WATCH PROGRESS (Resume functionality)
// ========================================

data class SaveWatchProgressRequestDto(
    @SerializedName("contentId")
    val contentId: Long,
    @SerializedName("contentType")
    val contentType: String? = null,
    @SerializedName("episodeId")
    val episodeId: Long? = null,
    @SerializedName("positionSeconds")
    val positionSeconds: Long,
    @SerializedName("durationSeconds")
    val durationSeconds: Long
)

data class WatchProgressDto(
    @SerializedName("content_id")
    val contentId: Long,
    @SerializedName("content_type")
    val contentType: String,
    @SerializedName("episode_id")
    val episodeId: Long?,
    @SerializedName("position_seconds")
    val positionSeconds: Long,
    @SerializedName("duration_seconds")
    val durationSeconds: Long,
    @SerializedName("progress_percent")
    val progressPercent: Double,
    @SerializedName("completed")
    val completed: Boolean,
    @SerializedName("updated_at")
    val updatedAt: String
)

data class WatchProgressResponseDto(
    @SerializedName("success")
    val success: Boolean,
    @SerializedName("progress")
    val progress: WatchProgressDto?
)

data class ContinueWatchingItemDto(
    @SerializedName("content_id")
    val contentId: Long,
    @SerializedName("content_type")
    val contentType: String,
    @SerializedName("episode_id")
    val episodeId: Long?,
    @SerializedName("position_seconds")
    val positionSeconds: Long,
    @SerializedName("duration_seconds")
    val durationSeconds: Long,
    @SerializedName("progress_percent")
    val progressPercent: Double,
    @SerializedName("updated_at")
    val updatedAt: String?,
    @SerializedName("title")
    val title: String?,
    @SerializedName("poster_url")
    val posterUrl: String?,
    @SerializedName("backdrop_url")
    val backdropUrl: String?
)

data class ContinueWatchingResponseDto(
    @SerializedName("success")
    val success: Boolean,
    @SerializedName("items")
    val items: List<ContinueWatchingItemDto>
)

// ========================================
// USER DEVICES
// ========================================

data class UserDevicesResponseDto(
    @SerializedName("devices")
    val devices: List<DeviceDto> = emptyList(),
    @SerializedName("max_devices")
    val maxDevices: Int? = null,
    @SerializedName("success")
    val success: Boolean? = null,
    @SerializedName("data")
    val data: List<DeviceDto>? = null,
    @SerializedName("message")
    val message: String? = null
)

data class DeviceDto(
    @SerializedName("id")
    val id: String? = null,
    @SerializedName(value = "name", alternate = ["device_name"])
    val name: String? = null,
    @SerializedName(value = "type", alternate = ["device_type"])
    val type: String? = null,
    @SerializedName(value = "registered_at", alternate = ["created_at"])
    val registeredAt: String? = null,
    @SerializedName(value = "last_used", alternate = ["last_active"])
    val lastUsed: String? = null,
    @SerializedName(value = "is_current_device", alternate = ["is_current"])
    val isCurrentDevice: Boolean = false,
    @SerializedName("device_id")
    val deviceId: String? = null,
    @SerializedName("app_version")
    val appVersion: String?,
    @SerializedName("os_version")
    val osVersion: String?
)

data class DeviceStatusResponseDto(
    @SerializedName("success")
    val success: Boolean? = null,
    @SerializedName("data")
    val data: DeviceStatusDto? = null,
    @SerializedName("current_devices")
    val currentDevices: Int? = null,
    @SerializedName("max_devices")
    val maxDevices: Int? = null,
    @SerializedName("has_space")
    val hasSpace: Boolean? = null,
    @SerializedName("devices")
    val devices: List<DeviceDto>? = null,
    @SerializedName("message")
    val message: String? = null
)

data class DeviceStatusDto(
    @SerializedName("current_devices")
    val currentDevices: Int,
    @SerializedName("max_devices")
    val maxDevices: Int,
    @SerializedName("has_space")
    val hasSpace: Boolean,
    @SerializedName("devices")
    val devices: List<DeviceDto>?
)

// Real backend response format for /api/user/devices
data class UserDevicesBackendResponseDto(
    @SerializedName("devices")
    val devices: List<BackendDeviceDto> = emptyList(),
    @SerializedName("max_devices")
    val maxDevices: Int? = null
)

data class BackendDeviceDto(
    @SerializedName("id")
    val id: Long? = null,
    @SerializedName("device_id")
    val deviceId: String? = null,
    @SerializedName(value = "device_name", alternate = ["name"])
    val deviceName: String? = null,
    @SerializedName("user_id")
    val userId: Long? = null,
    @SerializedName(value = "created_at", alternate = ["registered_at"])
    val createdAt: String? = null,
    @SerializedName(value = "last_active", alternate = ["last_used"])
    val lastActive: String? = null
)

// Response format for /api/devices endpoint that includes max_devices
data class UserDevicesWithLimitResponseDto(
    @SerializedName("devices")
    val devices: List<BackendDeviceDto> = emptyList(),
    @SerializedName("max_devices")
    val maxDevices: Int = 0
)
