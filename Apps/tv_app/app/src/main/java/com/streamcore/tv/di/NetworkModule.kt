package com.streamcore.tv.di

import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.streamcore.tv.BuildConfig
import com.streamcore.tv.core.network.NetworkSecurityHelper
import com.streamcore.tv.data.remote.api.IPTVApiService
import com.streamcore.tv.data.remote.api.RefreshTokenService
import com.streamcore.tv.data.remote.interceptor.AuthInterceptor
import com.streamcore.tv.data.remote.interceptor.DecryptionInterceptor
import com.streamcore.tv.data.remote.interceptor.DynamicBaseUrlInterceptor
import com.streamcore.tv.data.remote.interceptor.DynamicUserAgentInterceptor
import com.streamcore.tv.data.remote.interceptor.ErrorInterceptor
import com.streamcore.tv.data.remote.interceptor.LocaleInterceptor
import com.streamcore.tv.data.remote.interceptor.RetryInterceptor
import com.streamcore.tv.data.remote.interceptor.UserAgentErrorInterceptor
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import okhttp3.ConnectionPool
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import timber.log.Timber
import java.util.concurrent.TimeUnit
import javax.inject.Named
import javax.inject.Singleton

/**
 * Hilt module for network dependencies
 * 
 * Provides:
 * - OkHttpClient with interceptors
 * - Retrofit instance
 * - API service interfaces
 * - Gson converter
 */
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    
    /**
     * Provides Gson instance with custom configuration
     */
    @Provides
    @Singleton
    fun provideGson(): Gson {
        @Suppress("DEPRECATION")
        return GsonBuilder()
            .setLenient()
            .setDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
            .create()
    }
    
    /**
     * Provides HTTP logging interceptor for debugging
     */
    @Provides
    @Singleton
    fun provideHttpLoggingInterceptor(): HttpLoggingInterceptor {
        return HttpLoggingInterceptor { message ->
            Timber.tag("HTTP").d(message)
        }.apply {
            redactHeader("Authorization")
            redactHeader("Cookie")
            redactHeader("Set-Cookie")
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BODY
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        }
    }
    
    /**
     * Provides OkHttpClient with all necessary interceptors
     */
    @Provides
    @Singleton
    fun provideOkHttpClient(
        retryInterceptor: RetryInterceptor,
        dynamicBaseUrlInterceptor: DynamicBaseUrlInterceptor,
        authInterceptor: AuthInterceptor,
        dynamicUserAgentInterceptor: DynamicUserAgentInterceptor,
        userAgentErrorInterceptor: UserAgentErrorInterceptor,
        errorInterceptor: ErrorInterceptor,
        localeInterceptor: LocaleInterceptor,
        loggingInterceptor: HttpLoggingInterceptor,
        decryptionInterceptor: DecryptionInterceptor
    ): OkHttpClient {
        val builder = OkHttpClient.Builder()
            .apply { NetworkSecurityHelper.applyLenientSsl(this) } // Bypass OCSP validation issues
            .connectionPool(ConnectionPool(5, 15, TimeUnit.SECONDS)) // Shorter keep-alive to avoid stale connections
            .addInterceptor(decryptionInterceptor) // First: HMAC signing + response decryption
            .addInterceptor(retryInterceptor) // Second: Retry on stale connection errors
            .addInterceptor(dynamicBaseUrlInterceptor) // Third: Dynamic base URL
            .addInterceptor(dynamicUserAgentInterceptor) // Fourth: Dynamic User-Agent with auto-renewal
            .addInterceptor(localeInterceptor) // Fifth: Accept-Language header
            .addInterceptor(authInterceptor) // Sixth: Auth token handling
            .addInterceptor(userAgentErrorInterceptor) // Seventh: User-Agent specific error handling
            .addInterceptor(errorInterceptor) // Eighth: General error handling
            .addInterceptor(loggingInterceptor) // Last: Logging
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)

        return builder.build()
    }

    /**
     * Provides OkHttpClient for refresh token service (without AuthInterceptor to avoid circular dependency)
     */
    @Provides
    @Singleton
    @Named("RefreshTokenClient")
    fun provideRefreshTokenOkHttpClient(
        retryInterceptor: RetryInterceptor,
        dynamicBaseUrlInterceptor: DynamicBaseUrlInterceptor,
        dynamicUserAgentInterceptor: DynamicUserAgentInterceptor,
        errorInterceptor: ErrorInterceptor,
        localeInterceptor: LocaleInterceptor,
        loggingInterceptor: HttpLoggingInterceptor,
        decryptionInterceptor: DecryptionInterceptor
    ): OkHttpClient {
        return OkHttpClient.Builder()
            .apply { NetworkSecurityHelper.applyLenientSsl(this) } // Bypass OCSP validation issues
            .connectionPool(ConnectionPool(5, 15, TimeUnit.SECONDS))
            .addInterceptor(decryptionInterceptor) // First: HMAC signing + response decryption
            .addInterceptor(retryInterceptor) // Second: Retry on stale connection errors
            .addInterceptor(dynamicBaseUrlInterceptor) // Third: Dynamic base URL
            .addInterceptor(dynamicUserAgentInterceptor) // Fourth: Dynamic User-Agent
            .addInterceptor(localeInterceptor) // Fourth: Accept-Language header
            .addInterceptor(errorInterceptor)
            .addInterceptor(loggingInterceptor)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }
    
    /**
     * Provides Retrofit instance
     * Note: Base URL will be dynamically changed by DynamicBaseUrlInterceptor
     */
    @Provides
    @Singleton
    fun provideRetrofit(
        okHttpClient: OkHttpClient,
        gson: Gson
    ): Retrofit {
        return Retrofit.Builder()
            .baseUrl("http://placeholder.com/api/") // Placeholder, will be replaced by interceptor
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()
    }
    
    /**
     * Provides Retrofit instance for refresh token service
     */
    @Provides
    @Singleton
    @Named("RefreshTokenRetrofit")
    fun provideRefreshTokenRetrofit(
        @Named("RefreshTokenClient") okHttpClient: OkHttpClient,
        gson: Gson
    ): Retrofit {
        return Retrofit.Builder()
            .baseUrl("http://placeholder.com/api/") // Placeholder, will be replaced by interceptor
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()
    }

    /**
     * Provides IPTV API service
     */
    @Provides
    @Singleton
    fun provideIPTVApiService(retrofit: Retrofit): IPTVApiService {
        return retrofit.create(IPTVApiService::class.java)
    }

    /**
     * Provides Refresh Token service
     */
    @Provides
    @Singleton
    fun provideRefreshTokenService(@Named("RefreshTokenRetrofit") retrofit: Retrofit): RefreshTokenService {
        return retrofit.create(RefreshTokenService::class.java)
    }
}
