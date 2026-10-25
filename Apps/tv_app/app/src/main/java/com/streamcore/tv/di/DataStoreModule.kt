package com.streamcore.tv.di

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStore
import com.streamcore.tv.data.local.datastore.TokenManager
import com.streamcore.tv.data.local.datastore.UserPreferencesManager
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Hilt module for DataStore dependencies
 * 
 * Provides:
 * - DataStore instances
 * - Token manager
 * - User preferences manager
 */
@Module
@InstallIn(SingletonComponent::class)
object DataStoreModule {
    
    // DataStore extension property
    private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(
        name = "iptv_preferences"
    )
    
    /**
     * Provides DataStore instance
     */
    @Provides
    @Singleton
    fun provideDataStore(
        @ApplicationContext context: Context
    ): DataStore<Preferences> {
        return context.dataStore
    }
    
    /**
     * Provides Token Manager
     */
    @Provides
    @Singleton
    fun provideTokenManager(
        dataStore: DataStore<Preferences>
    ): TokenManager {
        return TokenManager(dataStore)
    }
    
    /**
     * Provides User Preferences Manager
     */
    @Provides
    @Singleton
    fun provideUserPreferencesManager(
        dataStore: DataStore<Preferences>
    ): UserPreferencesManager {
        return UserPreferencesManager(dataStore)
    }
}
