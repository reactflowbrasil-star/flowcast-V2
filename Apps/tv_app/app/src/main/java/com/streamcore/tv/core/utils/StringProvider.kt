package com.streamcore.tv.core.utils

import android.content.Context
import androidx.annotation.StringRes
import com.streamcore.tv.R
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Interface for providing localized strings in layers that don't have access to Context.
 * This allows the domain layer to use localized strings without violating Clean Architecture.
 */
interface StringProvider {
    fun getString(@StringRes resId: Int): String
    fun getString(@StringRes resId: Int, vararg args: Any): String
    
    // Pre-defined error getters for common cases
    fun getNoCredentialsError(): String
    fun getDeviceManagementFailedError(message: String?): String
    fun getUnexpectedStateError(): String
    fun getUnexpectedDuringRegistrationError(): String
    fun getUnexpectedDuringRemovalError(): String
    fun getDeviceRegistrationError(message: String?): String
    fun getDeviceRemovalError(message: String?): String
}

/**
 * Implementation of StringProvider that uses Android Context.
 */
@Singleton
class StringProviderImpl @Inject constructor(
    @ApplicationContext private val context: Context
) : StringProvider {
    
    override fun getString(@StringRes resId: Int): String {
        return context.getString(resId)
    }
    
    override fun getString(@StringRes resId: Int, vararg args: Any): String {
        return context.getString(resId, *args)
    }
    
    override fun getNoCredentialsError(): String {
        return context.getString(R.string.error_no_credentials)
    }
    
    override fun getDeviceManagementFailedError(message: String?): String {
        val base = context.getString(R.string.error_device_management_failed)
        return if (message != null) "$base: $message" else base
    }
    
    override fun getUnexpectedStateError(): String {
        return context.getString(R.string.error_unexpected_state)
    }
    
    override fun getUnexpectedDuringRegistrationError(): String {
        return context.getString(R.string.error_unexpected_during_registration)
    }
    
    override fun getUnexpectedDuringRemovalError(): String {
        return context.getString(R.string.error_unexpected_during_removal)
    }
    
    override fun getDeviceRegistrationError(message: String?): String {
        val base = context.getString(R.string.error_device_registration)
        return if (message != null) "$base: $message" else base
    }
    
    override fun getDeviceRemovalError(message: String?): String {
        return context.getString(R.string.error_unexpected_try_again)
    }
}
