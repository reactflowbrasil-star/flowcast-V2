package com.streamcore.tv.di

import android.content.Context
import com.streamcore.tv.core.media.CodecCompatibilityHelper
import com.streamcore.tv.core.network.NetworkSecurityHelper
import com.streamcore.tv.core.security.DynamicUserAgentManager
import com.streamcore.tv.data.local.datastore.TokenManager
import com.streamcore.tv.presentation.player.DrmHelper
import com.streamcore.tv.presentation.player.ExoPlayerManager
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Dependency injection module for player-related dependencies
 */
@Module
@InstallIn(SingletonComponent::class)
object PlayerModule {

    @Provides
    @Singleton
    fun provideDrmHelper(
        tokenManager: TokenManager,
        userAgentManager: DynamicUserAgentManager
    ): DrmHelper {
        return DrmHelper(tokenManager, userAgentManager)
    }

    @Provides
    @Singleton
    fun provideNetworkSecurityHelper(
        @ApplicationContext context: Context
    ): NetworkSecurityHelper {
        return NetworkSecurityHelper(context)
    }

    @Provides
    @Singleton
    fun provideCodecCompatibilityHelper(
        @ApplicationContext context: Context
    ): CodecCompatibilityHelper {
        return CodecCompatibilityHelper(context)
    }

    @Provides
    @Singleton
    fun provideExoPlayerManager(
        @ApplicationContext context: Context,
        drmHelper: DrmHelper,
        networkSecurityHelper: NetworkSecurityHelper,
        codecCompatibilityHelper: CodecCompatibilityHelper,
        tokenManager: TokenManager,
        userAgentManager: DynamicUserAgentManager
    ): ExoPlayerManager {
        return ExoPlayerManager(context, drmHelper, networkSecurityHelper, codecCompatibilityHelper, tokenManager, userAgentManager)
    }
}
