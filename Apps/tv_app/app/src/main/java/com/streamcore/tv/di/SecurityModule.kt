package com.streamcore.tv.di

import android.content.Context
import com.streamcore.tv.core.network.BackendHandler
import com.streamcore.tv.core.security.DynamicUserAgentManager
import com.streamcore.tv.core.security.NetworkSecurityManager
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import javax.inject.Singleton

/**
 * Security Module for Dependency Injection
 *
 * Provides security-related dependencies
 */
@Module
@InstallIn(SingletonComponent::class)
object SecurityModule {

    @Provides
    @Singleton
    fun provideNetworkSecurityManager(
        @ApplicationContext context: Context
    ): NetworkSecurityManager {
        return NetworkSecurityManager(context)
    }

    @Provides
    @Singleton
    fun provideApplicationCoroutineScope(): CoroutineScope {
        return CoroutineScope(SupervisorJob() + Dispatchers.IO)
    }

    @Provides
    @Singleton
    fun provideDynamicUserAgentManager(
        @ApplicationContext context: Context,
        coroutineScope: CoroutineScope
    ): DynamicUserAgentManager {
        return DynamicUserAgentManager(context, coroutineScope)
    }

    @Provides
    @Singleton
    fun provideBackendHandler(
        @ApplicationContext context: Context
    ): BackendHandler {
        return BackendHandler(context)
    }
}
