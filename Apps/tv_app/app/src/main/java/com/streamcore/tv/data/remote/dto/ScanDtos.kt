package com.streamcore.tv.data.remote.dto

import com.google.gson.annotations.SerializedName

data class ScanFolderRequestDto(
    @SerializedName("root_path")
    val rootPath: String,
    @SerializedName("media")
    val media: String? = null, // "movies" | "series" | "mixed"
    @SerializedName("duplicate_policy")
    val duplicatePolicy: String? = null, // "omit" | "replace" | "allow"
    @SerializedName("add_subs")
    val addSubs: Boolean? = true
)

data class ScanFolderResultDto(
    @SerializedName("movies_created")
    val moviesCreated: Int = 0,
    @SerializedName("series_created")
    val seriesCreated: Int = 0,
    @SerializedName("episodes_created")
    val episodesCreated: Int = 0,
    @SerializedName("subtitles_added")
    val subtitlesAdded: Int = 0,
    @SerializedName("skipped")
    val skipped: Int = 0,
    @SerializedName("replaced")
    val replaced: Int = 0,
    @SerializedName("logs")
    val logs: List<String> = emptyList()
)