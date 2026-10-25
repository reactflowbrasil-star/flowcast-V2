package com.streamcore.tv.core.network

import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.HttpDataSource
import androidx.media3.datasource.DataSpec
import timber.log.Timber
import java.io.IOException
import java.net.URL
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi

/**
 * Custom HTTP Data Source Factory that provides better logging for cleartext traffic issues
 *
 * This factory creates DefaultHttpDataSource instances with enhanced error logging
 * to help identify cleartext traffic issues and provide guidance for resolution.
 */
@OptIn(UnstableApi::class)
class CleartextHttpDataSource {

    companion object {
        private const val TAG = "CleartextHttpDataSource"
    }

    /**
     * Factory for creating enhanced HTTP data sources with cleartext logging
     */
    class Factory : HttpDataSource.Factory {
        private var userAgent: String = "IPTV-Android/1.0"
        private var connectTimeoutMs = DefaultHttpDataSource.DEFAULT_CONNECT_TIMEOUT_MILLIS
        private var readTimeoutMs = DefaultHttpDataSource.DEFAULT_READ_TIMEOUT_MILLIS
        private var allowCrossProtocolRedirects = false
        private var defaultRequestProperties: MutableMap<String, String> = mutableMapOf()

        fun setUserAgent(userAgent: String): Factory {
            this.userAgent = userAgent
            return this
        }

        fun setConnectTimeoutMs(connectTimeoutMs: Int): Factory {
            this.connectTimeoutMs = connectTimeoutMs
            return this
        }

        fun setReadTimeoutMs(readTimeoutMs: Int): Factory {
            this.readTimeoutMs = readTimeoutMs
            return this
        }

        fun setAllowCrossProtocolRedirects(allowCrossProtocolRedirects: Boolean): Factory {
            this.allowCrossProtocolRedirects = allowCrossProtocolRedirects
            return this
        }

        override fun setDefaultRequestProperties(defaultRequestProperties: MutableMap<String, String>): HttpDataSource.Factory {
            this.defaultRequestProperties.clear()
            this.defaultRequestProperties.putAll(defaultRequestProperties)
            return this
        }

        fun setDefaultRequestProperties(defaultRequestProperties: Map<String, String>?): Factory {
            this.defaultRequestProperties.clear()
            defaultRequestProperties?.let { this.defaultRequestProperties.putAll(it) }
            return this
        }

        override fun createDataSource(): HttpDataSource {
            // Debug: Log headers being set
            Timber.d("$TAG: Creating DataSource with headers: ${defaultRequestProperties.keys.joinToString(", ")}")
            if (defaultRequestProperties.containsKey("Authorization")) {
                Timber.d("$TAG: ✅ Authorization header is present")
            } else {
                Timber.w("$TAG: ⚠️ Authorization header is NOT present")
            }

            // Create a standard DefaultHttpDataSource with enhanced error handling
            val dataSource = DefaultHttpDataSource.Factory()
                .setUserAgent(userAgent)
                .setConnectTimeoutMs(connectTimeoutMs)
                .setReadTimeoutMs(readTimeoutMs)
                .setAllowCrossProtocolRedirects(allowCrossProtocolRedirects)
                .setDefaultRequestProperties(defaultRequestProperties)
                .createDataSource()

            // Wrap it with our enhanced logging
            return EnhancedHttpDataSource(dataSource)
        }
    }

    /**
     * Enhanced HTTP Data Source that wraps DefaultHttpDataSource with better error logging
     */
    private class EnhancedHttpDataSource(
        private val delegate: HttpDataSource
    ) : HttpDataSource by delegate {

        @Throws(IOException::class)
        override fun open(dataSpec: DataSpec): Long {
            try {
                // Try the default open first
                return delegate.open(dataSpec)
            } catch (e: IOException) {
                // If it fails due to cleartext restrictions, provide detailed logging
                if (e.message?.contains("Cleartext HTTP traffic") == true ||
                    e.message?.contains("not permitted") == true) {

                    Timber.e("$TAG: ❌ CLEARTEXT TRAFFIC ERROR ❌")
                    Timber.e("$TAG: URL: ${dataSpec.uri}")

                    // Extract domain/IP for logging
                    val host = try {
                        URL(dataSpec.uri.toString()).host
                    } catch (ex: Exception) {
                        "unknown"
                    }

                    Timber.e("$TAG: Host that needs cleartext access: $host")
                    Timber.e("$TAG: 🔧 SOLUTION: Add this to network_security_config.xml:")
                    Timber.e("$TAG: <domain includeSubdomains=\"false\">$host</domain>")
                    Timber.e("$TAG: Or set cleartextTrafficPermitted=\"true\" in base-config")
                }
                throw e
            }
        }
    }
}
