package com.streamcore.tv.presentation.screens.home.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.streamcore.tv.R
import com.streamcore.tv.domain.model.ContentItem
import com.streamcore.tv.domain.model.ContentType
import com.streamcore.tv.presentation.theme.*

/**
 * Horizontal content carousel component
 * 
 * Displays a horizontal scrollable list of content items
 */
@Composable
fun HorizontalContentCarousel(
    title: String,
    content: List<ContentItem>,
    onItemClick: (ContentItem) -> Unit,
    onSeeAllClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Section Header
        SectionHeader(
            title = title,
            onSeeAllClick = onSeeAllClick
        )
        
        // Content Carousel - Streamflix style
        if (content.isNotEmpty()) {
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                contentPadding = PaddingValues(horizontal = 16.dp)
            ) {
                items(content, key = { it.id }) { item ->
                    ContentCard(
                        content = item,
                        onClick = { onItemClick(item) }
                    )
                }
            }
        } else {
            EmptyContentMessage()
        }
    }
}

@Composable
private fun SectionHeader(
    title: String,
    onSeeAllClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.headlineSmall,
            color = HeroBannerTextPrimary,
            fontWeight = FontWeight.Bold
        )

        TextButton(
            onClick = onSeeAllClick,
            colors = ButtonDefaults.textButtonColors(
                contentColor = Secondary
            )
        ) {
            Text(
                text = stringResource(R.string.content_see_all),
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

@Composable
private fun ContentCard(
    content: ContentItem,
    onClick: () -> Unit
) {
    // Streamflix style card - more cinematic proportions
    val cardWidth = 220.dp
    val cardHeight = 130.dp

    // Use backdrop image if available, fallback to poster
    val backgroundImage = content.backdropUrl ?: content.imageUrl

    var isHovered by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(
        targetValue = if (isHovered) 1.05f else 1.0f,
        animationSpec = tween(durationMillis = 200),
        label = "cardScale"
    )

    Box(
        modifier = Modifier
            .width(cardWidth)
            .height(cardHeight)
            .scale(scale)
            .clip(RoundedCornerShape(8.dp))
            .clickable { onClick() }
            .hoverable(remember { MutableInteractionSource() })
            .onFocusChanged { focusState ->
                isHovered = focusState.isFocused
            }
    ) {
        // Background image covering the entire card
        AsyncImage(
            model = backgroundImage,
            contentDescription = content.title,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop
        )

        // Streamflix style gradient overlay
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

        // Floating badges - Streamflix style
        GoogleTVHomeContentTypeBadge(
            type = content.type,
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(6.dp)
        )

        content.rating?.let { rating ->
            GoogleTVHomeRatingBadge(
                rating = rating,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(8.dp)
            )
        }

        // Content info overlay at bottom
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            Text(
                text = content.title,
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                content.year?.let { year ->
                    Text(
                        text = year.toString(),
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.8f),
                        fontWeight = FontWeight.Medium
                    )
                }

                if (content.genres.isNotEmpty()) {
                    Text(
                        text = "•",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.6f)
                    )

                    Text(
                        text = content.genres.first(),
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.8f),
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

@Composable
private fun GoogleTVHomeContentTypeBadge(
    type: ContentType,
    modifier: Modifier = Modifier
) {
    val (badgeColor, badgeText) = when (type) {
        ContentType.MOVIE -> Pair(Color(0xFF1976D2), "MOVIE")
        ContentType.SERIES -> Pair(Color(0xFF388E3C), "SERIE")
        ContentType.LIVE_TV -> Pair(Color(0xFFD32F2F), "EN VIVO")
        ContentType.EPISODE -> Pair(Color(0xFFF57C00), "EPISODIO")
    }

    Box(
        modifier = modifier
            .background(
                color = Color.Black.copy(alpha = 0.7f),
                shape = RoundedCornerShape(4.dp)
            )
            .padding(horizontal = 6.dp, vertical = 3.dp)
    ) {
        Text(
            text = badgeText,
            style = MaterialTheme.typography.labelSmall.copy(
                fontWeight = FontWeight.Bold
            ),
            color = badgeColor
        )
    }
}

@Composable
private fun GoogleTVHomeRatingBadge(
    rating: Float,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .background(
                color = Color.Black.copy(alpha = 0.7f),
                shape = RoundedCornerShape(4.dp)
            )
            .padding(horizontal = 6.dp, vertical = 3.dp)
    ) {
        Text(
            text = "★ ${String.format(java.util.Locale.getDefault(), "%.1f", rating)}",
            style = MaterialTheme.typography.labelSmall.copy(
                fontWeight = FontWeight.Bold
            ),
            color = Color(0xFFFFD700) // Gold
        )
    }
}

@Composable
private fun EmptyContentMessage() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(120.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = stringResource(R.string.content_empty_message),
            style = MaterialTheme.typography.bodyMedium,
            color = TextTertiary
        )
    }
}
