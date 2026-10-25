package com.streamcore.tv.domain.repository

import com.streamcore.tv.domain.model.*
import kotlinx.coroutines.flow.Flow

/**
 * Repository interface for content operations
 * 
 * Handles:
 * - Content browsing and discovery
 * - Categories management
 * - Content details and metadata
 * - Search functionality
 */
interface ContentRepository {
    
    /**
     * Get all content categories
     */
    suspend fun getCategories(): Result<List<Category>>
    
    /**
     * Get content by category with pagination
     */
    suspend fun getContentByCategory(
        categoryId: String,
        page: Int = 1,
        limit: Int = 200,
        sort: String? = null,
        filter: String? = null
    ): Result<ContentPage>
    
    /**
     * Get content details by ID
     */
    suspend fun getContentDetails(contentId: String): Result<ContentDetails>
    
    /**
     * Get featured content for home screen
     */
    suspend fun getFeaturedContent(limit: Int = 10): Result<List<ContentItem>>
    
    /**
     * Search content with query and filters
     */
    suspend fun searchContent(searchQuery: SearchQuery): Result<SearchResult>
    
    /**
     * Get content recommendations based on user history
     */
    suspend fun getRecommendations(limit: Int = 20): Result<List<ContentItem>>
    
    /**
     * Get recently added content
     */
    suspend fun getRecentlyAdded(limit: Int = 20): Result<List<ContentItem>>
    
    /**
     * Get popular content
     */
    suspend fun getPopularContent(
        type: ContentType? = null,
        limit: Int = 20
    ): Result<List<ContentItem>>
    
    /**
     * Get content by genre
     */
    suspend fun getContentByGenre(
        genre: String,
        limit: Int = 20
    ): Result<List<ContentItem>>
    
    /**
     * Cache content locally for offline access
     */
    suspend fun cacheContent(content: List<ContentItem>): Result<Unit>
    
    /**
     * Get cached content
     */
    fun getCachedContent(): Flow<List<ContentItem>>
    
    /**
     * Clear content cache
     */
    suspend fun clearCache(): Result<Unit>
    
    /**
     * Get content sections for home screen
     */
    suspend fun getContentSections(): Result<List<ContentSection>>

    // ========================================
    // STREAMING METHODS - PHASE 2
    // ========================================

    /**
     * Get content stream with DRM support (for Live TV/Events)
     */
    suspend fun getContentStream(contentId: String): retrofit2.Response<ContentStream>

    /**
     * Get available streams for content (multi-stream quality selector)
     */
    suspend fun getContentStreams(contentId: String): retrofit2.Response<List<com.streamcore.tv.data.remote.dto.StreamPublicDto>>

    /**
     * Get episode stream
     */
    suspend fun getEpisodeStream(episodeId: String): retrofit2.Response<EpisodeStream>

    /**
     * Get available streams for episode (multi-stream quality selector)
     */
    suspend fun getEpisodeStreams(episodeId: String): retrofit2.Response<List<com.streamcore.tv.data.remote.dto.StreamPublicDto>>

    /**
     * Get TV channels for Live TV
     */
    suspend fun getTvChannels(): retrofit2.Response<List<ContentItem>>

    /**
     * Get TV channels filtered by channel category
     */
    suspend fun getTvChannelsByCategory(channelCategory: String): retrofit2.Response<List<ContentItem>>

    /**
     * Get available TV channel categories
     */
    suspend fun getTvChannelCategories(): retrofit2.Response<List<String>>

    // ========================================
    // SERIES METHODS - PHASE 2
    // ========================================

    /**
     * Get series details by content ID
     */
    suspend fun getSeriesByContentId(contentId: String): retrofit2.Response<SeriesDetails>

    /**
     * Get series details by series ID
     */
    suspend fun getSeriesDetails(seriesId: Int): retrofit2.Response<SeriesDetails>

    /**
     * Get seasons for a series
     */
    suspend fun getSeriesSeasons(seriesId: String): retrofit2.Response<List<SeasonDetails>>

    /**
     * Get episodes for a season
     */
    suspend fun getSeasonEpisodes(seasonId: String): retrofit2.Response<List<EpisodeDetails>>

    /**
     * Get episode details
     */
    suspend fun getEpisodeDetails(episodeId: String): retrofit2.Response<EpisodeDetails>

    /**
     * Admin: Scan folder ingest (calls backend admin/ingest/scan-folder)
     * Returns raw Retrofit Response containing ScanFolderResultDto
     */
    suspend fun scanFolderIngest(request: com.streamcore.tv.data.remote.dto.ScanFolderRequestDto): retrofit2.Response<com.streamcore.tv.data.remote.dto.ScanFolderResultDto>
}
