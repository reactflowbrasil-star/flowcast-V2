package com.streamcore.tv.di

import com.streamcore.tv.core.utils.StringProvider
import com.streamcore.tv.core.utils.StringProviderImpl
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Hilt module for utility bindings.
 * Provides common utilities like StringProvider for i18n support.
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class UtilityModule {
    
    @Binds
    @Singleton
    abstract fun bindStringProvider(impl: StringProviderImpl): StringProvider
}
