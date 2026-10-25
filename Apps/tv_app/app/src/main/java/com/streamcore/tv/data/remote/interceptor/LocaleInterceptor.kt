package com.streamcore.tv.data.remote.interceptor

import okhttp3.Interceptor
import okhttp3.Response
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton

/**
 * OkHttp interceptor that adds the Accept-Language header to every request.
 * Sends the device locale so the backend can return localized TMDB metadata.
 *
 * Example header value: "es-ES, es;q=0.9, en;q=0.5"
 */
@Singleton
class LocaleInterceptor @Inject constructor() : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val locale = Locale.getDefault()
        val languageTag = locale.toLanguageTag()   // e.g. "es-ES"
        val language = locale.language              // e.g. "es"

        // Build Accept-Language with quality values for better negotiation
        val acceptLanguage = if (languageTag != language) {
            "$languageTag, $language;q=0.9, en;q=0.5"
        } else {
            "$languageTag, en;q=0.5"
        }

        val request = chain.request().newBuilder()
            .header("Accept-Language", acceptLanguage)
            .build()

        return chain.proceed(request)
    }
}
