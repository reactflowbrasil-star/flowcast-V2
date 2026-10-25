package com.streamcore.tv.data.mapper

import com.streamcore.tv.core.constants.ApiConstants
import com.streamcore.tv.core.utils.logd
import com.streamcore.tv.data.local.entity.*
import com.streamcore.tv.data.remote.dto.*
import com.streamcore.tv.domain.model.*
import java.net.URI

/**
 * Mapper functions for content-related data transformations
 * 
 * Converts between:
 * - DTOs (from API) ↔ Domain Models
 * - Domain Models ↔ Entities (for database)
 */

// ========================================
// DTO TO DOMAIN MODEL MAPPERS
// ========================================

/**
 * Convert CategoryContentItemDto to ContentItem domain model
 */
fun CategoryContentItemDto.toDomainModel(): ContentItem {
    val normalizedPoster = resolveContentAssetUrl(posterUrl)
    val normalizedImage = normalizedPoster ?: resolveContentAssetUrl(imageUrl)
    return ContentItem(
        id = id.toString(),
        title = title,
        description = description,
        imageUrl = normalizedImage,
        backdropUrl = resolveContentAssetUrl(backdropUrl),
        duration = null,
        year = year,
        rating = null,
        genres = emptyList(),
        type = determineContentTypeFromCategory(),
        streamUrl = null,
        originalType = category?.categoryType?.lowercase(),
        createdAt = createdAt,
        updatedAt = createdAt,
        isLive = false,
        drmKeys = null
    )
}

fun ContentItemDto.toDomainModel(): ContentItem {
    val normalizedPoster = resolveContentAssetUrl(posterUrl)
    val normalizedImage = normalizedPoster ?: resolveContentAssetUrl(imageUrl)
    return ContentItem(
        id = id.toString(),
        title = title,
        description = description,
        imageUrl = normalizedImage,
        backdropUrl = resolveContentAssetUrl(backdropUrl),
        duration = null,
        year = year,
        rating = null,
        genres = emptyList(),
        type = determineContentType(),
        streamUrl = streamUrl,
        originalType = contentType?.lowercase(),
        createdAt = createdAt,
        updatedAt = createdAt,
        isLive = isLive ?: false,
        drmKeys = drmKeys,
        // LiveTV specific headers
        origin = origin,
        userAgent = userAgent,
        referer = referer,
        customHeaders = customHeaders,
        channelCategory = channelCategory,
        proxyUrl = proxyUrl,
        dohUrl = dohUrl,
        subtitleUrl = null,
        subtitleTracks = emptyList()
    )
}

/**
 * Determine content type for CategoryContentItemDto based on category information
 */
private fun CategoryContentItemDto.determineContentTypeFromCategory(): ContentType {
    val normalizedApiType = contentType?.lowercase()
    val categoryType = category?.categoryType?.lowercase()

    val result = when {
        normalizedApiType == "series" || normalizedApiType == "anime" -> ContentType.SERIES
        normalizedApiType == "movie" || normalizedApiType == "vod" ||
            normalizedApiType == "events" || normalizedApiType == "eventos" ||
            normalizedApiType == "kids" -> ContentType.MOVIE
        normalizedApiType == "live_tv" || normalizedApiType == "tv" -> ContentType.LIVE_TV
        categoryType == "series" -> ContentType.SERIES
        categoryType == "tv" || categoryType == "live_tv" -> ContentType.LIVE_TV
        categoryId == 3L -> ContentType.SERIES  // Series category
        categoryId == 7L -> ContentType.SERIES  // Anime category (has seasons/episodes)
        categoryId == 2L -> ContentType.LIVE_TV // TV category
        else -> ContentType.MOVIE // VOD, Kids, Events all treated as movies
    }

    // Log for debugging
    logd("ContentMapper: Content '$title' (ID: $id) - contentType: '$contentType', categoryType: '$categoryType', categoryId: $categoryId -> Mapped to: $result")

    return result
}

private fun ContentItemDto.determineContentType(): ContentType {
    val normalizedApiType = contentType?.lowercase()
    val result = when {
        // First check explicit content_type field from API
        normalizedApiType == "series" || normalizedApiType == "anime" -> ContentType.SERIES
        normalizedApiType == "movie" || normalizedApiType == "vod" ||
            normalizedApiType == "events" || normalizedApiType == "eventos" ||
            normalizedApiType == "kids" -> ContentType.MOVIE
        normalizedApiType == "live_tv" || normalizedApiType == "tv" -> ContentType.LIVE_TV
        // Fallback to legacy logic
        channelNumber != null -> ContentType.LIVE_TV
        isLive == true -> ContentType.LIVE_TV
        categoryId == 3L -> ContentType.SERIES  // Series category
        categoryId == 7L -> ContentType.SERIES  // Anime category (has seasons/episodes)
        categoryId == 2L -> ContentType.LIVE_TV // TV category
        else -> ContentType.MOVIE // VOD, Kids, Events all treated as movies
    }

    // Log for debugging
    logd("ContentMapper: Content '$title' (ID: $id) - contentType: '$contentType', categoryId: $categoryId -> Mapped to: $result")

    return result
}

private fun resolveContentAssetUrl(rawUrl: String?): String? {
    val candidate = rawUrl?.trim().orEmpty()
    if (candidate.isBlank()) return null

    val lower = candidate.lowercase()
    val isAbsolute = lower.startsWith("http://") ||
        lower.startsWith("https://") ||
        lower.startsWith("file://") ||
        lower.startsWith("content://") ||
        lower.startsWith("data:")

    return if (isAbsolute) {
        replaceLocalhostWithApiBase(candidate)
    } else {
        val base = resolveServerBaseUrl()
        val sanitizedPath = candidate.removePrefix("/")
        "$base/$sanitizedPath"
    }
}

private fun replaceLocalhostWithApiBase(url: String): String {
    return try {
        val uri = URI(url)
        val host = uri.host
        if (host.isNullOrBlank() || (!host.equals("localhost", ignoreCase = true) && host != "127.0.0.1")) {
            url
        } else {
            val base = resolveServerBaseUrl()
            val baseUri = URI(base)
            val scheme = uri.scheme ?: baseUri.scheme ?: "http"
            val port = when {
                baseUri.port != -1 -> baseUri.port
                uri.port != -1 -> uri.port
                else -> -1
            }

            URI(
                scheme,
                uri.userInfo,
                baseUri.host,
                port,
                uri.rawPath,
                uri.rawQuery,
                uri.rawFragment
            ).toString()
        }
    } catch (_: Exception) {
        url
    }
}

private fun resolveServerBaseUrl(): String {
    return try {
        val apiUri = URI(ApiConstants.API_BASE_URL)
        val scheme = apiUri.scheme ?: "http"
        val host = apiUri.host
        if (host.isNullOrBlank()) {
            ApiConstants.API_BASE_URL.trimEnd('/')
        } else {
            val port = apiUri.port
            val portSuffix = when {
                port == -1 -> ""
                scheme == "http" && port == 80 -> ""
                scheme == "https" && port == 443 -> ""
                else -> ":$port"
            }
            "$scheme://$host$portSuffix"
        }
    } catch (_: Exception) {
        ApiConstants.API_BASE_URL
            .trimEnd('/')
            .removeSuffix("/api")
            .removeSuffix("/api/")
    }
}

fun ContentDetailsDto.toDomainModel(): ContentDetails {
    val normalizedPoster = resolveContentAssetUrl(posterUrl)
    val normalizedImage = normalizedPoster
    return ContentDetails(
        id = id.toString(),
        title = title,
        description = description,
        imageUrl = normalizedImage,
        posterUrl = normalizedPoster,
        backdropUrl = resolveContentAssetUrl(backdropUrl),
        duration = duration,
        year = year,
        rating = rating,
        genres = genres ?: emptyList(),
        type = determineContentTypeFromDetails(type, episodes, seasons),
        originalType = type, // Preserve original content_type from server
        streamUrl = streamUrl,
        cast = cast?.map { it.toDomainModel() },
        director = director,
        trailer = trailer,
        episodes = episodes?.map { it.toDomainModel() },
        seasons = seasons?.map { it.toDomainModel() },
        relatedContent = relatedContent?.map { it.toDomainModel() },
        createdAt = createdAt,
        updatedAt = updatedAt ?: createdAt,
        // LiveTV specific headers
        origin = origin,
        userAgent = userAgent,
        referer = referer,
        customHeaders = customHeaders,
        subtitleUrl = subtitleUrl,
        subtitleTracks = subtitles?.map { it.toDomainModel() } ?: emptyList()
    )
}

fun CastMemberDto.toDomainModel(): CastMember {
    return CastMember(
        name = name,
        character = character,
        imageUrl = resolveContentAssetUrl(imageUrl)
    )
}

fun EpisodeDto.toDomainModel(): Episode {
    return Episode(
        id = id,
        seasonId = seasonId ?: 0L,
        episodeNumber = episodeNumber,
        title = title,
        description = description,
        imageUrl = resolveContentAssetUrl(imageUrl),
        createdAt = createdAt ?: ""
    )
}

fun SeasonDto.toDomainModel(): Season {
    return Season(
        id = id ?: 0L,
        seriesId = seriesId ?: 0L,
        seasonNumber = seasonNumber,
        totalEpisodes = episodeCount ?: episodes.size,
        episodes = episodes.map { it.toDomainModel() },
        createdAt = createdAt ?: ""
    )
}

fun CategoryDto.toDomainModel(): Category {
    return Category(
        id = id.toString(),
        name = name,
        slug = categoryType.lowercase(),
        description = null,
        imageUrl = null,
        contentCount = 0
    )
}

fun ContentResponseDto.toDomainModel(): ContentPage {
    return ContentPage(
        content = content.map { it.toDomainModel() },
        pagination = PaginationInfo(
            currentPage = page,
            totalPages = if (total > 0) ((total - 1) / limit) + 1 else 1,
            totalItems = total,
            hasNext = hasMore,
            hasPrevious = page > 1
        )
    )
}

// ========================================
// DOMAIN MODEL TO ENTITY MAPPERS
// ========================================

fun ContentItem.toEntity(): ContentEntity {
    return ContentEntity(
        id = id,
        title = title,
        description = description,
        imageUrl = imageUrl,
        backdropUrl = backdropUrl,
        duration = duration,
        year = year,
        rating = rating,
        genres = genres,
        type = type.name,
        streamUrl = streamUrl,
        createdAt = createdAt,
        updatedAt = updatedAt
        // Note: isLive and drmKeys are not stored in local cache
    )
}

fun Category.toEntity(): CategoryEntity {
    return CategoryEntity(
        id = id,
        name = name,
        slug = slug,
        description = description,
        imageUrl = imageUrl,
        contentCount = contentCount
    )
}

fun FavoriteItem.toEntity(): FavoriteEntity {
    return FavoriteEntity(
        contentId = contentId,
        addedAt = addedAt
    )
}

fun WatchHistoryItem.toEntity(): WatchHistoryEntity {
    return WatchHistoryEntity(
        contentId = contentId,
        watchedAt = watchedAt,
        progress = progress,
        duration = duration
    )
}

// ========================================
// ENTITY TO DOMAIN MODEL MAPPERS
// ========================================

fun ContentEntity.toDomainModel(): ContentItem {
    val safeType = runCatching {
        ContentType.valueOf(type.uppercase())
    }.getOrDefault(ContentType.MOVIE)

    return ContentItem(
        id = id,
        title = title,
        description = description,
        imageUrl = imageUrl,
        backdropUrl = backdropUrl,
        duration = duration,
        year = year,
        rating = rating,
        genres = genres,
        type = safeType,
        streamUrl = streamUrl,
        createdAt = createdAt,
        updatedAt = updatedAt,
        isLive = false, // Default for cached entities
        drmKeys = null  // Default for cached entities
    )
}

fun CategoryEntity.toDomainModel(): Category {
    return Category(
        id = id,
        name = name,
        slug = slug,
        description = description,
        imageUrl = imageUrl,
        contentCount = contentCount
    )
}

fun FavoriteEntity.toDomainModel(content: ContentItem): FavoriteItem {
    return FavoriteItem(
        contentId = contentId,
        content = content,
        addedAt = addedAt
    )
}

fun WatchHistoryEntity.toDomainModel(content: ContentItem): WatchHistoryItem {
    return WatchHistoryItem(
        contentId = contentId,
        content = content,
        watchedAt = watchedAt,
        progress = progress,
        duration = duration
    )
}

// ========================================
// EXTENSION FUNCTIONS FOR LISTS
// ========================================

fun List<ContentItemDto>.toContentItemsFromDto(): List<ContentItem> {
    return map { it.toDomainModel() }
}

fun List<CategoryDto>.toCategoriesFromDto(): List<Category> {
    return map { it.toDomainModel() }
}

fun List<ContentItem>.toContentEntities(): List<ContentEntity> {
    return map { it.toEntity() }
}

fun List<Category>.toCategoryEntities(): List<CategoryEntity> {
    return map { it.toEntity() }
}

fun List<ContentEntity>.toContentItemsFromEntity(): List<ContentItem> {
    return map { it.toDomainModel() }
}

fun List<CategoryEntity>.toCategoriesFromEntity(): List<Category> {
    return map { it.toDomainModel() }
}

// ========================================
// HELPER FUNCTIONS FOR CONTENT DETAILS
// ========================================

private fun determineContentTypeFromDetails(
    type: String?,
    episodes: List<EpisodeDto>?,
    seasons: List<SeasonDto>?
): ContentType {
    return when {
        type != null -> {
            when (type.lowercase()) {
                "series" -> ContentType.SERIES
                "movie" -> ContentType.MOVIE
                "live_tv" -> ContentType.LIVE_TV
                "episode" -> ContentType.EPISODE
                "anime" -> ContentType.SERIES    // Anime are series with episodes
                "kids" -> ContentType.MOVIE      // Kids content is movies
                "vod" -> ContentType.MOVIE       // VOD content is movies
                "tv" -> ContentType.LIVE_TV      // TV content is live TV
                // VOD content mapping removed
                "eventos" -> ContentType.MOVIE   // Events content is movies
                else -> {
                    // If type is not recognized, determine from structure
                    determineContentTypeFromStructure(episodes, seasons)
                }
            }
        }
        else -> determineContentTypeFromStructure(episodes, seasons)
    }
}

private fun determineContentTypeFromStructure(
    episodes: List<EpisodeDto>?,
    seasons: List<SeasonDto>?
): ContentType {
    return when {
        !episodes.isNullOrEmpty() || !seasons.isNullOrEmpty() -> ContentType.SERIES
        else -> ContentType.MOVIE // Default to movie
    }
}

// ========================================
// STREAMING MAPPERS - PHASE 2
// ========================================

/**
 * Convert ContentStreamDto to ContentStream domain model
 */
fun ContentStreamDto.toContentStreamFromDto(): ContentStream {
    return ContentStream(
        id = id.toString(),
        categoryId = categoryId.toString(),
        title = title,
        description = description,
        imageUrl = posterUrl ?: imageUrl, // Use posterUrl if available, fallback to imageUrl
        streamUrl = streamUrl,
        tmdbId = tmdbId?.toString(),
        year = year,
        channelNumber = channelNumber,
        createdAt = createdAt,
        drmKeys = drmKeys,
        drmKeysExo = drmKeysExo,
        // New DRM fields for Widevine/PlayReady support
        // Infer PlayReady if license URL suggests it, overriding backend 'widevine' default
        drmType = if (licenseServerUrl?.contains("playready", ignoreCase = true) == true || 
                      licenseServerUrl?.contains("microsoft", ignoreCase = true) == true) {
            "playready"
        } else {
            drmType
        },
        licenseServerUrl = licenseServerUrl,
        drmHeaders = drmHeaders,
        // LiveTV specific headers
        origin = origin,
        userAgent = userAgent,
        referer = referer,
        customHeaders = customHeaders,
        // Per-channel HTTP proxy for Live TV
        proxyUrl = proxyUrl,
        dohUrl = dohUrl,
        subtitleUrl = subtitleUrl,
        subtitleTracks = subtitles?.map { it.toDomainModel() } ?: emptyList(),
        // Auth scope flags - CRITICAL: tells player whether to send JWT auth headers
        requiresAuth = requiresAuth,
        isInternalStream = isInternalStream
    )
}

/**
 * Convert EpisodeStreamDto to EpisodeStream domain model
 */
fun EpisodeStreamDto.toEpisodeStreamFromDto(): EpisodeStream {
    return EpisodeStream(
        id = id.toString(),
        seriesId = "", // Not available in DTO
        seasonId = seasonId.toString(),
        title = title,
        description = description,
        episodeNumber = episodeNumber,
        seasonNumber = 0, // Not available in DTO
        imageUrl = imageUrl ?: "",
        streamUrl = streamUrl,
        duration = null, // Not available in DTO
        airDate = null, // Not available in DTO
        createdAt = createdAt,
        subtitleUrl = subtitleUrl,
        subtitleTracks = subtitles?.map { it.toDomainModel() } ?: emptyList(),
        proxyUrl = proxyUrl,
        dohUrl = dohUrl
    )
}

fun SubtitleTrackDto.toDomainModel(): SubtitleTrack {
    return SubtitleTrack(
        id = id.toString(),
        language = language,
        label = (label ?: language).ifBlank { language.uppercase() },
        url = url
    )
}

// ========================================
// SERIES MAPPERS - PHASE 2
// ========================================

/**
 * Convert SeriesDetailsDto to SeriesDetails domain model
 */
fun SeriesDetailsDto.toSeriesDetailsFromDto(): SeriesDetails {
    return SeriesDetails(
        id = id,
        content = content?.let { contentDto ->
                    SeriesContent(
            id = contentDto.id,
            categoryId = contentDto.categoryId,
            title = contentDto.title,
            description = contentDto.description,
            imageUrl = contentDto.imageUrl ?: "",
            tmdbId = contentDto.tmdbId,
            year = contentDto.year,
            createdAt = contentDto.createdAt
        )
        } ?: SeriesContent(
            id = 0,
            categoryId = 0,
            title = id.toString(),
            description = null,
            imageUrl = "",
            tmdbId = null,
            year = null,
            createdAt = createdAt
        ),
        totalSeasons = totalSeasons,
        seasons = seasons?.map { it.toDomainModel() } ?: emptyList(),
        backdropUrl = backdropUrl,
        createdAt = createdAt
    )
}

/**
 * Convert SeasonDetailsDto to SeasonDetails domain model
 */
fun SeasonDetailsDto.toSeasonDetailsFromDto(): SeasonDetails {
    return SeasonDetails(
        id = id.toString(),
        seriesId = seriesId.toString(),
        seasonNumber = seasonNumber,
        title = title,
        description = description,
        imageUrl = imageUrl ?: "",
        posterUrl = posterUrl ?: "",
        backdropUrl = backdropUrl ?: "",
        totalEpisodes = totalEpisodes,
        tmdbId = tmdbId,
        airDate = airDate,
        createdAt = createdAt
    )
}

/**
 * Convert EpisodeDetailsDto to EpisodeDetails domain model
 */
fun EpisodeDetailsDto.toEpisodeDetailsFromDto(): EpisodeDetails {
    return EpisodeDetails(
        id = id.toString(),
        seriesId = seriesId.toString(),
        seasonId = seasonId.toString(),
        title = title,
        description = description,
        episodeNumber = episodeNumber,
        seasonNumber = seasonNumber,
        imageUrl = imageUrl ?: "",
        duration = duration,
        airDate = airDate,
        isWatched = isWatched,
        watchProgress = watchProgress,
        createdAt = createdAt
    )
}
