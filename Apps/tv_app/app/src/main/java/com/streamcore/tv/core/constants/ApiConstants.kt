package com.streamcore.tv.core.constants

import com.streamcore.tv.BuildConfig

/**
 * API constants and configuration
 * 
 * Centralizes all API-related constants and endpoints
 */
object ApiConstants {
    
    // API Base URLs (configured via BuildConfig in build.gradle)
    // Set backend.url in local.properties or IPTV_BACKEND_URL env var
    val API_BASE_URL: String = BuildConfig.API_BASE_URL
    val STREAM_BASE_URL: String = BuildConfig.STREAM_BASE_URL
    
    // BASE_URL without /api/ suffix for health checks etc.
    val BASE_URL: String = API_BASE_URL.removeSuffix("api/").removeSuffix("/")
    
    // API Endpoints
    object Endpoints {
        // Authentication
        const val LOGIN = "/auth/login"
        const val REFRESH_TOKEN = "/auth/refresh"
        const val LOGOUT = "/auth/logout"

        // Device Management
        const val DEVICE_REGISTRATION = "/devices"
        const val DEVICE_LIST = "/devices"
        const val DEVICE_CHECK = "/devices/{deviceId}/check"
        const val DEVICE_REMOVE = "/devices/{deviceId}"

        // User Profile
        const val USER_PROFILE = "/user/profile"
        const val CHANGE_PASSWORD = "/user/password"
        
        // Content
        const val CATEGORIES = "/content/categories"
        const val CONTENT_BY_CATEGORY = "/delivery/content/category/{categoryId}"
        const val CONTENT_SEARCH = "/delivery/content/search"
        const val FEATURED_CONTENT = "/delivery/content/featured"
        
        // Streaming
        const val CONTENT_STREAM = "/delivery/content/{contentId}/stream"
        const val EPISODE_STREAM = "/delivery/episodes/{episodeId}/stream"
        const val CHAPTER_STREAM = "/delivery/chapters/{chapterId}/stream"
        const val SCHEDULE_STREAM = "/delivery/schedules/{scheduleId}/stream"
        
        // User
        const val USER_DEVICES = "/user/devices"
        const val WATCH_HISTORY = "/user/history"
        const val FAVORITES = "/user/favorites"
        
        // Series and Episodes
        const val SERIES_DETAILS = "/series/{seriesId}"
        const val SERIES_SEASONS = "/series/{seriesId}/seasons"
        const val SEASON_EPISODES = "/series/{seriesId}/seasons/{seasonNumber}/episodes"
        
        // Specialized Content
        const val EVENTS = "/specialized/events"
        const val EVENT_SCHEDULES = "/specialized/events/{eventId}/schedules"
        const val KIDS_CONTENT = "/specialized/kids"
        const val ANIME_CONTENT = "/specialized/anime"
    }
    
    // HTTP Headers
    object Headers {
        const val AUTHORIZATION = "Authorization"
        const val CONTENT_TYPE = "Content-Type"
        const val ACCEPT = "Accept"
        const val USER_AGENT = "User-Agent"
        const val DEVICE_ID = "X-Device-ID"
        const val APP_VERSION = "X-App-Version"
    }
    
    // Content Types
    object ContentTypes {
        const val JSON = "application/json"
        const val FORM_DATA = "multipart/form-data"
        const val URL_ENCODED = "application/x-www-form-urlencoded"
    }
    
    // Request Parameters
    object Params {
        const val PAGE = "page"
        const val LIMIT = "limit"
        const val SORT = "sort"
        const val FILTER = "filter"
        const val QUERY = "query"
        const val CATEGORY_ID = "categoryId"
        const val CONTENT_TYPE = "type"
    }
    
    // Default Values
    object Defaults {
        const val PAGE_SIZE = 500
        const val MAX_PAGE_SIZE = 500
        const val TIMEOUT_SECONDS = 30L
        const val RETRY_ATTEMPTS = 3
        const val RETRY_DELAY_MS = 1000L
    }
    
    // Error Codes
    object ErrorCodes {
        const val UNAUTHORIZED = 401
        const val FORBIDDEN = 403
        const val NOT_FOUND = 404
        const val SERVER_ERROR = 500
        const val NETWORK_ERROR = -1
        const val TIMEOUT_ERROR = -2
    }
    
    // Helper functions
    fun buildContentUrl(contentId: String): String {
        return Endpoints.CONTENT_STREAM.replace("{contentId}", contentId)
    }
    
    fun buildCategoryUrl(categoryId: String): String {
        return Endpoints.CONTENT_BY_CATEGORY.replace("{categoryId}", categoryId)
    }
    
    fun buildSeriesUrl(seriesId: String): String {
        return Endpoints.SERIES_DETAILS.replace("{seriesId}", seriesId)
    }
    
    fun buildEpisodeStreamUrl(episodeId: String): String {
        return Endpoints.EPISODE_STREAM.replace("{episodeId}", episodeId)
    }
    
    fun buildChapterStreamUrl(chapterId: String): String {
        return Endpoints.CHAPTER_STREAM.replace("{chapterId}", chapterId)
    }
    
    fun buildScheduleStreamUrl(scheduleId: String): String {
        return Endpoints.SCHEDULE_STREAM.replace("{scheduleId}", scheduleId)
    }
    
    /**
     * Get full URL for an endpoint
     */
    fun getFullUrl(endpoint: String): String {
        return if (endpoint.startsWith("http")) {
            endpoint
        } else {
            API_BASE_URL + endpoint.removePrefix("/")
        }
    }
    
    /**
     * Check if the current configuration is using localhost (development)
     */
    fun isDevelopmentServer(): Boolean {
        return API_BASE_URL.contains("localhost") || API_BASE_URL.contains("127.0.0.1")
    }
    
    /**
     * Get server status URL for health checks
     */
    fun getServerStatusUrl(): String {
        return "$BASE_URL/api/health"
    }
}
