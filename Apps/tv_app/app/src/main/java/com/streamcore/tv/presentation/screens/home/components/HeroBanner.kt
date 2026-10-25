package com.streamcore.tv.presentation.screens.home.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.streamcore.tv.R
import com.streamcore.tv.domain.model.ContentItem
import com.streamcore.tv.presentation.components.StreamflixAnimatedBackground
import com.streamcore.tv.presentation.components.StreamflixFloatingParticles
import com.streamcore.tv.presentation.theme.GoogleTVFocus
import com.streamcore.tv.presentation.theme.GoogleTVFocus.googleTVFocusable
import com.streamcore.tv.presentation.components.StreamflixGlowEffect
import kotlinx.coroutines.delay

import com.streamcore.tv.presentation.theme.*

/**
 * Streamflix-style Hero Slider component for featured content
 *
 * Displays a horizontal pager with auto-scroll, dot indicators, and cinematic overlays
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun StreamflixHeroSlider(
    contentList: List<ContentItem>,
    onPlayClick: (ContentItem) -> Unit,
    modifier: Modifier = Modifier,
    autoScrollDelayMs: Long = 8000L
) {
    if (contentList.isEmpty()) return

    val pagerState = rememberPagerState(pageCount = { contentList.size })

    // Auto-scroll effect (like Streamflix) - only if more than 1 item
    if (contentList.size > 1) {
        LaunchedEffect(pagerState.currentPage) {
            delay(autoScrollDelayMs)
            val nextPage = (pagerState.currentPage + 1) % contentList.size
            pagerState.animateScrollToPage(nextPage)
        }
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(400.dp)
    ) {
        // Animated background for cinematic effect
        StreamflixAnimatedBackground()

        // Floating particles for ambiance
        StreamflixFloatingParticles(
            modifier = Modifier.fillMaxSize(),
            particleCount = 6
        )

        // Hero Pager
        HorizontalPager(
            state = pagerState,
            modifier = Modifier.fillMaxSize()
        ) { page ->
            StreamflixHeroBanner(
                content = contentList[page],
                onPlayClick = { onPlayClick(contentList[page]) }
            )
        }

        // Dot Indicators (Streamflix style) - only show if more than 1 item
        if (contentList.size > 1) {
            StreamflixDotIndicators(
                itemCount = contentList.size,
                currentIndex = pagerState.currentPage,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(24.dp)
            )
        }
    }
}

/**
 * Individual hero banner with Streamflix styling
 */
@Composable
private fun StreamflixHeroBanner(
    content: ContentItem,
    onPlayClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .clip(RoundedCornerShape(16.dp))
    ) {
        // Background Image
        AsyncImage(
            model = content.backdropUrl ?: content.imageUrl,
            contentDescription = content.title,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop
        )

        // Streamflix Style Gradient Overlay - Exact fade replication
        Box(
            modifier = Modifier
                .fillMaxSize()
                .clip(RoundedCornerShape(16.dp))
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color.Transparent,                    // 0%: Top completely transparent
                            Color.Transparent,                    // 40%: Keep transparent longer
                            Color.Transparent,                    // 50%: Still transparent
                            Color.Black.copy(alpha = 0.05f),     // 60%: Very subtle start
                            Color.Black.copy(alpha = 0.15f),     // 70%: Gentle fade begins
                            Color.Black.copy(alpha = 0.35f),     // 80%: More noticeable
                            Color.Black.copy(alpha = 0.65f),     // 90%: Strong but not opaque
                            Color.Black.copy(alpha = 0.85f)      // 100%: Bottom strong overlay
                        ),
                        startY = 0f,
                        endY = Float.POSITIVE_INFINITY
                    )
                )
        )

        // Content Overlay moved to top-left (Streamflix-like)
        Box(
            modifier = Modifier
                .align(Alignment.TopStart)
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color.Black.copy(alpha = 0.75f),
                            Color.Black.copy(alpha = 0.35f),
                            Color.Transparent
                        ),
                        startY = 0f,
                        endY = 300f
                    )
                )
        ) {
            Column(
                modifier = Modifier
                    .padding(start = 24.dp, top = 64.dp, end = 24.dp, bottom = 16.dp)
                    .fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Content Info
                StreamflixContentInfo(content = content)

                // Action Buttons
                StreamflixActionButtons(
                    onPlayClick = onPlayClick
                )
            }
        }

        // Quality Badge
        content.rating?.let { rating ->
            QualityBadge(
                rating = rating,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(16.dp)
            )
        }
    }
}

/**
 * Streamflix-style dot indicators
 */
@Composable
private fun StreamflixDotIndicators(
    itemCount: Int,
    currentIndex: Int,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        repeat(itemCount) { index ->
            val isActive = index == currentIndex
            Box(
                modifier = Modifier
                    .size(if (isActive) 12.dp else 8.dp)
                    .background(
                        color = if (isActive) DotIndicatorActive else DotIndicatorInactive,
                        shape = CircleShape
                    )
            )
        }
    }
}

/**
 * Streamflix-style content info
 */
@Composable
private fun StreamflixContentInfo(content: ContentItem) {
    Column(
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Title - Streamflix style (15% smaller)
        Text(
            text = content.title,
            style = MaterialTheme.typography.headlineLarge.copy(
                fontSize = (MaterialTheme.typography.headlineLarge.fontSize.value * 0.85f).sp
            ),
            color = HeroBannerTextPrimary,
            fontWeight = FontWeight.Bold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )

        // Metadata Row
        Row(
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Year (15% smaller)
            content.year?.let { year ->
                Text(
                    text = year.toString(),
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontSize = (MaterialTheme.typography.bodyMedium.fontSize.value * 0.85f).sp
                    ),
                    color = HeroBannerTextSecondary
                )
            }

            // Duration (15% smaller)
            content.duration?.let { duration ->
                Text(
                    text = formatDuration(duration),
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontSize = (MaterialTheme.typography.bodyMedium.fontSize.value * 0.85f).sp
                    ),
                    color = HeroBannerTextSecondary
                )
            }

            // Genres (15% smaller)
            if (content.genres.isNotEmpty()) {
                Text(
                    text = content.genres.take(2).joinToString(", "),
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontSize = (MaterialTheme.typography.bodyMedium.fontSize.value * 0.85f).sp
                    ),
                    color = HeroBannerTextSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }

        // Description - Streamflix style (15% smaller text)
        content.description?.let { description ->
            Text(
                text = description,
                style = MaterialTheme.typography.bodyMedium.copy(
                    fontSize = (MaterialTheme.typography.bodyMedium.fontSize.value * 0.85f).sp
                ),
                color = HeroBannerTextSecondary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.widthIn(max = 400.dp)
            )
        }
    }
}

/**
 * Streamflix-style action buttons
 */
@Composable
private fun StreamflixActionButtons(
    onPlayClick: () -> Unit
) {
    var isFocused by remember { mutableStateOf(false) }

    Row(
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Play Button with Google TV focus effects
        Box(
            modifier = Modifier
                .googleTVFocusable(
                    scaleType = GoogleTVFocus.FocusScaleType.Medium,
                    borderRadius = 6.dp,
                    elevation = true,
                    glow = true,
                    shimmer = true
                )
                .focusable()
                .onFocusChanged { focusState ->
                    isFocused = focusState.isFocused
                }
        ) {
            // Glow effect behind button
            StreamflixGlowEffect(
                modifier = Modifier
                    .matchParentSize()
                    .offset(y = 2.dp),
                isActive = isFocused,
                glowColor = ButtonPrimary,
                intensity = 0.8f
            )

            // Play Button - Streamflix style (15% smaller)
            Button(
                onClick = onPlayClick,
                modifier = Modifier.height((40 * 0.85f).dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = ButtonPrimary,
                    contentColor = ButtonPrimaryText
                ),
                shape = RoundedCornerShape(6.dp),
                contentPadding = PaddingValues(horizontal = (20 * 0.85f).dp, vertical = 0.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.PlayArrow,
                    contentDescription = null,
                    modifier = Modifier.size((18 * 0.85f).dp)
                )
                Spacer(modifier = Modifier.width((8 * 0.85f).dp))
                Text(
                    text = stringResource(id = R.string.play_button),
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontSize = (MaterialTheme.typography.bodyMedium.fontSize.value * 0.85f).sp
                    ),
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

/**
 * Legacy HeroBanner for backward compatibility
 */
@Composable
fun HeroBanner(
    content: ContentItem,
    onPlayClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    StreamflixHeroSlider(
        contentList = listOf(content),
        onPlayClick = { onPlayClick() },
        modifier = modifier
    )
}

@Composable
private fun QualityBadge(
    rating: Float,
    modifier: Modifier = Modifier
) {
    val (badgeColor, badgeText) = when {
        rating >= 8.0f -> Pair(Success, "★ ${String.format(java.util.Locale.getDefault(), "%.1f", rating)}")
        rating >= 6.0f -> Pair(Warning, "★ ${String.format(java.util.Locale.getDefault(), "%.1f", rating)}")
        else -> Pair(Error, "★ ${String.format(java.util.Locale.getDefault(), "%.1f", rating)}")
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
            color = Color.White,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
        )
    }
}

/**
 * Format duration from seconds to readable string
 */
private fun formatDuration(seconds: Long): String {
    val hours = seconds / 3600
    val minutes = (seconds % 3600) / 60
    
    return when {
        hours > 0 -> "${hours}h ${minutes}m"
        minutes > 0 -> "${minutes}m"
        else -> "< 1m"
    }
}
