package com.streamcore.tv.core.error

import retrofit2.HttpException
import timber.log.Timber
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Centralized error handling for the IPTV app
 * 
 * Converts exceptions to user-friendly error messages
 */
@Singleton
class ErrorHandler @Inject constructor() {
    
    /**
     * Convert exception to user-friendly error message
     */
    fun getErrorMessage(throwable: Throwable): String {
        Timber.e(throwable, "Error occurred: ${throwable.message}")
        
        return when (throwable) {
            is NetworkException -> throwable.message ?: "Network error"
            is AuthException -> throwable.message ?: "Authentication error"
            is ContentException -> throwable.message ?: "Content error"
            is HttpException -> handleHttpException(throwable)
            is IOException -> handleIOException(throwable)
            else -> throwable.message?.takeIf { it.isNotBlank() }
                ?: "Unknown error. Please try again."
        }
    }
    
    /**
     * Convert exception to specific error type
     */
    fun mapException(throwable: Throwable): IPTVException {
        return when (throwable) {
            is IPTVException -> throwable
            is HttpException -> mapHttpException(throwable)
            is IOException -> mapIOException(throwable)
            else -> UnknownException(throwable.message ?: "Unknown error")
        }
    }
    
    private fun handleHttpException(exception: HttpException): String {
        return when (exception.code()) {
            400 -> "Invalid request. Check your input."
            401 -> "Unauthorized. Please sign in again."
            403 -> "Access denied"
            404 -> "Content not found"
            408 -> "Request timeout"
            429 -> "Too many requests. Please try again later."
            500 -> "Server error. Please try again later."
            502, 503 -> "Service unavailable"
            else -> "Network error (${exception.code()})"
        }
    }
    
    private fun handleIOException(exception: IOException): String {
        return when (exception) {
            is UnknownHostException -> "No internet connection"
            is SocketTimeoutException -> "Request timeout"
            else -> "Connection error"
        }
    }
    
    private fun mapHttpException(exception: HttpException): IPTVException {
        return when (exception.code()) {
            401 -> AuthException("Session expired. Please sign in again.")
            403 -> AuthException("Access denied")
            404 -> ContentException("Content not found")
            429 -> NetworkException("Too many requests. Please try again later.")
            in 500..599 -> NetworkException("Server error")
            else -> NetworkException("Network error (${exception.code()})")
        }
    }
    
    private fun mapIOException(exception: IOException): IPTVException {
        return when (exception) {
            is UnknownHostException -> NetworkException("No internet connection")
            is SocketTimeoutException -> NetworkException("Request timeout")
            else -> NetworkException("Connection error")
        }
    }
}

/**
 * Base exception class for IPTV app
 */
sealed class IPTVException(message: String) : Exception(message)

/**
 * Network-related exceptions
 */
class NetworkException(message: String) : IPTVException(message)

/**
 * Authentication-related exceptions
 */
class AuthException(message: String) : IPTVException(message)

/**
 * Content-related exceptions
 */
class ContentException(message: String) : IPTVException(message)

/**
 * User-related exceptions
 */
class UserException(message: String) : IPTVException(message)

/**
 * Unknown exceptions
 */
class UnknownException(message: String) : IPTVException(message)

/**
 * Validation exceptions
 */
class ValidationException(message: String) : IPTVException(message)

/**
 * Cache-related exceptions
 */
class CacheException(message: String) : IPTVException(message)

/**
 * Player-related exceptions
 */
class PlayerException(message: String) : IPTVException(message)
