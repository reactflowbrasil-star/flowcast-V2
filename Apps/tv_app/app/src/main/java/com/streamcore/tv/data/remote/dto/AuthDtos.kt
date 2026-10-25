package com.streamcore.tv.data.remote.dto

import com.google.gson.JsonElement
import com.google.gson.annotations.SerializedName

/**
 * Data Transfer Objects for Authentication API
 */

// ========================================
// USER LOGIN
// ========================================

data class LoginRequestDto(
    @SerializedName("username")
    val username: String,
    @SerializedName("password")
    val password: String,
    // device_id is OPTIONAL - when null, login returns a token without device binding
    // This matches web behavior and allows device management operations
    @SerializedName("device_id")
    val deviceId: String? = null
)

data class LoginResponseDto(
    @SerializedName("success")
    val success: Boolean? = null,
    @SerializedName("message")
    val message: String? = null,
    @SerializedName("user")
    val user: UserDto?,
    @SerializedName("token")
    val token: String?,
    @SerializedName("user_agent")
    val userAgent: String? = null,
    @SerializedName("refreshToken")
    val refreshToken: String? = null,
    @SerializedName("expiresIn")
    val expiresIn: Long? = null
)

data class UserDto(
    @SerializedName("id")
    val id: Int,
    @SerializedName("username")
    val username: String,
    @SerializedName("email")
    val email: String?,
    @SerializedName("role")
    val role: String,
    @SerializedName("active")
    val isActive: Boolean,
    @SerializedName("max_devices")
    val maxDevices: Int,
    @SerializedName("created_at")
    val createdAt: String? = null,
    @SerializedName("last_login_at")
    val lastLoginAt: String? = null
)

// ========================================
// DEVICE REGISTRATION
// ========================================

data class DeviceRegistrationRequestDto(
    @SerializedName("device_id")
    val deviceId: String,
    @SerializedName("device_name")
    val deviceName: String
)

data class DeviceRegistrationResponseDto(
    @SerializedName("success")
    val success: Boolean,
    @SerializedName("message")
    val message: String
)

// ========================================
// DEVICE ACTIVATION
// ========================================

data class DeviceActivationRequestDto(
    @SerializedName("deviceToken")
    val deviceToken: String,
    @SerializedName("activationCode")
    val activationCode: String
)

data class DeviceActivationResponseDto(
    @SerializedName("success")
    val success: Boolean,
    @SerializedName("message")
    val message: String,
    @SerializedName("accessToken")
    val accessToken: String?,
    @SerializedName("refreshToken")
    val refreshToken: String?,
    @SerializedName("user")
    val user: UserProfileDto?,
    @SerializedName("expiresIn")
    val expiresIn: Long?
)

// ========================================
// TOKEN REFRESH
// ========================================

// Backend returns { "token": "..." } on refresh
data class TokenRefreshResponseDto(
    @SerializedName(value = "token", alternate = ["access_token", "accessToken"])
    val token: String?
) {
    val success: Boolean get() = !token.isNullOrBlank()
    val accessToken: String? get() = token
    val expiresIn: Long get() = 86400L // Default 24h; backend doesn't send this field
}

// ========================================
// COMMON RESPONSE
// ========================================

data class ApiResponseDto(
    @SerializedName("success")
    val success: Boolean = false,
    @SerializedName("message")
    val message: String? = null,
    @SerializedName("data")
    val data: JsonElement? = null,
    @SerializedName("error")
    val error: String? = null,
    @SerializedName("code")
    val code: String? = null,
    @SerializedName("details")
    val details: Map<String, Any>? = null
) {
    fun messageOrError(defaultMessage: String = "Unknown API error"): String {
        return message?.takeIf { it.isNotBlank() }
            ?: error?.takeIf { it.isNotBlank() }
            ?: defaultMessage
    }
}
