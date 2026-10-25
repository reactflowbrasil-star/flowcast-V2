package com.streamcore.tv.domain.model

/**
 * Domain models for content-related entities
 * 
 * These are the core business entities used throughout the app
 */

// ========================================
// CONTENT TYPES
// ========================================

enum class ContentType {
    MOVIE,
    SERIES,
    LIVE_TV,
    EPISODE
}

enum class VideoQuality {
    AUTO,
    LOW,
    MEDIUM,
    HIGH,
    ULTRA
}

// ========================================
// CONTENT ENTITIES
// ========================================

data class ContentItem(
    val id: String,
    val title: String,
    val description: String?,
    val imageUrl: String?,
    val backdropUrl: String?,
    val duration: Long?, // in seconds
    val year: Int?,
    val rating: Float?, // 0.0 - 10.0
    val genres: List<String>,
    val type: ContentType,
    val originalType: String? = null, // Original type from server (e.g., "anime", "series")
    val streamUrl: String?,
    val createdAt: String = "",
    val updatedAt: String = "",
    val isLive: Boolean = false,
    val drmKeys: String? = null, // ClearKey DRM keys in format "kid:key"
    // LiveTV specific headers
    val origin: String? = null,
    val userAgent: String? = null,
    val referer: String? = null,
    val customHeaders: String? = null,
    val channelCategory: String? = null,
    // Per-channel HTTP proxy for Live TV
    val proxyUrl: String? = null,
    // Optional DNS-over-HTTPS resolver for Live TV
    val dohUrl: String? = null,
    // Optional external subtitles (SRT/VTT) URL. Example: "https://.../subs.srt" or "https://.../subs.vtt"
    val subtitleUrl: String? = null,
    val subtitleTracks: List<SubtitleTrack> = emptyList()
)

data class ContentDetails(
    val id: String,
    val title: String,
    val description: String?,
    val imageUrl: String?, // Legacy field for compatibility
    val posterUrl: String?, // New field for poster
    val backdropUrl: String?,
    val duration: Long?,
    val year: Int?,
    val rating: Float?,
    val genres: List<String>,
    val type: ContentType,
    val originalType: String?, // Original content_type from server (e.g., "anime", "series")
    val streamUrl: String?,
    val cast: List<CastMember>?,
    val director: String?,
    val trailer: String?,
    val episodes: List<Episode>?,
    val seasons: List<Season>?,
    val relatedContent: List<ContentItem>?,
    val createdAt: String,
    val updatedAt: String,
    // LiveTV specific headers
    val origin: String? = null,
    val userAgent: String? = null,
    val referer: String? = null,
    val customHeaders: String? = null,
    // Optional external subtitles
    val subtitleUrl: String? = null,
    val subtitleTracks: List<SubtitleTrack> = emptyList()
)

data class CastMember(
    val name: String,
    val character: String?,
    val imageUrl: String?
)

// Legacy Episode and Season models removed - using new models below

// ========================================
// CATEGORIES
// ========================================

data class Category(
    val id: String,
    val name: String,
    val slug: String,
    val description: String?,
    val imageUrl: String?,
    val contentCount: Int
)

// ========================================
// CONTENT SECTIONS
// ========================================

data class ContentSection(
    val title: String,
    val categoryId: String,
    val items: List<ContentItem>
)

// ========================================
// PAGINATION
// ========================================

data class PaginationInfo(
    val currentPage: Int,
    val totalPages: Int,
    val totalItems: Int,
    val hasNext: Boolean,
    val hasPrevious: Boolean
)

data class ContentPage(
    val content: List<ContentItem>,
    val pagination: PaginationInfo
)

// ========================================
// SEARCH
// ========================================

data class SearchResult(
    val results: List<ContentItem>,
    val pagination: PaginationInfo,
    val suggestions: List<String>?
)

data class SearchQuery(
    val query: String,
    val type: ContentType? = null,
    val category: String? = null,
    val year: Int? = null,
    val genre: String? = null,
    val country: String? = null,
    val page: Int = 1,
    val limit: Int = 20,
    val excludeCategories: List<String> = emptyList() // Categories to exclude from search
)

// ========================================
// STREAMING MODELS
// ========================================

/**
 * Content stream with DRM support for Live TV/Events
 */
data class ContentStream(
    val id: String,
    val categoryId: String,
    val title: String,
    val description: String?,
    val imageUrl: String?,
    val streamUrl: String,
    val tmdbId: String?,
    val year: Int?,
    val channelNumber: Int?,        // Channel number for display
    val channelCategory: String? = null,
    val createdAt: String,
    val drmKeys: String?,           // Original hex format (for Live TV/Events DRM)
    val drmKeysExo: String?,        // ExoPlayer JSON format (for Live TV/Events DRM)
    // New DRM fields for Widevine/PlayReady support
    val drmType: String? = null,    // "clearkey", "widevine", "playready"
    val licenseServerUrl: String? = null, // License server URL for Widevine/PlayReady
    val drmHeaders: Map<String, String>? = null, // Custom headers for license requests
    // LiveTV specific headers
    val origin: String? = null,
    val userAgent: String? = null,
    val referer: String? = null,
    val customHeaders: String? = null,
    // Per-channel HTTP proxy for Live TV
    val proxyUrl: String? = null,
    // Optional DNS-over-HTTPS resolver
    val dohUrl: String? = null,
    // Optional external subtitle URL (SRT/VTT)
    val subtitleUrl: String? = null,
    val subtitleTracks: List<SubtitleTrack> = emptyList(),
    // Auth scope flags - CRITICAL: tells player whether to send JWT auth headers
    // Only send Authorization header to internal URLs, NOT to external URLs like Google API
    val requiresAuth: Boolean = false,
    val isInternalStream: Boolean = false
)

data class SubtitleTrack(
    val id: String,
    val language: String,
    val label: String,
    val url: String
)

/**
 * Episode stream
 */
data class EpisodeStream(
    val id: String,
    val seriesId: String,
    val seasonId: String,
    val title: String,
    val description: String?,
    val episodeNumber: Int,
    val seasonNumber: Int,
    val imageUrl: String?,
    val streamUrl: String,
    val duration: Long?,
    val airDate: String?,
    val createdAt: String,
    val subtitleUrl: String? = null,
    val subtitleTracks: List<SubtitleTrack> = emptyList(),
    val proxyUrl: String? = null,
    val dohUrl: String? = null
)

// ========================================
// SERIES MODELS (Based on real API structure)
// ========================================

/**
 * Series details with nested seasons and episodes
 */
data class SeriesDetails(
    val id: Int,
    val content: SeriesContent,
    val totalSeasons: Int,
    val seasons: List<Season>,
    val backdropUrl: String? = null,
    val createdAt: String
)

/**
 * Series content information
 */
data class SeriesContent(
    val id: Int,
    val categoryId: Int,
    val title: String,
    val description: String?,
    val imageUrl: String?,
    val tmdbId: Int?,
    val year: Int?,
    val createdAt: String
)

/**
 * Season with episodes
 */
data class Season(
    val id: Long,
    val seriesId: Long,
    val seasonNumber: Int,
    val totalEpisodes: Int,
    val episodes: List<Episode>,
    val createdAt: String
)

/**
 * Episode details
 */
data class Episode(
    val id: Long,
    val seasonId: Long,
    val episodeNumber: Int,
    val title: String,
    val description: String?,
    val imageUrl: String?,
    val createdAt: String
)

/**
 * Legacy models for backward compatibility
 */
data class SeasonDetails(
    val id: String,
    val seriesId: String,
    val seasonNumber: Int,
    val title: String?,
    val description: String?,
    val imageUrl: String?,
    val posterUrl: String?,
    val backdropUrl: String?,
    val totalEpisodes: Int,
    val tmdbId: Long?,
    val airDate: String?,
    val createdAt: String
)

data class EpisodeDetails(
    val id: String,
    val seriesId: String,
    val seasonId: String,
    val title: String,
    val description: String?,
    val episodeNumber: Int,
    val seasonNumber: Int,
    val imageUrl: String?,
    val duration: Long?,
    val airDate: String?,
    val isWatched: Boolean = false,
    val watchProgress: Long = 0L,
    val createdAt: String
)

// Extension function to convert ContentDetails to ContentItem
fun ContentDetails.toContentItem(): ContentItem {
    return ContentItem(
        id = this.id,
        title = this.title,
        description = this.description,
        imageUrl = this.posterUrl ?: this.imageUrl ?: "", // Use posterUrl if available, fallback to imageUrl, then empty string
        backdropUrl = this.backdropUrl,
        duration = this.duration,
        year = this.year,
        rating = this.rating,
        genres = this.genres,
        type = this.type,
        originalType = this.originalType,
        streamUrl = this.streamUrl,
        createdAt = this.createdAt,
        updatedAt = this.updatedAt,
        isLive = this.type == ContentType.LIVE_TV,
        drmKeys = null, // ContentDetails doesn't have drmKeys
        // LiveTV headers
        origin = this.origin,
        userAgent = this.userAgent,
        referer = this.referer,
        customHeaders = this.customHeaders,
        subtitleUrl = this.subtitleUrl,
        subtitleTracks = this.subtitleTracks
    )
}


// Subtitle selection option for UI (mapped from ExoPlayer TEXT renderer tracks)
data class SubtitleOption(
    val rendererIndex: Int,
    val groupIndex: Int,
    val trackIndex: Int,
    val language: String,
    val label: String,
    val isSelected: Boolean = false
) {
    fun getDisplayName(): String {
        val display = label.ifBlank { language.uppercase() }
        return if (isSelected) "$display ✓" else display
    }
}
