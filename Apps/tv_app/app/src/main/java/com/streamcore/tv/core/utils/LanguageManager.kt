package com.streamcore.tv.core.utils

import android.content.Context
import android.content.SharedPreferences
import android.content.res.Configuration
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.streamcore.tv.BuildConfig
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import timber.log.Timber
import java.util.Locale

/**
 * Manager for handling app language preferences and locale changes
 */
class LanguageManager(private val context: Context) {
    
    companion object {
        private const val PREFS_NAME = "language_prefs"
        private const val TAG = "LanguageManager"
        private const val KEY_LANGUAGE = "selected_language"
        private const val LANGUAGE_SPANISH = "es"
        private const val LANGUAGE_ENGLISH = "en"
        private const val LANGUAGE_FRENCH = "fr"
        private const val LANGUAGE_PORTUGUESE = "pt"
        private const val LANGUAGE_RUSSIAN = "ru"
        private const val LANGUAGE_TURKISH = "tr"
        private const val LANGUAGE_SLOVAK = "sk"
        private const val LANGUAGE_CHINESE = "zh"
        private const val LANGUAGE_SYSTEM = "system"
        
        @Volatile
        private var INSTANCE: LanguageManager? = null
        
        fun getInstance(context: Context): LanguageManager {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: LanguageManager(context.applicationContext).also { INSTANCE = it }
            }
        }
    }
    
    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    
    private val _currentLanguage = MutableStateFlow(getCurrentLanguage())
    val currentLanguage: StateFlow<String> = _currentLanguage.asStateFlow()
    
    /**
     * Available languages in the app
     */
    enum class Language(val code: String, val displayName: String) {
        SYSTEM("system", "System"),
        SPANISH("es", "Spanish"),
        ENGLISH("en", "English"),
        FRENCH("fr", "French"),
        PORTUGUESE("pt", "Portuguese"),
        RUSSIAN("ru", "Русский"),
        TURKISH("tr", "Türkçe"),
        SLOVAK("sk", "Slovenčina"),
        CHINESE("zh", "中文")
    }
    
    /**
     * Get the currently selected language
     */
    fun getCurrentLanguage(): String {
        return prefs.getString(KEY_LANGUAGE, BuildConfig.DEFAULT_LANGUAGE) ?: BuildConfig.DEFAULT_LANGUAGE
    }
    
    /**
     * Set the app language
     */
    fun setLanguage(languageCode: String) {
        val oldLanguage = getCurrentLanguage()
        prefs.edit().putString(KEY_LANGUAGE, languageCode).apply()
        _currentLanguage.value = languageCode
        
        // Apply the language change immediately
        applyLanguage(languageCode)
        
        // Log the language change
        Timber.tag(TAG).d("Language changed from %s to %s", oldLanguage, languageCode)
        
        // Force a more aggressive locale update
        forceLocaleUpdate(languageCode)
    }
    
    /**
     * Force a more aggressive locale update
     */
    private fun forceLocaleUpdate(languageCode: String) {
        try {
            val locale = resolveLocaleForCode(languageCode)
            
            // Set default locale globally
            Locale.setDefault(locale)
            
            // Update application resources
            val config = Configuration(context.resources.configuration)
            config.setLocales(android.os.LocaleList(locale))
            context.createConfigurationContext(config)
            
            // Force resource update
            @Suppress("DEPRECATION")
            context.resources.updateConfiguration(config, context.resources.displayMetrics)
            
            Timber.tag(TAG).d("Forced locale update to: %s", locale.language)
        } catch (e: Exception) {
            Timber.tag(TAG).e(e, "Failed to force locale update")
        }
    }
    
    /**
     * Apply language to the current context
     */
    private fun applyLanguage(languageCode: String) {
        val locale = resolveLocaleForCode(languageCode)
        
        Timber.tag(TAG).d("Applying locale: %s", locale.language)
        
        Locale.setDefault(locale)
        updateConfiguration(locale)
        
        // Force update of resources
        try {
            @Suppress("DEPRECATION")
            context.resources.updateConfiguration(
                context.resources.configuration,
                context.resources.displayMetrics
            )
        } catch (e: Exception) {
            Timber.tag(TAG).w(e, "Failed to update resources configuration")
        }
    }
    
    /**
     * Get system default locale
     */
    private fun getSystemLocale(localeContext: Context = context): Locale {
        val locales = localeContext.resources.configuration.locales
        return if (!locales.isEmpty) locales[0] else Locale.getDefault()
    }

    /**
     * Resolve locale from stored language code.
     */
    private fun resolveLocaleForCode(languageCode: String, localeContext: Context = context): Locale {
        return when (languageCode) {
            LANGUAGE_SPANISH -> Locale("es")
            LANGUAGE_ENGLISH -> Locale("en")
            LANGUAGE_FRENCH -> Locale("fr")
            LANGUAGE_PORTUGUESE -> Locale("pt")
            LANGUAGE_RUSSIAN -> Locale("ru")
            LANGUAGE_TURKISH -> Locale("tr")
            LANGUAGE_SLOVAK -> Locale("sk")
            LANGUAGE_CHINESE -> Locale("zh")
            LANGUAGE_SYSTEM -> getSystemLocale(localeContext)
            else -> getSystemLocale(localeContext)
        }
    }
    
    /**
     * Update app configuration with new locale
     */
    private fun updateConfiguration(locale: Locale) {
        val config = Configuration(context.resources.configuration)
        config.setLocales(android.os.LocaleList(locale))
        context.createConfigurationContext(config)
        @Suppress("DEPRECATION")
        context.resources.updateConfiguration(config, context.resources.displayMetrics)
    }
    
    /**
     * Get display name for language code
     */
    fun getLanguageDisplayName(languageCode: String): String {
        return when (languageCode) {
            LANGUAGE_SPANISH -> Language.SPANISH.displayName
            LANGUAGE_ENGLISH -> Language.ENGLISH.displayName
            LANGUAGE_FRENCH -> Language.FRENCH.displayName
            LANGUAGE_PORTUGUESE -> Language.PORTUGUESE.displayName
            LANGUAGE_RUSSIAN -> Language.RUSSIAN.displayName
            LANGUAGE_TURKISH -> Language.TURKISH.displayName
            LANGUAGE_SLOVAK -> Language.SLOVAK.displayName
            LANGUAGE_CHINESE -> Language.CHINESE.displayName
            LANGUAGE_SYSTEM -> Language.SYSTEM.displayName
            else -> Language.SYSTEM.displayName
        }
    }
    
    /**
     * Get all available languages
     */
    fun getAvailableLanguages(): List<Language> {
        return listOf(
            Language.SYSTEM,
            Language.ENGLISH,
            Language.SPANISH,
            Language.FRENCH,
            Language.PORTUGUESE,
            Language.RUSSIAN,
            Language.TURKISH,
            Language.SLOVAK,
            Language.CHINESE
        )
    }
    
    /**
     * Check if app restart is required for language change
     */
    fun isRestartRequired(): Boolean {
        // For simplicity, we'll say restart is always recommended for full language change
        return true
    }
    
    /**
     * Initialize language on app start
     */
    fun initializeLanguage() {
        val savedLanguage = getCurrentLanguage()
        applyLanguage(savedLanguage)
    }
    
    /**
     * Get localized string resource
     */
    fun getString(resId: Int): String {
        return context.getString(resId)
    }
    
    /**
     * Get localized string resource with format args
     */
    fun getString(resId: Int, vararg formatArgs: Any): String {
        return context.getString(resId, *formatArgs)
    }
    
    /**
     * Create a context with the appropriate locale
     */
    fun createLocalizedContext(baseContext: Context): Context {
        val languageCode = getCurrentLanguage()
        val locale = resolveLocaleForCode(languageCode, baseContext)
        
        return createContextWithLocale(baseContext, locale)
    }
    
    /**
     * Helper method to create context with specific locale
     */
    private fun createContextWithLocale(context: Context, locale: Locale): Context {
        val config = Configuration(context.resources.configuration)
        config.setLocales(android.os.LocaleList(locale))
        return context.createConfigurationContext(config)
    }
    
    /**
     * Force recreation of the current activity for immediate language change
     */
    fun recreateCurrentActivity() {
        try {
            if (context is android.app.Activity) {
                (context as android.app.Activity).recreate()
                Timber.tag(TAG).d("Activity recreation triggered")
            } else {
                Timber.tag(TAG).w("Context is not an Activity, cannot recreate")
            }
        } catch (e: Exception) {
            Timber.tag(TAG).e(e, "Failed to recreate activity")
        }
    }
}

/**
 * Composable function to observe current language
 */
@Composable
fun rememberLanguage(languageManager: LanguageManager): String {
    val currentLanguage by languageManager.currentLanguage.collectAsState()
    return currentLanguage
}

/**
 * Extension function to get LanguageManager instance
 */
fun Context.getLanguageManager(): LanguageManager {
    return LanguageManager.getInstance(this)
}
