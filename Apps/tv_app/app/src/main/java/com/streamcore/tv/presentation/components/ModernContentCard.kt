package com.streamcore.tv.presentation.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
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
import com.streamcore.tv.presentation.navigation.GoogleTVFocusableContainer
import com.streamcore.tv.presentation.theme.GoogleTVFocus.googleTVShimmer
import com.streamcore.tv.presentation.theme.*

/**
 * Google TV Style Modern content card with focus management and animations
 * Optimized for TV remote navigation with enhanced visual feedback
 */
@Composable
fun ModernContentCard(
    content: ContentItem,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    isHovered: Boolean = false
) {
    val focusRequester = remember { FocusRequester() }
    var isFocused by remember { mutableStateOf(false) }
    var isPressed by remember { mutableStateOf(false) }

    // Google TV optimized scale animation
    val scale by animateFloatAsState(
        targetValue = when {
            isPressed -> GoogleTVFocus.Visual.PRESSED_SCALE
            isFocused || isHovered -> GoogleTVFocus.Visual.FOCUS_SCALE_LARGE
            else -> GoogleTVFocus.Visual.DEFAULT_SCALE
        },
        animationSpec = GoogleTVFocus.Animation.BOUNCE_SPRING,
        label = "card_scale"
    )

    // Google TV optimized elevation animation
    val elevation by animateFloatAsState(
        targetValue = when {
            isPressed -> GoogleTVFocus.Visual.PRESSED_ELEVATION.value
            isFocused || isHovered -> GoogleTVFocus.Visual.FOCUS_ELEVATION.value
            else -> GoogleTVFocus.Visual.DEFAULT_ELEVATION.value
        },
        animationSpec = tween(
            durationMillis = GoogleTVFocus.Animation.FOCUS_DURATION,
            easing = GoogleTVFocus.Animation.FOCUS_EASING
        ),
        label = "card_elevation"
    )

    // Focus border color animation
    val borderColor by animateColorAsState(
        targetValue = if (isFocused) FocusBorder else Color.Transparent,
        animationSpec = tween(
            durationMillis = GoogleTVFocus.Animation.COLOR_DURATION,
            easing = GoogleTVFocus.Animation.COLOR_EASING
        ),
        label = "card_border_color"
    )

    GoogleTVFocusableContainer(
        modifier = modifier
            .width(280.dp)
            .height(420.dp)
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
        Card(
            modifier = Modifier
                .fillMaxSize()
                .googleTVShimmer(isFocused)
                .clickable {
                    isPressed = true
                    onClick()
                },
            colors = CardDefaults.cardColors(
                containerColor = if (isFocused) CardBackgroundFocus else CardBackground
            ),
            shape = RoundedCornerShape(GoogleTVFocus.Visual.BORDER_RADIUS),
            elevation = CardDefaults.cardElevation(
                defaultElevation = elevation.dp
            ),
            border = if (isFocused) {
                androidx.compose.foundation.BorderStroke(
                    width = GoogleTVFocus.Visual.BORDER_WIDTH,
                    color = borderColor
                )
            } else null
        ) {
        Box(
            modifier = Modifier.fillMaxSize()
        ) {
            // Background gradient
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        brush = Brush.verticalGradient(
                            colors = listOf(
                                Color.Black.copy(alpha = 0.3f),
                                Color.Black.copy(alpha = 0.8f)
                            )
                        )
                    )
            )
            
            // Content image
            AsyncImage(
                model = content.imageUrl,
                contentDescription = content.title,
                modifier = Modifier
                    .fillMaxSize()
                    .clip(RoundedCornerShape(20.dp)),
                contentScale = ContentScale.Crop
            )
            
            // Gradient overlay
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        brush = Brush.verticalGradient(
                            colors = listOf(
                                Color.Transparent,
                                Color.Black.copy(alpha = 0.7f)
                            ),
                            startY = 200f
                        )
                    )
            )
            
            // Content info
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(20.dp),
                verticalArrangement = Arrangement.SpaceBetween
            ) {
                // Top section - Quality badge and rating
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Top
                ) {
                    // Quality badge (based on content type)
                    QualityBadge(quality = getQualityFromType(content.type))

                    // Rating
                    RatingBadge(rating = content.rating ?: 0f)
                }
                
                // Bottom section - Title and info
                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Title
                    Text(
                        text = content.title,
                        style = MaterialTheme.typography.titleLarge.copy(
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold
                        ),
                        color = Color.White,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    
                    // Genre and year
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Show first genre if available
                        if (content.genres.isNotEmpty()) {
                            GenreChip(genre = content.genres.first())
                        }

                        content.year?.let { year ->
                            Text(
                                text = year.toString(),
                                style = MaterialTheme.typography.bodyMedium,
                                color = Color.White.copy(alpha = 0.8f)
                            )
                        }
                    }
                    
                    // Duration
                    content.duration?.let { duration ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Schedule,
                                contentDescription = null,
                                tint = Color.White.copy(alpha = 0.7f),
                                modifier = Modifier.size(16.dp)
                            )
                            Text(
                                text = formatDuration(duration.toInt()),
                                style = MaterialTheme.typography.bodySmall,
                                color = Color.White.copy(alpha = 0.7f)
                            )
                        }
                    }
                }
            }
            
            // Hover overlay with play button
            if (isHovered) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Color.Black.copy(alpha = 0.5f)
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    PlayButton()
                }
            }
        }
    }
    } // Close GoogleTVFocusableContainer
}

@Composable
private fun QualityBadge(quality: String) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = when (quality.uppercase()) {
                "4K", "UHD" -> PremiumGold
                "HD", "1080P" -> Primary
                else -> Color.Gray
            }
        ),
        shape = RoundedCornerShape(8.dp)
    ) {
        Text(
            text = quality.uppercase(),
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            style = MaterialTheme.typography.labelSmall.copy(
                fontWeight = FontWeight.Bold
            ),
            color = Color.White
        )
    }
}

@Composable
private fun RatingBadge(rating: Float) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Icon(
            imageVector = Icons.Default.Star,
            contentDescription = null,
            tint = RatingGold,
            modifier = Modifier.size(16.dp)
        )
        Text(
            text = String.format(java.util.Locale.getDefault(), "%.1f", rating),
            style = MaterialTheme.typography.labelMedium.copy(
                fontWeight = FontWeight.Bold
            ),
            color = Color.White
        )
    }
}

@Composable
private fun GenreChip(genre: String) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = Color.White.copy(alpha = 0.2f)
        ),
        shape = RoundedCornerShape(12.dp)
    ) {
        Text(
            text = genre,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            style = MaterialTheme.typography.labelSmall,
            color = Color.White
        )
    }
}

@Composable
private fun PlayButton() {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = Color.White.copy(alpha = 0.9f)
        ),
        shape = RoundedCornerShape(50),
        modifier = Modifier.size(64.dp)
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Default.PlayArrow,
                contentDescription = stringResource(R.string.play_button),
                tint = Color.Black,
                modifier = Modifier.size(32.dp)
            )
        }
    }
}

private fun formatDuration(seconds: Int): String {
    val minutes = seconds / 60
    val hours = minutes / 60
    val mins = minutes % 60
    return if (hours > 0) {
        "${hours}h ${mins}m"
    } else {
        "${mins}m"
    }
}

private fun getQualityFromType(type: com.streamcore.tv.domain.model.ContentType): String {
    return when (type) {
        com.streamcore.tv.domain.model.ContentType.MOVIE -> "HD"
        com.streamcore.tv.domain.model.ContentType.SERIES -> "HD"
        com.streamcore.tv.domain.model.ContentType.LIVE_TV -> "LIVE"
        com.streamcore.tv.domain.model.ContentType.EPISODE -> "HD"
    }
}

/**
 * Google TV specific content card variants
 */

/**
 * Compact content card for Google TV carousels
 */
@Composable
fun GoogleTVCompactCard(
    content: ContentItem,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    ModernContentCard(
        content = content,
        onClick = onClick,
        modifier = modifier
            .width(200.dp)
            .height(300.dp)
    )
}

/**
 * Hero content card for Google TV main banner
 */
@Composable
fun GoogleTVHeroCard(
    content: ContentItem,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    ModernContentCard(
        content = content,
        onClick = onClick,
        modifier = modifier
            .width(400.dp)
            .height(600.dp)
    )
}

/**
 * Grid content card for Google TV grid layouts
 */
@Composable
fun GoogleTVGridCard(
    content: ContentItem,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    ModernContentCard(
        content = content,
        onClick = onClick,
        modifier = modifier
            .width(240.dp)
            .height(360.dp)
    )
}
