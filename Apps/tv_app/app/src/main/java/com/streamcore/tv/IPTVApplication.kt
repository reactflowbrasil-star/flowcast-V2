package com.streamcore.tv

import android.app.Application
import dagger.hilt.android.HiltAndroidApp
import timber.log.Timber
import java.io.File
import com.streamcore.tv.core.perf.DebugPerformanceTracer
import com.streamcore.tv.core.utils.LanguageManager

/**
 * Application class for IPTV Android App
 * 
 * Handles:
 * - Hilt dependency injection initialization
 * - Logging setup
 * - ExoPlayer cache initialization
 * - Global app configuration
 */
import coil.ImageLoader
import coil.ImageLoaderFactory
import javax.inject.Inject

/**
 * Application class for IPTV Android App
 * 
 * Handles:
 * - Hilt dependency injection initialization
 * - Logging setup
 * - ExoPlayer cache initialization
 * - Global app configuration
 * - Coil ImageLoader configuration
 */
@HiltAndroidApp
class IPTVApplication : Application(), ImageLoaderFactory {

    @Inject
    lateinit var imageLoader: dagger.Lazy<ImageLoader>

    override fun newImageLoader(): ImageLoader = imageLoader.get()
    
    override fun onCreate() {
        super.onCreate()

        DebugPerformanceTracer.start(
            metric = "startup.app_on_create_to_first_compose_ms",
            token = "process"
        )
        
        // Initialize logging in debug mode
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
            Timber.d("IPTV Application started in DEBUG mode")
        }
        
        // Initialize ExoPlayer cache
        initializeExoPlayerCache()

        // Initialize language manager
        initializeLanguageManager()

        // Log app info
        Timber.i("IPTV Application initialized - Version: ${BuildConfig.VERSION_NAME}")
    }
    
    /**
     * Initialize ExoPlayer cache directory
     */
    private fun initializeExoPlayerCache() {
        try {
            val cacheDir = File(cacheDir, "exoplayer_cache")
            if (!cacheDir.exists()) {
                val created = cacheDir.mkdirs()
                Timber.d("ExoPlayer cache directory created: $created")
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to create ExoPlayer cache directory")
        }
    }

    /**
     * Initialize language manager with saved preferences
     */
    private fun initializeLanguageManager() {
        try {
            val languageManager = LanguageManager.getInstance(this)
            languageManager.initializeLanguage()
            Timber.d("Language manager initialized")
        } catch (e: Exception) {
            Timber.e(e, "Failed to initialize language manager")
        }
    }
}
