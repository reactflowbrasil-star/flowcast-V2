package com.streamcore.tv.presentation.screens.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.streamcore.tv.R
import com.streamcore.tv.core.utils.ShowToast
import com.streamcore.tv.domain.model.UiState
import com.streamcore.tv.presentation.components.*
import com.streamcore.tv.presentation.screens.detail.components.*
import com.streamcore.tv.presentation.theme.*

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.focusable
import androidx.compose.ui.focus.onFocusChanged
import com.streamcore.tv.presentation.theme.GoogleTVFocus.googleTVFocusable
/**
 * Content detail screen showing comprehensive information about content
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContentDetailScreen(
    contentId: String,
    onNavigateBack: () -> Unit,
    onNavigateToPlayer: (String) -> Unit,
    onNavigateToDetail: (String) -> Unit,
    viewModel: ContentDetailViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    // Load content when screen opens
    LaunchedEffect(contentId) {
        viewModel.loadContent(contentId)
    }

    // Show error messages
    uiState.error?.let { error ->
        ShowToast(message = error)
        LaunchedEffect(error) {
            viewModel.clearError()
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        when (val contentState = uiState.contentState) {
            is UiState.Loading -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    LoadingIndicator()
                }
            }

            is UiState.Success -> {
                val content = contentState.data

                LazyColumn(
                    modifier = Modifier.fillMaxSize()
                ) {
                    // Hero Section
                    item {
                        ContentHeroSection(
                            content = content,
                            isFavorite = uiState.isFavorite,
                            onPlayClick = { onNavigateToPlayer(content.id) },
                            onFavoriteClick = viewModel::toggleFavorite,
                            onNavigateBack = onNavigateBack
                        )
                    }

                    // Content Info
                    item {
                        ContentInfoSection(
                            content = content,
                            modifier = Modifier.padding(16.dp)
                        )
                    }

                    // Episodes (for series)
                    content.episodes?.let { episodes ->
                        if (episodes.isNotEmpty()) {
                            item {
                                EpisodesSection(
                                    episodes = episodes,
                                    onEpisodeClick = { episode ->
                                        onNavigateToPlayer(episode.id.toString())
                                    },
                                    modifier = Modifier.padding(horizontal = 16.dp)
                                )
                            }
                        }
                    }

                    // Cast & Crew
                    content.cast?.let { cast ->
                        if (cast.isNotEmpty()) {
                            item {
                                CastSection(
                                    cast = cast,
                                    modifier = Modifier.padding(horizontal = 16.dp)
                                )
                            }
                        }
                    }

                    // Related Content
                    content.relatedContent?.let { related ->
                        if (related.isNotEmpty()) {
                            item {
                                RelatedContentSection(
                                    content = related,
                                    onContentClick = { relatedContent ->
                                        onNavigateToDetail(relatedContent.id)
                                    },
                                    modifier = Modifier.padding(horizontal = 16.dp)
                                )
                            }
                        }
                    }

                    // Bottom spacing
                    item {
                        Spacer(modifier = Modifier.height(32.dp))
                    }
                }
            }

            is UiState.Error -> {
                ErrorScreen(
                    message = contentState.message,
                    onRetry = { viewModel.loadContent(contentId) }
                )

                // Back button for error state
                IconButton(
                    onClick = onNavigateBack,
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(16.dp)
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = stringResource(R.string.cd_back),
                        tint = Color.White
                    )
                }
            }
        }
    }
}

@Composable
private fun ContentHeroSection(
    content: com.streamcore.tv.domain.model.ContentDetails,
    isFavorite: Boolean,
    onPlayClick: () -> Unit,
    onFavoriteClick: () -> Unit,
    onNavigateBack: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(500.dp)
    ) {
        // Background Image
        AsyncImage(
            model = content.backdropUrl ?: content.imageUrl,
            contentDescription = content.title,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop
        )

        // Gradient Overlay
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color.Transparent,
                            Color.Black.copy(alpha = 0.3f),
                            Color.Black.copy(alpha = 0.8f)
                        )
                    )
                )
        )

        // Back Button
        IconButton(
            onClick = onNavigateBack,
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(16.dp)
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = stringResource(R.string.cd_back),
                tint = Color.White
            )
        }

        // Content Info with Poster
        Row(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(24.dp)
                .fillMaxWidth()
                .height(200.dp), // Fixed height for the row
            horizontalArrangement = Arrangement.spacedBy(20.dp),
            verticalAlignment = Alignment.Bottom
        ) {
            // Movie Poster
            Card(
                modifier = Modifier
                    .width(120.dp)
                    .height(180.dp),
                shape = RoundedCornerShape(6.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                )
            ) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    if (!content.posterUrl.isNullOrEmpty()) {
                        AsyncImage(
                            model = content.posterUrl,
                            contentDescription = content.title,
                            modifier = Modifier.fillMaxSize(),
                            contentScale = ContentScale.Crop
                        )
                    } else {
                        // Placeholder when no image URL
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.Movie,
                                contentDescription = null,
                                modifier = Modifier.size(48.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                            )
                            Text(
                                text = stringResource(R.string.content_no_image),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center
                            )
                        }
                    }
                }
            }

            // Content Details
            Column(
                modifier = Modifier
                    .weight(1f)
                    .height(180.dp), // Match poster height
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Title
                Text(
                    text = content.title,
                    style = MaterialTheme.typography.headlineLarge,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )

                // Metadata
                ContentMetadata(
                    content = content,
                    textColor = Color.White
                )

                // Description
                content.description?.let { description ->
                    Text(
                        text = description,
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.9f),
                        maxLines = 4,
                        overflow = TextOverflow.Ellipsis,
                        lineHeight = 20.sp
                    )
                }

                // Action Buttons
                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Play button - same style as Home hero slider
                    var playFocused by remember { mutableStateOf(false) }
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
                            .onFocusChanged { focusState -> playFocused = focusState.isFocused }
                    ) {
                        StreamflixGlowEffect(
                            modifier = Modifier
                                .matchParentSize()
                                .offset(y = 2.dp),
                            isActive = playFocused,
                            glowColor = ButtonPrimary,
                            intensity = 0.8f
                        )
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
                            Icon(imageVector = Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size((18 * 0.85f).dp))
                            Spacer(modifier = Modifier.width((8 * 0.85f).dp))
                            Text(
                                text = stringResource(R.string.content_play_now),
                                style = MaterialTheme.typography.bodyMedium.copy(fontSize = (MaterialTheme.typography.bodyMedium.fontSize.value * 0.85f).sp),
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }

                    // Favorite button - outline flat
                    OutlinedButton(
                        onClick = onFavoriteClick,
                        colors = ButtonDefaults.outlinedButtonColors(
                            containerColor = ButtonOutline,
                            contentColor = OnSurface
                        ),
                        shape = RoundedCornerShape(6.dp),
                        border = BorderStroke(2.dp, OnSurfaceVariant),
                        contentPadding = PaddingValues(horizontal = 20.dp)
                    ) {
                        Icon(
                            imageVector = if (isFavorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                            contentDescription = null
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(text = if (isFavorite) stringResource(R.string.content_remove_favorite) else stringResource(R.string.content_add_favorite))
                    }
                }
            }
        }

        // Rating Badge
        content.rating?.let { rating ->
            Card(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(16.dp),
                colors = CardDefaults.cardColors(
                    containerColor = when {
                        rating >= 8.0f -> Success
                        rating >= 6.0f -> Warning
                        else -> Error
                    }
                ),
                shape = RoundedCornerShape(6.dp)
            ) {
                Text(
                    text = stringResource(R.string.content_rating_star, String.format(java.util.Locale.getDefault(), "%.1f", rating)),
                    style = MaterialTheme.typography.labelMedium,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                )
            }
        }
    }
}
