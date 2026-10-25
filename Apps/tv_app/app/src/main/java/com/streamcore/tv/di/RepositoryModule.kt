package com.streamcore.tv.di

import com.streamcore.tv.data.repository.AuthRepositoryImpl
import com.streamcore.tv.data.repository.ContentRepositoryImpl
import com.streamcore.tv.data.repository.ChannelsRepositoryImpl
import com.streamcore.tv.data.repository.UserRepositoryImpl
import com.streamcore.tv.domain.repository.AuthRepository
import com.streamcore.tv.domain.repository.ContentRepository
import com.streamcore.tv.domain.repository.ChannelsRepository
import com.streamcore.tv.domain.repository.UserRepository
import com.streamcore.tv.domain.repository.AppRepository
import com.streamcore.tv.domain.repository.PlaybackRepository // Import Interface
import com.streamcore.tv.data.repository.AppRepositoryImpl
import com.streamcore.tv.data.repository.PlaybackRepositoryImpl // Import Impl
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Hilt module for repository dependencies
 * 
 * Binds repository implementations to their interfaces
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {
    
    /**
     * Binds AuthRepository implementation
     */
    @Binds
    @Singleton
    abstract fun bindAuthRepository(
        authRepositoryImpl: AuthRepositoryImpl
    ): AuthRepository
    
    /**
     * Binds ContentRepository implementation
     */
    @Binds
    @Singleton
    abstract fun bindContentRepository(
        contentRepositoryImpl: ContentRepositoryImpl
    ): ContentRepository
    
    /**
     * Binds ChannelsRepository implementation
     */
    @Binds
    @Singleton
    abstract fun bindChannelsRepository(
        channelsRepositoryImpl: ChannelsRepositoryImpl
    ): ChannelsRepository
    
    /**
     * Binds UserRepository implementation
     */
    @Binds
    @Singleton
    abstract fun bindUserRepository(
        userRepositoryImpl: UserRepositoryImpl
    ): UserRepository

    /**
     * Binds AppRepository implementation
     */
    @Binds
    @Singleton
    abstract fun bindAppRepository(
        appRepositoryImpl: AppRepositoryImpl
    ): AppRepository

    /**
     * Binds PlaybackRepository implementation
     */
    @Binds
    @Singleton
    abstract fun bindPlaybackRepository(
        playbackRepositoryImpl: PlaybackRepositoryImpl
    ): PlaybackRepository
}
