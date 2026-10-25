package com.streamcore.tv.data.remote.dto

import com.google.gson.annotations.SerializedName

/**
 * Data Transfer Objects for Content API
 */

// ========================================
// CATEGORIES
// ========================================

data class CategoryDto(
    @SerializedName("id")
    val id: Long,
    @SerializedName("name")
    val name: String,
    @SerializedName("category_type")
    val categoryType: String,
    @SerializedName("created_at")
    val createdAt: String
)

data class CategoriesResponseDto(
    @SerializedName("success")
    val success: Boolean,
    @SerializedName("categories")
    val categories: List<CategoryDto>
)

// ========================================
// CONTENT
// ========================================

data class ContentItemDto(
    @SerializedName("id")
    val id: Long,
    @SerializedName("category_id")
    val categoryId: Long,
    @SerializedName("title")
    val title: String,
    @SerializedName("description")
    val description: String?,
    @SerializedName("poster_url")
    val posterUrl: String?,
    @SerializedName("image_url")
    val imageUrl: String?,
    @SerializedName("backdrop_url")
    val backdropUrl: String?,
    @SerializedName("stream_url")
    val streamUrl: String?,
    @SerializedName("tmdb_id")
    val tmdbId: Long?,
    @SerializedName("year")
    val year: Int?,
    @SerializedName("active")
    val active: Boolean,
    @SerializedName("created_at")
    val createdAt: String,
    @SerializedName("provider")
    val provider: String? = null,
    @SerializedName("country")
    val country: String? = null,
    @SerializedName("format")
    val format: String? = null,
    @SerializedName("channel_number")
    val channelNumber: Int? = null,
    @SerializedName("channel_category")
    val channelCategory: String? = null,
    @SerializedName("is_live")
    val isLive: Boolean? = null,
    @SerializedName("drm_keys")
    val drmKeys: String? = null,
    @SerializedName("content_type")
    val contentType: String? = null,
    // LiveTV specific headers
    @SerializedName("origin")
    val origin: String? = null,
    @SerializedName("user_agent")
    val userAgent: String? = null,
    @SerializedName("referer")
    val referer: String? = null,
    @SerializedName("custom_headers")
    val customHeaders: String? = null,

    @SerializedName("proxy_url")
    val proxyUrl: String? = null,
    
    @SerializedName("doh_url")
    val dohUrl: String? = null
)

/**
 * DTO for content item from category endpoint (different structure)
 */
data class CategoryContentItemDto(
    @SerializedName("id")
    val id: Long,
    @SerializedName("category")
    val category: CategoryDto?,
    @SerializedName("title")
    val title: String,
    @SerializedName("description")
    val description: String?,
    @SerializedName("poster_url")
    val posterUrl: String?,
    @SerializedName("image_url")
    val imageUrl: String?,
    @SerializedName("backdrop_url")
    val backdropUrl: String?,
    @SerializedName("stream_url")
    val streamUrl: String?,
    @SerializedName("tmdb_id")
    val tmdbId: Long?,
    @SerializedName("year")
    val year: Int?,
    @SerializedName("created_at")
    val createdAt: String
) {
    // Helper properties to match ContentItemDto interface
    val categoryId: Long get() = category?.id ?: 0L
    val contentType: String? get() = when (category?.categoryType?.lowercase()) {
        "series" -> "series"
        "tv" -> "live_tv"
        "vod" -> "movie"
        else -> null
    }
}

data class ContentResponseDto(
    @SerializedName("content")
    val content: List<CategoryContentItemDto>,
    @SerializedName("total")
    val total: Int,
    @SerializedName("page")
    val page: Int,
    @SerializedName("limit")
    val limit: Int,
    @SerializedName("has_more")
    val hasMore: Boolean
)

// ========================================
// CONTENT DETAILS
// ========================================

data class ContentDetailsDto(
    @SerializedName("id")
    val id: Long,
    @SerializedName("title")
    val title: String,
    @SerializedName("description")
    val description: String?,
    @SerializedName("poster_url")
    val posterUrl: String?,
    @SerializedName("backdrop_url")
    val backdropUrl: String?,
    @SerializedName("duration")
    val duration: Long?,
    @SerializedName("year")
    val year: Int?,
    @SerializedName("rating")
    val rating: Float?,
    @SerializedName("genres")
    val genres: List<String>? = null,
    @SerializedName("content_type")
    val type: String?,
    @SerializedName("stream_url")
    val streamUrl: String?,

    @SerializedName("cast")
    val cast: List<CastMemberDto>? = null,
    @SerializedName("director")
    val director: String? = null,
    @SerializedName("trailer")
    val trailer: String? = null,
    @SerializedName("episodes")
    val episodes: List<EpisodeDto>? = null,
    @SerializedName("seasons")
    val seasons: List<SeasonDto>? = null,
    @SerializedName("relatedContent")
    val relatedContent: List<ContentItemDto>? = null,
    @SerializedName("created_at")
    val createdAt: String,
    @SerializedName("updatedAt")
    val updatedAt: String? = null,
    // LiveTV specific headers
    @SerializedName("origin")
    val origin: String? = null,
    @SerializedName("user_agent")
    val userAgent: String? = null,
    @SerializedName("referer")
    val referer: String? = null,
    @SerializedName("custom_headers")
    val customHeaders: String? = null
    ,
    @SerializedName("subtitle_url")
    val subtitleUrl: String? = null,
    @SerializedName("subtitles")
    val subtitles: List<SubtitleTrackDto>? = null
)

data class CastMemberDto(
    @SerializedName("name")
    val name: String,
    @SerializedName("character")
    val character: String?,
    @SerializedName("imageUrl")
    val imageUrl: String?
)

data class EpisodeDto(
    @SerializedName("id")
    val id: Long,
    @SerializedName("season_id")
    val seasonId: Long?,
    @SerializedName("episode_number")
    val episodeNumber: Int,
    @SerializedName("title")
    val title: String,
    @SerializedName("description")
    val description: String?,
    @SerializedName("stream_url")
    val streamUrl: String?,
    @SerializedName("image_url")
    val imageUrl: String?,
    @SerializedName("duration")
    val duration: Int?,
    @SerializedName("tmdb_id")
    val tmdbId: Long?,
    @SerializedName("air_date")
    val airDate: String?,
    @SerializedName("created_at")
    val createdAt: String?
)

data class SeasonDto(
    @SerializedName("id")
    val id: Long?,
    @SerializedName("series_id")
    val seriesId: Long?,
    @SerializedName("season_number")
    val seasonNumber: Int,
    @SerializedName("total_episodes")
    val episodeCount: Int?,
    @SerializedName("episodes")
    val episodes: List<EpisodeDto>,
    @SerializedName("created_at")
    val createdAt: String?
)

// ========================================
// STREAMING
// ========================================

/**
 * DTO for streaming content with decrypted URLs and DRM keys
 */
data class ContentStreamDto(
    @SerializedName("id")
    val id: Long,
    @SerializedName("category_id")
    val categoryId: Long,
    @SerializedName("title")
    val title: String,
    @SerializedName("description")
    val description: String?,
    @SerializedName("poster_url")
    val posterUrl: String?,
    @SerializedName("image_url")
    val imageUrl: String?,
    @SerializedName("stream_url")
    val streamUrl: String,
    @SerializedName("tmdb_id")
    val tmdbId: Long?,
    @SerializedName("year")
    val year: Int?,
    @SerializedName("channel_number")
    val channelNumber: Int?,        // Channel number for display
    @SerializedName("created_at")
    val createdAt: String,
    @SerializedName("drm_keys")
    val drmKeys: String?,           // Original hex format (for Live TV/Events DRM)
    @SerializedName("drm_keys_exo")
    val drmKeysExo: String?,        // ExoPlayer JSON format (for Live TV/Events DRM)
    // New DRM fields for Widevine/PlayReady support
    @SerializedName("drm_type")
    val drmType: String? = null,    // "clearkey", "widevine", "playready"
    @SerializedName("license_server_url")
    val licenseServerUrl: String? = null, // License server URL for Widevine/PlayReady
    @SerializedName("drm_headers")
    val drmHeaders: Map<String, String>? = null, // Custom headers for license requests
    // LiveTV specific headers
    @SerializedName("origin")
    val origin: String? = null,
    @SerializedName("user_agent")
    val userAgent: String? = null,
    @SerializedName("referer")
    val referer: String? = null,
    @SerializedName("custom_headers")
    val customHeaders: String? = null,
    // Per-channel HTTP proxy for Live TV
    @SerializedName("proxy_url")
    val proxyUrl: String? = null,
    @SerializedName("doh_url")
    val dohUrl: String? = null,
    @SerializedName("subtitle_url")
    val subtitleUrl: String? = null,
    @SerializedName("subtitles")
    val subtitles: List<SubtitleTrackDto>? = null,
    // Auth scope flags - tells client whether to send JWT auth headers
    // CRITICAL: Only send Authorization header to internal URLs, NOT to external URLs like Google API
    @SerializedName("requires_auth")
    val requiresAuth: Boolean = false,
    @SerializedName("is_internal_stream")
    val isInternalStream: Boolean = false
)

/**
 * DTO for episode streaming
 */
data class EpisodeStreamDto(
    @SerializedName("id")
    val id: Long,
    @SerializedName("season_id")
    val seasonId: Long,
    @SerializedName("episode_number")
    val episodeNumber: Int,
    @SerializedName("title")
    val title: String,
    @SerializedName("description")
    val description: String?,
    @SerializedName("image_url")
    val imageUrl: String?,
    @SerializedName("stream_url")
    val streamUrl: String,
    @SerializedName("created_at")
    val createdAt: String,
    @SerializedName("subtitle_url")
    val subtitleUrl: String? = null,
    @SerializedName("subtitles")
    val subtitles: List<SubtitleTrackDto>? = null,
    @SerializedName("proxy_url")
    val proxyUrl: String? = null,
    @SerializedName("doh_url")
    val dohUrl: String? = null
)

data class SubtitleTrackDto(
    @SerializedName("id")
    val id: Long,
    @SerializedName("language")
    val language: String,
    @SerializedName("label")
    val label: String?,
    @SerializedName("url")
    val url: String
)

/**
 * DTO for public stream listing (multi-stream quality selector)
 */
data class StreamPublicDto(
    @SerializedName("id")
    val id: Long,
    @SerializedName("is_default")
    val isDefault: Boolean,
    @SerializedName("quality")
    val quality: String? = null,
    @SerializedName("language")
    val language: String? = null,
    @SerializedName("audio_languages")
    val audioLanguages: String? = null,
    @SerializedName("format")
    val format: String? = null,
    @SerializedName("stream_url")
    val streamUrl: String,
    @SerializedName("drm_keys")
    val drmKeys: String? = null,
    @SerializedName("drm_keys_json")
    val drmKeysJson: String? = null,
    @SerializedName("drm_type")
    val drmType: String? = null,
    @SerializedName("license_server_url")
    val licenseServerUrl: String? = null,
    @SerializedName("drm_headers")
    val drmHeaders: Map<String, String>? = null,
    @SerializedName("proxy_url")
    val proxyUrl: String? = null,
    @SerializedName("doh_url")
    val dohUrl: String? = null,
    @SerializedName("origin")
    val origin: String? = null,
    @SerializedName("user_agent")
    val userAgent: String? = null,
    @SerializedName("referer")
    val referer: String? = null,
    @SerializedName("custom_headers")
    val customHeaders: String? = null
)

// ========================================
// SERIES & SEASONS
// ========================================

/**
 * DTO for series details (based on real API structure)
 */
data class SeriesDetailsDto(
    @SerializedName("id")
    val id: Int,
    @SerializedName("content")
    val content: SeriesContentDto?,
    @SerializedName("total_seasons")
    val totalSeasons: Int,
    @SerializedName("seasons")
    val seasons: List<SeasonDto>?,
    @SerializedName("backdrop_url")
    val backdropUrl: String?,
    @SerializedName("created_at")
    val createdAt: String
)

/**
 * DTO for series content information
 */
data class SeriesContentDto(
    @SerializedName("id")
    val id: Int,
    @SerializedName("category_id")
    val categoryId: Int,
    @SerializedName("title")
    val title: String,
    @SerializedName("description")
    val description: String?,
    @SerializedName("image_url")
    val imageUrl: String?,
    @SerializedName("tmdb_id")
    val tmdbId: Int?,
    @SerializedName("year")
    val year: Int?,
    @SerializedName("created_at")
    val createdAt: String
)

/**
 * DTO for season details
 */
data class SeasonDetailsDto(
    @SerializedName("id")
    val id: Long,
    @SerializedName("series_id")
    val seriesId: Long,
    @SerializedName("season_number")
    val seasonNumber: Int,
    @SerializedName("title")
    val title: String?,
    @SerializedName("description")
    val description: String?,
    @SerializedName("image_url")
    val imageUrl: String?,
    @SerializedName("poster_url")
    val posterUrl: String?,
    @SerializedName("backdrop_url")
    val backdropUrl: String?,
    @SerializedName("total_episodes")
    val totalEpisodes: Int,
    @SerializedName("tmdb_id")
    val tmdbId: Long?,
    @SerializedName("air_date")
    val airDate: String?,
    @SerializedName("created_at")
    val createdAt: String
)

/**
 * DTO for episode details
 */
data class EpisodeDetailsDto(
    @SerializedName("id")
    val id: Long,
    @SerializedName("series_id")
    val seriesId: Long,
    @SerializedName("season_id")
    val seasonId: Long,
    @SerializedName("title")
    val title: String,
    @SerializedName("description")
    val description: String?,
    @SerializedName("episode_number")
    val episodeNumber: Int,
    @SerializedName("season_number")
    val seasonNumber: Int,
    @SerializedName("image_url")
    val imageUrl: String?,
    @SerializedName("duration")
    val duration: Long?,
    @SerializedName("air_date")
    val airDate: String?,
    @SerializedName("is_watched")
    val isWatched: Boolean = false,
    @SerializedName("watch_progress")
    val watchProgress: Long = 0L,
    @SerializedName("created_at")
    val createdAt: String
)
