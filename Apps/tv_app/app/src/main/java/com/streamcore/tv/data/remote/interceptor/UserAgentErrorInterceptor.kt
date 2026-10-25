package com.streamcore.tv.data.remote.interceptor

import okhttp3.Interceptor
import okhttp3.Response
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * User-Agent Error Interceptor
 * 
 * Handles specific 401 errors that might be related to authentication.
 * Note: User-Agent is now static and doesn't require renewal.
 */
@Singleton
class UserAgentErrorInterceptor @Inject constructor() : Interceptor {
    
    companion object {
        private const val TAG = "UserAgentErrorInterceptor"
    }
    
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val response = chain.proceed(request)
        
        // Log 401 errors for debugging but don't attempt renewal
        // (User-Agent is static and doesn't expire)
        if (response.code == 401) {
            val url = request.url.toString()
            Timber.w("$TAG: 🚨 401 error on: $url")
            Timber.d("$TAG: Static User-Agent in use; no renewal needed")
        }
        
        return response
    }
}
