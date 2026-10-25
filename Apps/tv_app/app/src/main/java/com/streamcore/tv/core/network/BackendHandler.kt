package com.streamcore.tv.core.network

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import timber.log.Timber
import com.streamcore.tv.BuildConfig
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Backend Handler
 *
 * Handler to manage backend IP and port configuration.
 * 
 * Priority order:
 * 1. User-configured values (from DataStore preferences)
 * 2. BuildConfig values (from build.gradle)
 * 
 * This allows for runtime configuration while maintaining secure defaults.
 */
@Singleton
class BackendHandler @Inject constructor(
    private val context: Context
) {

    companion object {
        private val BACKEND_IP_KEY = stringPreferencesKey("backend_ip")
        private val BACKEND_PORT_KEY = stringPreferencesKey("backend_port")
        private const val RETROFIT_PLACEHOLDER_HOST = "placeholder.com"
    }

    private val Context.backendDataStore: DataStore<Preferences> by preferencesDataStore(
        name = "backend_config"
    )

    /**
     * Get current backend base URL
     */
    suspend fun getBaseUrl(): String {
        val preferences = context.backendDataStore.data.first()
        val ipOrUrl = preferences[BACKEND_IP_KEY]
        val port = preferences[BACKEND_PORT_KEY]

        // If user has configured a custom backend, normalize it and keep /api/ suffix.
        if (!ipOrUrl.isNullOrBlank()) {
            val normalized = normalizeApiBaseUrl(ipOrUrl, port)
            return if (isPlaceholderUrl(normalized)) BuildConfig.API_BASE_URL else normalized
        }

        // Otherwise use BuildConfig (default)
        return BuildConfig.API_BASE_URL
    }

    /**
     * Set backend IP and port (port can be empty for domains)
     */
    suspend fun setBackend(ip: String, port: String = "") {
        // Never persist Retrofit placeholder as a real backend host.
        if (isPlaceholderInput(ip)) {
            Timber.w("Ignoring placeholder backend input, keeping BuildConfig default")
            context.backendDataStore.edit { preferences ->
                preferences.remove(BACKEND_IP_KEY)
                preferences.remove(BACKEND_PORT_KEY)
            }
            return
        }

        context.backendDataStore.edit { preferences ->
            preferences[BACKEND_IP_KEY] = ip
            preferences[BACKEND_PORT_KEY] = port
        }

        val url = normalizeApiBaseUrl(ip, port)
        Timber.i("🌐 Backend updated: $url")
    }

    /**
     * Get current IP
     */
    suspend fun getCurrentIp(): String {
        val preferences = context.backendDataStore.data.first()
        val configured = preferences[BACKEND_IP_KEY]
        if (configured.isNullOrBlank()) {
            return extractIpFromUrl(BuildConfig.API_BASE_URL)
        }

        if (configured.contains("://")) {
            return extractIpFromUrl(configured)
        }

        return configured.substringBefore("/").ifBlank {
            extractIpFromUrl(BuildConfig.API_BASE_URL)
        }
    }

    /**
     * Get current port
     */
    suspend fun getCurrentPort(): String {
        val preferences = context.backendDataStore.data.first()
        val configuredPort = preferences[BACKEND_PORT_KEY]
        if (!configuredPort.isNullOrBlank()) {
            return configuredPort
        }

        val configured = preferences[BACKEND_IP_KEY]
        if (!configured.isNullOrBlank() && configured.contains("://")) {
            return extractPortFromUrl(configured)
        }

        return extractPortFromUrl(BuildConfig.API_BASE_URL)
    }

    /**
     * Extract IP from URL (helper function)
     */
    private fun extractIpFromUrl(url: String): String {
        return try {
            val uri = java.net.URI(url)
            uri.host ?: "145.239.68.223"
        } catch (e: Exception) {
            "145.239.68.223"
        }
    }

    /**
     * Extract port from URL (helper function)
     */
    private fun extractPortFromUrl(url: String): String {
        return try {
            val uri = java.net.URI(url)
            val port = uri.port
            if (port != -1) {
                port.toString()
            } else if (uri.scheme.equals("https", ignoreCase = true)) {
                "443"
            } else {
                "3000"
            }
        } catch (e: Exception) {
            "3000"
        }
    }

    private fun normalizeApiBaseUrl(ipOrUrl: String, port: String?): String {
        val raw = ipOrUrl.trim()
        if (raw.isBlank()) return BuildConfig.API_BASE_URL

        return try {
            if (raw.startsWith("http://", ignoreCase = true) || raw.startsWith("https://", ignoreCase = true)) {
                val uri = java.net.URI(raw)
                val host = uri.host ?: return BuildConfig.API_BASE_URL
                val scheme = uri.scheme ?: resolveDefaultScheme()
                val resolvedPort = parsePort(port) ?: uri.port.takeIf { it != -1 }
                val normalizedPath = ensureApiPath(uri.path)
                buildUrl(scheme, host, resolvedPort, normalizedPath)
            } else {
                val scheme = resolveDefaultScheme()
                val provisional = java.net.URI("$scheme://$raw")
                val host = provisional.host ?: raw.substringBefore("/")
                val resolvedPort = parsePort(port) ?: provisional.port.takeIf { it != -1 }
                val normalizedPath = ensureApiPath(provisional.path)
                buildUrl(scheme, host, resolvedPort, normalizedPath)
            }
        } catch (e: Exception) {
            Timber.w(e, "Invalid backend format, falling back to BuildConfig.API_BASE_URL")
            BuildConfig.API_BASE_URL
        }
    }

    private fun resolveDefaultScheme(): String {
        return try {
            java.net.URI(BuildConfig.API_BASE_URL).scheme ?: "http"
        } catch (_: Exception) {
            "http"
        }
    }

    private fun parsePort(port: String?): Int? {
        return port
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
            ?.toIntOrNull()
    }

    private fun ensureApiPath(path: String?): String {
        val normalized = (path ?: "").trim()
        if (normalized.isEmpty() || normalized == "/") return "/api/"

        val withoutTrailingSlash = normalized.trimEnd('/')
        return if (withoutTrailingSlash.endsWith("/api")) {
            "$withoutTrailingSlash/"
        } else {
            "$withoutTrailingSlash/api/"
        }
    }

    private fun buildUrl(scheme: String, host: String, port: Int?, path: String): String {
        val portPart = port?.let { ":$it" } ?: ""
        return "$scheme://$host$portPart$path"
    }

    private fun isPlaceholderInput(raw: String): Boolean {
        val trimmed = raw.trim()
        if (trimmed.equals(RETROFIT_PLACEHOLDER_HOST, ignoreCase = true)) return true
        return trimmed.contains(RETROFIT_PLACEHOLDER_HOST, ignoreCase = true)
    }

    private fun isPlaceholderUrl(url: String): Boolean {
        return try {
            val host = java.net.URI(url).host
            host.equals(RETROFIT_PLACEHOLDER_HOST, ignoreCase = true)
        } catch (_: Exception) {
            false
        }
    }
}
