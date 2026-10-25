package com.streamcore.tv.presentation.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.streamcore.tv.R
import com.streamcore.tv.core.error.ErrorHandler
import com.streamcore.tv.core.utils.StringProvider
import com.streamcore.tv.core.utils.logd
import com.streamcore.tv.core.utils.loge
import com.streamcore.tv.domain.model.*
import com.streamcore.tv.domain.usecase.content.*
import com.streamcore.tv.domain.usecase.user.GetContinueWatchingUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * ViewModel for Home Screen
 * 
 * Handles loading and managing home screen content
 */
@HiltViewModel
class HomeViewModel @Inject constructor(
    private val getFeaturedContentUseCase: GetFeaturedContentUseCase,
    private val getContentSectionsUseCase: GetContentSectionsUseCase,
    private val getCategoriesUseCase: GetCategoriesUseCase,
    private val getContentByCategoryUseCase: GetContentByCategoryUseCase,
    private val getContinueWatchingUseCase: GetContinueWatchingUseCase,
    private val errorHandler: ErrorHandler,
    private val stringProvider: StringProvider
) : ViewModel() {
    
    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    init {
        logd("HomeViewModel initialized")
        loadContent()
    }
    
    /**
     * Load home screen content
     */
    fun loadContent() {
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    contentState = UiState.Loading,
                    error = null
                ) 
            }
            
            try {
                logd("Loading home content")
                var firstError: Throwable? = null

                fun registerError(throwable: Throwable) {
                    if (firstError == null) {
                        firstError = throwable
                    }
                }
                
                // Load featured content
                logd("Calling getFeaturedContentUseCase with limit=1")
                val featuredResult = getFeaturedContentUseCase(limit = 1)
                logd("getFeaturedContentUseCase result: $featuredResult")
                val featuredContent = when (featuredResult) {
                    is Result.Success -> {
                        logd("Featured content loaded successfully: ${featuredResult.data.size} items")
                        featuredResult.data.firstOrNull()
                    }
                    is Result.Error -> {
                        loge("Failed to load featured content: ${featuredResult.exception.message}", featuredResult.exception)
                        registerError(featuredResult.exception)
                        null
                    }
                    is Result.Loading -> {
                        logd("Featured content still loading")
                        null
                    }
                }
                
                // Fetch continue watching directly from server
                val continueWatchingResult = getContinueWatchingUseCase()
                val continueWatchingItems: List<WatchHistoryItem> = when (continueWatchingResult) {
                    is Result.Success -> {
                        logd("Continue watching loaded from server: ${continueWatchingResult.data.size} items")
                        continueWatchingResult.data
                    }
                    is Result.Error -> {
                        loge("Failed to load continue watching: ${continueWatchingResult.exception.message}", continueWatchingResult.exception)
                        registerError(continueWatchingResult.exception)
                        emptyList()
                    }
                    is Result.Loading -> {
                        logd("Continue watching still loading")
                        emptyList()
                    }
                }
                
                // Load custom content sections
                val sectionResult = loadCustomContentSections()
                sectionResult.firstError?.let(::registerError)
                val contentSections = sectionResult.sections
                
                // Load categories for navigation
                logd("Calling getCategoriesUseCase")
                val categoriesResult = getCategoriesUseCase()
                logd("getCategoriesUseCase result: $categoriesResult")
                val categories = when (categoriesResult) {
                    is Result.Success -> {
                        logd("Categories loaded successfully: ${categoriesResult.data.size} categories")
                        categoriesResult.data
                    }
                    is Result.Error -> {
                        loge("Failed to load categories: ${categoriesResult.exception.message}", categoriesResult.exception)
                        registerError(categoriesResult.exception)
                        emptyList()
                    }
                    is Result.Loading -> {
                        logd("Categories still loading")
                        emptyList()
                    }
                }
                
                val homeData = HomeData(
                    featuredContent = featuredContent,
                    continueWatching = continueWatchingItems,
                    contentSections = contentSections,
                    categories = categories
                )

                val hasAnyContent = featuredContent != null ||
                    continueWatchingItems.isNotEmpty() ||
                    contentSections.any { it.items.isNotEmpty() } ||
                    categories.isNotEmpty()

                if (!hasAnyContent && firstError != null) {
                    val errorMessage = errorHandler.getErrorMessage(firstError!!)
                    _uiState.update {
                        it.copy(
                            contentState = UiState.Error(errorMessage),
                            categories = categories
                        )
                    }
                    return@launch
                }

                _uiState.update {
                    it.copy(
                        contentState = UiState.Success(homeData),
                        categories = categories,
                        error = null
                    )
                }
                
                logd("Home content loaded successfully")
                
            } catch (e: Exception) {
                val errorMessage = errorHandler.getErrorMessage(e)
                loge("Home content loading exception: $errorMessage", e)
                _uiState.update {
                    it.copy(
                        contentState = UiState.Error(errorMessage),
                        error = null
                    )
                }
            }
        }
    }
    
    /**
     * Select category for navigation
     */
    fun selectCategory(categoryId: String) {
        _uiState.update { it.copy(selectedCategory = categoryId) }
        logd("Category selected: $categoryId")
        
        // Category-specific content is loaded through navigation to CategoryScreen
        // This method updates UI state for category highlighting in navigation
    }
    
    /**
     * Clear error message
     */
    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
    
    /**
     * Refresh content
     */
    fun refreshContent() {
        logd("Refreshing home content")
        loadContent()
    }



    /**
     * Load custom content sections for home screen
     */
    private suspend fun loadCustomContentSections(): ContentSectionsLoadResult {
        val sections = mutableListOf<ContentSection>()
        var firstError: Throwable? = null

        fun registerError(throwable: Throwable) {
            if (firstError == null) {
                firstError = throwable
            }
        }

        try {
            // 1. Featured content - Exclude Live TV
            val featuredResult = getFeaturedContentUseCase(limit = 10)
            when (featuredResult) {
                is Result.Success -> {
                    if (featuredResult.data.isNotEmpty()) {
                        val filteredFeatured = featuredResult.data
                            .filter { it.type != com.streamcore.tv.domain.model.ContentType.LIVE_TV }
                            .sortedByDescending { it.createdAt }
                        if (filteredFeatured.isNotEmpty()) {
                            sections.add(
                                ContentSection(
                                    title = stringProvider.getString(R.string.section_featured),
                                    categoryId = "featured",
                                    items = filteredFeatured
                                )
                            )
                            logd("Added Featured section with ${filteredFeatured.size} items (Live TV excluded)")
                        }
                    }
                }
                is Result.Error -> {
                    loge("Failed to load featured section: ${featuredResult.exception.message}", featuredResult.exception)
                    registerError(featuredResult.exception)
                }
                is Result.Loading -> Unit
            }

            // Load categories to get their IDs
            val categoriesResult = getCategoriesUseCase()
            when (categoriesResult) {
                is Result.Success -> {
                    val categories = categoriesResult.data

                    // 2. Movies (VOD category) - Exclude Live TV
                    val vodCategory = categories.findCategoryByType("vod", "movie", "movies")
                    if (vodCategory != null) {
                        val moviesResult = getContentByCategoryUseCase(vodCategory.id, limit = 15)
                        when (moviesResult) {
                            is Result.Success -> {
                                if (moviesResult.data.content.isNotEmpty()) {
                                    val filteredMovies = moviesResult.data.content
                                        .filter { it.type != com.streamcore.tv.domain.model.ContentType.LIVE_TV }
                                        .sortedByDescending { it.createdAt }
                                    if (filteredMovies.isNotEmpty()) {
                                        sections.add(
                                            ContentSection(
                                                title = stringProvider.getString(R.string.section_movies),
                                                categoryId = vodCategory.id,
                                                items = filteredMovies
                                            )
                                        )
                                        logd("Added Movies section with ${filteredMovies.size} items (Live TV excluded)")
                                    }
                                }
                            }
                            is Result.Error -> {
                                loge("Failed to load movies section: ${moviesResult.exception.message}", moviesResult.exception)
                                registerError(moviesResult.exception)
                            }
                            is Result.Loading -> Unit
                        }
                    }

                    // 3. Series - Exclude Live TV
                    val seriesCategory = categories.findCategoryByType("series", "show", "shows")
                    if (seriesCategory != null) {
                        val seriesResult = getContentByCategoryUseCase(seriesCategory.id, limit = 15)
                        when (seriesResult) {
                            is Result.Success -> {
                                if (seriesResult.data.content.isNotEmpty()) {
                                    val filteredSeries = seriesResult.data.content
                                        .filter { it.type != com.streamcore.tv.domain.model.ContentType.LIVE_TV }
                                        .sortedByDescending { it.createdAt }
                                    if (filteredSeries.isNotEmpty()) {
                                        sections.add(
                                            ContentSection(
                                                title = stringProvider.getString(R.string.section_series),
                                                categoryId = seriesCategory.id,
                                                items = filteredSeries
                                            )
                                        )
                                        logd("Added Series section with ${filteredSeries.size} items (Live TV excluded)")
                                    }
                                }
                            }
                            is Result.Error -> {
                                loge("Failed to load series section: ${seriesResult.exception.message}", seriesResult.exception)
                                registerError(seriesResult.exception)
                            }
                            is Result.Loading -> Unit
                        }
                    }

                    // 4. Live TV - REMOVED: Only accessible from menu

                    // 5. Kids content - Exclude Live TV
                    val kidsCategory = categories.findCategoryByType("kids", "children")
                    if (kidsCategory != null) {
                        val kidsResult = getContentByCategoryUseCase(kidsCategory.id, limit = 15)
                        when (kidsResult) {
                            is Result.Success -> {
                                if (kidsResult.data.content.isNotEmpty()) {
                                    val filteredKids = kidsResult.data.content
                                        .filter { it.type != com.streamcore.tv.domain.model.ContentType.LIVE_TV }
                                        .sortedByDescending { it.createdAt }
                                    if (filteredKids.isNotEmpty()) {
                                        sections.add(
                                            ContentSection(
                                                title = stringProvider.getString(R.string.section_kids),
                                                categoryId = kidsCategory.id,
                                                items = filteredKids
                                            )
                                        )
                                        logd("Added Kids section with ${filteredKids.size} items (Live TV excluded)")
                                    }
                                }
                            }
                            is Result.Error -> {
                                loge("Failed to load kids section: ${kidsResult.exception.message}", kidsResult.exception)
                                registerError(kidsResult.exception)
                            }
                            is Result.Loading -> Unit
                        }
                    }

                    logd("Available categories: ${categories.map { "${it.name} (${it.id})" }}")
                }
                is Result.Error -> {
                    loge("Failed to load categories for sections: ${categoriesResult.exception.message}", categoriesResult.exception)
                    registerError(categoriesResult.exception)
                }
                is Result.Loading -> Unit
            }

            logd("Loaded ${sections.size} custom content sections")

        } catch (e: Exception) {
            loge("Error loading custom content sections", e)
            registerError(e)
        }

        return ContentSectionsLoadResult(sections = sections, firstError = firstError)
    }
}

private data class ContentSectionsLoadResult(
    val sections: List<ContentSection>,
    val firstError: Throwable? = null
)

/**
 * UI State for Home Screen
 */
data class HomeUiState(
    val selectedCategory: String = "home",
    val contentState: UiState<HomeData> = UiState.Loading,
    val categories: List<Category> = emptyList(),
    val error: String? = null
)

/**
 * Data class for home screen content
 */
data class HomeData(
    val featuredContent: ContentItem?,
    val continueWatching: List<WatchHistoryItem> = emptyList(),
    val contentSections: List<ContentSection>,
    val categories: List<Category>
)

private fun List<Category>.findCategoryByType(vararg expectedTypes: String): Category? {
    return firstOrNull { category ->
        val slug = category.slug.trim().lowercase()
        val name = category.name.trim().lowercase()
        expectedTypes.any { expected ->
            slug == expected || name == expected || name.contains(expected)
        }
    }
}
