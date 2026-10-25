package com.streamcore.tv.core.featureflags

import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@EntryPoint
@InstallIn(SingletonComponent::class)
interface FeatureFlagsEntryPoint {
    fun featureFlagManager(): FeatureFlagManager
}