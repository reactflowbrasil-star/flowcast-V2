package com.streamcore.tv.data.remote.dto

import com.google.gson.annotations.SerializedName

data class VersionCheckResponseDto(
    @SerializedName("has_update")
    val hasUpdate: Boolean,
    
    @SerializedName("latest_version")
    val latestVersion: String,
    
    @SerializedName("latest_version_code")
    val latestVersionCode: Int,
    
    @SerializedName("force_update")
    val forceUpdate: Boolean,
    
    @SerializedName("download_url")
    val downloadUrl: String,
    
    @SerializedName("release_notes")
    val releaseNotes: String?,
    
    @SerializedName("min_required_version")
    val minRequiredVersion: String?,
    
    @SerializedName("file_size")
    val fileSize: Long,
    
    @SerializedName("file_hash")
    val fileHash: String
)
