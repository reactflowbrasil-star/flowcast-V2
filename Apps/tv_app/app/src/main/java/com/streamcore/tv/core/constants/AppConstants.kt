package com.streamcore.tv.core.constants

/**
 * Application constants
 */
object AppConstants {
    
    // API Configuration
    const val BASE_URL = "http://192.168.1.4:3000/"
    const val API_VERSION = "v1"
    const val TIMEOUT_SECONDS = 30L
    
    // Database
    const val DATABASE_NAME = "iptv_database"
    const val DATABASE_VERSION = 1
    
    // DataStore
    const val PREFERENCES_NAME = "iptv_preferences"
    const val AUTH_PREFERENCES = "auth_preferences"
    const val USER_PREFERENCES = "user_preferences"
    
    // Cache
    const val CACHE_SIZE = 10 * 1024 * 1024L // 10MB
    const val CACHE_MAX_AGE = 5 * 60 // 5 minutes
    const val CACHE_MAX_STALE = 24 * 60 * 60 // 24 hours
    
    // Pagination
    const val DEFAULT_PAGE_SIZE = 500
    const val MAX_PAGE_SIZE = 500
    
    // Content
    const val ACTIVATION_CODE_LENGTH = 6
    const val MIN_DEVICE_NAME_LENGTH = 3
    const val MAX_DEVICE_NAME_LENGTH = 50

    // Device Limits
    const val DEFAULT_MAX_DEVICES = 10 // Default device limit for users
    
    // Player
    const val PLAYER_SEEK_INCREMENT = 10000L // 10 seconds
    const val PLAYER_POSITION_UPDATE_INTERVAL = 1000L // 1 second
    const val PLAYER_CONTROLS_HIDE_DELAY = 3000L // 3 seconds
    
    // Image Loading
    const val IMAGE_CACHE_SIZE = 50 * 1024 * 1024L // 50MB
    const val IMAGE_PLACEHOLDER_FADE_DURATION = 300
    
    // Search
    const val SEARCH_DEBOUNCE_DELAY = 500L // 500ms
    const val MIN_SEARCH_QUERY_LENGTH = 2
    
    // Error Retry
    const val MAX_RETRY_ATTEMPTS = 3
    const val RETRY_DELAY_MS = 1000L
    
    // Content Types
    object ContentTypes {
        const val MOVIE = "movie"
        const val SERIES = "series"
        const val EPISODE = "episode"
        const val LIVE_TV = "live_tv"
    }
    
    // Video Quality
    object VideoQuality {
        const val AUTO = "auto"
        const val LOW = "480p"
        const val MEDIUM = "720p"
        const val HIGH = "1080p"
        const val ULTRA = "4k"
    }
    
    // Playback Speed
    object PlaybackSpeed {
        const val SPEED_0_5X = 0.5f
        const val SPEED_0_75X = 0.75f
        const val SPEED_1X = 1.0f
        const val SPEED_1_25X = 1.25f
        const val SPEED_1_5X = 1.5f
        const val SPEED_2X = 2.0f
    }
    
    // Device Types
    object DeviceTypes {
        const val ANDROID_TV = "android_tv"
        const val ANDROID_PHONE = "android_phone"
        const val ANDROID_TABLET = "android_tablet"
    }
    
    // Notification Channels
    object NotificationChannels {
        const val DOWNLOADS = "downloads"
        const val PLAYBACK = "playback"
        const val GENERAL = "general"
    }
    
    // Intent Actions
    object IntentActions {
        const val PLAY_CONTENT = "com.streamcore.tv.PLAY_CONTENT"
        const val OPEN_CONTENT = "com.streamcore.tv.OPEN_CONTENT"
    }
    
    // Bundle Keys
    object BundleKeys {
        const val CONTENT_ID = "content_id"
        const val CATEGORY_ID = "category_id"
        const val DEVICE_TOKEN = "device_token"
        const val ACTIVATION_CODE = "activation_code"
    }
    
    // Shared Preferences Keys
    object PreferenceKeys {
        const val FIRST_LAUNCH = "first_launch"
        const val LAST_UPDATE_CHECK = "last_update_check"
        const val USER_ONBOARDED = "user_onboarded"

        // Feature Flags
        const val CHANNEL_SWITCHER_V2 = "channel_switcher_v2"
        const val CHANNEL_SWITCHER_V2_PIP = "channel_switcher_v2_pip"
    }
    
    // Analytics Events
    object AnalyticsEvents {
        const val CONTENT_PLAYED = "content_played"
        const val CONTENT_SEARCHED = "content_searched"
        const val USER_REGISTERED = "user_registered"
        const val ERROR_OCCURRED = "error_occurred"
    }
}
