package com.streamcore.tv.data.remote.interceptor

import com.streamcore.tv.core.security.DynamicUserAgentManager
import okhttp3.Interceptor
import okhttp3.Response
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * User-Agent Interceptor
 *
 * Adds the static User-Agent to all HTTP requests.
 * The User-Agent is generated during login and remains static for the session.
 */
@Singleton
class DynamicUserAgentInterceptor @Inject constructor(
    private val userAgentManager: DynamicUserAgentManager
) : Interceptor {

    companion object {
        private const val USER_AGENT_HEADER = "User-Agent"
        private const val DEFAULT_USER_AGENT = "IPTVApp/2.1.0 (Android 14; SM-G998B)"
        private const val TAG = "UserAgentInterceptor"
    }

    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()

        // Get current static User-Agent
        val userAgent = userAgentManager.getCurrentUserAgent()

        val requestBuilder = originalRequest.newBuilder()

        if (userAgent != null) {
            requestBuilder.header(USER_AGENT_HEADER, userAgent)
            Timber.v("$TAG: 🔐 Using User-Agent for ${originalRequest.url}")
        } else {
            requestBuilder.header(USER_AGENT_HEADER, DEFAULT_USER_AGENT)
            Timber.v("$TAG: 📱 Using default User-Agent for ${originalRequest.url}")
        }

        val request = requestBuilder.build()
        return chain.proceed(request)
    }
}
