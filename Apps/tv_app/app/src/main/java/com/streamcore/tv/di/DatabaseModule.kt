package com.streamcore.tv.di

import android.content.Context
import androidx.room.Room
import com.streamcore.tv.data.local.database.IPTVDatabase
import com.streamcore.tv.data.local.dao.ContentDao
import com.streamcore.tv.data.local.dao.UserDao
import com.streamcore.tv.data.local.dao.ChannelDao
import com.streamcore.tv.data.local.dao.PlaybackProgressDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Hilt module for database dependencies
 * 
 * Provides:
 * - Room database instance
 * - DAO interfaces
 * - Database configuration
 */
@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {
    
    /**
     * Provides Room database instance
     */
    @Provides
    @Singleton
    fun provideIPTVDatabase(
        @ApplicationContext context: Context
    ): IPTVDatabase {
        return Room.databaseBuilder(
            context,
            IPTVDatabase::class.java,
            "iptv_database"
        )
            .fallbackToDestructiveMigration() // For development - remove in production
            .build()
    }
    
    /**
     * Provides Content DAO
     */
    @Provides
    fun provideContentDao(database: IPTVDatabase): ContentDao {
        return database.contentDao()
    }
    
    /**
     * Provides User DAO
     */
    @Provides
    fun provideUserDao(database: IPTVDatabase): UserDao {
        return database.userDao()
    }
    
    /**
     * Provides Channel DAO
     */
    @Provides
    fun provideChannelDao(database: IPTVDatabase): ChannelDao {
        return database.channelDao()
    }
    
    /**
     * Provides PlaybackProgress DAO
     */
    @Provides
    fun providePlaybackProgressDao(database: IPTVDatabase): PlaybackProgressDao {
        return database.playbackProgressDao()
    }
}
