package com.streamcore.tv.presentation.screens.home.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.key.*
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.streamcore.tv.R
import com.streamcore.tv.presentation.theme.*
import kotlinx.coroutines.delay

import com.streamcore.tv.BuildConfig

@Composable
fun StreamCoreNavigation(
    selectedCategory: String,
    availableCategories: List<com.streamcore.tv.domain.model.Category>,
    onCategorySelected: (String) -> Unit,
    onSearchClick: () -> Unit,
    onSettingsClick: () -> Unit,
    onNavigateToLiveTV: () -> Unit = {},
    onNavigateToEvents: () -> Unit = {},
    userName: String = "",
    userAvatar: String? = null,
    modifier: Modifier = Modifier
) {
    var isOpen by remember { mutableStateOf(false) }
    var hasAnyFocus by remember { mutableStateOf(false) }

    // Auto-expand when any item has focus
    LaunchedEffect(hasAnyFocus) {
        isOpen = hasAnyFocus
    }

    // String resources
    val navHomeText = stringResource(R.string.nav_home)
    val navSearchText = stringResource(R.string.nav_search)
    val navLiveTvText = stringResource(R.string.nav_live_tv)
    val navEventsText = stringResource(R.string.nav_events)
    val navMoviesText = stringResource(R.string.nav_movies)
    val navSeriesText = stringResource(R.string.nav_series)
    val navAnimeText = stringResource(R.string.nav_anime)
    val navKidsText = stringResource(R.string.nav_kids)

    val navSettingsText = stringResource(R.string.nav_settings)

    // Build navigation items based on available categories
    val navigationItems = remember(availableCategories, navHomeText, navSearchText, navLiveTvText) {
        val items = mutableListOf<NavItem>()

        val hasMovies = availableCategories.any { categoryMatches(it, "vod", "movie", "movies") }
        val hasSeries = availableCategories.any { categoryMatches(it, "series", "show", "shows") }
        val hasLiveTv = availableCategories.any { categoryMatches(it, "tv", "live_tv", "live") }
        val hasEvents = availableCategories.any { categoryMatches(it, "event", "events") }
        val hasKids = availableCategories.any { categoryMatches(it, "kids", "children") }
        val hasAnime = availableCategories.any { categoryMatches(it, "anime") }

        items.add(NavItem("search", navSearchText, Icons.Outlined.Search, Icons.Filled.Search))
        items.add(NavItem("home", navHomeText, Icons.Outlined.Home, Icons.Filled.Home))
        if (hasLiveTv) items.add(NavItem("live_tv", navLiveTvText, Icons.Outlined.LiveTv, Icons.Filled.LiveTv, showBadge = true))
        if (hasEvents) items.add(NavItem("events", navEventsText, Icons.Outlined.Event, Icons.Filled.Event))
        if (hasMovies) items.add(NavItem("movies", navMoviesText, Icons.Outlined.Movie, Icons.Filled.Movie))
        if (hasSeries) items.add(NavItem("series", navSeriesText, Icons.Outlined.Tv, Icons.Filled.Tv))
        if (hasKids) items.add(NavItem("kids", navKidsText, Icons.Outlined.ChildCare, Icons.Filled.ChildCare))
        if (hasAnime) items.add(NavItem("anime", navAnimeText, Icons.Outlined.Animation, Icons.Filled.Animation))
        items.add(NavItem("settings", navSettingsText, Icons.Outlined.Settings, Icons.Filled.Settings))

        items
    }

    val categoryMapping = remember(availableCategories) {
        val mapping = mutableMapOf<String, String>()
        availableCategories.forEach { category ->
            when {
                categoryMatches(category, "vod", "movie", "movies") -> mapping["movies"] = category.id
                categoryMatches(category, "series", "show", "shows") -> mapping["series"] = category.id
                categoryMatches(category, "tv", "live_tv", "live") -> mapping["live_tv"] = category.id
                categoryMatches(category, "event", "events") -> mapping["events"] = category.id
                categoryMatches(category, "kids", "children") -> mapping["kids"] = category.id
                categoryMatches(category, "anime") -> mapping["anime"] = category.id
            }
        }
        mapping
    }

    // Split items for layout
    val mainItems = remember(navigationItems) { navigationItems.filter { it.id != "settings" } }
    val bottomItems = remember(navigationItems) { navigationItems.filter { it.id == "settings" } }
    val navItemFocusRequesters = remember(navigationItems) {
        navigationItems.associate { it.id to FocusRequester() }
    }
    var lastFocusedItemId by rememberSaveable { mutableStateOf<String?>(null) }

    LaunchedEffect(navigationItems, selectedCategory) {
        if (navigationItems.isEmpty()) return@LaunchedEffect
        if (lastFocusedItemId != null) return@LaunchedEffect

        val selectedNavId = navigationItems.firstOrNull { it.id == selectedCategory }?.id
            ?: navigationItems.firstOrNull { categoryMapping[it.id] == selectedCategory }?.id
            ?: navigationItems.first().id

        delay(120)
        navItemFocusRequesters[selectedNavId]?.requestFocus()
        lastFocusedItemId = selectedNavId
    }
    
    // Animation for menu width
    val menuWidth by animateDpAsState(
        targetValue = if (isOpen) 224.dp else 80.dp,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioLowBouncy,
            stiffness = Spring.StiffnessLow
        ),
        label = "menuWidth"
    )

    // Navigation drawer container
    Surface(
        modifier = modifier
            .width(menuWidth)
            .fillMaxHeight()
            .onFocusChanged { 
                // Keep menu open if it has focus, but allow it to close if focus leaves
                if (!it.hasFocus) {
                    hasAnyFocus = false
                    isOpen = false
                }
            }
            .focusable(false) // The surface itself shouldn't take focus, only contents
            .onKeyEvent { keyEvent ->
                if (keyEvent.type == KeyEventType.KeyDown) {
                    when (keyEvent.key) {
                        Key.DirectionRight -> {
                            // Allow navigation out to content
                            if (isOpen) {
                                isOpen = false
                                false // Let event propagate to move focus
                            } else false
                        }
                        Key.Back -> {
                            if (isOpen) {
                                isOpen = false
                                true
                            } else false
                        }
                        else -> false
                    }
                } else false
            },
        color = Color.Transparent,
        tonalElevation = 0.dp
    ) {
        // Glassmorphism Background
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    brush = Brush.horizontalGradient(
                        colors = listOf(
                            Color(0xFF0F0F15).copy(alpha = 0.98f),
                            Color(0xFF13131A).copy(alpha = 0.95f),
                            Color(0xFF13131A).copy(alpha = 0.8f)
                        )
                    )
                )
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(vertical = 24.dp),
                horizontalAlignment = Alignment.Start
            ) {
                // Logo Section
                Box(
                    modifier = Modifier
                        .height(60.dp)
                        .fillMaxWidth(),
                    contentAlignment = Alignment.Center
                ) {
                    // Logo Text (Animated visibility)
                    androidx.compose.animation.AnimatedVisibility(
                        visible = isOpen,
                        enter = fadeIn(tween(300)),
                        exit = fadeOut(tween(100))
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = BuildConfig.BRANDING_NAME,
                                style = MaterialTheme.typography.titleMedium.copy(
                                    fontWeight = FontWeight.Bold,
                                    letterSpacing = 1.sp
                                ),
                                color = Color.White
                            )
                            Text(
                                text = stringResource(id = R.string.nav_streaming_tagline),
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontWeight = FontWeight.Medium,
                                    letterSpacing = 2.sp
                                ),
                                color = Primary
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(32.dp))

                // Scrollable Navigation Items
                val listState = rememberLazyListState()
                
                LazyColumn(
                    state = listState,
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(horizontal = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    itemsIndexed(mainItems) { _, item ->
                        ModernNavItemRow(
                            item = item,
                            isSelected = selectedCategory == item.id,
                            isOpen = isOpen,
                            modifier = Modifier.focusRequester(navItemFocusRequesters.getValue(item.id)),
                            onFocus = { 
                                hasAnyFocus = true
                                lastFocusedItemId = item.id
                            },
                            onClick = {
                                when (item.id) {
                                    "search" -> onSearchClick()
                                    "live_tv" -> onNavigateToLiveTV()
                                    "events" -> onNavigateToEvents()
                                    else -> {
                                        val categoryId = categoryMapping[item.id] ?: item.id
                                        onCategorySelected(categoryId)
                                    }
                                }
                            }
                        )
                    }
                    
                    item {
                        Spacer(modifier = Modifier.height(24.dp))
                        if (isOpen) {
                             Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 8.dp)
                                    .height(1.dp)
                                    .background(Color.White.copy(alpha = 0.1f))
                            )
                            Spacer(modifier = Modifier.height(24.dp))
                        }
                    }

                    itemsIndexed(bottomItems) { _, item ->
                        ModernNavItemRow(
                            item = item,
                            isSelected = selectedCategory == item.id,
                            isOpen = isOpen,
                            modifier = Modifier.focusRequester(navItemFocusRequesters.getValue(item.id)),
                            onFocus = {
                                hasAnyFocus = true
                                lastFocusedItemId = item.id
                            },
                            onClick = {
                                when (item.id) {
                                    "settings" -> onSettingsClick()
                                    else -> onCategorySelected(item.id)
                                }
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ModernNavItemRow(
    item: NavItem,
    isSelected: Boolean,
    isOpen: Boolean,
    modifier: Modifier = Modifier,
    onFocus: () -> Unit,
    onClick: () -> Unit
) {
    var isFocused by remember { mutableStateOf(false) }
    
    // Animations
    val scale by animateFloatAsState(
        targetValue = if (isFocused) 1.0f else 0.95f, // Subtle scale
        animationSpec = spring(dampingRatio = 0.6f, stiffness = 400f),
        label = "scale"
    )
    
    val backgroundColor by animateColorAsState(
        targetValue = when {
            isFocused -> Color.White
            isSelected -> Color.White.copy(alpha = 0.1f)
            else -> Color.Transparent
        },
        label = "bgColor"
    )

    val contentColor by animateColorAsState(
        targetValue = when {
            isFocused -> Color.Black
            isSelected -> Color.White
            else -> Color.White.copy(alpha = 0.6f)
        },
        label = "contentColor"
    )

    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(52.dp)
            .scale(scale)
            .background(
                color = backgroundColor,
                shape = RoundedCornerShape(12.dp)
            )
            .onFocusChanged {
                isFocused = it.isFocused
                if (it.isFocused) onFocus()
            }
            .clickable { onClick() }
            .focusable()
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Icon
        Icon(
            imageVector = if (isSelected || isFocused) item.iconFilled else item.icon,
            contentDescription = item.label,
            tint = contentColor,
            modifier = Modifier.size(22.dp)
        )

        // Label (Animated visibility)
        AnimatedVisibility(
            visible = isOpen,
            enter = fadeIn() + expandHorizontally(),
            exit = fadeOut() + shrinkHorizontally()
        ) {
            Row {
                Spacer(modifier = Modifier.width(16.dp))
                Text(
                    text = item.label,
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontWeight = if (isSelected || isFocused) FontWeight.Bold else FontWeight.Medium
                    ),
                    color = contentColor,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
        
        // Selection Indicator Dot (only when collapsed and selected)
        if (!isOpen && isSelected && !isFocused) {
            Box(
                modifier = Modifier
                    .size(4.dp)
                    .offset(x = 4.dp, y = (-10).dp)
                    .background(Primary, CircleShape)
            )
        }
        
        // Badge
        if (item.showBadge && isOpen) {
            Spacer(modifier = Modifier.weight(1f))
            Box(
                modifier = Modifier
                    .size(6.dp)
                    .background(Secondary, CircleShape)
            )
        }
    }
}

private data class NavItem(
    val id: String,
    val label: String,
    val icon: ImageVector,
    val iconFilled: ImageVector = icon,
    val showBadge: Boolean = false
)

private fun categoryMatches(
    category: com.streamcore.tv.domain.model.Category,
    vararg expectedTypes: String
): Boolean {
    val slug = category.slug.trim().lowercase()
    val name = category.name.trim().lowercase()
    return expectedTypes.any { expected ->
        slug == expected || name == expected || name.contains(expected)
    }
}
