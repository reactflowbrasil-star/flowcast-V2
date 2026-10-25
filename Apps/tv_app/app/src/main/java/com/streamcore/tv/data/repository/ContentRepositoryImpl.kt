package com.streamcore.tv.data.repository

import com.streamcore.tv.data.local.dao.ContentDao
import com.streamcore.tv.data.mapper.*
import com.streamcore.tv.data.remote.api.IPTVApiService
import com.streamcore.tv.domain.model.*
import com.streamcore.tv.domain.repository.ContentRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Implementation of ContentRepository
 * 
 * Handles content operations with both remote API and local caching
 */
@Singleton
class ContentRepositoryImpl @Inject constructor(
    private val apiService: IPTVApiService,
    private val contentDao: ContentDao
) : ContentRepository {
    
    override suspend fun getCategories(): Result<List<Category>> {
        return try {
            Timber.d("Fetching categories")

            val response = apiService.getCategories()

            if (response.isSuccessful) {
                val body = response.body()
                if (body != null) {
                    val categories = body.toCategoriesFromDto()

                    // Cache categories locally
                    contentDao.insertAllCategories(categories.toCategoryEntities())

                    Timber.d("Fetched ${categories.size} categories")
                    Result.Success(categories)
                } else {
                    val errorMessage = "Failed to fetch categories - empty response"
                    Timber.w(errorMessage)
                    Result.Error(Exception(errorMessage))
                }
            } else {
                val errorMessage = "HTTP ${response.code()}: ${response.message()}"
                Timber.e("Categories API error: $errorMessage")

                // Try to return cached data as fallback
                val cachedCategories = contentDao.getAllCategories().first()
                if (cachedCategories.isNotEmpty()) {
                    Timber.d("Returning ${cachedCategories.size} cached categories as fallback")
                    Result.Success(cachedCategories.toCategoriesFromEntity())
                } else {
                    Result.Error(Exception(errorMessage))
                }
            }
        } catch (e: Exception) {
            Timber.e(e, "Categories fetch exception")
            Result.Error(e)
        }
    }
    
    override suspend fun getContentByCategory(
        categoryId: String,
        page: Int,
        limit: Int,
        sort: String?,
        filter: String?
    ): Result<ContentPage> {
        return try {
            Timber.d("Fetching content for category: $categoryId, page: $page")

            // Convert string categoryId to int for API call
            val categoryIdInt = categoryId.toIntOrNull() ?: return Result.Error(
                Exception("Invalid category ID: $categoryId")
            )

            val response = apiService.getContentByCategory(
                categoryId = categoryIdInt,
                page = page,
                limit = limit,
                sort = sort,
                filter = filter
            )
            
            if (response.isSuccessful) {
                val body = response.body()
                if (body != null) {
                    val contentPage = body.toDomainModel()

                    // Cache content locally
                    contentDao.insertAllContent(contentPage.content.toContentEntities())

                    Timber.d("Fetched ${contentPage.content.size} content items for category")
                    Result.Success(contentPage)
                } else {
                    val errorMessage = "Empty response body"
                    Timber.w(errorMessage)
                    Result.Error(Exception(errorMessage))
                }
            } else {
                val errorMessage = "HTTP ${response.code()}: ${response.message()}"
                Timber.e("Content API error: $errorMessage")
                Result.Error(Exception(errorMessage))
            }
        } catch (e: Exception) {
            Timber.e(e, "Content fetch exception")
            Result.Error(e)
        }
    }
    
    override suspend fun getContentDetails(contentId: String): Result<ContentDetails> {
        return try {
            Timber.d("Fetching content details for: $contentId")
            
            val response = apiService.getContentDetails(contentId)
            
            if (response.isSuccessful) {
                val body = response.body()
                if (body != null) {
                    val contentDetails = body.toDomainModel()
                    Timber.d("Fetched content details for: ${contentDetails.title}")
                    Result.Success(contentDetails)
                } else {
                    val errorMessage = "Content details not found"
                    Timber.w(errorMessage)
                    Result.Error(Exception(errorMessage))
                }
            } else {
                val errorMessage = "HTTP ${response.code()}: ${response.message()}"
                Timber.e("Content details API error: $errorMessage")
                Result.Error(Exception(errorMessage))
            }
        } catch (e: Exception) {
            Timber.e(e, "Content details fetch exception")
            Result.Error(e)
        }
    }
    
    override suspend fun getFeaturedContent(limit: Int): Result<List<ContentItem>> {
        return try {
            Timber.d("Fetching featured content (movies), limit: $limit")

            // Use movies as featured content since there's no dedicated featured endpoint
            val response = apiService.getMovies(page = 1, limit = limit)

            if (response.isSuccessful) {
                val body = response.body()
                if (body != null) {
                    val featuredContent = body.toContentItemsFromDto()

                    // Cache featured content
                    contentDao.insertAllContent(featuredContent.toContentEntities())

                    Timber.d("Fetched ${featuredContent.size} featured content items")
                    Result.Success(featuredContent)
                } else {
                    val errorMessage = "Failed to fetch featured content - empty response"
                    Timber.w(errorMessage)
                    Result.Error(Exception(errorMessage))
                }
            } else {
                val errorMessage = "HTTP ${response.code()}: ${response.message()}"
                Timber.e("Featured content API error: $errorMessage")
                Result.Error(Exception(errorMessage))
            }
        } catch (e: Exception) {
            Timber.e(e, "Featured content fetch exception")
            Result.Error(e)
        }
    }
    
    override suspend fun searchContent(searchQuery: SearchQuery): Result<SearchResult> {
        return try {
            val normalizedQuery = searchQuery.query.trim()
            Timber.d("Searching content: $normalizedQuery")
            if (normalizedQuery.isBlank()) {
                return Result.Success(emptySearchResult(searchQuery.page, searchQuery.limit))
            }
            
            // Use delivery search endpoint directly - it matches the backend's response format:
            // GET /api/delivery/content/search -> { content: [...], total, page, limit, has_more }
            val deliveryResp = apiService.searchContent(
                query = normalizedQuery,
                category = searchQuery.category,
                year = searchQuery.year,
                page = searchQuery.page,
                limit = searchQuery.limit
            )
            val deliveryBody = deliveryResp.body()
            if (deliveryResp.isSuccessful && deliveryBody != null) {
                val dto = deliveryBody
                val apiResults = dto.content.map { it.toDomainModel() }
                val results = applySearchFilters(apiResults, searchQuery)

                if (results.isEmpty()) {
                    val cachedFallback = searchContentFromCache(searchQuery = searchQuery)
                    if (cachedFallback != null) {
                        Timber.d("Search API returned 0 results, using cache fallback (${cachedFallback.results.size} items)")
                        return Result.Success(cachedFallback)
                    }
                }

                val pageInfo = PaginationInfo(
                    currentPage = dto.page,
                    totalPages = if (dto.total > 0) ((dto.total - 1) / dto.limit) + 1 else 1,
                    totalItems = if (results.isEmpty()) dto.total else results.size,
                    hasNext = dto.hasMore,
                    hasPrevious = dto.page > 1
                )
                val searchResult = SearchResult(
                    results = results,
                    pagination = pageInfo,
                    suggestions = emptyList()
                )
                Timber.d("Found ${results.size} search results")
                Result.Success(searchResult)
            } else {
                val errorMessage = "HTTP ${deliveryResp.code()}: ${deliveryResp.message()}"
                Timber.e("Search API error: $errorMessage")
                val cachedFallback = searchContentFromCache(searchQuery = searchQuery)
                if (cachedFallback != null) {
                    Timber.d("Using cache fallback after search API error (${cachedFallback.results.size} items)")
                    Result.Success(cachedFallback)
                } else {
                    Timber.w("Search API failed and cache is empty, returning empty result")
                    Result.Success(emptySearchResult(searchQuery.page, searchQuery.limit))
                }
            }
        } catch (e: Exception) {
            Timber.e(e, "Search exception")
            val cachedFallback = searchContentFromCache(searchQuery = searchQuery)
            if (cachedFallback != null) {
                Timber.d("Using cache fallback after search exception (${cachedFallback.results.size} items)")
                Result.Success(cachedFallback)
            } else {
                Result.Success(emptySearchResult(searchQuery.page, searchQuery.limit))
            }
        }
    }

    private suspend fun searchContentFromCache(searchQuery: SearchQuery): SearchResult? {
        val normalizedQuery = searchQuery.query.trim()
        if (normalizedQuery.isBlank()) return emptySearchResult(searchQuery.page, searchQuery.limit)

        val cachedRaw = contentDao.searchContent(normalizedQuery).toContentItemsFromEntity()
        val filtered = applySearchFilters(cachedRaw, searchQuery)
        if (filtered.isEmpty()) return null

        val safeLimit = searchQuery.limit.coerceAtLeast(1)
        val safePage = searchQuery.page.coerceAtLeast(1)
        val totalItems = filtered.size
        val fromIndex = ((safePage - 1) * safeLimit).coerceAtMost(totalItems)
        val toIndex = (fromIndex + safeLimit).coerceAtMost(totalItems)
        val pagedResults = if (fromIndex < toIndex) filtered.subList(fromIndex, toIndex) else emptyList()

        return SearchResult(
            results = pagedResults,
            pagination = PaginationInfo(
                currentPage = safePage,
                totalPages = if (totalItems > 0) ((totalItems - 1) / safeLimit) + 1 else 1,
                totalItems = totalItems,
                hasNext = toIndex < totalItems,
                hasPrevious = fromIndex > 0
            ),
            suggestions = emptyList()
        )
    }

    private fun applySearchFilters(
        items: List<ContentItem>,
        searchQuery: SearchQuery
    ): List<ContentItem> {
        var filtered = items

        searchQuery.type?.let { type ->
            filtered = filtered.filter { it.type == type }
        }

        // Category ID "2" corresponds to Live TV in this project.
        if (searchQuery.excludeCategories.contains("2")) {
            filtered = filtered.filter { it.type != ContentType.LIVE_TV }
        }

        return filtered
    }

    private fun emptySearchResult(page: Int, limit: Int = 20): SearchResult {
        val safePage = page.coerceAtLeast(1)
        val safeLimit = limit.coerceAtLeast(1)
        return SearchResult(
            results = emptyList(),
            pagination = PaginationInfo(
                currentPage = safePage,
                totalPages = 1,
                totalItems = 0,
                hasNext = false,
                hasPrevious = safePage > 1 && safeLimit > 0
            ),
            suggestions = emptyList()
        )
    }
    
    override suspend fun getRecommendations(limit: Int): Result<List<ContentItem>> {
        return try {
            Timber.d("Fetching recommendations based on popular content")
            
            // No dedicated recommendations API endpoint - use popular content as recommendations
            // This provides relevant content while keeping the implementation simple
            val popularResult = getPopularContent(limit = limit)
            
            if (popularResult is Result.Success && popularResult.data.isNotEmpty()) {
                Timber.d("Returning ${popularResult.data.size} recommendations from popular content")
                Result.Success(popularResult.data)
            } else {
                // Fallback to featured content if popular is empty
                val featuredResult = getFeaturedContent(limit = limit)
                if (featuredResult is Result.Success) {
                    Timber.d("Returning ${featuredResult.data.size} recommendations from featured content")
                    Result.Success(featuredResult.data)
                } else {
                    Timber.d("No recommendations available, returning empty list")
                    Result.Success(emptyList())
                }
            }
        } catch (e: Exception) {
            Timber.e(e, "Recommendations exception")
            Result.Error(e)
        }
    }
    
    override suspend fun getRecentlyAdded(limit: Int): Result<List<ContentItem>> {
        return try {
            // Use movies as recently added content since there's no specific endpoint
            Timber.d("Fetching recently added content (using movies)")
            val response = apiService.getMovies(page = 1, limit = limit)

            if (response.isSuccessful) {
                val body = response.body()
                if (body != null) {
                    val content = body.toContentItemsFromDto()
                    Result.Success(content)
                } else {
                    Result.Error(Exception("Failed to fetch recently added content - empty response"))
                }
            } else {
                Result.Error(Exception("HTTP ${response.code()}: ${response.message()}"))
            }
        } catch (e: Exception) {
            Timber.e(e, "Recently added exception")
            Result.Error(e)
        }
    }
    
    override suspend fun getPopularContent(
        type: ContentType?,
        limit: Int
    ): Result<List<ContentItem>> {
        return try {
            // Use TV channels as popular content since there's no specific endpoint
            Timber.d("Fetching popular content (using TV channels)")
            val response = apiService.getTvChannels(page = 1, limit = limit)

            if (response.isSuccessful) {
                val body = response.body()
                if (body != null) {
                    val content = body.toContentItemsFromDto()
                    val filteredContent = if (type != null) {
                        content.filter { it.type == type }
                    } else {
                        content
                    }
                    Result.Success(filteredContent)
                } else {
                    Result.Error(Exception("Failed to fetch popular content - empty response"))
                }
            } else {
                Result.Error(Exception("HTTP ${response.code()}: ${response.message()}"))
            }
        } catch (e: Exception) {
            Timber.e(e, "Popular content exception")
            Result.Error(e)
        }
    }
    
    override suspend fun getContentByGenre(
        genre: String,
        limit: Int
    ): Result<List<ContentItem>> {
        return try {
            // Use search with genre filter
            val searchQuery = SearchQuery(
                query = "",
                category = genre,
                limit = limit
            )
            val result = searchContent(searchQuery)
            result.mapSuccess { it.results }
        } catch (e: Exception) {
            Timber.e(e, "Content by genre exception")
            Result.Error(e)
        }
    }
    
    override suspend fun cacheContent(content: List<ContentItem>): Result<Unit> {
        return try {
            contentDao.insertAllContent(content.toContentEntities())
            Timber.d("Cached ${content.size} content items")
            Result.Success(Unit)
        } catch (e: Exception) {
            Timber.e(e, "Cache content exception")
            Result.Error(e)
        }
    }
    
    override fun getCachedContent(): Flow<List<ContentItem>> {
        return contentDao.getAllContent().map { entities ->
            entities.toContentItemsFromEntity()
        }
    }
    
    override suspend fun clearCache(): Result<Unit> {
        return try {
            contentDao.clearAllContent()
            contentDao.clearAllCategories()
            Timber.d("Content cache cleared")
            Result.Success(Unit)
        } catch (e: Exception) {
            Timber.e(e, "Clear cache exception")
            Result.Error(e)
        }
    }
    
    override suspend fun getContentSections(): Result<List<ContentSection>> {
        return try {
            Timber.d("Building content sections")
            
            val sections = mutableListOf<ContentSection>()
            
            // Featured content
            val featured = getFeaturedContent(10)
            if (featured is Result.Success) {
                sections.add(ContentSection("Featured", "featured", featured.data))
            }
            
            // Recently added
            val recent = getRecentlyAdded(20)
            if (recent is Result.Success) {
                sections.add(ContentSection("Recently added", "recent", recent.data))
            }
            
            // Popular content
            val popular = getPopularContent(limit = 20)
            if (popular is Result.Success) {
                sections.add(ContentSection("Popular", "popular", popular.data))
            }
            
            Timber.d("Built ${sections.size} content sections")
            Result.Success(sections)
        } catch (e: Exception) {
            Timber.e(e, "Content sections exception")
            Result.Error(e)
        }
    }

    // ========================================
    // STREAMING METHODS - PHASE 2
    // ========================================

    override suspend fun getContentStream(contentId: String): retrofit2.Response<ContentStream> {
        Timber.d("Getting content stream for: $contentId")
        val response = apiService.getContentStream(contentId)
        return response.let { apiResponse ->
            val responseBody = apiResponse.body()
            if (apiResponse.isSuccessful && responseBody != null) {
                val dto = responseBody
                val contentStream = dto.toContentStreamFromDto()
                retrofit2.Response.success(contentStream)
            } else {
                Timber.e("Failed to get content stream: ${apiResponse.message()}")
                toErrorResponse(apiResponse, "Failed to get content stream")
            }
        }
    }

    override suspend fun getEpisodeStream(episodeId: String): retrofit2.Response<EpisodeStream> {
        Timber.d("Getting episode stream for: $episodeId")
        val response = apiService.getEpisodeStream(episodeId)
        return response.let { apiResponse ->
            val responseBody = apiResponse.body()
            if (apiResponse.isSuccessful && responseBody != null) {
                val dto = responseBody
                val episodeStream = dto.toEpisodeStreamFromDto()
                retrofit2.Response.success(episodeStream)
            } else {
                Timber.e("Failed to get episode stream: ${apiResponse.message()}")
                toErrorResponse(apiResponse, "Failed to get episode stream")
            }
        }
    }

    override suspend fun getContentStreams(contentId: String): retrofit2.Response<List<com.streamcore.tv.data.remote.dto.StreamPublicDto>> {
        Timber.d("Getting content streams for: $contentId")
        return apiService.getContentStreams(contentId)
    }

    override suspend fun getEpisodeStreams(episodeId: String): retrofit2.Response<List<com.streamcore.tv.data.remote.dto.StreamPublicDto>> {
        Timber.d("Getting episode streams for: $episodeId")
        return apiService.getEpisodeStreams(episodeId)
    }

    override suspend fun getTvChannels(): retrofit2.Response<List<ContentItem>> {
        Timber.d("Getting TV channels with pagination loop")
        val allChannels = mutableListOf<ContentItem>()
        var page = 1
        val pageSize = 10000 // Keep requesting max limit
        var keepFetching = true
        
        try {
            while (keepFetching) {
                Timber.d("Fetching TV channels page $page")
                val response = apiService.getTvChannels(page = page, limit = pageSize)
                val responseBody = response.body()
                
                if (response.isSuccessful && responseBody != null) {
                    val dtos = responseBody
                    if (dtos.isEmpty()) {
                        keepFetching = false
                    } else {
                        val channels = dtos.map { it.toDomainModel() }
                        allChannels.addAll(channels)
                        Timber.d("Fetched ${channels.size} channels from page $page")
                        
                        // If we got fewer than expected, we're likely done, but some APIs 
                        // might return perfect chunks, so we check if result is empty on next loop usually.
                        // However, to be safe against infinite loops if server ignores page param:
                        if (channels.size < 50) { // Assuming if we get very few, we're at the end. Or strictly check empty next time.
                             // Actually, safest is to just increment page.
                             // But let's add a safety break if we get 0 items, which we did above.
                        }
                        page++
                    }
                } else {
                    Timber.e("Failed to get TV channels page $page: ${response.message()}")
                    // If first page fails, return error. If subsequent pages fail, return what we have?
                    // Design choice: strict failure if page 1 fails. partial success otherwise?
                    // Let's return error if we have NOTHING.
                    if (allChannels.isEmpty()) {
                        return toErrorResponse(response, "Failed to get TV channels")
                    }
                    keepFetching = false
                }
                
                // Safety break for sane limits
                if (page > 100) { 
                    Timber.w("Pagination safety limit reached (100 pages)")
                    keepFetching = false 
                }
            }
            
            // Deduplicate by ID just in case
            val uniqueChannels = allChannels.distinctBy { it.id }
            Timber.d("Total fetched channels after strict paging: ${uniqueChannels.size}")
            return retrofit2.Response.success(uniqueChannels)
            
        } catch (e: Exception) {
            Timber.e(e, "Exception fetching TV channels")
            if (allChannels.isNotEmpty()) {
                return retrofit2.Response.success(allChannels.distinctBy { it.id })
            }
            throw e // Or return error response
        }
    }

    override suspend fun getTvChannelsByCategory(channelCategory: String): retrofit2.Response<List<ContentItem>> {
        Timber.d("Getting TV channels by category: $channelCategory with pagination loop")
        val allChannels = mutableListOf<ContentItem>()
        var page = 1
        val pageSize = 10000
        var keepFetching = true
        
        try {
            while (keepFetching) {
                Timber.d("Fetching TV channels category '$channelCategory' page $page")
                val response = apiService.getTvChannels(channelCategory = channelCategory, page = page, limit = pageSize)
                val responseBody = response.body()
                
                if (response.isSuccessful && responseBody != null) {
                    val dtos = responseBody
                    if (dtos.isEmpty()) {
                        keepFetching = false
                    } else {
                        val channels = dtos.map { it.toDomainModel() }
                        allChannels.addAll(channels)
                        Timber.d("Fetched ${channels.size} channels for category '$channelCategory' page $page")
                        page++
                    }
                } else {
                    Timber.e("Failed to get TV channels category '$channelCategory' page $page: ${response.message()}")
                    if (allChannels.isEmpty()) {
                        return toErrorResponse(response, "Failed to get TV channels by category")
                    }
                    keepFetching = false
                }
                
                if (page > 100) { 
                    keepFetching = false 
                }
            }
            
            val uniqueChannels = allChannels.distinctBy { it.id }
            Timber.d("Total fetched channels for category '$channelCategory': ${uniqueChannels.size}")
            return retrofit2.Response.success(uniqueChannels)

        } catch (e: Exception) {
            Timber.e(e, "Exception fetching TV channels by category")
             if (allChannels.isNotEmpty()) {
                return retrofit2.Response.success(allChannels.distinctBy { it.id })
            }
            throw e
        }
    }

    override suspend fun getTvChannelCategories(): retrofit2.Response<List<String>> {
        Timber.d("Getting TV channel categories")
        return apiService.getTvChannelCategories()
    }

    override suspend fun scanFolderIngest(request: com.streamcore.tv.data.remote.dto.ScanFolderRequestDto): retrofit2.Response<com.streamcore.tv.data.remote.dto.ScanFolderResultDto> {
        Timber.d("Admin: scanFolderIngest -> root=${request.rootPath}, media=${request.media}, duplicatePolicy=${request.duplicatePolicy}, addSubs=${request.addSubs}")
        return try {
            val response = apiService.scanFolderIngest(request)
            response
        } catch (e: Exception) {
            Timber.e(e, "Failed to call scanFolderIngest")
            // Return a failed Retrofit response — build a synthetic error response
            retrofit2.Response.error(500, @Suppress("DEPRECATION") okhttp3.ResponseBody.create(null, "Scan request failed"))
        }
    }

    // ========================================
    // SERIES METHODS - PHASE 2
    // ========================================

    override suspend fun getSeriesByContentId(contentId: String): retrofit2.Response<SeriesDetails> {
        Timber.d("Getting series details for content ID: $contentId")
        val response = apiService.getSeriesByContentId(contentId)
        return response.let { apiResponse ->
            val responseBody = apiResponse.body()
            if (apiResponse.isSuccessful && responseBody != null) {
                val dto = responseBody
                val seriesDetails = dto.toSeriesDetailsFromDto()
                retrofit2.Response.success(seriesDetails)
            } else {
                Timber.e("Failed to get series details by content ID: ${apiResponse.message()}")
                toErrorResponse(apiResponse, "Failed to get series details by content ID")
            }
        }
    }



    override suspend fun getSeriesDetails(seriesId: Int): retrofit2.Response<SeriesDetails> {
        Timber.d("Getting series details for series ID: $seriesId")
        val response = apiService.getSeriesDetails(seriesId)
        return response.let { apiResponse ->
            val responseBody = apiResponse.body()
            if (apiResponse.isSuccessful && responseBody != null) {
                val dto = responseBody
                val seriesDetails = dto.toSeriesDetailsFromDto()
                retrofit2.Response.success(seriesDetails)
            } else {
                Timber.e("Failed to get series details: ${apiResponse.message()}")
                toErrorResponse(apiResponse, "Failed to get series details")
            }
        }
    }

    override suspend fun getSeriesSeasons(seriesId: String): retrofit2.Response<List<SeasonDetails>> {
        Timber.d("Getting seasons for series: $seriesId")
        val response = apiService.getSeriesSeasons(seriesId)
        return response.let { apiResponse ->
            val responseBody = apiResponse.body()
            if (apiResponse.isSuccessful && responseBody != null) {
                val dtos = responseBody
                val seasons = dtos.map { it.toSeasonDetailsFromDto() }
                retrofit2.Response.success(seasons)
            } else {
                Timber.e("Failed to get series seasons: ${apiResponse.message()}")
                toErrorResponse(apiResponse, "Failed to get series seasons")
            }
        }
    }

    override suspend fun getSeasonEpisodes(seasonId: String): retrofit2.Response<List<EpisodeDetails>> {
        Timber.d("Getting episodes for season: $seasonId")
        val response = apiService.getSeasonEpisodes(seasonId)
        return response.let { apiResponse ->
            val responseBody = apiResponse.body()
            if (apiResponse.isSuccessful && responseBody != null) {
                val dtos = responseBody
                val episodes = dtos.map { it.toEpisodeDetailsFromDto() }
                retrofit2.Response.success(episodes)
            } else {
                Timber.e("Failed to get season episodes: ${apiResponse.message()}")
                toErrorResponse(apiResponse, "Failed to get season episodes")
            }
        }
    }

    override suspend fun getEpisodeDetails(episodeId: String): retrofit2.Response<EpisodeDetails> {
        Timber.d("Getting episode details fallback via /episodes/{id}/stream for: $episodeId")
        val response = apiService.getEpisodeStream(episodeId)
        return response.let { apiResponse ->
            val responseBody = apiResponse.body()
            if (apiResponse.isSuccessful && responseBody != null) {
                val episodeDetails = EpisodeDetails(
                    id = responseBody.id.toString(),
                    seriesId = "",
                    seasonId = responseBody.seasonId.toString(),
                    title = responseBody.title,
                    description = responseBody.description,
                    episodeNumber = responseBody.episodeNumber,
                    seasonNumber = 0,
                    imageUrl = responseBody.imageUrl ?: "",
                    duration = null,
                    airDate = null,
                    isWatched = false,
                    watchProgress = 0L,
                    createdAt = responseBody.createdAt
                )
                retrofit2.Response.success(episodeDetails)
            } else {
                Timber.e("Failed to get episode details fallback: ${apiResponse.message()}")
                toErrorResponse(apiResponse, "Failed to get episode details")
            }
        }
    }

    private fun <T> toErrorResponse(
        apiResponse: retrofit2.Response<*>,
        fallbackMessage: String
    ): retrofit2.Response<T> {
        val safeStatusCode = apiResponse.code().takeIf { it in 400..599 } ?: 500
        val errorBody = apiResponse.errorBody()
            ?: @Suppress("DEPRECATION") okhttp3.ResponseBody.create(null, fallbackMessage)
        return retrofit2.Response.error(safeStatusCode, errorBody)
    }
}
