package com.streamcore.tv.presentation.screens.category.components

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import coil.compose.AsyncImage
import com.streamcore.tv.R
import com.streamcore.tv.domain.model.ContentItem
import com.streamcore.tv.domain.model.ContentType
import com.streamcore.tv.presentation.theme.GoogleTVFocus.FocusScaleType
import com.streamcore.tv.presentation.theme.GoogleTVFocus.googleTVFocusable
import com.streamcore.tv.presentation.theme.TextPrimary

/**
 * Modern category content card component - Home style
 */
@Composable
fun CategoryContentCard(
    content: ContentItem,
    isLarge: Boolean,
    onClick: () -> Unit,
    onHover: (String?) -> Unit = {},
    modifier: Modifier = Modifier
) {
    // Movie poster dimensions (2:3 poster ratio)
    val cardWidth = if (isLarge) 150.dp else 130.dp
    val posterRatio = 2f / 3f

    // Prefer poster for cards to avoid awkward backdrop crops
    val backgroundImage = content.imageUrl ?: content.backdropUrl

    // Notify backdrop change on hover or focus - use backdrop for background effect
    var isFocused by remember { mutableStateOf(false) }
    // Prefer backdrop for hover background, fallback to imageUrl
    val hoverBackdrop = content.backdropUrl ?: content.imageUrl
    
    // Debug logging to trace image URLs
    LaunchedEffect(Unit) {
        timber.log.Timber.d("CategoryContentCard: '${content.title}' - backdropUrl: ${content.backdropUrl}, imageUrl: ${content.imageUrl}, hoverBackdrop: $hoverBackdrop")
    }
    
    LaunchedEffect(isFocused) {
        if (isFocused) {
            onHover(hoverBackdrop)
        } else {
            onHover(null)
        }
    }

    // Home-style card with simple structure
    Column(
        modifier = modifier
            .width(cardWidth)
            .zIndex(if (isFocused) 2f else 0f)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(posterRatio)
                .shadow(if (isFocused) 24.dp else 6.dp, RoundedCornerShape(14.dp), clip = false)
                .clip(RoundedCornerShape(14.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.2f))
                .googleTVFocusable(
                    scaleType = FocusScaleType.Medium,
                    borderRadius = 14.dp,
                    elevation = true,
                    glow = true,
                    shimmer = false
                )
                .focusable()
                .onFocusChanged { focusState ->
                    isFocused = focusState.isFocused
                }
                .clickable { onClick() }
        ) {
            AsyncImage(
                model = backgroundImage,
                contentDescription = content.title,
                modifier = Modifier
                    .fillMaxSize()
                    .clip(RoundedCornerShape(14.dp)),
                contentScale = ContentScale.Crop
            )

            if (isFocused) {
                Box(
                    modifier = Modifier
                        .matchParentSize()
                        .clip(RoundedCornerShape(14.dp))
                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.14f))
                )
            }

            // Top badges (rating, year)
            Row(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(8.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                content.rating?.let { rating ->
                    if (rating > 0f) Pill(icon = Icons.Default.Star, label = String.format(java.util.Locale.getDefault(), "%.1f", rating), container = Color(0xFFFFD700).copy(alpha = 0.18f), content = Color(0xFFFFD700))
                }
                content.year?.let { year ->
                    Pill(icon = Icons.Default.DateRange, label = year.toString(), container = Color.Black.copy(alpha = 0.35f), content = Color.White)
                }
            }

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
                            Color(0xFF1976D2), // Primary blue
                            androidx.compose.foundation.shape.CircleShape
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.PlayArrow,
                        contentDescription = stringResource(R.string.category_content_play_description),
                        tint = Color(0xFF1976D2), // Primary blue
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
                                Color.Black.copy(alpha = 0.5f),
                                Color.Black.copy(alpha = 0.85f)
                            )
                        )
                    )
                    .padding(12.dp)
            ) {
                Text(
                    text = content.title,
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

@Composable
private fun Pill(
    icon: ImageVector,
    label: String,
    container: Color,
    content: Color
) {
    Surface(
        color = container,
        contentColor = content,
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
        ) {
            Icon(imageVector = icon, contentDescription = null, modifier = Modifier.size(12.dp))
            Text(text = label, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold)
        }
    }
}

/**
 * Modern filter chip component
 */
@Composable
fun ModernFilterChip(
    selected: Boolean,
    onClick: () -> Unit,
    label: String,
    icon: ImageVector,
    modifier: Modifier = Modifier
) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = { Text(label) },
        leadingIcon = {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(16.dp)
            )
        },
        modifier = modifier
    )
}

/**
 * Category filters component
 */
@Composable
fun CategoryFilters(
    selectedSort: String,
    selectedFilter: String?,
    onSortSelected: (String) -> Unit,
    onFilterSelected: (String?) -> Unit,
    modifier: Modifier = Modifier
) {
    val sortOptions = remember { getSortOptions() }
    val filterOptions = remember { getFilterOptions() }

    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Sort Options
        Text(
            text = stringResource(R.string.category_sort_by),
            style = MaterialTheme.typography.titleSmall,
            color = TextPrimary,
            fontWeight = FontWeight.SemiBold
        )

        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(sortOptions, key = { it.first }) { (value, labelRes, icon) ->
                ModernFilterChip(
                    selected = selectedSort == value,
                    onClick = { onSortSelected(value) },
                    label = stringResource(labelRes),
                    icon = icon
                )
            }
        }

        // Filter Options
        Text(
            text = stringResource(R.string.category_filter_by),
            style = MaterialTheme.typography.titleSmall,
            color = TextPrimary,
            fontWeight = FontWeight.SemiBold
        )

        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                ModernFilterChip(
                    selected = selectedFilter == null,
                    onClick = { onFilterSelected(null) },
                    label = stringResource(R.string.category_filter_all),
                    icon = Icons.Default.Apps
                )
            }

            items(filterOptions, key = { it.first }) { (value, labelRes, icon) ->
                ModernFilterChip(
                    selected = selectedFilter == value,
                    onClick = { onFilterSelected(value) },
                    label = stringResource(labelRes),
                    icon = icon
                )
            }
        }
    }
}

/**
 * Get sort options with icons
 */
private fun getSortOptions(): List<Triple<String, Int, ImageVector>> {
    return listOf(
        Triple("title", R.string.sort_title, Icons.Default.SortByAlpha),
        Triple("year", R.string.sort_year, Icons.Default.DateRange),
        Triple("rating", R.string.sort_rating, Icons.Default.Star),
        Triple("date_added", R.string.sort_date_added, Icons.Default.Schedule)
    )
}

/**
 * Get filter options with icons
 */
private fun getFilterOptions(): List<Triple<String, Int, ImageVector>> {
    return listOf(
        Triple("recent", R.string.category_filter_recent, Icons.Default.NewReleases),
        Triple("popular", R.string.category_filter_popular, Icons.AutoMirrored.Filled.TrendingUp),
        Triple("high_rated", R.string.category_filter_top_rated, Icons.Default.Star),
        Triple("hd", R.string.common_hd, Icons.Default.HighQuality),
        Triple("4k", R.string.channel_quality_4k, Icons.Default.HighQuality)
    )
}
