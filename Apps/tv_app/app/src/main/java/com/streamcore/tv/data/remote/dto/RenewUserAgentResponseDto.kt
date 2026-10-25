package com.streamcore.tv.data.remote.dto

import com.google.gson.annotations.SerializedName

/**
 * Request DTO for User-Agent renewal
 */
data class RenewUserAgentRequestDto(
    @SerializedName("placeholder")
    val placeholder: String = ""
)

/**
 * Response DTO for User-Agent renewal
 */
data class RenewUserAgentResponseDto(
    @SerializedName("user_agent")
    val userAgent: String,

    @SerializedName("expires_at")
    val expiresAt: Long
)
