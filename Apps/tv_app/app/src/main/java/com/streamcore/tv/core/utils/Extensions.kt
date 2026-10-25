package com.streamcore.tv.core.utils

import android.content.Context
import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.platform.LocalContext
import com.streamcore.tv.domain.model.Result
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import timber.log.Timber

/**
 * Extension functions and utilities for the IPTV app
 */

// ========================================
// CONTEXT EXTENSIONS
// ========================================

/**
 * Show toast message
 */
fun Context.showToast(message: String, duration: Int = Toast.LENGTH_SHORT) {
    Toast.makeText(this, message, duration).show()
}

/**
 * Show long toast message
 */
fun Context.showLongToast(message: String) {
    showToast(message, Toast.LENGTH_LONG)
}

// ========================================
// RESULT EXTENSIONS
// ========================================

/**
 * Map Result success data
 */
inline fun <T, R> Result<T>.mapSuccess(transform: (T) -> R): Result<R> {
    return when (this) {
        is Result.Success -> Result.Success(transform(data))
        is Result.Error -> Result.Error(exception)
        is Result.Loading -> Result.Loading
    }
}

/**
 * Handle Result with callbacks
 */
inline fun <T> Result<T>.handle(
    onSuccess: (T) -> Unit = {},
    onError: (Throwable) -> Unit = {},
    onLoading: () -> Unit = {}
) {
    when (this) {
        is Result.Success -> onSuccess(data)
        is Result.Error -> onError(exception)
        is Result.Loading -> onLoading()
    }
}

/**
 * Get data or null from Result
 */
fun <T> Result<T>.getDataOrNull(): T? {
    return when (this) {
        is Result.Success -> data
        else -> null
    }
}

/**
 * Check if Result is success
 */
fun <T> Result<T>.isSuccess(): Boolean {
    return this is Result.Success
}

/**
 * Check if Result is error
 */
fun <T> Result<T>.isError(): Boolean {
    return this is Result.Error
}

/**
 * Check if Result is loading
 */
fun <T> Result<T>.isLoading(): Boolean {
    return this is Result.Loading
}

// ========================================
// FLOW EXTENSIONS
// ========================================

/**
 * Convert Flow to Result Flow with error handling
 */
fun <T> Flow<T>.asResult(): Flow<Result<T>> {
    return this
        .map<T, Result<T>> { Result.Success(it) }
        .catch { emit(Result.Error(it)) }
}

/**
 * Handle Flow errors with logging
 */
fun <T> Flow<T>.handleErrors(tag: String = "Flow"): Flow<T> {
    return this.catch { throwable ->
        Timber.e(throwable, "[$tag] Flow error: ${throwable.message}")
        throw throwable
    }
}

// ========================================
// STRING EXTENSIONS
// ========================================

/**
 * Check if string is valid email
 */
fun String.isValidEmail(): Boolean {
    val candidate = trim()
    if (candidate.isEmpty() || candidate.contains(' ') || candidate.contains("..")) return false

    val parts = candidate.split("@")
    if (parts.size != 2) return false

    val local = parts[0]
    val domain = parts[1]
    if (local.isEmpty() || domain.isEmpty()) return false
    if (local.startsWith(".") || local.endsWith(".")) return false

    val localRegex = Regex("^[A-Za-z0-9+_%\\-][A-Za-z0-9+_.%\\-]*$")
    val domainRegex = Regex("^[A-Za-z0-9\\-]+(\\.[A-Za-z0-9\\-]+)+$")

    return localRegex.matches(local) && domainRegex.matches(domain)
}

/**
 * Capitalize first letter
 */
fun String.capitalizeFirst(): String {
    return if (isEmpty()) this else this[0].uppercase() + substring(1).lowercase()
}

/**
 * Format duration from seconds to readable string
 */
fun Long.formatDuration(): String {
    val hours = this / 3600
    val minutes = (this % 3600) / 60
    
    return when {
        hours > 0 -> "${hours}h ${minutes}m"
        minutes > 0 -> "${minutes}m"
        else -> "<1m"
    }
}

/**
 * Format file size to readable string
 */
fun Long.formatFileSize(): String {
    val kb = 1024
    val mb = kb * 1024
    val gb = mb * 1024
    
    return when {
        this >= gb -> String.format(java.util.Locale.getDefault(), "%.1f GB", this.toFloat() / gb)
        this >= mb -> String.format(java.util.Locale.getDefault(), "%.1f MB", this.toFloat() / mb)
        this >= kb -> String.format(java.util.Locale.getDefault(), "%.1f KB", this.toFloat() / kb)
        else -> "$this B"
    }
}

// ========================================
// COMPOSE EXTENSIONS
// ========================================

/**
 * Show toast in Compose
 */
@Composable
fun ShowToast(message: String, duration: Int = Toast.LENGTH_SHORT) {
    val context = LocalContext.current
    LaunchedEffect(message) {
        if (message.isNotEmpty()) {
            context.showToast(message, duration)
        }
    }
}

/**
 * Handle Result in Compose with side effects
 */
@Composable
fun <T> HandleResult(
    result: Result<T>,
    onSuccess: (T) -> Unit = {},
    onError: (String) -> Unit = {},
    onLoading: () -> Unit = {}
) {
    LaunchedEffect(result) {
        result.handle(
            onSuccess = onSuccess,
            onError = { onError(it.message ?: "Unknown error") },
            onLoading = onLoading
        )
    }
}

// ========================================
// COLLECTION EXTENSIONS
// ========================================

/**
 * Safe get item from list
 */
fun <T> List<T>.safeGet(index: Int): T? {
    return if (index in 0 until size) this[index] else null
}

/**
 * Check if list is not null or empty
 */
fun <T> List<T>?.isNotNullOrEmpty(): Boolean {
    return !this.isNullOrEmpty()
}

/**
 * Get random item from list
 */
fun <T> List<T>.randomOrNull(): T? {
    return if (isEmpty()) null else random()
}

// ========================================
// VALIDATION EXTENSIONS
// ========================================

/**
 * Validate activation code format
 */
fun String.isValidActivationCode(): Boolean {
    return length == 6 && all { it.isDigit() }
}

/**
 * Validate device name
 */
fun String.isValidDeviceName(): Boolean {
    return isNotBlank() && length in 3..50
}

/**
 * Clean string for search
 */
fun String.cleanForSearch(): String {
    return trim().lowercase()
}

// ========================================
// LOGGING EXTENSIONS
// ========================================

/**
 * Log with tag
 */
fun Any.logd(message: String) {
    Timber.tag(this::class.java.simpleName).d(message)
}

fun Any.loge(message: String, throwable: Throwable? = null) {
    Timber.tag(this::class.java.simpleName).e(throwable, message)
}

fun Any.logw(message: String) {
    Timber.tag(this::class.java.simpleName).w(message)
}

fun Any.logi(message: String) {
    Timber.tag(this::class.java.simpleName).i(message)
}
