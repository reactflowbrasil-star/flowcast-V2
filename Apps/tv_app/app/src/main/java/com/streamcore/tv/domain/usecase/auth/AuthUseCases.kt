package com.streamcore.tv.domain.usecase.auth

import com.streamcore.tv.domain.model.*
import com.streamcore.tv.domain.repository.AuthRepository
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

/**
 * Use cases for authentication operations
 */

class RegisterDeviceUseCase @Inject constructor(
    private val authRepository: AuthRepository
) {
    suspend operator fun invoke(deviceRegistration: DeviceRegistration): Result<String> {
        return try {
            authRepository.registerDevice(deviceRegistration)
        } catch (e: Exception) {
            Result.Error(e)
        }
    }

    /**
     * Register device with device name only (convenience method)
     */
    suspend operator fun invoke(deviceName: String, deviceIdToReplace: String? = null): Result<String> {
        return try {
            if (deviceIdToReplace != null) {
                // Replace specific device
                authRepository.replaceDevice(deviceName, deviceIdToReplace)
            } else {
                // Normal registration
                authRepository.registerDevice(deviceName)
            }
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}

class ActivateDeviceUseCase @Inject constructor(
    private val authRepository: AuthRepository
) {
    suspend operator fun invoke(deviceActivation: DeviceActivation): Result<AuthTokens> {
        return try {
            val result = authRepository.activateDevice(deviceActivation)
            if (result is Result.Success) {
                // Save tokens after successful activation
                authRepository.saveTokens(result.data)
            }
            result
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}

class RefreshTokenUseCase @Inject constructor(
    private val authRepository: AuthRepository
) {
    suspend operator fun invoke(): Result<AuthTokens> {
        return try {
            val result = authRepository.refreshToken()
            if (result is Result.Success) {
                // Save new tokens after successful refresh
                authRepository.saveTokens(result.data)
            }
            result
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}

class LogoutUseCase @Inject constructor(
    private val authRepository: AuthRepository
) {
    suspend operator fun invoke(): Result<Unit> {
        return try {
            val result = authRepository.logout()
            // Clear all auth data regardless of API response
            authRepository.clearAuthData()
            result
        } catch (e: Exception) {
            // Still clear local data even if API call fails
            authRepository.clearAuthData()
            Result.Error(e)
        }
    }
}

class IsAuthenticatedUseCase @Inject constructor(
    private val authRepository: AuthRepository
) {
    operator fun invoke(): Flow<Boolean> {
        return authRepository.isAuthenticated()
    }
}

class GetAccessTokenUseCase @Inject constructor(
    private val authRepository: AuthRepository
) {
    operator fun invoke(): Flow<String?> {
        return authRepository.getAccessToken()
    }
}

class GetDeviceStatusUseCase @Inject constructor(
    private val authRepository: AuthRepository
) {
    suspend operator fun invoke(): Result<DeviceStatus> {
        return try {
            authRepository.getDeviceStatus()
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}


