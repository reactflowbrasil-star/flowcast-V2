package com.streamcore.tv.data.remote.interceptor

import com.streamcore.tv.BuildConfig
import com.streamcore.tv.core.network.BackendHandler
import kotlinx.coroutines.runBlocking
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Interceptor
import okhttp3.Response
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Dynamic Base URL Interceptor
 * 
 * Dynamically changes the base URL of requests based on BackendHandler configuration
 */
@Singleton
class DynamicBaseUrlInterceptor @Inject constructor(
    private val backendHandler: BackendHandler
) : Interceptor {

    companion object {
        // Matches the Retrofit placeholder host configured in NetworkModule.
        private const val RETROFIT_PLACEHOLDER_HOST = "placeholder.com"
    }
    
    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()

        // Only rewrite Retrofit requests that still target the placeholder host.
        // Direct OkHttp calls with absolute URLs (e.g. APK/CDN downloads) must keep their real host.
        if (!originalRequest.url.host.equals(RETROFIT_PLACEHOLDER_HOST, ignoreCase = true)) {
            return chain.proceed(originalRequest)
        }

        return try {
            // Get current base URL from BackendHandler
            val candidateBaseUrl = runBlocking {
                backendHandler.getBaseUrl()
            }
            val newBaseUrl = if (candidateBaseUrl.contains(RETROFIT_PLACEHOLDER_HOST, ignoreCase = true)) {
                BuildConfig.API_BASE_URL
            } else {
                candidateBaseUrl
            }

            // Parse the new base URL
            val newHttpUrl = newBaseUrl.toHttpUrl()

            // Build new URL with the dynamic base URL
            val newUrl = originalRequest.url.newBuilder()
                .scheme(newHttpUrl.scheme)
                .host(newHttpUrl.host)
                .port(newHttpUrl.port)
                .build()

            // Create new request with updated URL
            val newRequest = originalRequest.newBuilder()
                .url(newUrl)
                .build()

            chain.proceed(newRequest)
        } catch (e: java.io.IOException) {
            // Network errors (connection reset, timeout, cancelled) must propagate
            // so OkHttp's built-in RetryAndFollowUpInterceptor can handle them.
            Timber.d("🔄 Network error in DynamicBaseUrlInterceptor, propagating: ${e.message}")
            throw e
        } catch (e: Exception) {
            // URL construction/parsing errors → fallback to BuildConfig URL
            Timber.e(e, "❌ URL construction error in DynamicBaseUrlInterceptor, using default")
            try {
                val defaultBaseUrl = BuildConfig.API_BASE_URL
                val defaultHttpUrl = defaultBaseUrl.toHttpUrl()

                val fallbackUrl = originalRequest.url.newBuilder()
                    .scheme(defaultHttpUrl.scheme)
                    .host(defaultHttpUrl.host)
                    .port(defaultHttpUrl.port)
                    .build()

                val fallbackRequest = originalRequest.newBuilder()
                    .url(fallbackUrl)
                    .build()

                Timber.i("🔄 Using fallback URL: ${fallbackRequest.url}")
                chain.proceed(fallbackRequest)
            } catch (fallbackError: Exception) {
                Timber.e(fallbackError, "❌ Fallback URL construction also failed")
                throw fallbackError
            }
        }
    }
}
