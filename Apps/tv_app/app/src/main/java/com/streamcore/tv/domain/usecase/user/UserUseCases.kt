package com.streamcore.tv.domain.usecase.user

import com.streamcore.tv.domain.model.*
import com.streamcore.tv.domain.repository.UserRepository
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

/**
 * Use cases for user operations
 */

// ========================================
// PROFILE USE CASES
// ========================================

class GetUserProfileUseCase @Inject constructor(
    private val userRepository: UserRepository
) {
    suspend operator fun invoke(): Result<UserProfile> {
        return try {
            userRepository.getUserProfile()
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}

class UpdateUserProfileUseCase @Inject constructor(
    private val userRepository: UserRepository
) {
    suspend operator fun invoke(profile: UserProfile): Result<UserProfile> {
        return try {
            userRepository.updateUserProfile(profile)
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}

class GetUserPreferencesUseCase @Inject constructor(
    private val userRepository: UserRepository
) {
    operator fun invoke(): Flow<UserPreferences> {
        return userRepository.getUserPreferences()
    }
}

class UpdateUserPreferencesUseCase @Inject constructor(
    private val userRepository: UserRepository
) {
    suspend operator fun invoke(preferences: UserPreferences): Result<Unit> {
        return try {
            userRepository.updateUserPreferences(preferences)
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}

// ========================================
// FAVORITES USE CASES
// ========================================

class GetFavoritesUseCase @Inject constructor(
    private val userRepository: UserRepository
) {
    suspend operator fun invoke(): Result<List<FavoriteItem>> {
        return try {
            userRepository.getFavorites()
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}

class AddToFavoritesUseCase @Inject constructor(
    private val userRepository: UserRepository
) {
    suspend operator fun invoke(contentId: String): Result<Unit> {
        return try {
            if (contentId.isBlank()) {
                return Result.Error(IllegalArgumentException("Content ID cannot be empty"))
            }
            
            userRepository.addToFavorites(contentId)
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}

class RemoveFromFavoritesUseCase @Inject constructor(
    private val userRepository: UserRepository
) {
    suspend operator fun invoke(contentId: String): Result<Unit> {
        return try {
            if (contentId.isBlank()) {
                return Result.Error(IllegalArgumentException("Content ID cannot be empty"))
            }
            
            userRepository.removeFromFavorites(contentId)
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}

class IsFavoriteUseCase @Inject constructor(
    private val userRepository: UserRepository
) {
    suspend operator fun invoke(contentId: String): Result<Boolean> {
        return try {
            if (contentId.isBlank()) {
                return Result.Error(IllegalArgumentException("Content ID cannot be empty"))
            }
            
            userRepository.isFavorite(contentId)
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}

class GetFavoritesFlowUseCase @Inject constructor(
    private val userRepository: UserRepository
) {
    operator fun invoke(): Flow<List<FavoriteItem>> {
        return userRepository.getFavoritesFlow()
    }
}

// ========================================
// WATCH HISTORY USE CASES
// ========================================

class GetWatchHistoryUseCase @Inject constructor(
    private val userRepository: UserRepository
) {
    suspend operator fun invoke(): Result<List<WatchHistoryItem>> {
        return try {
            userRepository.getWatchHistory()
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}

class UpdateWatchProgressUseCase @Inject constructor(
    private val userRepository: UserRepository
) {
    suspend operator fun invoke(
        contentId: String,
        progress: Float,
        duration: Long
    ): Result<Unit> {
        return try {
            if (contentId.isBlank()) {
                return Result.Error(IllegalArgumentException("Content ID cannot be empty"))
            }
            
            if (progress < 0f || progress > 1f) {
                return Result.Error(IllegalArgumentException("Progress must be between 0.0 and 1.0"))
            }
            
            if (duration < 0) {
                return Result.Error(IllegalArgumentException("Duration cannot be negative"))
            }
            
            userRepository.updateWatchProgress(contentId, progress, duration)
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}

class GetWatchProgressUseCase @Inject constructor(
    private val userRepository: UserRepository
) {
    suspend operator fun invoke(contentId: String): Result<WatchProgress?> {
        return try {
            if (contentId.isBlank()) {
                return Result.Error(IllegalArgumentException("Content ID cannot be empty"))
            }
            
            userRepository.getWatchProgress(contentId)
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}

class GetContinueWatchingUseCase @Inject constructor(
    private val userRepository: UserRepository
) {
    suspend operator fun invoke(): Result<List<WatchHistoryItem>> {
        return userRepository.getContinueWatching()
    }
}

class ClearWatchHistoryUseCase @Inject constructor(
    private val userRepository: UserRepository
) {
    suspend operator fun invoke(): Result<Unit> {
        return try {
            userRepository.clearWatchHistory()
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}

// ========================================
// DEVICE MANAGEMENT USE CASES
// ========================================

class GetUserDevicesUseCase @Inject constructor(
    private val userRepository: UserRepository
) {
    suspend operator fun invoke(): Result<List<DeviceInfo>> {
        return try {
            userRepository.getUserDevices()
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}

class RemoveDeviceUseCase @Inject constructor(
    private val userRepository: UserRepository
) {
    suspend operator fun invoke(deviceId: String): Result<Unit> {
        return try {
            if (deviceId.isBlank()) {
                return Result.Error(IllegalArgumentException("Device ID cannot be empty"))
            }
            
            userRepository.removeDevice(deviceId)
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}

class UpdateDeviceNameUseCase @Inject constructor(
    private val userRepository: UserRepository
) {
    suspend operator fun invoke(deviceId: String, name: String): Result<Unit> {
        return try {
            if (deviceId.isBlank()) {
                return Result.Error(IllegalArgumentException("Device ID cannot be empty"))
            }
            
            if (name.isBlank()) {
                return Result.Error(IllegalArgumentException("Device name cannot be empty"))
            }
            
            userRepository.updateDeviceName(deviceId, name)
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}
