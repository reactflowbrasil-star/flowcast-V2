package com.streamcore.tv.data.remote.api

import com.streamcore.tv.data.remote.dto.TokenRefreshResponseDto
import retrofit2.Response
import retrofit2.http.Header
import retrofit2.http.POST

/**
 * Separate service for token refresh to avoid circular dependency.
 * This service doesn't use the AuthInterceptor, so the caller must
 * provide the Authorization header explicitly.
 */
interface RefreshTokenService {
    
    /**
     * Refresh access token.
     * Backend reads the current JWT from the Authorization header to issue a new one.
     */
    @POST("auth/refresh")
    suspend fun refreshToken(
        @Header("Authorization") authorization: String
    ): Response<TokenRefreshResponseDto>
}
