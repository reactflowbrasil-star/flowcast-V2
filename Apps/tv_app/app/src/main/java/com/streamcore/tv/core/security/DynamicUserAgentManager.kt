package com.streamcore.tv.core.security

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import timber.log.Timber
import java.util.concurrent.atomic.AtomicReference
import javax.inject.Inject
import javax.inject.Singleton

    /**
     * Dynamic User-Agent Manager
     *
     * Manages automatic renewal of dynamic User-Agent.
     * Updated: validity window extended from ~8–9 minutes to 12 hours.
     */
@Singleton
class DynamicUserAgentManager @Inject constructor(
    private val context: Context,
    private val coroutineScope: CoroutineScope
) {
    
    companion object {
        private val USER_AGENT_KEY = stringPreferencesKey("dynamic_user_agent")
        private val LAST_UPDATE_KEY = stringPreferencesKey("user_agent_last_update")
        private const val USER_AGENT_VALIDITY_MS = Long.MAX_VALUE // static UA, never expires
    }
    
    private val Context.userAgentDataStore: DataStore<Preferences> by preferencesDataStore(
        name = "user_agent_prefs"
    )
    
    private val currentUserAgent = AtomicReference<String?>(null)
    private val renewalMutex = kotlinx.coroutines.sync.Mutex()
    private var isRenewing = AtomicReference(false)
    
    /**
     * Initialize with User-Agent from login response
     */
    fun initialize(userAgent: String) {
        Timber.d("🔐 Initializing Dynamic User-Agent Manager")

        currentUserAgent.set(userAgent)

        // Save to persistent storage with current timestamp
        coroutineScope.launch {
            saveUserAgent(userAgent)
        }
    }
    
    /**
     * Get current User-Agent
     */
    fun getCurrentUserAgent(): String? {
        return currentUserAgent.get()
    }
    
    /**
     * Get User-Agent as Flow for reactive updates
     */
    fun getUserAgentFlow(): Flow<String?> {
        return context.userAgentDataStore.data
            .map { preferences ->
                preferences[USER_AGENT_KEY]
            }
            .distinctUntilChanged()
    }
    
    /**
     * Update User-Agent with new value
     */
    fun updateUserAgent(userAgent: String) {
        Timber.d("🔐 Updating User-Agent")
        currentUserAgent.set(userAgent)

        // Save to persistent storage with current timestamp
        coroutineScope.launch {
            saveUserAgent(userAgent)
        }
    }
    
    // Static UA never needs renewal
    fun needsRenewal(): Boolean = false
    
    /**
     * Save User-Agent to persistent storage with current timestamp
     */
    private suspend fun saveUserAgent(userAgent: String) {
        try {
            val currentTime = System.currentTimeMillis()
            context.userAgentDataStore.edit { preferences ->
                preferences[USER_AGENT_KEY] = userAgent
                preferences[LAST_UPDATE_KEY] = currentTime.toString()
            }
            Timber.d("🔐 User-Agent saved to storage at: $currentTime")
        } catch (e: Exception) {
            Timber.e(e, "Error saving User-Agent to storage")
        }
    }
    
    /**
     * Load User-Agent from storage on app restart
     */
    suspend fun loadFromStorage(): String? {
        return try {
            val preferences = context.userAgentDataStore.data.first()
            val userAgent = preferences[USER_AGENT_KEY]
            if (userAgent != null) {
                currentUserAgent.set(userAgent)
                Timber.d("🔐 Loaded static User-Agent from storage")
                userAgent
            } else {
                Timber.d("🔐 No stored User-Agent found")
                null
            }
        } catch (e: Exception) {
            Timber.e(e, "Error loading User-Agent from storage")
            null
        }
    }


    /**
     * Clear User-Agent (on logout)
     */
    suspend fun clear() {
        Timber.d("🔐 Clearing User-Agent")
        currentUserAgent.set(null)

        try {
            context.userAgentDataStore.edit { preferences ->
                preferences.remove(USER_AGENT_KEY)
                preferences.remove(LAST_UPDATE_KEY)
            }
        } catch (e: Exception) {
            Timber.e(e, "Error clearing User-Agent from storage")
        }
    }
}
