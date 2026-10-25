package com.streamcore.tv.domain.model

/**
 * Domain models for user-related entities
 */

// ========================================
// USER AUTHENTICATION
// ========================================

data class User(
    val id: String,
    val username: String,
    val email: String?,
    val role: UserRole,
    val isActive: Boolean,
    val maxDevices: Int,
    val createdAt: String,
    val lastLoginAt: String?
)

enum class UserRole {
    ADMIN,
    RESELLER,
    END_USER
}

data class LoginResponse(
    val user: User,
    val token: String,
    val refreshToken: String,
    val expiresIn: Long
)

// ========================================
// USER PROFILE
// ========================================

data class UserProfile(
    val id: String,
    val username: String?,
    val email: String?,
    val role: String,
    val maxDevices: Int,
    val expiresAt: String?,
    val active: Boolean,
    val createdAt: String,
    val deviceCount: Int,
    val preferences: UserPreferences,
    val subscription: SubscriptionInfo?,
    val devices: List<DeviceInfo>
)

data class UserPreferences(
    val language: String = "es",
    val autoplay: Boolean = true,
    val quality: VideoQuality = VideoQuality.AUTO,
    val subtitles: Boolean = false
)

data class SubscriptionInfo(
    val plan: String,
    val isActive: Boolean,
    val expiresAt: String?,
    val features: List<String>
)

data class DeviceInfo(
    val id: String,
    val name: String,
    val type: String,
    val lastActive: String,
    val isCurrentDevice: Boolean
)

// ========================================
// DEVICE MANAGEMENT
// ========================================

data class Device(
    val id: String,
    val name: String,
    val type: String,
    val registeredAt: String,
    val lastUsed: String?,
    val isCurrentDevice: Boolean = false,
    val deviceId: String,
    val appVersion: String? = null,
    val osVersion: String? = null
)

data class DeviceStatus(
    val currentDevices: Int,
    val maxDevices: Int,
    val hasSpace: Boolean,
    val devices: List<Device>
)

// ========================================
// FAVORITES
// ========================================

data class FavoriteItem(
    val contentId: String,
    val content: ContentItem,
    val addedAt: String
)

// ========================================
// WATCH HISTORY
// ========================================

data class WatchHistoryItem(
    val contentId: String,
    val content: ContentItem,
    val watchedAt: String,
    val progress: Float, // 0.0 - 1.0
    val duration: Long // Total watched time in seconds
)

data class WatchProgress(
    val contentId: String,
    val progress: Float,
    val duration: Long,
    val lastWatched: String
)

// ========================================
// AUTHENTICATION
// ========================================

data class DeviceRegistration(
    val deviceName: String,
    val deviceType: String = "android",
    val deviceId: String,
    val appVersion: String,
    val osVersion: String
)

data class DeviceActivation(
    val deviceToken: String,
    val activationCode: String
)

data class AuthTokens(
    val accessToken: String,
    val refreshToken: String,
    val expiresIn: Long
)

// ========================================
// API RESPONSES
// ========================================

data class ApiResponse<T>(
    val success: Boolean,
    val data: T?,
    val message: String,
    val code: String? = null
)

sealed class Result<out T> {
    data class Success<T>(val data: T) : Result<T>()
    data class Error(val exception: Throwable) : Result<Nothing>()
    object Loading : Result<Nothing>()
}

// ========================================
// UI STATES
// ========================================

sealed class UiState<out T> {
    object Loading : UiState<Nothing>()
    data class Success<T>(val data: T) : UiState<T>()
    data class Error(val message: String) : UiState<Nothing>()
}
