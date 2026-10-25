package com.streamcore.tv.common

/**
 * A generic wrapper class for handling state in API responses.
 * 
 * @param T The type of data wrapped by this resource.
 * @property data The data payload.
 * @property message An optional message (typically for errors).
 */
sealed class Resource<T>(
    val data: T? = null,
    val message: String? = null
) {
    /**
     * Represents a successful state with data.
     */
    class Success<T>(data: T) : Resource<T>(data)
    
    /**
     * Represents an error state with an optional message and data.
     */
    class Error<T>(message: String, data: T? = null) : Resource<T>(data, message)
    
    /**
     * Represents a loading state.
     */
    class Loading<T>(data: T? = null) : Resource<T>(data)
}
