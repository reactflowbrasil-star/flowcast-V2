package com.streamcore.tv.data.local.datastore

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manager for handling user preferences using DataStore
 * 
 * Handles:
 * - Video quality preferences
 * - Autoplay settings
 * - Subtitle preferences
 * - Language settings
 */
@Singleton
class UserPreferencesManager @Inject constructor(
    private val dataStore: DataStore<Preferences>
) {
    
    companion object {
        // Video preferences
        private val VIDEO_QUALITY_KEY = stringPreferencesKey("video_quality")
        private val AUTOPLAY_KEY = booleanPreferencesKey("autoplay")
        private val SUBTITLES_KEY = booleanPreferencesKey("subtitles")
        
        // App preferences
        private val LANGUAGE_KEY = stringPreferencesKey("language")
        private val FIRST_LAUNCH_KEY = booleanPreferencesKey("first_launch")
        
        // Favorites and overlay state
        private val FAVORITES_KEY = stringPreferencesKey("favorites")
        private val LAST_SELECTED_CATEGORY_KEY = stringPreferencesKey("last_selected_category")
        private val LAST_VIEWED_CHANNEL_KEY = stringPreferencesKey("last_viewed_channel")
        
        // Player preferences
        private val PLAYER_VOLUME_KEY = stringPreferencesKey("player_volume")
        private val PLAYER_BRIGHTNESS_KEY = stringPreferencesKey("player_brightness")
        private val PLAYER_TYPE_KEY = stringPreferencesKey("player_type")
        private val HWDEC_MODE_KEY = stringPreferencesKey("hwdec_mode")
        
        // Default values
        const val DEFAULT_PLAYER_TYPE = "auto"
        const val DEFAULT_HWDEC_MODE = "auto-safe"
        
        // UI preferences
        private val THEME_KEY = stringPreferencesKey("theme")
        private val GRID_SIZE_KEY = stringPreferencesKey("grid_size")
        
        // Default values
        const val DEFAULT_VIDEO_QUALITY = "AUTO"
        const val DEFAULT_LANGUAGE = "es"
        const val DEFAULT_AUTOPLAY = true
        const val DEFAULT_SUBTITLES = false
        const val DEFAULT_THEME = "dark"
        const val DEFAULT_GRID_SIZE = "medium"
        const val DEFAULT_FIRST_LAUNCH = true
    }
    
    // ========================================
    // VIDEO PREFERENCES
    // ========================================
    
    /**
     * Get video quality preference
     */
    fun getVideoQuality(): Flow<String> {
        return dataStore.data.map { preferences ->
            preferences[VIDEO_QUALITY_KEY] ?: DEFAULT_VIDEO_QUALITY
        }
    }
    
    /**
     * Save video quality preference
     */
    suspend fun saveVideoQuality(quality: String) {
        try {
            dataStore.edit { preferences ->
                preferences[VIDEO_QUALITY_KEY] = quality
            }
            Timber.d("Video quality saved: $quality")
        } catch (e: Exception) {
            Timber.e(e, "Failed to save video quality")
        }
    }
    
    /**
     * Get autoplay preference
     */
    fun getAutoplay(): Flow<Boolean> {
        return dataStore.data.map { preferences ->
            preferences[AUTOPLAY_KEY] ?: DEFAULT_AUTOPLAY
        }
    }
    
    /**
     * Save autoplay preference
     */
    suspend fun saveAutoplay(enabled: Boolean) {
        try {
            dataStore.edit { preferences ->
                preferences[AUTOPLAY_KEY] = enabled
            }
            Timber.d("Autoplay saved: $enabled")
        } catch (e: Exception) {
            Timber.e(e, "Failed to save autoplay preference")
        }
    }
    
    /**
     * Get subtitles preference
     */
    fun getSubtitles(): Flow<Boolean> {
        return dataStore.data.map { preferences ->
            preferences[SUBTITLES_KEY] ?: DEFAULT_SUBTITLES
        }
    }
    
    /**
     * Save subtitles preference
     */
    suspend fun saveSubtitles(enabled: Boolean) {
        try {
            dataStore.edit { preferences ->
                preferences[SUBTITLES_KEY] = enabled
            }
            Timber.d("Subtitles saved: $enabled")
        } catch (e: Exception) {
            Timber.e(e, "Failed to save subtitles preference")
        }
    }
    
    // ========================================
    // APP PREFERENCES
    // ========================================
    
    /**
     * Get language preference
     */
    fun getLanguage(): Flow<String> {
        return dataStore.data.map { preferences ->
            preferences[LANGUAGE_KEY] ?: DEFAULT_LANGUAGE
        }
    }
    
    /**
     * Save language preference
     */
    suspend fun saveLanguage(language: String) {
        try {
            dataStore.edit { preferences ->
                preferences[LANGUAGE_KEY] = language
            }
            Timber.d("Language saved: $language")
        } catch (e: Exception) {
            Timber.e(e, "Failed to save language preference")
        }
    }
    
    // ========================================
    // UI PREFERENCES
    // ========================================
    
    /**
     * Get theme preference
     */
    fun getTheme(): Flow<String> {
        return dataStore.data.map { preferences ->
            preferences[THEME_KEY] ?: DEFAULT_THEME
        }
    }
    
    /**
     * Save theme preference
     */
    suspend fun saveTheme(theme: String) {
        try {
            dataStore.edit { preferences ->
                preferences[THEME_KEY] = theme
            }
            Timber.d("Theme saved: $theme")
        } catch (e: Exception) {
            Timber.e(e, "Failed to save theme preference")
        }
    }
    
    /**
     * Get grid size preference
     */
    fun getGridSize(): Flow<String> {
        return dataStore.data.map { preferences ->
            preferences[GRID_SIZE_KEY] ?: DEFAULT_GRID_SIZE
        }
    }
    
    /**
     * Save grid size preference
     */
    suspend fun saveGridSize(size: String) {
        try {
            dataStore.edit { preferences ->
                preferences[GRID_SIZE_KEY] = size
            }
            Timber.d("Grid size saved: $size")
        } catch (e: Exception) {
            Timber.e(e, "Failed to save grid size preference")
        }
    }
    
    // ========================================
    // BULK OPERATIONS
    // ========================================
    
    /**
     * Reset all preferences to defaults
     */
    suspend fun resetToDefaults() {
        try {
            dataStore.edit { preferences ->
                preferences[VIDEO_QUALITY_KEY] = DEFAULT_VIDEO_QUALITY
                preferences[AUTOPLAY_KEY] = DEFAULT_AUTOPLAY
                preferences[SUBTITLES_KEY] = DEFAULT_SUBTITLES
                preferences[LANGUAGE_KEY] = DEFAULT_LANGUAGE
                preferences[THEME_KEY] = DEFAULT_THEME
                preferences[GRID_SIZE_KEY] = DEFAULT_GRID_SIZE
            }
            Timber.d("All preferences reset to defaults")
        } catch (e: Exception) {
            Timber.e(e, "Failed to reset preferences")
        }
    }
    
    /**
     * Get all preferences as a combined flow
     */
    data class UserPreferences(
        val videoQuality: String,
        val autoplay: Boolean,
        val subtitles: Boolean,
        val language: String,
        val theme: String,
        val gridSize: String,
        val playerType: String,
        val hwdecMode: String
    )
    
    fun getAllPreferences(): Flow<UserPreferences> {
        return dataStore.data.map { preferences ->
            UserPreferences(
                videoQuality = preferences[VIDEO_QUALITY_KEY] ?: DEFAULT_VIDEO_QUALITY,
                autoplay = preferences[AUTOPLAY_KEY] ?: DEFAULT_AUTOPLAY,
                subtitles = preferences[SUBTITLES_KEY] ?: DEFAULT_SUBTITLES,
                language = preferences[LANGUAGE_KEY] ?: DEFAULT_LANGUAGE,
                theme = preferences[THEME_KEY] ?: DEFAULT_THEME,
                gridSize = preferences[GRID_SIZE_KEY] ?: DEFAULT_GRID_SIZE,
                playerType = preferences[PLAYER_TYPE_KEY] ?: DEFAULT_PLAYER_TYPE,
                hwdecMode = preferences[HWDEC_MODE_KEY] ?: DEFAULT_HWDEC_MODE
            )
        }
    }

    // ========================================
    // PLAYER PREFERENCES
    // ========================================

    fun getPlayerType(): Flow<String> {
        return dataStore.data.map { preferences ->
            preferences[PLAYER_TYPE_KEY] ?: DEFAULT_PLAYER_TYPE
        }
    }

    suspend fun savePlayerType(type: String) {
        try {
            dataStore.edit { preferences ->
                preferences[PLAYER_TYPE_KEY] = type
            }
            Timber.d("Player type saved: $type")
        } catch (e: Exception) {
            Timber.e(e, "Failed to save player type")
        }
    }

    fun getHwdecMode(): Flow<String> {
        return dataStore.data.map { preferences ->
            preferences[HWDEC_MODE_KEY] ?: DEFAULT_HWDEC_MODE
        }
    }

    suspend fun saveHwdecMode(mode: String) {
        try {
            dataStore.edit { preferences ->
                preferences[HWDEC_MODE_KEY] = mode
            }
            Timber.d("HWDEC mode saved: $mode")
        } catch (e: Exception) {
            Timber.e(e, "Failed to save hwdec mode")
        }
    }

    // ========================================
    // FIRST LAUNCH METHODS
    // ========================================

    /**
     * Check if this is the first launch of the app
     */
    fun isFirstLaunch(): Flow<Boolean> {
        return dataStore.data.map { preferences ->
            preferences[FIRST_LAUNCH_KEY] ?: DEFAULT_FIRST_LAUNCH
        }
    }

    /**
     * Mark that the app has been launched (no longer first launch)
     */
    suspend fun setFirstLaunchCompleted() {
        try {
            dataStore.edit { preferences ->
                preferences[FIRST_LAUNCH_KEY] = false
            }
            Timber.d("First launch completed")
        } catch (e: Exception) {
            Timber.e(e, "Failed to set first launch completed")
        }
    }

    /**
     * Clear all user-specific data when switching accounts
     * This ensures no data persists between different user accounts
     */
    suspend fun clearUserSpecificData() {
        try {
            dataStore.edit { preferences ->
                // Reset first launch flag for new user
                preferences[FIRST_LAUNCH_KEY] = DEFAULT_FIRST_LAUNCH

                // Keep general app preferences (video quality, language, etc.)
                // as these are device-level preferences, not user-specific
            }
            Timber.d("User-specific data cleared for account switch")
        } catch (e: Exception) {
            Timber.e(e, "Failed to clear user-specific data")
        }
    }

    // ========================================
    // FAVORITES & OVERLAY PERSISTENCE
    // ========================================

    /**
     * Get favorites as a Flow of channelId set (stored as comma-separated string)
     */
    fun getFavorites(): Flow<Set<String>> {
        return dataStore.data.map { preferences ->
            val raw = preferences[FAVORITES_KEY] ?: ""
            if (raw.isBlank()) emptySet() else raw.split(",").filter { it.isNotBlank() }.toSet()
        }
    }

    /**
     * Add favorite
     */
    suspend fun addFavorite(channelId: String) {
        try {
            dataStore.edit { preferences ->
                val raw = preferences[FAVORITES_KEY] ?: ""
                val set = if (raw.isBlank()) mutableSetOf() else raw.split(",").toMutableSet()
                set.add(channelId)
                preferences[FAVORITES_KEY] = set.joinToString(",")
            }
            Timber.d("Favorite added: $channelId")
        } catch (e: Exception) {
            Timber.e(e, "Failed to add favorite")
        }
    }

    /**
     * Remove favorite
     */
    suspend fun removeFavorite(channelId: String) {
        try {
            dataStore.edit { preferences ->
                val raw = preferences[FAVORITES_KEY] ?: ""
                val set = if (raw.isBlank()) mutableSetOf() else raw.split(",").toMutableSet()
                set.remove(channelId)
                preferences[FAVORITES_KEY] = set.joinToString(",")
            }
            Timber.d("Favorite removed: $channelId")
        } catch (e: Exception) {
            Timber.e(e, "Failed to remove favorite")
        }
    }

    /**
     * Save last selected category
     */
    suspend fun saveLastSelectedCategory(category: String?) {
        try {
            dataStore.edit { preferences ->
                preferences[LAST_SELECTED_CATEGORY_KEY] = category ?: ""
            }
            Timber.d("Last selected category saved: $category")
        } catch (e: Exception) {
            Timber.e(e, "Failed to save last selected category")
        }
    }

    fun getLastSelectedCategory(): Flow<String?> {
        return dataStore.data.map { preferences ->
            preferences[LAST_SELECTED_CATEGORY_KEY] ?: null
        }
    }

    /**
     * Save last viewed channel
     */
    suspend fun saveLastViewedChannel(channelId: String?) {
        try {
            dataStore.edit { preferences ->
                preferences[LAST_VIEWED_CHANNEL_KEY] = channelId ?: ""
            }
            Timber.d("Last viewed channel saved: $channelId")
        } catch (e: Exception) {
            Timber.e(e, "Failed to save last viewed channel")
        }
    }

    fun getLastViewedChannel(): Flow<String?> {
        return dataStore.data.map { preferences ->
            preferences[LAST_VIEWED_CHANNEL_KEY] ?: null
        }
    }

}
