package com.streamcore.tv.data.remote.interceptor

import okhttp3.Interceptor
import okhttp3.Response
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Error handling interceptor for network requests
 * 
 * Handles:
 * - Logging network errors
 * - Adding custom headers for error tracking
 * - Network connectivity issues
 */
@Singleton
class ErrorInterceptor @Inject constructor() : Interceptor {
    
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        
        return try {
            val response = chain.proceed(request)
            
            // Log successful responses in debug mode
            if (response.isSuccessful) {
                Timber.d("✅ ${request.method} ${request.url} - ${response.code}")
            } else {
                // Log error responses
                Timber.w("❌ ${request.method} ${request.url} - ${response.code} ${response.message}")
                
                // Log response body for debugging (only in debug builds)
                if (timber.log.Timber.treeCount > 0) {
                    val responseBody = response.peekBody(1024)
                    Timber.w("Error response body: ${responseBody.string()}")
                }
            }
            
            response
        } catch (e: Exception) {
            // Handle cancellation gracefully (normal when user exits)
            if (e is java.io.IOException && e.message?.contains("Canceled") == true) {
                Timber.d("🔄 Request cancelled for ${request.method} ${request.url} (user exit)")
            } else {
                Timber.e(e, "🔥 Network error for ${request.method} ${request.url}")
            }
            throw e
        }
    }
}
