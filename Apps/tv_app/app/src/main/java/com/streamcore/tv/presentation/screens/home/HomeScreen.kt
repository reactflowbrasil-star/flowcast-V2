package com.streamcore.tv.presentation.screens.home

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.material3.*
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.input.key.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import androidx.compose.runtime.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.animation.*
import androidx.compose.ui.focus.onFocusChanged
import com.streamcore.tv.core.utils.logd
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Add
import com.streamcore.tv.presentation.theme.Primary
import kotlinx.coroutines.CoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R
import androidx.compose.runtime.Composable
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import androidx.hilt.navigation.compose.hiltViewModel
import com.streamcore.tv.core.utils.ShowToast
import com.streamcore.tv.domain.model.UiState
import com.streamcore.tv.domain.model.WatchHistoryItem
import com.streamcore.tv.presentation.components.LoadingIndicator
import com.streamcore.tv.presentation.components.ErrorScreen
import com.streamcore.tv.presentation.components.GoogleTVHorizontalCarousel
import com.streamcore.tv.presentation.components.transitions.SmoothCrossfade
import com.streamcore.tv.presentation.components.transitions.PageTransition
import com.streamcore.tv.presentation.screens.home.components.StreamCoreNavigation
import com.streamcore.tv.presentation.theme.GoogleTVFocus
import com.streamcore.tv.presentation.theme.GoogleTVFocus.googleTVFocusable
import com.streamcore.tv.presentation.components.IPTVButton
import com.streamcore.tv.presentation.components.ButtonVariant
import com.streamcore.tv.presentation.components.ButtonSize
import kotlinx.coroutines.delay

/**
 * STREAMFLIX HOME SCREEN - EXACT REPLICA
 * Based on HomeTvFragment.kt and fragment_home_tv.xml
 */
@Composable
fun HomeScreen(
    onNavigateToDetail: (String) -> Unit,
    onNavigateToPlayer: (String) -> Unit,
    onNavigateToCategory: (String) -> Unit,
    onNavigateToSearch: () -> Unit,
    onNavigateToSettings: () -> Unit,
    onNavigateToLiveTV: () -> Unit = {},
    onNavigateToEvents: () -> Unit = {},
    onNavigateToSeries: (String) -> Unit = {},
    viewModel: HomeViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val scrollState = rememberScrollState()
    val scope = rememberCoroutineScope()

    uiState.error?.let { error ->
        ShowToast(message = error)
        LaunchedEffect(error) {
            viewModel.clearError()
        }
    }

    // EXACT STREAMFLIX LAYOUT: fragment_home_tv.xml
    Box(
        modifier = Modifier
            .fillMaxSize()
            .onKeyEvent { keyEvent ->
                // GLOBAL KEY HANDLER - PERMITE QUE EL MENU RECIBA FOCUS
                false // Deja que los componentes hijos manejen las teclas
            }
    ) {

        // Background image with dynamic content (iv_home_background)
        var currentBackgroundImage by remember { mutableStateOf<String?>(null) }

        AsyncImage(
            model = currentBackgroundImage,
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop
        )

        // Streamflix gradient overlay (bg_home_fragment_tv.xml)
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.horizontalGradient(
                        colors = listOf(
                            Color(0xFF181818), // startColor
                            Color(0x88181818), // centerColor
                            Color(0x00181818)  // endColor
                        )
                    )
                )
        )

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color(0xFF181818), // top
                            Color(0x00181818), // center transparent
                            Color(0xFF181818)  // bottom
                        )
                    )
                )
        )

        Row(modifier = Modifier.fillMaxSize()) {
            StreamCoreNavigation(
                selectedCategory = uiState.selectedCategory,
                availableCategories = uiState.categories,
                onCategorySelected = { categoryId ->
                    if (categoryId == "home") {
                        viewModel.selectCategory(categoryId)
                    } else {
                        onNavigateToCategory(categoryId)
                    }
                },
                onSearchClick = onNavigateToSearch,
                onSettingsClick = onNavigateToSettings,
                onNavigateToLiveTV = onNavigateToLiveTV,
                onNavigateToEvents = onNavigateToEvents
            )

            // vgv_home equivalent - VerticalGridView
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .weight(1f)
            ) {
                when (val contentState = uiState.contentState) {
                is UiState.Loading -> {
                    Box(
                        modifier = Modifier.fillMaxSize().weight(1f),
                        contentAlignment = Alignment.Center
                    ) {
                        LoadingIndicator()
                    }
                }

                is UiState.Success -> {
                    StreamflixVerticalGrid(
                        homeData = contentState.data,
                        onNavigateToDetail = onNavigateToDetail,
                        onNavigateToPlayer = onNavigateToPlayer,
                        onNavigateToCategory = onNavigateToCategory,
                        onNavigateToSeries = onNavigateToSeries,
                        onBackgroundUpdate = { imageUrl ->
                            currentBackgroundImage = imageUrl
                        },
                        scrollState = scrollState,
                        scope = scope,
                        modifier = Modifier.weight(1f)
                    )
                }

                is UiState.Error -> {
                    Box(
                        modifier = Modifier.fillMaxSize().weight(1f),
                        contentAlignment = Alignment.Center
                    ) {
                        ErrorScreen(
                            message = contentState.message,
                            onRetry = viewModel::loadContent
                        )
                    }
                }
            }
            }
        }
    }
}

/**
 * Translate section titles from ViewModel to localized strings
 */
@Composable
private fun getLocalizedSectionTitle(title: String): String {
    return when (title.lowercase()) {
        "featured" -> stringResource(R.string.section_featured)
        "movies" -> stringResource(R.string.section_movies)
        "series" -> stringResource(R.string.section_series)
        "kids" -> stringResource(R.string.section_kids)
        else -> title // Return original title if no translation found
    }
}

/**
 * STREAMFLIX VERTICAL GRID - EXACT REPLICA
 * Based on vgv_home VerticalGridView from fragment_home_tv.xml
 */
@Composable
private fun StreamflixVerticalGrid(
    homeData: HomeData,
    onNavigateToDetail: (String) -> Unit,
    onNavigateToPlayer: (String) -> Unit,
    onNavigateToCategory: (String) -> Unit,
    onNavigateToSeries: (String) -> Unit,
    onBackgroundUpdate: (String?) -> Unit,
    scrollState: ScrollState,
    scope: CoroutineScope,
    modifier: Modifier = Modifier
) {
    val featuredItems = remember(homeData.contentSections) {
        homeData.contentSections
            .firstOrNull()
            ?.items
            ?.filter { it.type != com.streamcore.tv.domain.model.ContentType.LIVE_TV }
            ?.take(5)
            .orEmpty()
    }
    val nonLiveSections = remember(homeData.contentSections) {
        homeData.contentSections.drop(1).mapNotNull { section ->
            val filteredItems = section.items.filter { it.type != com.streamcore.tv.domain.model.ContentType.LIVE_TV }
            if (filteredItems.isNotEmpty()) {
                section to filteredItems
            } else {
                null
            }
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(
                start = 16.dp, // home_spacing from dimens
                top = 16.dp,
                end = 16.dp,
                bottom = 16.dp
            ),
        verticalArrangement = Arrangement.spacedBy(12.dp) // Reduced spacing between sections
    ) {

        // FEATURED SECTION - CATEGORY_TV_SWIPER (content_category_swiper_tv.xml) - Exclude Live TV
        if (featuredItems.isNotEmpty()) {
            StreamflixCategorySwiper(
                items = featuredItems,
                onItemClick = { content ->
                    logd("HomeScreen: Clicked on '${content.title}' (ID: ${content.id}) - Type: ${content.type}")
                    when (content.type) {
                        com.streamcore.tv.domain.model.ContentType.LIVE_TV -> {
                            logd("HomeScreen: Navigating to Player for Live TV")
                            onNavigateToPlayer(content.id)
                        }
                        com.streamcore.tv.domain.model.ContentType.SERIES -> {
                            logd("HomeScreen: Navigating to Series Detail")
                            onNavigateToSeries(content.id)
                        }
                        else -> {
                            logd("HomeScreen: Navigating to Content Detail")
                            onNavigateToDetail(content.id)
                        }
                    }
                },
                onBackgroundUpdate = onBackgroundUpdate,
                scrollState = scrollState,
                scope = scope
            )
        }

        // CONTINUE WATCHING SECTION - Show if user has partially watched content
        if (homeData.continueWatching.isNotEmpty()) {
            ContinueWatchingSection(
                items = homeData.continueWatching,
                onItemClick = { item ->
                    logd("HomeScreen: Continue watching clicked - Content ID: ${item.contentId}")
                    onNavigateToPlayer(item.contentId)
                }
            )
        }

        // OTHER CATEGORIES - CATEGORY_TV_ITEM (item_category_tv.xml) - Exclude Live TV
        nonLiveSections.forEach { (section, filteredItems) ->
            StreamflixCategoryItem(
                title = getLocalizedSectionTitle(section.title),
                items = filteredItems,
                onItemClick = { content ->
                    logd("HomeScreen: Clicked on '${content.title}' (ID: ${content.id}) - Type: ${content.type}")
                    when (content.type) {
                        com.streamcore.tv.domain.model.ContentType.LIVE_TV -> {
                            logd("HomeScreen: Navigating to Player for Live TV")
                            onNavigateToPlayer(content.id)
                        }
                        com.streamcore.tv.domain.model.ContentType.SERIES -> {
                            logd("HomeScreen: Navigating to Series Detail")
                            onNavigateToSeries(content.id)
                        }
                        else -> {
                            logd("HomeScreen: Navigating to Content Detail")
                            onNavigateToDetail(content.id)
                        }
                    }
                },
                onSeeAllClick = {
                    onNavigateToCategory(section.categoryId)
                }
            )
        }
    }
}

/**
 * STREAMFLIX CATEGORY SWIPER - EXACT REPLICA
 * Based on content_category_swiper_tv.xml layout
 */
@Composable
private fun StreamflixCategorySwiper(
    items: List<com.streamcore.tv.domain.model.ContentItem>,
    onItemClick: (com.streamcore.tv.domain.model.ContentItem) -> Unit,
    onBackgroundUpdate: (String?) -> Unit,
    scrollState: ScrollState,
    scope: CoroutineScope,
    modifier: Modifier = Modifier
) {
    if (items.isEmpty()) return

    var currentIndex by remember { mutableIntStateOf(0) }

    LaunchedEffect(items.size) {
        if (currentIndex >= items.size) currentIndex = 0
    }

    // Auto-scroll like Streamflix (12 seconds)
    LaunchedEffect(currentIndex, items.size) {
        delay(12_000)
        currentIndex = (currentIndex + 1) % items.size
    }

    val currentItem = items.getOrElse(currentIndex) { items.first() }

    // Update background image
    LaunchedEffect(currentItem.id) {
        onBackgroundUpdate(currentItem.backdropUrl ?: currentItem.imageUrl)
    }

    // content_category_swiper_tv.xml layout
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(400.dp)
    ) {
            // Title (tv_swiper_title) - 40sp, white, top margin 50dp
            Text(
                text = currentItem.title,
                fontSize = 40.sp,
                color = Color.White,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier
                    .padding(top = 50.dp, end = 50.dp)
                    .fillMaxWidth()
            )

            // Metadata row (tv_swiper_quality, tv_swiper_released, tv_swiper_rating)
            Row(
                modifier = Modifier
                    .padding(top = 110.dp)
                    .fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(25.dp)
            ) {
                // Quality (using type as quality indicator)
                Text(
                    text = when (currentItem.type) {
                        com.streamcore.tv.domain.model.ContentType.LIVE_TV -> stringResource(R.string.home_content_type_live)
                        com.streamcore.tv.domain.model.ContentType.MOVIE -> stringResource(R.string.home_content_type_hd)
                        com.streamcore.tv.domain.model.ContentType.SERIES -> stringResource(R.string.home_content_type_hd)
                        com.streamcore.tv.domain.model.ContentType.EPISODE -> stringResource(R.string.home_content_type_hd)
                    },
                    color = Color.White,
                    fontSize = 14.sp
                )

                // Year
                currentItem.year?.let { year ->
                    Text(
                        text = year.toString(),
                        color = Color.White,
                        fontSize = 14.sp
                    )
                }

                // Rating
                currentItem.rating?.let { rating ->
                    Text(
                        text = stringResource(R.string.content_rating_format, String.format(java.util.Locale.getDefault(), "%.1f", rating)),
                        color = Color(0xFFC0C0C0),
                        fontSize = 14.sp
                    )
                }
            }

            // Overview (tv_swiper_overview) - 4 lines max (25% shorter), 40% width
            currentItem.description?.let { description ->
                Text(
                    text = description,
                    color = Color.White,
                    maxLines = 4,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .padding(top = 170.dp)
                        .fillMaxWidth(0.40f)
                )
            }

            // Watch Now Button (btn_swiper_watch_now) - 15% smaller
            IPTVButton(
                text = stringResource(R.string.detail_watch_now),
                onClick = { onItemClick(currentItem) },
                variant = ButtonVariant.Primary,
                size = ButtonSize.Small, // Changed from Medium to Small
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(bottom = 50.dp)
                    .width((140 * 0.85f).dp) // 15% smaller width
                    .onFocusChanged { focusState ->
                        if (focusState.isFocused) {
                            // Scroll to show the complete hero slider like at app start
                            scope.launch {
                                // Small delay to ensure focus is properly established
                                kotlinx.coroutines.delay(50)
                                // Force scroll to top to show hero banner completely
                                scrollState.animateScrollTo(0)
                            }
                        }
                    }
            )

            // Dots indicator (ll_dots_indicator) - bottom right
        if (items.size > 1) {
            Row(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 50.dp, bottom = 50.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                repeat(items.size) { index ->
                    Box(
                        modifier = Modifier
                            .size(if (index == currentIndex) 12.dp else 8.dp)
                            .background(
                                color = if (index == currentIndex) Color.White else Color.Gray,
                                shape = androidx.compose.foundation.shape.CircleShape
                            )
                    )
                }
            }
        }
}
}

/**
 * STREAMFLIX CATEGORY ITEM - EXACT REPLICA
 * Based on item_category_tv.xml layout
 */
@Suppress("UNUSED_PARAMETER")
@Composable
private fun StreamflixCategoryItem(
    title: String,
    items: List<com.streamcore.tv.domain.model.ContentItem>,
    onItemClick: (com.streamcore.tv.domain.model.ContentItem) -> Unit,
    onSeeAllClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.fillMaxWidth()
    ) {
        // Category title (tv_category_title) - 20sp, white
        Text(
            text = title,
            fontSize = 20.sp,
            color = Color.White,
            modifier = Modifier.fillMaxWidth()
        )

        // Horizontal grid (hgv_category) - limit to 15 + trailing plus card
        StreamflixHorizontalCarousel(
            items = items.take(15),
            onItemClick = onItemClick,
            onPlusClick = onSeeAllClick,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 4.dp) // Keep title and cards visually connected
        )
    }
}

/**
 * Simple horizontal carousel without header spacing
 */
@Composable
private fun StreamflixHorizontalCarousel(
    items: List<com.streamcore.tv.domain.model.ContentItem>,
    onItemClick: (com.streamcore.tv.domain.model.ContentItem) -> Unit,
    onPlusClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(20.dp),
        contentPadding = PaddingValues(horizontal = 24.dp),
        modifier = modifier.fillMaxWidth()
    ) {
        items(items, key = { it.id }) { item ->
            // Modern card with Google TV focus effects
            var isFocused by remember { mutableStateOf(false) }
            androidx.compose.foundation.layout.Column(
                modifier = Modifier.width(150.dp)
            ) {
                androidx.compose.foundation.layout.Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(225.dp)
                        .googleTVFocusable(
                            scaleType = GoogleTVFocus.FocusScaleType.Small,
                            borderRadius = 12.dp,
                            elevation = true,
                            glow = true,
                            shimmer = true
                        )
                        .background(
                            Color.Gray,
                            androidx.compose.foundation.shape.RoundedCornerShape(12.dp)
                        )
                        .clickable { onItemClick(item) }
                        .focusable()
                        .onFocusChanged { focusState ->
                            isFocused = focusState.isFocused
                        }
                ) {
                    coil.compose.AsyncImage(
                        model = item.imageUrl ?: item.backdropUrl,
                        contentDescription = item.title,
                        modifier = Modifier
                            .fillMaxSize()
                            .clip(androidx.compose.foundation.shape.RoundedCornerShape(12.dp)),
                        contentScale = ContentScale.Crop
                    )

                    // Animated play button on focus
                    androidx.compose.animation.AnimatedVisibility(
                        visible = isFocused,
                        enter = androidx.compose.animation.fadeIn() + androidx.compose.animation.scaleIn(),
                        exit = androidx.compose.animation.fadeOut() + androidx.compose.animation.scaleOut(),
                        modifier = Modifier.align(Alignment.Center)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(64.dp)
                                .background(
                                    Color.White.copy(alpha = 0.95f),
                                    androidx.compose.foundation.shape.CircleShape
                                )
                                .border(
                                    2.dp,
                                    Primary,
                                    androidx.compose.foundation.shape.CircleShape
                                ),
                            contentAlignment = Alignment.Center
                        ) {
                            androidx.compose.material3.Icon(
                                imageVector = Icons.Default.PlayArrow,
                                contentDescription = stringResource(R.string.home_play_description),
                                tint = Primary,
                                modifier = Modifier.size(32.dp)
                            )
                        }
                    }

                    // Title overlay at bottom of card
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .align(Alignment.BottomCenter)
                            .background(
                                Brush.verticalGradient(
                                    colors = listOf(
                                        Color.Transparent,
                                        Color.Black.copy(alpha = 0.8f)
                                    )
                                )
                            )
                            .padding(12.dp)
                    ) {
                        androidx.compose.material3.Text(
                            text = item.title,
                            color = Color.White,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }
        }

        // Trailing plus card to open full category
        item {
            androidx.compose.foundation.layout.Column(
                modifier = Modifier.width(150.dp)
            ) {
                androidx.compose.foundation.layout.Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(225.dp)
                        .googleTVFocusable(
                            scaleType = GoogleTVFocus.FocusScaleType.Small,
                            borderRadius = 12.dp,
                            elevation = true,
                            glow = true,
                            shimmer = false
                        )
                        .background(
                            Color.Black.copy(alpha = 0.5f),
                            androidx.compose.foundation.shape.RoundedCornerShape(12.dp)
                        )
                        .clickable { onPlusClick() }
                        .focusable(),
                    contentAlignment = Alignment.Center
                ) {
                    androidx.compose.material3.Icon(
                        imageVector = Icons.Filled.Add,
                        contentDescription = stringResource(R.string.content_see_all),
                        tint = Color.White,
                        modifier = Modifier.size(36.dp)
                    )
                }
            }
        }
    }
}

/**
 * CONTINUE WATCHING SECTION
 * Shows content the user has partially watched with progress bars
 */
@Composable
private fun ContinueWatchingSection(
    items: List<WatchHistoryItem>,
    onItemClick: (WatchHistoryItem) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.fillMaxWidth()) {
        // Section title
        Text(
            text = stringResource(R.string.content_continue_watching),
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White,
            modifier = Modifier.padding(bottom = 12.dp)
        )

        // Horizontal list of continue watching items
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(end = 16.dp)
        ) {
            items(items, key = { it.contentId }) { item ->
                ContinueWatchingCard(
                    item = item,
                    onClick = { onItemClick(item) }
                )
            }
        }
    }
}

/**
 * Continue Watching Card with progress bar
 */
@Composable
private fun ContinueWatchingCard(
    item: WatchHistoryItem,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .width(180.dp)
            .googleTVFocusable(
                scaleType = GoogleTVFocus.FocusScaleType.Small,
                borderRadius = 12.dp,
                elevation = true,
                glow = true,
                shimmer = false
            )
            .clickable(onClick = onClick)
            .focusable()
    ) {
        // Thumbnail with play overlay
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(100.dp)
                .clip(androidx.compose.foundation.shape.RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp))
        ) {
            AsyncImage(
                model = item.content.imageUrl ?: item.content.backdropUrl,
                contentDescription = item.content.title,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )

            // Dark overlay
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.3f))
            )

            // Play icon
            Icon(
                imageVector = Icons.Filled.PlayArrow,
                contentDescription = stringResource(R.string.home_play_description),
                tint = Color.White,
                modifier = Modifier
                    .size(40.dp)
                    .align(Alignment.Center)
            )

            // Progress bar at bottom of thumbnail
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(4.dp)
                    .align(Alignment.BottomCenter)
                    .background(Color.Gray.copy(alpha = 0.5f))
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(item.progress.coerceIn(0f, 1f))
                        .fillMaxHeight()
                        .background(Primary)
                )
            }
        }

        // Title and remaining time
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Color.Black.copy(alpha = 0.7f),
                    androidx.compose.foundation.shape.RoundedCornerShape(bottomStart = 12.dp, bottomEnd = 12.dp)
                )
                .padding(8.dp)
        ) {
            Text(
                text = item.content.title,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                color = Color.White,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )


        }
    }
}
