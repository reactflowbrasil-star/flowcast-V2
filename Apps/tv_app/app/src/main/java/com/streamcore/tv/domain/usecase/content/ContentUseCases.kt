package com.streamcore.tv.domain.usecase.content

import com.streamcore.tv.domain.model.*
import com.streamcore.tv.domain.repository.ContentRepository
import javax.inject.Inject

/**
 * Use cases for content operations
 */

class GetCategoriesUseCase @Inject constructor(
    private val contentRepository: ContentRepository
) {
    suspend operator fun invoke(): Result<List<Category>> {
        return try {
            contentRepository.getCategories()
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}

class GetContentByCategoryUseCase @Inject constructor(
    private val contentRepository: ContentRepository
) {
    suspend operator fun invoke(
        categoryId: String,
        page: Int = 1,
        limit: Int = 200,
        sort: String? = null,
        filter: String? = null
    ): Result<ContentPage> {
        return try {
            contentRepository.getContentByCategory(categoryId, page, limit, sort, filter)
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}

class GetContentDetailsUseCase @Inject constructor(
    private val contentRepository: ContentRepository
) {
    suspend operator fun invoke(contentId: String): Result<ContentDetails> {
        return try {
            contentRepository.getContentDetails(contentId)
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}

class GetFeaturedContentUseCase @Inject constructor(
    private val contentRepository: ContentRepository
) {
    suspend operator fun invoke(limit: Int = 10): Result<List<ContentItem>> {
        return try {
            contentRepository.getFeaturedContent(limit)
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}

class SearchContentUseCase @Inject constructor(
    private val contentRepository: ContentRepository
) {
    suspend operator fun invoke(searchQuery: SearchQuery): Result<SearchResult> {
        return try {
            // Validate search query
            if (searchQuery.query.isBlank()) {
                return Result.Error(IllegalArgumentException("Search query cannot be empty"))
            }
            
            contentRepository.searchContent(searchQuery)
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}

class GetRecommendationsUseCase @Inject constructor(
    private val contentRepository: ContentRepository
) {
    suspend operator fun invoke(limit: Int = 20): Result<List<ContentItem>> {
        return try {
            contentRepository.getRecommendations(limit)
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}

class GetRecentlyAddedUseCase @Inject constructor(
    private val contentRepository: ContentRepository
) {
    suspend operator fun invoke(limit: Int = 20): Result<List<ContentItem>> {
        return try {
            contentRepository.getRecentlyAdded(limit)
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}

class GetPopularContentUseCase @Inject constructor(
    private val contentRepository: ContentRepository
) {
    suspend operator fun invoke(
        type: ContentType? = null,
        limit: Int = 20
    ): Result<List<ContentItem>> {
        return try {
            contentRepository.getPopularContent(type, limit)
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}

class GetContentSectionsUseCase @Inject constructor(
    private val contentRepository: ContentRepository
) {
    suspend operator fun invoke(): Result<List<ContentSection>> {
        return try {
            contentRepository.getContentSections()
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}

class GetContentByGenreUseCase @Inject constructor(
    private val contentRepository: ContentRepository
) {
    suspend operator fun invoke(
        genre: String,
        limit: Int = 20
    ): Result<List<ContentItem>> {
        return try {
            if (genre.isBlank()) {
                return Result.Error(IllegalArgumentException("Genre cannot be empty"))
            }
            
            contentRepository.getContentByGenre(genre, limit)
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}
