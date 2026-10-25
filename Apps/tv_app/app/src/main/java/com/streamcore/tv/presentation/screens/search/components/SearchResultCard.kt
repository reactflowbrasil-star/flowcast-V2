package com.streamcore.tv.presentation.screens.search.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.runtime.*
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.streamcore.tv.domain.model.ContentItem
import com.streamcore.tv.domain.model.ContentType
import com.streamcore.tv.presentation.theme.*
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R

/**
 * Search result card component
 */
@Composable
fun SearchResultCard(
    content: ContentItem,
    onClick: () -> Unit,
    onPlayClick: (() -> Unit)? = null,
    onSeriesClick: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    var isFocused by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(targetValue = if (isFocused) 1.06f else 1f, animationSpec = tween(180), label = "searchCardScale")

    Box(
        modifier = modifier
            .width(150.dp)
            .aspectRatio(2f / 3f)
            .scale(scale)
            .clip(RoundedCornerShape(14.dp))
            .background(Color.Black.copy(alpha = 0.1f))
            .clickable { onClick() }
            .focusable()
            .onFocusChanged { isFocused = it.isFocused }
    ) {
        // Poster
        AsyncImage(
            model = content.imageUrl ?: content.backdropUrl,
            contentDescription = content.title,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop
        )

        // Glow border on focus
        if (isFocused) {
            Box(
                modifier = Modifier
                    .matchParentSize()
                    .border(2.dp, Primary.copy(alpha = 0.9f), RoundedCornerShape(14.dp))
            )
        }

        // Top badges
        ContentTypeBadge(
            type = content.type,
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(8.dp)
        )
        content.rating?.let { rating ->
            RatingBadge(
                rating = rating,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(8.dp)
            )
        }

        // Bottom gradient and texts
        Box(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .background(
                    androidx.compose.ui.graphics.Brush.verticalGradient(
                        colors = listOf(Color.Transparent, Color.Black.copy(alpha = 0.6f), Color.Black.copy(alpha = 0.85f))
                    )
                )
                .padding(10.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = content.title,
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    content.year?.let { year ->
                        Text(text = year.toString(), style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.8f))
                    }
                    if (content.genres.isNotEmpty()) {
                        Text(text = stringResource(R.string.common_dot_separator), style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.8f))
                        Text(text = content.genres.first(), style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.8f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }
}

@Composable
private fun ContentTypeBadge(
    type: ContentType,
    modifier: Modifier = Modifier
) {
    val (badgeColor, badgeText) = when (type) {
        ContentType.MOVIE -> Pair(Primary, stringResource(R.string.search_content_type_movie))
        ContentType.SERIES -> Pair(Secondary, stringResource(R.string.search_content_type_series))
        ContentType.LIVE_TV -> Pair(Error, stringResource(R.string.search_content_type_live))
        ContentType.EPISODE -> Pair(Warning, stringResource(R.string.search_content_type_episode))
    }
    
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(
            containerColor = badgeColor
        ),
        shape = RoundedCornerShape(4.dp)
    ) {
        androidx.compose.material3.Text(
            text = badgeText,
            style = MaterialTheme.typography.labelSmall,
            color = Color.White,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
        )
    }
}

@Composable
private fun RatingBadge(
    rating: Float,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(
            containerColor = Color.Black.copy(alpha = 0.7f)
        ),
        shape = RoundedCornerShape(4.dp)
    ) {
        Text(
            text = stringResource(R.string.content_rating_format, String.format(java.util.Locale.getDefault(), "%.1f", rating)),
            style = MaterialTheme.typography.labelSmall,
            color = Color.White,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
        )
    }
}
