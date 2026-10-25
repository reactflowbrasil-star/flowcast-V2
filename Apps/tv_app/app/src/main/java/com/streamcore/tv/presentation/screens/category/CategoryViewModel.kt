package com.streamcore.tv.presentation.screens.category

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.streamcore.tv.core.error.ErrorHandler
import com.streamcore.tv.core.utils.logd
import com.streamcore.tv.core.utils.loge
import com.streamcore.tv.domain.model.*
import com.streamcore.tv.domain.usecase.content.GetContentByCategoryUseCase
import com.streamcore.tv.domain.usecase.content.GetCategoriesUseCase
import com.streamcore.tv.domain.usecase.content.SearchContentUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import kotlinx.coroutines.Job
import javax.inject.Inject

/**
 * ViewModel for Category Screen
 * 
 * Handles category content loading with filters and pagination
 */
@HiltViewModel
class CategoryViewModel @Inject constructor(
    private val getContentByCategoryUseCase: GetContentByCategoryUseCase,
    private val getCategoriesUseCase: GetCategoriesUseCase,
    private val searchContentUseCase: SearchContentUseCase,
    private val errorHandler: ErrorHandler
) : ViewModel() {
    
    private val _uiState = MutableStateFlow(CategoryUiState())
    val uiState: StateFlow<CategoryUiState> = _uiState.asStateFlow()

    private var currentCategoryId: String = ""
    private var allContent: List<ContentItem> = emptyList()
    private var lastNonSearchContentPage: ContentPage? = null
    private var searchJob: Job? = null
    private var isLoadMoreRunning = false

    private val SEARCH_PAGE_SIZE = 200

    init {
        logd("CategoryViewModel initialized")
    }
    
    /**
     * Load category content
     */
    fun loadCategory(categoryId: String) {
        currentCategoryId = categoryId
        lastNonSearchContentPage = null
        allContent = emptyList()
        isLoadMoreRunning = false

        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    categoryId = categoryId,
                    categorySlug = getCategorySlugFallback(categoryId) ?: it.categorySlug,
                    contentState = UiState.Loading,
                    error = null,
                    isSearchMode = false
                )
            }

            try {
                logd("Loading category content: $categoryId")

                // Load category name first
                loadCategoryName(categoryId)

                // Load content
                when (val result = getContentByCategoryUseCase(
                    categoryId = categoryId,
                    page = 1,
                    limit = 50, // Smaller initial load for better performance
                    sort = _uiState.value.selectedSort,
                    filter = _uiState.value.selectedFilter
                )) {
                    is Result.Success -> {
                        val contentPage = result.data
                        allContent = contentPage.content
                        lastNonSearchContentPage = contentPage
                        logd("Category content loaded: ${contentPage.content.size} items")

                        val currentQuery = _uiState.value.searchQuery

                        _uiState.update {
                            it.copy(
                                contentState = UiState.Success(contentPage),
                                error = null,
                                isSearchMode = false,
                                isLoadingMore = false
                            )
                        }

                        if (currentQuery.isNotBlank()) {
                            triggerRemoteSearch(currentQuery, debounce = 0L)
                        }
                    }

                    is Result.Error -> {
                        val exception = result.exception
                        val displayMessage = errorHandler.getErrorMessage(exception)
                        loge("Failed to load category content: $displayMessage", exception)
                        _uiState.update {
                            it.copy(
                                contentState = UiState.Error(displayMessage),
                                error = displayMessage
                            )
                        }
                    }

                    is Result.Loading -> {
                        // Should not happen in this use case
                        logd("Unexpected loading state in category content")
                    }
                }
            } catch (e: Exception) {
                val errorMessage = errorHandler.getErrorMessage(e)
                loge("Category content loading exception: $errorMessage", e)
                _uiState.update {
                    it.copy(
                        contentState = UiState.Error(errorMessage),
                        error = errorMessage
                    )
                }
            }
        }
    }
    


    /**
     * Load more content (pagination)
     */
    fun loadMore() {
        val currentState = _uiState.value
        val successState = currentState.contentState as? UiState.Success ?: return
        val pagination = successState.data.pagination

        val searchQuery = currentState.searchQuery.trim()
        val effectiveFilter = when {
            searchQuery.isNotEmpty() -> searchQuery
            else -> currentState.selectedFilter
        }

        if (!pagination.hasNext) return
        if (isLoadMoreRunning) return

        val nextPage = pagination.currentPage + 1
        isLoadMoreRunning = true

        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingMore = true) }

            try {
                logd("Loading more content, page: $nextPage")

                if (currentState.isSearchMode) {
                    when (val result = searchContentUseCase(buildSearchQuery(searchQuery, nextPage, SEARCH_PAGE_SIZE))) {
                        is Result.Success -> {
                            val currentContent = (_uiState.value.contentState as? UiState.Success)?.data?.content ?: emptyList()
                            val filteredNewContent = filterResultsForCategory(result.data.results)

                            val mergedContent = (currentContent + filteredNewContent).distinctBy { it.id }

                            allContent = mergedContent
                            val updatedContentPage = result.data.toContentPage(
                                contentOverride = mergedContent,
                                currentPageOverride = nextPage
                            )

                            _uiState.update {
                                it.copy(
                                    contentState = UiState.Success(updatedContentPage),
                                    isLoadingMore = false
                                )
                            }

                            logd("More search results loaded: ${filteredNewContent.size} new items (page $nextPage)")
                        }

                        is Result.Error -> {
                            val errorMessage = errorHandler.getErrorMessage(result.exception)
                            loge("Failed to load more search results: $errorMessage", result.exception)
                            _uiState.update {
                                it.copy(
                                    isLoadingMore = false,
                                    error = errorMessage
                                )
                            }
                        }

                        is Result.Loading -> {
                            // No-op
                        }
                    }
                } else {
                    when (val result = getContentByCategoryUseCase(
                        categoryId = currentCategoryId,
                        page = nextPage,
                        limit = 200,
                        sort = currentState.selectedSort,
                        filter = effectiveFilter
                    )) {
                        is Result.Success -> {
                            val currentContent = (_uiState.value.contentState as? UiState.Success)?.data?.content ?: emptyList()
                            val newContent = result.data.content

                            // Avoid duplicate pages if API returns overlapping data
                            val mergedContent = (currentContent + newContent).distinctBy { it.id }

                            allContent = mergedContent
                            val updatedContentPage = result.data.copy(content = mergedContent)

                            _uiState.update {
                                it.copy(
                                    contentState = UiState.Success(updatedContentPage),
                                    isLoadingMore = false
                                )
                            }

                            if (searchQuery.isEmpty()) {
                                lastNonSearchContentPage = updatedContentPage
                            }

                            logd("More content loaded: ${newContent.size} new items (page $nextPage)")
                        }

                        is Result.Error -> {
                            val errorMessage = errorHandler.getErrorMessage(result.exception)
                            loge("Failed to load more content: $errorMessage", result.exception)
                            _uiState.update {
                                it.copy(
                                    isLoadingMore = false,
                                    error = errorMessage
                                )
                            }
                        }

                        is Result.Loading -> {
                            // No-op
                        }
                    }
                }
            } catch (e: Exception) {
                val errorMessage = errorHandler.getErrorMessage(e)
                loge("Load more content exception: $errorMessage", e)
                _uiState.update {
                    it.copy(
                        isLoadingMore = false,
                        error = errorMessage
                    )
                }
            } finally {
                isLoadMoreRunning = false
            }
        }
    }
    
    /**
     * Update sort option
     */
    fun updateSort(sort: String) {
        _uiState.update { it.copy(selectedSort = sort) }
        logd("Sort updated: $sort")
        // Apply local sorting immediately (no extra API call)
        applySorting()
    }
    
    /**
     * Update filter option
     */
    fun updateFilter(filter: String?) {
        _uiState.update { it.copy(selectedFilter = filter) }
        logd("Filter updated: $filter")
        
        // Reload content with new filter
        loadCategory(currentCategoryId)
    }
    
    /**
     * Toggle sort order
     */
    fun toggleSortOrder() {
        val newOrder = !_uiState.value.sortAscending
        _uiState.update { it.copy(sortAscending = newOrder) }
        logd("Sort order toggled: $newOrder")
        
        // Apply local sorting to avoid API call
        applySorting()
    }
    
    /**
     * Toggle grid size
     */
    fun toggleGridSize() {
        val newSize = !_uiState.value.isLargeGrid
        _uiState.update { it.copy(isLargeGrid = newSize) }
        logd("Grid size toggled: $newSize")
    }

    /**
     * Update search query and filter content
     */
    fun updateSearchQuery(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
        logd("Search query updated: $query")

        triggerRemoteSearch(query)
    }

    /**
     * Update selected backdrop for background
     */
    fun updateSelectedBackdrop(backdropUrl: String?) {
        _uiState.update { it.copy(selectedBackdrop = backdropUrl) }
        logd("Selected backdrop updated: $backdropUrl")
    }
    
    /**
     * Clear error message
     */
    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    /**
     * Load category name
     */
    private fun loadCategoryName(categoryId: String) {
        viewModelScope.launch {
            try {
                when (val result = getCategoriesUseCase()) {
                    is Result.Success -> {
                        val category = result.data.find { it.id == categoryId }
                        val categoryName = category?.name ?: getCategoryDisplayName(categoryId)
                        val categorySlug = category?.slug ?: getCategorySlugFallback(categoryId)
                        _uiState.update { it.copy(categoryName = categoryName, categorySlug = categorySlug) }
                        logd("Category name loaded: $categoryName")
                    }
                    is Result.Error -> {
                        val categoryName = getCategoryDisplayName(categoryId)
                        val categorySlug = getCategorySlugFallback(categoryId)
                        _uiState.update { it.copy(categoryName = categoryName, categorySlug = categorySlug) }
                        loge("Failed to load category name", result.exception)
                    }
                    is Result.Loading -> {}
                }
            } catch (e: Exception) {
                val categoryName = getCategoryDisplayName(categoryId)
                val categorySlug = getCategorySlugFallback(categoryId)
                _uiState.update { it.copy(categoryName = categoryName, categorySlug = categorySlug) }
                loge("Load category name exception", e)
            }
        }
    }
    
    /**
     * Apply local sorting to current content
     */
    private fun applySorting() {
        val currentState = _uiState.value
        val currentContent = (currentState.contentState as? UiState.Success)?.data ?: return
        
        val sortedContent = when (currentState.selectedSort) {
            "title" -> {
                if (currentState.sortAscending) {
                    currentContent.content.sortedBy { it.title }
                } else {
                    currentContent.content.sortedByDescending { it.title }
                }
            }
            "year" -> {
                if (currentState.sortAscending) {
                    currentContent.content.sortedBy { it.year ?: 0 }
                } else {
                    currentContent.content.sortedByDescending { it.year ?: 0 }
                }
            }
            "rating" -> {
                if (currentState.sortAscending) {
                    currentContent.content.sortedBy { it.rating ?: 0f }
                } else {
                    currentContent.content.sortedByDescending { it.rating ?: 0f }
                }
            }
            else -> currentContent.content
        }
        
        val updatedContentPage = currentContent.copy(content = sortedContent)
        allContent = sortedContent
        _uiState.update {
            it.copy(contentState = UiState.Success(updatedContentPage))
        }

        if (!_uiState.value.isSearchMode) {
            lastNonSearchContentPage = updatedContentPage
        }
    }
    
    /**
     * Get display name for category ID
     */
    private fun getCategoryDisplayName(categoryId: String): String {
        return when (categoryId) {
            "movies" -> "Movies"
            "series" -> "Series"
            "live_tv" -> "Live TV"
            "kids" -> "Kids"
            "popular" -> "Popular"
            "recently_added" -> "Recently Added"
            else -> categoryId.replaceFirstChar { it.uppercase() }
        }
    }

    private fun getCategorySlugFallback(categoryId: String): String? {
        return when (categoryId.lowercase()) {
            "1", "movies", "vod" -> "vod"
            "2", "live_tv", "tv" -> "tv"
            "3" -> "series"
            "5", "events" -> "events"
            "6", "kids" -> "kids"
            "7", "anime" -> "anime"
            else -> null
        }
    }

    private fun resolveSearchCategory(): String? {
        val currentState = _uiState.value
        return currentState.categorySlug ?: getCategorySlugFallback(currentState.categoryId)
    }

    private fun resolveSearchExclusions(): List<String> {
        val categoryId = currentCategoryId.lowercase()
        return when {
            categoryId in setOf("2", "tv", "live_tv") -> emptyList()
            else -> listOf("2")
        }
    }

    private fun buildSearchQuery(query: String, page: Int, limit: Int = SEARCH_PAGE_SIZE): SearchQuery {
        return SearchQuery(
            query = query,
            type = null,
            category = null,
            year = null,
            genre = null,
            country = null,
            page = page,
            limit = limit,
            excludeCategories = resolveSearchExclusions()
        )
    }

    private fun SearchResult.toContentPage(
        contentOverride: List<ContentItem>? = null,
        currentPageOverride: Int? = null
    ): ContentPage {
        val filteredResults = filterResultsForCategory(contentOverride ?: results)
        val mergedContent = filteredResults
        val currentPage = currentPageOverride ?: pagination.currentPage
        val updatedPagination = pagination.copy(
            currentPage = currentPage,
            totalItems = maxOf(pagination.totalItems, mergedContent.size),
            hasPrevious = pagination.hasPrevious || currentPage > 1
        )
        return ContentPage(
            content = mergedContent,
            pagination = updatedPagination
        )
    }

    private fun filterResultsForCategory(results: List<ContentItem>): List<ContentItem> {
        val slug = resolveSearchCategory()?.lowercase() ?: return results
        if (results.isEmpty()) return results

        val filtered = when (slug) {
            "tv", "live_tv" -> results.filter { it.type == ContentType.LIVE_TV }
            "vod", "movies" -> results.filter { it.type == ContentType.MOVIE }
            "series" -> results.filter { it.type == ContentType.SERIES }
            "anime" -> results.filter {
                it.originalType.equals("anime", ignoreCase = true) ||
                    (it.type == ContentType.SERIES && it.title.contains("anime", ignoreCase = true))
            }
            "kids" -> results.filter {
                it.originalType.equals("kids", ignoreCase = true) ||
                    it.title.contains("kids", ignoreCase = true) ||
                    it.title.contains("children", ignoreCase = true)
            }
            else -> results
        }

        return if (filtered.isNotEmpty()) filtered else results
    }

    /**
     * Apply search filter to current content
     */
    private fun triggerRemoteSearch(query: String, debounce: Long = 300L) {
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            if (debounce > 0) {
                delay(debounce)
            }
            performSearch(query)
        }
    }

    private suspend fun performSearch(rawQuery: String) {
        val query = rawQuery.trim()
        isLoadMoreRunning = false

        if (query.isEmpty()) {
            lastNonSearchContentPage?.let { contentPage ->
                allContent = contentPage.content
                _uiState.update {
                    it.copy(
                        contentState = UiState.Success(contentPage),
                        isSearchMode = false,
                        isLoadingMore = false
                    )
                }
            } ?: run {
                _uiState.update { it.copy(isSearchMode = false) }
                loadCategory(currentCategoryId)
            }
            return
        }

        val previousState = _uiState.value
        if (!previousState.isSearchMode) {
            val currentContent = (previousState.contentState as? UiState.Success)?.data
            if (currentContent != null) {
                lastNonSearchContentPage = currentContent
            }
        }

        _uiState.update {
            it.copy(
                contentState = UiState.Loading,
                isSearchMode = true,
                isLoadingMore = false
            )
        }

        try {
            when (val result = searchContentUseCase(buildSearchQuery(query = query, page = 1, limit = SEARCH_PAGE_SIZE))) {
                is Result.Success -> {
                    val searchResult = result.data
                    val contentPage = searchResult.toContentPage()
                    allContent = contentPage.content
                    _uiState.update {
                        it.copy(
                            contentState = UiState.Success(contentPage),
                            isSearchMode = true,
                            error = null
                        )
                    }
                }

                is Result.Error -> {
                    val errorMessage = errorHandler.getErrorMessage(result.exception)
                    loge("Search error: $errorMessage", result.exception)
                    val fallback = lastNonSearchContentPage

                    _uiState.update {
                        if (fallback != null) {
                            it.copy(
                                contentState = UiState.Success(fallback),
                                isSearchMode = false,
                                error = errorMessage
                            )
                        } else {
                            it.copy(
                                contentState = UiState.Error(errorMessage),
                                isSearchMode = false,
                                error = errorMessage
                            )
                        }
                    }
                }

                is Result.Loading -> {
                    // Ignored
                }
            }
        } catch (e: Exception) {
            val errorMessage = errorHandler.getErrorMessage(e)
            loge("Search exception: $errorMessage", e)
            val fallback = lastNonSearchContentPage

            _uiState.update {
                if (fallback != null) {
                    it.copy(
                        contentState = UiState.Success(fallback),
                        isSearchMode = false,
                        error = errorMessage
                    )
                } else {
                    it.copy(
                        contentState = UiState.Error(errorMessage),
                        isSearchMode = false,
                        error = errorMessage
                    )
                }
            }
        }
    }
}

/**
 * UI State for Category Screen
 */
data class CategoryUiState(
    val categoryId: String = "",
    val categoryName: String = "",
    val categorySlug: String? = null,
    val contentState: UiState<ContentPage> = UiState.Loading,
    val selectedSort: String = "title",
    val selectedFilter: String? = null,
    val sortAscending: Boolean = true,
    val isLargeGrid: Boolean = false,
    val isLoadingMore: Boolean = false,
    val isSearchMode: Boolean = false,
    val searchQuery: String = "",
    val selectedBackdrop: String? = null,
    val error: String? = null
)
