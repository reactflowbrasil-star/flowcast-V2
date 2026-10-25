package com.streamcore.tv.data.local.datastore

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.map
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manager for handling authentication tokens using DataStore
 * 
 * Handles:
 * - Access token storage and retrieval
 * - Refresh token storage and retrieval
 * - Token expiration management
 * - Secure token clearing
 * - Force logout events (401 errors)
 */
@Singleton
class TokenManager @Inject constructor(
    private val dataStore: DataStore<Preferences>
) {
    
    companion object {
        private val ACCESS_TOKEN_KEY = stringPreferencesKey("access_token")
        private val REFRESH_TOKEN_KEY = stringPreferencesKey("refresh_token")
        private val TOKEN_EXPIRY_KEY = stringPreferencesKey("token_expiry")
        private val DEVICE_TOKEN_KEY = stringPreferencesKey("device_token")
    }

    private val _forceLogoutEvent = MutableSharedFlow<ForceLogoutReason>(replay = 0, extraBufferCapacity = 1)
    val forceLogoutEvent: SharedFlow<ForceLogoutReason> = _forceLogoutEvent.asSharedFlow()

    enum class ForceLogoutReason {
        AUTHENTICATION_FAILED,
        DEVICE_DISCONNECTED,
        TOKEN_REFRESH_FAILED
    }
    
    /**
     * Get access token as Flow
     */
    fun getAccessToken(): Flow<String?> {
        return dataStore.data.map { preferences ->
            preferences[ACCESS_TOKEN_KEY]
        }
    }
    
    /**
     * Get refresh token as Flow
     */
    fun getRefreshToken(): Flow<String?> {
        return dataStore.data.map { preferences ->
            preferences[REFRESH_TOKEN_KEY]
        }
    }
    
    /**
     * Get device token as Flow
     */
    fun getDeviceToken(): Flow<String?> {
        return dataStore.data.map { preferences ->
            preferences[DEVICE_TOKEN_KEY]
        }
    }
    
    /**
     * Get token expiry time as Flow
     */
    fun getTokenExpiry(): Flow<String?> {
        return dataStore.data.map { preferences ->
            preferences[TOKEN_EXPIRY_KEY]
        }
    }
    
    /**
     * Save access token
     */
    suspend fun saveAccessToken(token: String) {
        try {
            dataStore.edit { preferences ->
                preferences[ACCESS_TOKEN_KEY] = token
            }
            Timber.d("Access token saved successfully")
        } catch (e: Exception) {
            Timber.e(e, "Failed to save access token")
        }
    }
    
    /**
     * Save refresh token
     */
    suspend fun saveRefreshToken(token: String) {
        try {
            dataStore.edit { preferences ->
                preferences[REFRESH_TOKEN_KEY] = token
            }
            Timber.d("Refresh token saved successfully")
        } catch (e: Exception) {
            Timber.e(e, "Failed to save refresh token")
        }
    }
    
    /**
     * Save device token
     */
    suspend fun saveDeviceToken(token: String) {
        try {
            dataStore.edit { preferences ->
                preferences[DEVICE_TOKEN_KEY] = token
            }
            Timber.d("Device token saved successfully")
        } catch (e: Exception) {
            Timber.e(e, "Failed to save device token")
        }
    }
    
    /**
     * Save token expiry time
     */
    suspend fun saveTokenExpiry(expiry: String) {
        try {
            dataStore.edit { preferences ->
                preferences[TOKEN_EXPIRY_KEY] = expiry
            }
            Timber.d("Token expiry saved successfully")
        } catch (e: Exception) {
            Timber.e(e, "Failed to save token expiry")
        }
    }
    
    /**
     * Save authentication tokens (access + refresh)
     */
    suspend fun saveTokens(
        accessToken: String,
        refreshToken: String,
        expiryTime: String? = null
    ) {
        try {
            dataStore.edit { preferences ->
                preferences[ACCESS_TOKEN_KEY] = accessToken
                preferences[REFRESH_TOKEN_KEY] = refreshToken
                expiryTime?.let {
                    preferences[TOKEN_EXPIRY_KEY] = it
                }
            }
            Timber.d("Authentication tokens saved successfully")
        } catch (e: Exception) {
            Timber.e(e, "Failed to save authentication tokens")
        }
    }
    
    /**
     * Clear all tokens (logout)
     */
    suspend fun clearTokens() {
        try {
            dataStore.edit { preferences ->
                preferences.remove(ACCESS_TOKEN_KEY)
                preferences.remove(REFRESH_TOKEN_KEY)
                preferences.remove(TOKEN_EXPIRY_KEY)
                preferences.remove(DEVICE_TOKEN_KEY)
            }
            Timber.d("All tokens cleared successfully")
        } catch (e: Exception) {
            Timber.e(e, "Failed to clear tokens")
        }
    }

    /**
     * Clear all tokens and emit force logout event (for 401 errors)
     */
    suspend fun clearTokensWithForceLogout(reason: ForceLogoutReason) {
        try {
            dataStore.edit { preferences ->
                preferences.remove(ACCESS_TOKEN_KEY)
                preferences.remove(REFRESH_TOKEN_KEY)
                preferences.remove(TOKEN_EXPIRY_KEY)
                preferences.remove(DEVICE_TOKEN_KEY)
            }
            Timber.d("All tokens cleared for force logout: $reason")
            _forceLogoutEvent.tryEmit(reason)
        } catch (e: Exception) {
            Timber.e(e, "Failed to clear tokens for force logout")
        }
    }
    
    /**
     * Clear only device token
     */
    suspend fun clearDeviceToken() {
        try {
            dataStore.edit { preferences ->
                preferences.remove(DEVICE_TOKEN_KEY)
            }
            Timber.d("Device token cleared successfully")
        } catch (e: Exception) {
            Timber.e(e, "Failed to clear device token")
        }
    }
    
    /**
     * Check if user is authenticated (has valid access token)
     */
    fun isAuthenticated(): Flow<Boolean> {
        return dataStore.data.map { preferences ->
            val accessToken = preferences[ACCESS_TOKEN_KEY]
            !accessToken.isNullOrEmpty()
        }
    }
}
