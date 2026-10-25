package com.streamcore.tv.data.mapper

import com.streamcore.tv.data.local.entity.UserEntity
import com.streamcore.tv.data.remote.dto.*
import com.streamcore.tv.domain.model.*

/**
 * Mapper functions for user-related data transformations
 */

// ========================================
// DTO TO DOMAIN MODEL MAPPERS
// ========================================

fun UserDto.toDomainModel(): User {
    return User(
        id = id.toString(),
        username = username,
        email = email,
        role = when (role.lowercase()) {
            "admin" -> UserRole.ADMIN
            "reseller" -> UserRole.RESELLER
            "end_user" -> UserRole.END_USER
            else -> UserRole.END_USER
        },
        isActive = isActive,
        maxDevices = maxDevices,
        createdAt = createdAt ?: "",
        lastLoginAt = lastLoginAt
    )
}

fun UserProfileDto.toDomainModel(): UserProfile {
    return UserProfile(
        id = id,
        username = username,
        email = email,
        role = "end_user", // Default value
        maxDevices = 3, // Default value
        expiresAt = null, // Default value
        active = true, // Default value
        createdAt = "", // Default value
        deviceCount = devices.size,
        preferences = preferences.toDomainModel(),
        subscription = subscription?.toDomainModel(),
        devices = devices.map { it.toDomainModel() }
    )
}

fun UserPreferencesDto.toDomainModel(): UserPreferences {
    val safeQuality = runCatching {
        VideoQuality.valueOf(quality.uppercase())
    }.getOrDefault(VideoQuality.AUTO)

    return UserPreferences(
        language = language,
        autoplay = autoplay,
        quality = safeQuality,
        subtitles = subtitles
    )
}

fun SubscriptionInfoDto.toDomainModel(): SubscriptionInfo {
    return SubscriptionInfo(
        plan = plan,
        isActive = isActive,
        expiresAt = expiresAt,
        features = features
    )
}

fun DeviceInfoDto.toDomainModel(): DeviceInfo {
    return DeviceInfo(
        id = id,
        name = name,
        type = type,
        lastActive = lastActive,
        isCurrentDevice = isCurrentDevice
    )
}

fun WatchHistoryItemDto.toDomainModel(): WatchHistoryItem {
    val rawType = contentType?.lowercase()
    val mappedType = when (rawType) {
        "movie", "vod" -> ContentType.MOVIE
        "series", "anime" -> ContentType.SERIES
        "live_tv", "tv" -> ContentType.LIVE_TV
        "episode" -> ContentType.EPISODE
        else -> ContentType.MOVIE
    }

    val title = contentTitle
        ?: episodeTitle
        ?: seriesTitle
        ?: "Unknown"

    val resolvedContentId = contentId?.toString() ?: "0"

    // Backend history payload doesn't include full ContentItem fields (streamUrl/images/etc),
    // so we create a minimal ContentItem for UI + caching.
    val content = ContentItem(
        id = resolvedContentId,
        title = title,
        description = null,
        imageUrl = null,
        backdropUrl = null,
        duration = null,
        year = null,
        rating = null,
        genres = emptyList(),
        type = mappedType,
        originalType = rawType,
        streamUrl = null
    )

    return WatchHistoryItem(
        contentId = resolvedContentId,
        content = content,
        watchedAt = startTimestamp ?: "",
        progress = 0f,
        duration = 0L
    )
}

fun DeviceActivationResponseDto.toDomainModel(): AuthTokens {
    return AuthTokens(
        accessToken = accessToken ?: "",
        refreshToken = refreshToken ?: "",
        expiresIn = expiresIn ?: 0L
    )
}

fun TokenRefreshResponseDto.toDomainModel(): AuthTokens {
    return AuthTokens(
        accessToken = accessToken ?: "",
        refreshToken = "", // Refresh token usually doesn't change
        expiresIn = expiresIn ?: 0L
    )
}

// ========================================
// DOMAIN MODEL TO DTO MAPPERS
// ========================================

fun DeviceRegistration.toDto(): DeviceRegistrationRequestDto {
    return DeviceRegistrationRequestDto(
        deviceId = deviceId,
        deviceName = deviceName
    )
}

fun DeviceActivation.toDto(): DeviceActivationRequestDto {
    return DeviceActivationRequestDto(
        deviceToken = deviceToken,
        activationCode = activationCode
    )
}

fun UserPreferences.toDto(): UserPreferencesDto {
    return UserPreferencesDto(
        language = language,
        autoplay = autoplay,
        quality = quality.name,
        subtitles = subtitles
    )
}

fun UserProfile.toDto(): UpdateProfileRequestDto {
    return UpdateProfileRequestDto(
        email = email
    )
}

fun UpdateWatchProgressRequestDto.toDomainModel(): WatchProgress {
    return WatchProgress(
        contentId = contentId,
        progress = progress,
        duration = duration,
        lastWatched = System.currentTimeMillis().toString()
    )
}

// ========================================
// DOMAIN MODEL TO ENTITY MAPPERS
// ========================================

fun UserProfile.toEntity(): UserEntity {
    return UserEntity(
        id = id,
        username = username ?: "unknown",
        email = email,
        displayName = username ?: "unknown", // Use username as display name if not provided
        avatarUrl = null, // Avatar URL not provided in UserProfile
        language = preferences.language,
        autoplay = preferences.autoplay,
        quality = preferences.quality.name,
        subtitles = preferences.subtitles
    )
}

// ========================================
// ENTITY TO DOMAIN MODEL MAPPERS
// ========================================

fun UserEntity.toDomainModel(): UserProfile {
    val safeQuality = runCatching {
        VideoQuality.valueOf((quality ?: "AUTO").uppercase())
    }.getOrDefault(VideoQuality.AUTO)

    return UserProfile(
        id = id,
        username = username,
        email = email,
        role = "end_user", // Default value
        maxDevices = 3, // Default value
        expiresAt = null, // Default value
        active = isActive,
        createdAt = java.time.Instant.ofEpochMilli(createdAt).toString(),
        deviceCount = 0, // Default value
        preferences = UserPreferences(
            language = language ?: "en",
            autoplay = autoplay,
            quality = safeQuality,
            subtitles = subtitles
        ),
        subscription = null, // Subscription info comes from API
        devices = emptyList() // Device info comes from API
    )
}

// ========================================
// SEARCH QUERY MAPPERS
// ========================================

fun SearchQuery.toQueryMap(): Map<String, String> {
    val queryMap = mutableMapOf<String, String>()

    queryMap["q"] = query
    queryMap["page"] = page.toString()
    queryMap["limit"] = limit.toString()

    type?.let { queryMap["type"] = it.name.lowercase() }
    category?.let { queryMap["category"] = it }

    // Add excluded categories
    if (excludeCategories.isNotEmpty()) {
        queryMap["exclude_categories"] = excludeCategories.joinToString(",")
    }

    return queryMap
}

// ========================================
// EXTENSION FUNCTIONS FOR LISTS
// ========================================

fun List<WatchHistoryItemDto>.toWatchHistoryItems(): List<WatchHistoryItem> {
    return map { it.toDomainModel() }
}

fun List<DeviceInfoDto>.toDeviceInfos(): List<DeviceInfo> {
    return map { it.toDomainModel() }
}

fun List<DeviceDto>.toDeviceInfoList(): List<DeviceInfo> {
    return map {
        val resolvedName = it.name ?: "Unknown device"
        DeviceInfo(
            id = it.deviceId ?: it.id ?: "unknown",
            name = resolvedName,
            type = it.type ?: "android",
            lastActive = it.lastUsed ?: it.registeredAt ?: "",
            isCurrentDevice = it.isCurrentDevice
        )
    }
}

// ========================================
// RESULT MAPPERS
// ========================================

fun <T, R> Result<T>.mapSuccess(transform: (T) -> R): Result<R> {
    return when (this) {
        is Result.Success -> Result.Success(transform(data))
        is Result.Error -> Result.Error(exception)
        is Result.Loading -> Result.Loading
    }
}

fun <T> ApiResponseDto.toResult(data: T?): Result<T> {
    return if (success && data != null) {
        Result.Success(data)
    } else {
        Result.Error(Exception(message))
    }
}

// ========================================
// USER PROFILE RESPONSE MAPPERS
// ========================================

fun UserProfileResponseDto.toDomainModel(): UserProfile {
    return UserProfile(
        id = id.toString(),
        username = username,
        email = email,
        role = role,
        maxDevices = maxDevices,
        expiresAt = expiresAt,
        active = active,
        createdAt = createdAt,
        deviceCount = deviceCount,
        preferences = UserPreferences(
            language = "es", // Default values, could be loaded separately
            autoplay = true,
            quality = VideoQuality.AUTO,
            subtitles = false
        ),
        subscription = null, // Could be loaded separately
        devices = emptyList() // Could be loaded separately
    )
}
