package com.streamcore.tv.core.image

import android.content.Context
import coil.ImageLoader
import coil.decode.SvgDecoder
import coil.disk.DiskCache
import coil.memory.MemoryCache
import coil.request.CachePolicy
import coil.util.DebugLogger
import com.streamcore.tv.BuildConfig
import com.streamcore.tv.core.constants.AppConstants
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Provides a configured ImageLoader with SVG support for the app
 */
@Singleton
class ImageLoaderProvider @Inject constructor(
    @ApplicationContext private val context: Context
) {
    
    val imageLoader: ImageLoader by lazy {
        ImageLoader.Builder(context)
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
            .apply {
                if (BuildConfig.DEBUG) {
                    logger(DebugLogger())
                }
            }
            .build()
    }
}
