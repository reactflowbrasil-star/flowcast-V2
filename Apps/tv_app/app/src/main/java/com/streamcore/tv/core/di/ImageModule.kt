package com.streamcore.tv.core.di

import android.content.Context
import coil.ImageLoader
import coil.decode.SvgDecoder
import coil.disk.DiskCache
import coil.memory.MemoryCache
import okhttp3.OkHttpClient
import com.streamcore.tv.core.constants.AppConstants
import com.streamcore.tv.core.network.NetworkSecurityHelper
import com.streamcore.tv.core.security.DynamicUserAgentManager
import dagger.Module
import dagger.Provides
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import timber.log.Timber
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

/**
 * Dependency injection module for image loading
 */
@Module
@InstallIn(SingletonComponent::class)
object ImageModule {
    private const val TAG = "ImageModule"

    /**
     * Creates an OkHttpClient for image loading with lenient SSL.
     */
    private fun createImageOkHttpClient(userAgentManager: DynamicUserAgentManager): OkHttpClient {
        Timber.tag(TAG).d("Creating OkHttpClient for Coil")
        return OkHttpClient.Builder()
            .apply { NetworkSecurityHelper.applyLenientSsl(this) }
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .addInterceptor { chain ->
                val originalRequest = chain.request()
                val userAgent = userAgentManager.getCurrentUserAgent() ?: "streamcore+android"
                val request = originalRequest.newBuilder()
                    .header("User-Agent", userAgent)
                    .build()
                chain.proceed(request)
            }
            .build()
    }

    @Provides
    @Singleton
    fun provideImageLoader(
        @ApplicationContext context: Context,
        userAgentManager: DynamicUserAgentManager
    ): ImageLoader {
        Timber.tag(TAG).d("Building ImageLoader with custom OkHttpClient")
        
        return ImageLoader.Builder(context)
            .okHttpClient(createImageOkHttpClient(userAgentManager))
            .components {
                // Add SVG decoder for channel logos
                add(SvgDecoder.Factory())
            }
            .memoryCache {
                MemoryCache.Builder(context)
                    .maxSizePercent(0.25) // Use 25% of available memory
                    .build()
            }
            .diskCache {
                DiskCache.Builder()
                    .directory(context.cacheDir.resolve("image_cache"))
                    .maxSizeBytes(AppConstants.IMAGE_CACHE_SIZE)
                    .build()
            }
            .crossfade(AppConstants.IMAGE_PLACEHOLDER_FADE_DURATION)
            .respectCacheHeaders(false)
            .allowHardware(true)
            .build()
    }
}

/**
 * Entry point for accessing ImageLoader from Composables
 */
@EntryPoint
@InstallIn(SingletonComponent::class)
interface ImageLoaderEntryPoint {
    fun imageLoader(): ImageLoader
}
