package com.streamcore.tv.data.remote.dto

import com.google.gson.annotations.SerializedName

/**
 * DTO for EPG response from API (matches backend format)
 */
data class EPGResponseDto(
    @SerializedName("programs")
    val programs: List<EPGProgramDto>
)

data class EPGProgramDto(
    @SerializedName("channel_id")
    val channelId: String,
    @SerializedName("title")
    val title: String,
    @SerializedName("description")
    val description: String?,
    @SerializedName("start")
    val start: String, // ISO-8601 UTC format from backend
    @SerializedName("end")
    val end: String,   // ISO-8601 UTC format from backend
    @SerializedName("category")
    val category: String?
)
