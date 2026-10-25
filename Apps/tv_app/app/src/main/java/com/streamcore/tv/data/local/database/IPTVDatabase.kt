package com.streamcore.tv.data.local.database

import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import android.content.Context
import com.streamcore.tv.data.local.dao.ChannelDao
import com.streamcore.tv.data.local.dao.ContentDao
import com.streamcore.tv.data.local.dao.UserDao
import com.streamcore.tv.data.local.dao.PlaybackProgressDao
import com.streamcore.tv.data.local.entity.*

/**
 * Room database for IPTV Android App
 * 
 * Contains all entities and provides access to DAOs
 */
@Database(
    entities = [
        ContentEntity::class,
        CategoryEntity::class,
        FavoriteEntity::class,
        WatchHistoryEntity::class,
        ChannelEntity::class,
        EPGProgramEntity::class,
        UserEntity::class,
        PlaybackProgressEntity::class
    ],
    version = 3,
    exportSchema = false
)
@TypeConverters(ContentConverters::class)
abstract class IPTVDatabase : RoomDatabase() {
    
    abstract fun contentDao(): ContentDao
    abstract fun channelDao(): ChannelDao
    abstract fun userDao(): UserDao
    abstract fun playbackProgressDao(): PlaybackProgressDao
    
    companion object {
        const val DATABASE_NAME = "iptv_database"
        
        @Volatile
        private var INSTANCE: IPTVDatabase? = null
        
        fun getDatabase(context: Context): IPTVDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    IPTVDatabase::class.java,
                    DATABASE_NAME
                )
                    .fallbackToDestructiveMigration()
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
