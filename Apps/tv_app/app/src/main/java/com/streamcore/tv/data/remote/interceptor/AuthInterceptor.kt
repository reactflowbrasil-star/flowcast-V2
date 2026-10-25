package com.streamcore.tv.data.remote.interceptor

import com.streamcore.tv.data.local.datastore.TokenManager
import com.streamcore.tv.data.remote.api.RefreshTokenService
import com.streamcore.tv.data.mapper.toDomainModel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Authentication interceptor for adding JWT tokens to requests
 * 
 * Handles:
 * - Adding Authorization header to requests
 * - Token refresh on 401 responses
 * - Automatic retry with new token
 */
@Singleton
class AuthInterceptor @Inject constructor(
    private val tokenManager: TokenManager,
    private val refreshTokenService: RefreshTokenService
) : Interceptor {

    private val refreshLock = Any()
    
    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        val normalizedPath = originalRequest.url.encodedPath.trimEnd('/')
        
        // Skip auth for certain endpoints
        if (shouldSkipAuth(originalRequest.method, originalRequest.url.encodedPath)) {
            return chain.proceed(originalRequest)
        }
        
        val originalAuthHeader = originalRequest.header("Authorization")
            ?.trim()
            ?.takeIf { it.isNotEmpty() }

        // Get access token
        val accessToken = runBlocking {
            tokenManager.getAccessToken().first()
        }
        
        // If no token and no explicit auth header, proceed without auth
        if (accessToken.isNullOrEmpty() && originalAuthHeader == null) {
            Timber.d("No access token available, proceeding without auth")
            return chain.proceed(originalRequest)
        }
        
        // Respect pre-existing Authorization header (e.g. explicit per-request credentials).
        val effectiveAuthHeader = originalAuthHeader ?: "Bearer $accessToken"
        val authenticatedRequest = originalRequest.newBuilder()
            .header("Authorization", effectiveAuthHeader)
            .build()
        val requestToken = extractBearerToken(effectiveAuthHeader)
        
        val response = chain.proceed(authenticatedRequest)
        
        // Handle token refresh on 401
        if (response.code == 401) {
            // Never attempt recursive refresh for refresh endpoint itself.
            if (normalizedPath.endsWith("/auth/refresh")) {
                Timber.d("AuthInterceptor: Skipping refresh logic for /auth/refresh")
                return response
            }

            // Check if this is a device disconnection
            val responseBody = response.peekBody(1024).string()
            
            // SPECIAL CASE: If we are deleting a device, do not trigger ANY 401 handling.
            // The server might return 401 with "Device disconnected" when deleting a device,
            // but this doesn't mean the CURRENT session is invalid - just return the error
            // to the UI layer to handle appropriately.
            val isDeleteDeviceRequest = originalRequest.method == "DELETE" &&
                normalizedPath.contains("/devices/") &&
                !normalizedPath.contains("/user/devices/")
            if (isDeleteDeviceRequest) {
                Timber.d("AuthInterceptor: Skipping 401 handling for DELETE /devices request")
                return response // Return 401 to caller, don't try refresh or force logout
            }
            
            if (responseBody.contains("device_disconnected")) {
                Timber.w("Device has been disconnected remotely, logging out user")
                // Do NOT close response if returning it
                // response.close() 

                // Clear tokens and emit force logout event - device was disconnected
                runBlocking {
                    tokenManager.clearTokensWithForceLogout(TokenManager.ForceLogoutReason.DEVICE_DISCONNECTED)
                }

                return response
            }

            Timber.d("Received 401, attempting token refresh")
            val newToken = synchronized(refreshLock) {
                val currentToken = runBlocking { tokenManager.getAccessToken().first() }
                if (!currentToken.isNullOrBlank() && currentToken != requestToken) {
                    Timber.d("Token already refreshed by another request, reusing latest token")
                    currentToken
                } else {
                    refreshToken()
                }
            }
            if (newToken != null) {
                Timber.d("Token refreshed successfully, retrying request")
                
                // NOW we can close the old response because we are proceeding with a new one
                response.close()
                
                val retryRequest = originalRequest.newBuilder()
                    .header("Authorization", "Bearer $newToken")
                    .build()
                return chain.proceed(retryRequest)
            } else {
                Timber.w("Token refresh failed, user needs to re-authenticate")
                // Clear tokens and emit force logout event
                runBlocking {
                    tokenManager.clearTokensWithForceLogout(TokenManager.ForceLogoutReason.TOKEN_REFRESH_FAILED)
                }
            }
        }
        
        return response
    }
    
    /**
     * Determines if authentication should be skipped for certain endpoints
     */
    private fun shouldSkipAuth(method: String, path: String): Boolean {
        val normalizedPath = path.trimEnd('/')

        // Public auth endpoints (no token needed).
        if (normalizedPath.endsWith("/auth/login")) return true
        if (normalizedPath.endsWith("/auth/device/activate")) return true
        // NOTE: /auth/refresh REQUIRES the current JWT in Authorization header.
        // The backend reads the token from the header to generate a new one.
        // Do NOT skip auth for refresh.

        // POST /api/devices REQUIRES authentication — the backend reads the JWT
        // to determine which user is registering the device. Do NOT skip auth.

        return false
    }

    private fun extractBearerToken(authorizationHeader: String?): String? {
        if (authorizationHeader.isNullOrBlank()) return null
        val prefix = "Bearer "
        return if (authorizationHeader.startsWith(prefix, ignoreCase = true)) {
            authorizationHeader.substring(prefix.length).trim().takeIf { it.isNotEmpty() }
        } else {
            null
        }
    }
    
    /**
     * Attempts to refresh the access token using the refresh token
     */
    private fun refreshToken(): String? {
        return try {
            runBlocking {
                // Backend reads the current JWT from Authorization header to issue a new token.
                // We need the current access token (even if expired for refresh purposes).
                val currentToken = tokenManager.getAccessToken().first()
                val currentRefreshToken = tokenManager.getRefreshToken().first().orEmpty()
                if (currentToken.isNullOrBlank()) {
                    Timber.w("No access token available for refresh")
                    return@runBlocking null
                }

                Timber.d("Attempting to refresh token")

                val response = refreshTokenService.refreshToken("Bearer $currentToken")

                if (response.isSuccessful) {
                    val refreshResponse = response.body()
                    if (refreshResponse?.success == true && !refreshResponse.accessToken.isNullOrEmpty()) {
                        val authTokens = refreshResponse.toDomainModel()

                        // Save the new access token (keep the same refresh token)
                        tokenManager.saveTokens(
                            accessToken = authTokens.accessToken,
                            refreshToken = currentRefreshToken,
                            expiryTime = (System.currentTimeMillis() + (authTokens.expiresIn * 1000)).toString()
                        )

                        Timber.d("Token refreshed successfully")
                        return@runBlocking authTokens.accessToken
                    } else {
                        Timber.w("Token refresh failed: Invalid response")
                        return@runBlocking null
                    }
                } else {
                    val errorMessage = response.errorBody()?.string() ?: "Token refresh failed"
                    Timber.w("Token refresh failed with code ${response.code()}: $errorMessage")
                    return@runBlocking null
                }
            }
        } catch (e: Exception) {
            Timber.e(e, "Error during token refresh")
            null
        }
    }
}
