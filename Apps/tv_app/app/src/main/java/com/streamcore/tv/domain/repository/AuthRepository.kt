package com.streamcore.tv.domain.repository

import com.streamcore.tv.domain.model.*
import kotlinx.coroutines.flow.Flow

/**
 * Repository interface for authentication operations
 *
 * Handles:
 * - User login and authentication
 * - Device registration and activation
 * - Token management
 * - User authentication state
 */
interface AuthRepository {

    /**
     * Login user with username and password
     * @param skipDeviceBinding When true, login without device binding (for device management).
     *                          This matches web login behavior and allows DELETE /devices to work.
     */
    suspend fun login(
        username: String,
        password: String,
        skipDeviceBinding: Boolean = false
    ): Result<User>

    /**
     * Register a new device with the IPTV service
     */
    suspend fun registerDevice(
        deviceRegistration: DeviceRegistration
    ): Result<String> // Returns device token

    /**
     * Register a new device with device name only (convenience method)
     */
    suspend fun registerDevice(deviceName: String): Result<String>

    /**
     * Replace an existing device with a new one
     */
    suspend fun replaceDevice(deviceName: String, deviceIdToReplace: String): Result<String>
    
    /**
     * Activate device with activation code
     */
    suspend fun activateDevice(
        deviceActivation: DeviceActivation
    ): Result<AuthTokens>
    
    /**
     * Refresh access token using refresh token
     */
    suspend fun refreshToken(): Result<AuthTokens>
    
    /**
     * Logout user and clear all tokens
     */
    suspend fun logout(): Result<Unit>
    
    /**
     * Check if user is currently authenticated
     */
    fun isAuthenticated(): Flow<Boolean>
    
    /**
     * Get current access token
     */
    fun getAccessToken(): Flow<String?>
    
    /**
     * Get current refresh token
     */
    fun getRefreshToken(): Flow<String?>
    
    /**
     * Save authentication tokens
     */
    suspend fun saveTokens(tokens: AuthTokens): Result<Unit>
    
    /**
     * Clear all authentication data
     */
    suspend fun clearAuthData(): Result<Unit>

    /**
     * Get device status (current count vs max allowed)
     */
    suspend fun getDeviceStatus(): Result<DeviceStatus>

    /**
     * Renew User-Agent from backend settings
     */
    suspend fun renewUserAgent(): Result<String>
}
