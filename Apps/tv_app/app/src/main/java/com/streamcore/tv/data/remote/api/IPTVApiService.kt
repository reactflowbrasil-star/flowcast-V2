package com.streamcore.tv.data.remote.api

import com.streamcore.tv.data.remote.dto.*
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.*
import retrofit2.http.Streaming

/**
 * IPTV API service interface
 * 
 * Defines all API endpoints for:
 * - Authentication (device registration, activation)
 * - Content management (movies, series, live TV)
 * - User management (profile, favorites, history)
 * - Search functionality
 */
interface IPTVApiService {
    
    // ========================================
    // AUTHENTICATION ENDPOINTS
    // ========================================

    /**
     * User login with username, password, and device_id
     */
    @POST("auth/login")
    suspend fun login(
        @Body request: LoginRequestDto
    ): Response<LoginResponseDto>

    /**
     * Register a new device
     */
    @POST("devices")
    suspend fun registerDevice(
        @Body request: DeviceRegistrationRequestDto
    ): Response<DeviceRegistrationResponseDto>
    
    /**
     * Refresh access token
     */
    @POST("auth/refresh")
    suspend fun refreshToken(): Response<TokenRefreshResponseDto>
    
    /**
     * Logout and invalidate tokens
     */
    @POST("auth/logout")
    suspend fun logout(): Response<ApiResponseDto>

    // ========================================
    // CONTENT ENDPOINTS
    // ========================================
    
    /**
     * Get all content categories
     */
    @GET("content/categories")
    suspend fun getCategories(): Response<List<CategoryDto>>
    
    /**
     * Get content by category
     */
    @GET("delivery/content/category/{categoryId}")
    suspend fun getContentByCategory(
        @Path("categoryId") categoryId: Int,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20,
        @Query("sort") sort: String? = null,
        @Query("filter") filter: String? = null
    ): Response<ContentResponseDto>
    
    /**
     * Get content details by ID
     */
    @GET("content/{contentId}")
    suspend fun getContentDetails(
        @Path("contentId") contentId: String
    ): Response<ContentDetailsDto>
    
    /**
     * Get movies (VOD content)
     */
    @GET("movies")
    suspend fun getMovies(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 50
    ): Response<List<ContentItemDto>>

    /**
     * Get TV channels
     */
    @GET("tv/channels")
    suspend fun getTvChannels(
        @Query("channel_category") channelCategory: String? = null,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 10000
    ): Response<List<ContentItemDto>>

    /**
     * Get series
     */
    @GET("series")
    suspend fun getSeries(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 10
    ): Response<List<ContentItemDto>>
    
    /**
     * Search content
     * Backend response schema: { content, total, page, limit, has_more }
     */
    @GET("delivery/content/search")
    suspend fun searchContent(
        @Query("q") query: String,
        @Query("category") category: String? = null,
        @Query("year") year: Int? = null,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20
    ): Response<ContentResponseDto>

    // ========================================
    // STREAMING ENDPOINTS
    // ========================================

    /**
     * Get streaming URL for content (with DRM support for Live TV/Events)
     */
    @GET("content/{contentId}/stream")
    suspend fun getContentStream(
        @Path("contentId") contentId: String
    ): Response<ContentStreamDto>

    /**
     * Get streaming URL for episode
     */
    @GET("episodes/{episodeId}/stream")
    suspend fun getEpisodeStream(
        @Path("episodeId") episodeId: String
    ): Response<EpisodeStreamDto>

    /**
     * Get available streams for content (multi-stream quality selector)
     */
    @GET("content/{contentId}/streams")
    suspend fun getContentStreams(
        @Path("contentId") contentId: String
    ): Response<List<StreamPublicDto>>

    /**
     * Get available streams for episode (multi-stream quality selector)
     */
    @GET("episodes/{episodeId}/streams")
    suspend fun getEpisodeStreams(
        @Path("episodeId") episodeId: String
    ): Response<List<StreamPublicDto>>

    // ========================================
    // SERIES & EPISODES ENDPOINTS
    // ========================================

    /**
     * Get series details by content ID
     */
    @GET("series/by-content/{contentId}")
    suspend fun getSeriesByContentId(
        @Path("contentId") contentId: String
    ): Response<SeriesDetailsDto>

    /**
     * Get series details by series ID
     */
    @GET("series/{seriesId}")
    suspend fun getSeriesDetails(
        @Path("seriesId") seriesId: Int
    ): Response<SeriesDetailsDto>

    /**
     * Get seasons for a series
     */
    @GET("series/{seriesId}/seasons")
    suspend fun getSeriesSeasons(
        @Path("seriesId") seriesId: String
    ): Response<List<SeasonDetailsDto>>

    /**
     * Get episodes for a season
     */
    @GET("episodes/season/{seasonId}")
    suspend fun getSeasonEpisodes(
        @Path("seasonId") seasonId: String
    ): Response<List<EpisodeDetailsDto>>

    // ========================================
    // LIVE TV ENDPOINTS
    // ========================================
    
    /**
     * Get all live TV channels
     * Backend returns a flat JSON array of ContentResponse objects (not wrapped).
     */
    @GET("tv/channels")
    suspend fun getChannels(
        @Query("channel_category") channelCategory: String? = null,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 10000
    ): Response<List<ContentItemDto>>

    /**
     * List available TV channel categories
     */
    @GET("tv/categories")
    suspend fun getTvChannelCategories(): Response<List<String>>
    
    /**
     * Get EPG data for multiple channels (backend format)
     */
    @GET("tv/epg")
    suspend fun getEPG(
        @Query("channel_ids") channelIds: String,
        @Query("start") start: String,
        @Query("end") end: String
    ): Response<EPGResponseDto>
    
    // ========================================
    // USER ENDPOINTS
    // ========================================
    
    /**
     * Admin: Scan folder ingest (requires admin role)
     * POST /api/admin/ingest/scan-folder
     */
    @POST("admin/ingest/scan-folder")
    suspend fun scanFolderIngest(
        @Body request: com.streamcore.tv.data.remote.dto.ScanFolderRequestDto
    ): Response<com.streamcore.tv.data.remote.dto.ScanFolderResultDto>
    
    /**
     * Get user profile
     */
    @GET("user/profile")
    suspend fun getUserProfile(): Response<UserProfileResponseDto>

    /**
     * Update user profile
     */
    @PUT("user/profile")
    suspend fun updateUserProfile(
        @Body request: UpdateProfileRequestDto
    ): Response<UserProfileResponseDto>

    /**
     * Change user password
     */
    @PUT("user/profile/password")
    suspend fun changePassword(
        @Body request: ChangePasswordRequestDto
    ): Response<ApiResponseDto>

    /**
     * Get user favorites (grouped by type: movies, series, channels, etc.)
     * Backend returns: { success: true, data: { movies: [...], series: [...], channels: [...] } }
     */
    @GET("user/favorites")
    suspend fun getFavorites(): Response<FavoritesResponseDto>
    
    /**
     * Add content to favorites
     * Backend expects POST body: { content_type: "movie"|"series"|"channel", content_id: "123" }
     */
    @POST("user/favorites")
    suspend fun addToFavorites(
        @Body request: AddFavoriteRequestDto
    ): Response<ApiResponseDto>
    
    /**
     * Remove content from favorites
     * Backend route: DELETE /api/user/favorites/:content_type/:content_id
     */
    @DELETE("user/favorites/{contentType}/{contentId}")
    suspend fun removeFromFavorites(
        @Path("contentType") contentType: String,
        @Path("contentId") contentId: String
    ): Response<ApiResponseDto>
    
    /**
     * Get watch history
     */
    @GET("user/history")
    suspend fun getWatchHistory(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 50
    ): Response<WatchHistoryResponseDto>
    
    /**
     * Save watch progress for resume functionality
     */
    @POST("user/progress")
    suspend fun saveWatchProgress(
        @Body request: SaveWatchProgressRequestDto
    ): Response<ApiResponseDto>
    
    /**
     * Get watch progress for specific content
     */
    @GET("user/progress/{contentId}")
    suspend fun getWatchProgress(
        @Path("contentId") contentId: Long
    ): Response<WatchProgressResponseDto>
    
    /**
     * Get continue watching list
     */
    @GET("user/continue-watching")
    suspend fun getContinueWatching(): Response<ContinueWatchingResponseDto>
    
    /**
     * Get user devices
     */
    @GET("user/devices")
    suspend fun getUserDevices(): Response<UserDevicesResponseDto>
    
    /**
     * Remove a device
     */
    @DELETE("devices/{deviceId}")
    suspend fun removeDevice(
        @Path("deviceId") deviceId: String
    ): Response<ApiResponseDto>

    /**
     * Check device limit status
     */
    @GET("user/device-status")
    suspend fun getDeviceStatus(): Response<DeviceStatusResponseDto>

    /**
     * Get user devices (backend format)
     */
    @GET("user/devices")
    suspend fun getUserDevicesBackend(): Response<UserDevicesBackendResponseDto>

    /**
     * Get user devices with max_devices (from /api/devices endpoint)
     */
    @GET("devices")
    suspend fun getUserDevicesWithLimit(): Response<UserDevicesWithLimitResponseDto>

    /**
     * Check for app updates
     */
    @GET("app/version")
    suspend fun checkVersion(
        @Query("app_type") appType: String,
        @Query("current_version_code") currentCode: Int
    ): Response<VersionCheckResponseDto>

}
