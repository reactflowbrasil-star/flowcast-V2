package com.streamcore.tv.core.featureflags

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

// Top-level DataStore delegate to ensure a single instance and proper delegate usage
private val Context.featureFlagsDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "feature_flags"
)

/**
 * FeatureFlagManager
 *
 * Local DataStore-backed feature flags with optional in-memory override.
 * - Primary storage: DataStore preferences file "feature_flags"
 * - In-memory overrides: highest priority, for instant rollback or remote toggles
 *
 * API:
 * - isEnabled(key): Boolean
 * - observe(key): Flow<Boolean>
 * - setEnabled(key, enabled)
 * - setRemoteOverride(key, enabled) / clearRemoteOverride(key)
 */
@Singleton
class FeatureFlagManager @Inject constructor(
    @ApplicationContext private val appContext: Context
) {

    // Simple in-memory overrides (highest priority)
    private val overrides: MutableMap<String, Boolean> = mutableMapOf()

    /**
     * Check if a flag is enabled.
     * Order of precedence:
     * 1) In-memory override
     * 2) DataStore value
     * 3) Provided default
     */
    suspend fun isEnabled(key: String, default: Boolean = false): Boolean {
        overrides[key]?.let { return it }
        return try {
            val prefKey = booleanPreferencesKey(key)
            val value = appContext.featureFlagsDataStore.data.first()[prefKey]
            value ?: default
        } catch (e: Exception) {
            Timber.w(e, "FeatureFlagManager.isEnabled: falling back to default for key=$key")
            default
        }
    }

    /**
     * Observe changes to a flag in DataStore and include in-memory overrides.
     * In-memory overrides win when present.
     */
    fun observe(key: String, default: Boolean = false): Flow<Boolean> {
        val prefKey = booleanPreferencesKey(key)
        return appContext.featureFlagsDataStore.data.map { prefs ->
            overrides[key] ?: prefs[prefKey] ?: default
        }
    }

    /**
     * Persist a flag value to DataStore.
     */
    suspend fun setEnabled(key: String, enabled: Boolean) {
        try {
            val prefKey = booleanPreferencesKey(key)
            appContext.featureFlagsDataStore.edit { prefs ->
                prefs[prefKey] = enabled
            }
            Timber.i("FeatureFlagManager: setEnabled key=$key enabled=$enabled")
        } catch (e: Exception) {
            Timber.e(e, "FeatureFlagManager.setEnabled failed for key=$key")
        }
    }

    /**
     * Apply a temporary in-memory override with highest priority.
     * Useful for instant rollback or experimentation without persistence.
     */
    fun setRemoteOverride(key: String, enabled: Boolean) {
        overrides[key] = enabled
        Timber.i("FeatureFlagManager: override key=$key enabled=$enabled")
    }

    /**
     * Clear an in-memory override for a flag.
     */
    fun clearRemoteOverride(key: String) {
        overrides.remove(key)
        Timber.i("FeatureFlagManager: override cleared key=$key")
    }

    /**
     * Clear all in-memory overrides.
     */
    fun clearAllOverrides() {
        overrides.clear()
        Timber.i("FeatureFlagManager: all overrides cleared")
    }
}