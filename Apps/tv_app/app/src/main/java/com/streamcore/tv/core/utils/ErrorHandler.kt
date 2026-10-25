package com.streamcore.tv.core.utils

import retrofit2.HttpException
import timber.log.Timber
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Centralized error handler for the application
 * 
 * Converts various types of exceptions into user-friendly error messages
 */
@Singleton
class ErrorHandler @Inject constructor() {
    
    /**
     * Get user-friendly error message from exception
     */
    fun getErrorMessage(exception: Throwable): String {
        Timber.e(exception, "Error occurred")
        
        return when (exception) {
            is HttpException -> {
                when (exception.code()) {
                    400 -> "Invalid request. Check the submitted data."
                    401 -> "Invalid credentials. Check your username and password."
                    403 -> "You do not have permission to perform this action."
                    404 -> "Resource not found. The service is unavailable."
                    408 -> "Request timeout. Please try again."
                    409 -> {
                        // For 409 conflicts, try to extract the message from response body
                        try {
                            val errorBody = exception.response()?.errorBody()?.string()
                            if (errorBody?.contains("device_limit_exceeded") == true) {
                                "device_limit_exceeded"
                            } else {
                                "Request conflict. Please try again."
                            }
                        } catch (e: Exception) {
                            "Request conflict. Please try again."
                        }
                    }
                    429 -> "Too many requests. Please wait and try again."
                    500 -> "Internal server error. Please try again later."
                    502 -> "Server unavailable. Please try again later."
                    503 -> "Service temporarily unavailable."
                    else -> "Server error (${exception.code()}). Please try again later."
                }
            }
            is SocketTimeoutException -> {
                "Request timeout. Check your internet connection."
            }
            is UnknownHostException -> {
                "Unable to reach the server. Check your internet connection."
            }
            is IOException -> {
                "Connection error. Check your internet connection."
            }
            is IllegalArgumentException -> {
                exception.message ?: "Invalid data provided."
            }
            is IllegalStateException -> {
                exception.message ?: "Invalid application state."
            }
            else -> {
                // Always return the original message if it exists
                exception.message?.takeIf { it.isNotBlank() }
                    ?: "Unknown error. Please try again."
            }
        }
    }
    
    /**
     * Get error code from exception
     */
    fun getErrorCode(exception: Throwable): String {
        return when (exception) {
            is HttpException -> "HTTP_${exception.code()}"
            is SocketTimeoutException -> "TIMEOUT"
            is UnknownHostException -> "NO_HOST"
            is IOException -> "IO_ERROR"
            is IllegalArgumentException -> "INVALID_ARGUMENT"
            is IllegalStateException -> "INVALID_STATE"
            else -> "UNKNOWN_ERROR"
        }
    }
    
    /**
     * Check if error is network related
     */
    fun isNetworkError(exception: Throwable): Boolean {
        return when (exception) {
            is SocketTimeoutException,
            is UnknownHostException,
            is IOException -> true
            is HttpException -> exception.code() in 500..599
            else -> false
        }
    }
    
    /**
     * Check if error is authentication related
     */
    fun isAuthError(exception: Throwable): Boolean {
        return when (exception) {
            is HttpException -> exception.code() in listOf(401, 403)
            else -> false
        }
    }
    
    /**
     * Check if error is client related (user error)
     */
    fun isClientError(exception: Throwable): Boolean {
        return when (exception) {
            is HttpException -> exception.code() in 400..499
            is IllegalArgumentException -> true
            else -> false
        }
    }
    
    /**
     * Check if error is server related
     */
    fun isServerError(exception: Throwable): Boolean {
        return when (exception) {
            is HttpException -> exception.code() in 500..599
            else -> false
        }
    }
    
    /**
     * Check if error is retryable
     */
    fun isRetryableError(exception: Throwable): Boolean {
        return when (exception) {
            is SocketTimeoutException,
            is IOException -> true
            is HttpException -> exception.code() in listOf(408, 429, 500, 502, 503, 504)
            else -> false
        }
    }
    
    /**
     * Get suggested retry delay in milliseconds
     */
    fun getRetryDelay(exception: Throwable, attemptNumber: Int): Long {
        val baseDelay = when (exception) {
            is HttpException -> {
                when (exception.code()) {
                    429 -> 5000L // Rate limited - wait longer
                    408 -> 2000L // Timeout - moderate delay
                    else -> 1000L // Other server errors - short delay
                }
            }
            is SocketTimeoutException -> 3000L
            is IOException -> 2000L
            else -> 1000L
        }
        
        // Exponential backoff with jitter
        return (baseDelay * Math.pow(2.0, (attemptNumber - 1).toDouble())).toLong()
            .coerceAtMost(30000L) // Max 30 seconds
    }
    
    /**
     * Log error with appropriate level
     */
    fun logError(exception: Throwable, context: String? = null) {
        val message = context?.let { "$it: ${exception.message}" } ?: exception.message
        
        when {
            isNetworkError(exception) -> Timber.w(exception, "Network error: $message")
            isAuthError(exception) -> Timber.w(exception, "Auth error: $message")
            isClientError(exception) -> Timber.w(exception, "Client error: $message")
            isServerError(exception) -> Timber.e(exception, "Server error: $message")
            else -> Timber.e(exception, "Unknown error: $message")
        }
    }
}
