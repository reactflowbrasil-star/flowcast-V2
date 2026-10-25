package com.streamcore.tv.data.repository

import com.streamcore.tv.domain.model.Result
import com.streamcore.tv.data.remote.api.IPTVApiService
import com.streamcore.tv.data.remote.dto.ChangePasswordRequestDto
import com.streamcore.tv.data.remote.dto.UpdateProfileRequestDto
import com.streamcore.tv.data.remote.dto.UserProfileResponseDto
import com.streamcore.tv.domain.model.UserProfile
import com.streamcore.tv.domain.model.UserPreferences
import com.streamcore.tv.domain.model.VideoQuality
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repository for user profile operations
 */
@Singleton
class UserProfileRepository @Inject constructor(
    private val apiService: IPTVApiService
) {

    /**
     * Get current user profile
     */
    suspend fun getUserProfile(): Result<UserProfile> {
        return try {
            val response = apiService.getUserProfile()
            if (response.isSuccessful) {
                response.body()?.let { dto ->
                    Result.Success(dto.toDomainModel())
                } ?: Result.Error(Exception("Empty response body"))
            } else {
                Result.Error(Exception("Failed to get user profile: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.Error(Exception("Network error: ${e.message}"))
        }
    }

    /**
     * Update user profile
     */
    suspend fun updateProfile(email: String?): Result<UserProfile> {
        return try {
            val request = UpdateProfileRequestDto(email = email)
            val response = apiService.updateUserProfile(request)
            if (response.isSuccessful) {
                response.body()?.let { dto ->
                    Result.Success(dto.toDomainModel())
                } ?: Result.Error(Exception("Empty response body"))
            } else {
                Result.Error(Exception("Failed to update profile: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.Error(Exception("Network error: ${e.message}"))
        }
    }

    /**
     * Change user password
     */
    suspend fun changePassword(currentPassword: String, newPassword: String): Result<String> {
        return try {
            val request = ChangePasswordRequestDto(
                currentPassword = currentPassword,
                newPassword = newPassword
            )
            val response = apiService.changePassword(request)
            if (response.isSuccessful) {
                Result.Success("Password changed successfully")
            } else {
                Result.Error(Exception("Failed to change password: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.Error(Exception("Network error: ${e.message}"))
        }
    }

    /**
     * Convert DTO to domain model
     */
    private fun UserProfileResponseDto.toDomainModel(): UserProfile {
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
}
