package com.streamcore.tv.data.remote.interceptor

import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response
import timber.log.Timber
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Interceptor that retries requests on transient connection errors.
 *
 * Handles the "unexpected end of stream" issue that occurs when OkHttp reuses
 * an HTTP/1.1 connection that the backend has already closed (half-open / stale).
 * OkHttp's built-in RetryAndFollowUpInterceptor doesn't always recover from this
 * because by the time the EOF is detected, the request headers have already been
 * written to the socket, and OkHttp considers the request "in-flight".
 *
 * This interceptor sits at the APPLICATION level (addInterceptor), so it wraps
 * the entire chain including RetryAndFollowUpInterceptor, giving it a second
 * chance to open a fresh connection.
 */
@Singleton
class RetryInterceptor @Inject constructor() : Interceptor {

    companion object {
        private const val MAX_RETRIES = 2
        private const val RETROFIT_PLACEHOLDER_HOST = "placeholder.com"
        private val RETRYABLE_MESSAGES = listOf(
            "unexpected end of stream",
            "connection reset",
            "connection closed",
            "stream was reset",
            "broken pipe"
        )
    }

    @Throws(IOException::class)
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val requestLabel = request.toLogLabel()
        var lastException: IOException? = null

        for (attempt in 0..MAX_RETRIES) {
            try {
                if (attempt > 0) {
                    Timber.d("🔄 Retry attempt $attempt for ${request.method} $requestLabel")
                }
                return chain.proceed(request)
            } catch (e: IOException) {
                lastException = e
                val message = e.message?.lowercase() ?: ""

                // Only retry on transient connection errors, not on timeouts or other issues
                val isRetryable = RETRYABLE_MESSAGES.any { message.contains(it) }
                
                if (!isRetryable || attempt >= MAX_RETRIES) {
                    Timber.e("❌ Non-retryable or max retries reached for ${request.method} $requestLabel: ${e.message}")
                    throw e
                }

                Timber.w("⚠️ Retryable error on ${request.method} $requestLabel (attempt ${attempt + 1}/$MAX_RETRIES): ${e.message}")
                
                // Small delay before retry to allow connection cleanup
                try {
                    Thread.sleep(100L * (attempt + 1))
                } catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                    throw e
                }
            }
        }

        // Should never reach here, but just in case
        throw lastException ?: IOException("Retry exhausted without exception")
    }

    private fun Request.toLogLabel(): String {
        return if (url.host.equals(RETROFIT_PLACEHOLDER_HOST, ignoreCase = true)) {
            "<dynamic-base-url>${url.encodedPath}"
        } else {
            url.toString()
        }
    }
}
