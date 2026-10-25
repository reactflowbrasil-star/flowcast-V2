package com.streamcore.tv.presentation.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.streamcore.tv.R
import com.streamcore.tv.domain.model.ContentItem
import com.streamcore.tv.presentation.components.StreamflixGlowEffect
import com.streamcore.tv.presentation.components.StreamflixShimmerEffect
import com.streamcore.tv.presentation.navigation.GoogleTVFocusableContainer
import com.streamcore.tv.presentation.theme.*

/**
 * Streamflix Style Horizontal Carousel
 *
 * Optimized for TV remote navigation with focus management
 * and Streamflix cinematic visual design patterns
 */
@Composable
fun GoogleTVHorizontalCarousel(
    title: String,
    items: List<ContentItem>,
    onItemClick: (ContentItem) -> Unit,
    modifier: Modifier = Modifier,
    onSeeAllClick: (() -> Unit)? = null,
    showSeeAll: Boolean = true
) {
    val listState = rememberLazyListState()

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(20.dp)
    ) {
        // Section Header - Streamflix style
        StreamflixCarouselHeader(
            title = title,
            onSeeAllClick = onSeeAllClick,
            showSeeAll = showSeeAll && onSeeAllClick != null
        )

        // Content Carousel - Streamflix spacing
        LazyRow(
            state = listState,
            horizontalArrangement = Arrangement.spacedBy(20.dp),
            contentPadding = PaddingValues(horizontal = 24.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            items(items, key = { it.id }) { item ->
                StreamflixCompactCard(
                    content = item,
                    onClick = { onItemClick(item) }
                )
            }
        }
    }
}

/**
 * Carousel header with title and optional "See All" button
 */
@Composable
private fun GoogleTVCarouselHeader(
    title: String,
    onSeeAllClick: (() -> Unit)?,
    showSeeAll: Boolean,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Section Title
        Text(
            text = title,
            style = MaterialTheme.typography.headlineMedium,
            color = TextPrimary,
            fontWeight = FontWeight.Bold
        )
        
        // See All Button
        if (showSeeAll && onSeeAllClick != null) {
            GoogleTVSeeAllButton(
                onClick = onSeeAllClick
            )
        }
    }
}

/**
 * "See All" button optimized for Google TV
 */
@Composable
private fun GoogleTVSeeAllButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val focusRequester = remember { FocusRequester() }
    var isFocused by remember { mutableStateOf(false) }
    
    val scale by animateFloatAsState(
        targetValue = if (isFocused) 1.05f else 1.0f,
        animationSpec = GoogleTVFocus.Animation.BOUNCE_SPRING,
        label = "see_all_scale"
    )
    
    val contentColor by animateColorAsState(
        targetValue = if (isFocused) Primary else OnSurfaceVariant,
        animationSpec = tween(200),
        label = "see_all_color"
    )
    
    GoogleTVFocusableContainer(
        modifier = modifier
            .scale(scale)
            .focusRequester(focusRequester)
            .onFocusChanged { focusState ->
                isFocused = focusState.isFocused
            }
            .focusable(),
        onFocusChanged = { focused ->
            isFocused = focused
        }
    ) {
        TextButton(
            onClick = onClick,
            colors = ButtonDefaults.textButtonColors(
                contentColor = contentColor
            )
        ) {
            Text(
                text = stringResource(id = R.string.quick_access_see_all),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Medium
            )
            
            Spacer(modifier = Modifier.width(4.dp))
            
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                contentDescription = null,
                modifier = Modifier.size(16.dp)
            )
        }
    }
}

/**
 * Hero carousel for featured content
 */
@Composable
fun GoogleTVHeroCarousel(
    items: List<ContentItem>,
    onItemClick: (ContentItem) -> Unit,
    modifier: Modifier = Modifier,
    autoScroll: Boolean = true,
    autoScrollDelayMs: Long = 5000L
) {
    val listState = rememberLazyListState()
    var currentIndex by remember { mutableIntStateOf(0) }

    LaunchedEffect(items.size) {
        if (items.isNotEmpty() && currentIndex >= items.size) {
            currentIndex = 0
        }
    }

    // Auto-scroll effect
    if (autoScroll && items.isNotEmpty()) {
        LaunchedEffect(currentIndex, items.size) {
            kotlinx.coroutines.delay(autoScrollDelayMs)
            val nextIndex = (currentIndex + 1) % items.size
            currentIndex = nextIndex
            listState.animateScrollToItem(nextIndex)
        }
    }
    
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Hero Carousel
        LazyRow(
            state = listState,
            horizontalArrangement = Arrangement.spacedBy(24.dp),
            contentPadding = PaddingValues(horizontal = 24.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            items(items, key = { it.id }) { item ->
                GoogleTVHeroCard(
                    content = item,
                    onClick = { onItemClick(item) }
                )
            }
        }
        
        // Carousel Indicators
        if (items.size > 1) {
            GoogleTVCarouselIndicators(
                itemCount = items.size,
                currentIndex = currentIndex,
                modifier = Modifier.align(Alignment.CenterHorizontally)
            )
        }
    }
}

/**
 * Carousel indicators for hero carousel
 */
@Composable
private fun GoogleTVCarouselIndicators(
    itemCount: Int,
    currentIndex: Int,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        repeat(itemCount) { index ->
            val isSelected = index == currentIndex
            val color by animateColorAsState(
                targetValue = if (isSelected) Primary else OnSurfaceVariant.copy(alpha = 0.5f),
                animationSpec = tween(300),
                label = "indicator_color"
            )
            
            Box(
                modifier = Modifier
                    .size(
                        width = if (isSelected) 24.dp else 8.dp,
                        height = 8.dp
                    )
                    .background(
                        color = color,
                        shape = androidx.compose.foundation.shape.RoundedCornerShape(4.dp)
                    )
            )
        }
    }
}

/**
 * Grid carousel for category content
 */
@Composable
fun GoogleTVGridCarousel(
    title: String,
    items: List<ContentItem>,
    onItemClick: (ContentItem) -> Unit,
    modifier: Modifier = Modifier,
    columns: Int = 4,
    onSeeAllClick: (() -> Unit)? = null
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Section Header
        GoogleTVCarouselHeader(
            title = title,
            onSeeAllClick = onSeeAllClick,
            showSeeAll = onSeeAllClick != null
        )
        
        // Grid Content
        val chunkedItems = remember(items, columns) { items.chunked(columns) }
        
        Column(
            verticalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier.padding(horizontal = 24.dp)
        ) {
            chunkedItems.forEach { rowItems ->
                Row(
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    rowItems.forEach { item ->
                        GoogleTVGridCard(
                            content = item,
                            onClick = { onItemClick(item) },
                            modifier = Modifier.weight(1f)
                        )
                    }
                    
                    // Fill remaining space if row is not complete
                    repeat(columns - rowItems.size) {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

/**
 * Streamflix-style carousel header with title and optional "See All" button
 */
@Composable
private fun StreamflixCarouselHeader(
    title: String,
    onSeeAllClick: (() -> Unit)?,
    showSeeAll: Boolean,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.headlineSmall,
            color = HeroBannerTextPrimary,
            fontWeight = FontWeight.Bold
        )

        if (showSeeAll && onSeeAllClick != null) {
            TextButton(
                onClick = onSeeAllClick,
                colors = ButtonDefaults.textButtonColors(
                    contentColor = Secondary
                )
            ) {
                Text(
                    text = stringResource(id = R.string.quick_access_see_all),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium
                )

                Spacer(modifier = Modifier.width(4.dp))

                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp)
                )
            }
        }
    }
}

/**
 * Streamflix-style compact card for carousels
 */
@Composable
private fun StreamflixCompactCard(
    content: ContentItem,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    var isHovered by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(
        targetValue = if (isHovered) 1.05f else 1.0f,
        animationSpec = tween(durationMillis = 200),
        label = "cardScale"
    )

    Box {
        // Glow effect for focused cards
        StreamflixGlowEffect(
            modifier = Modifier
                .width(200.dp)
                .height(300.dp),
            isActive = isHovered,
            glowColor = Secondary,
            intensity = 0.6f
        )

        Card(
            modifier = modifier
                .width(200.dp)
                .height(300.dp)
                .scale(scale)
                .clickable { onClick() }
                .hoverable(remember { MutableInteractionSource() })
                .onFocusChanged { focusState ->
                    isHovered = focusState.isFocused
                },
            shape = RoundedCornerShape(8.dp),
            colors = CardDefaults.cardColors(
                containerColor = CardBackground
            ),
            elevation = CardDefaults.cardElevation(
                defaultElevation = if (isHovered) 8.dp else 4.dp
            )
        ) {
        Box(modifier = Modifier.fillMaxSize()) {
            // Background image
            AsyncImage(
                model = content.imageUrl,
                contentDescription = content.title,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )

            // Streamflix gradient overlay
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                OverlayGradientStart,
                                OverlayGradientMid,
                                OverlayGradientEnd
                            ),
                            startY = 0f,
                            endY = Float.POSITIVE_INFINITY
                        )
                    )
            )

            // Content info
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(12.dp),
                verticalArrangement = Arrangement.SpaceBetween
            ) {
                // Quality badge
                content.rating?.let { rating ->
                    StreamflixQualityBadge(
                        rating = rating,
                        modifier = Modifier.align(Alignment.End)
                    )
                }

                // Title and info
                Column(
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        text = content.title,
                        style = MaterialTheme.typography.titleMedium,
                        color = HeroBannerTextPrimary,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )

                    content.year?.let { year ->
                        Text(
                            text = year.toString(),
                            style = MaterialTheme.typography.bodySmall,
                            color = HeroBannerTextSecondary
                        )
                    }
                }
            }
        }
        }
    }
}

/**
 * Streamflix-style quality badge
 */
@Composable
private fun StreamflixQualityBadge(
    rating: Float,
    modifier: Modifier = Modifier
) {
    val (badgeColor, badgeText) = when {
        rating >= 8.0f -> Pair(Secondary, "★ ${String.format(java.util.Locale.getDefault(), "%.1f", rating)}")
        rating >= 6.0f -> Pair(Primary, "★ ${String.format(java.util.Locale.getDefault(), "%.1f", rating)}")
        else -> Pair(Surface3, "★ ${String.format(java.util.Locale.getDefault(), "%.1f", rating)}")
    }

    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(
            containerColor = badgeColor
        ),
        shape = RoundedCornerShape(6.dp)
    ) {
        Text(
            text = badgeText,
            style = MaterialTheme.typography.labelMedium,
            color = HeroBannerTextPrimary,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
        )
    }
}
