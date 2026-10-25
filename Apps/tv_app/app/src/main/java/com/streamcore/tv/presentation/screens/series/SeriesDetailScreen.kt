package com.streamcore.tv.presentation.screens.series

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.PlayCircleOutline
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.focus.onFocusChanged
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.streamcore.tv.domain.model.Episode
import com.streamcore.tv.domain.model.Season
import com.streamcore.tv.domain.model.SeriesDetails
import com.streamcore.tv.presentation.components.IPTVButton
import com.streamcore.tv.presentation.components.ButtonVariant
import com.streamcore.tv.presentation.components.ButtonSize
import com.streamcore.tv.presentation.components.LoadingScreen
import com.streamcore.tv.presentation.components.ErrorScreen
import com.streamcore.tv.presentation.theme.*
import com.streamcore.tv.presentation.theme.GoogleTVFocus.googleTVFocusable
import com.streamcore.tv.presentation.theme.GoogleTVFocus
import com.streamcore.tv.core.utils.UiState

@Composable
fun SeriesDetailScreen(
    contentId: String,
    onNavigateBack: () -> Unit,
    onPlayEpisode: (Episode) -> Unit,
    viewModel: SeriesDetailViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(contentId) {
        viewModel.loadSeriesDetailsByContentId(contentId)
    }

    when (val state = uiState.seriesState) {
        is UiState.Loading -> {
            LoadingScreen()
        }
        is UiState.Error -> {
            ErrorScreen(
                message = state.message,
                onRetry = { viewModel.loadSeriesDetailsByContentId(contentId) }
            )
        }
        is UiState.Success -> {
            SeriesDetailContent(
                series = state.data,
                selectedSeason = uiState.selectedSeason,
                onNavigateBack = onNavigateBack,
                onSeasonSelected = viewModel::selectSeason,
                onPlayEpisode = onPlayEpisode
            )
        }
    }
}

@Composable
private fun SeriesDetailContent(
    series: SeriesDetails,
    selectedSeason: Season?,
    onNavigateBack: () -> Unit,
    onSeasonSelected: (Season) -> Unit,
    onPlayEpisode: (Episode) -> Unit
) {
    val scrollState = rememberLazyListState()

    LazyColumn(
        state = scrollState,
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundPrimary)
    ) {
        item {
            // Hero Section with Poster and Info
            SeriesHeroSection(
                series = series,
                onNavigateBack = onNavigateBack,
                onPlayFirstEpisode = {
                    selectedSeason?.episodes?.firstOrNull()?.let { firstEpisode ->
                        onPlayEpisode(firstEpisode)
                    }
                }
            )
        }

        item {
            Spacer(modifier = Modifier.height(8.dp))
        }

        item {
            // Season Selector
            SeasonSelector(
                seasons = series.seasons,
                selectedSeason = selectedSeason,
                onSeasonSelected = onSeasonSelected,
                modifier = Modifier.padding(horizontal = 16.dp)
            )
        }

        item {
            Spacer(modifier = Modifier.height(12.dp))
        }

        // Episodes List
        selectedSeason?.let { season ->
            items(season.episodes) { episode ->
                EpisodeCard(
                    episode = episode,
                    seasonNumber = season.seasonNumber,
                    onPlayEpisode = { onPlayEpisode(episode) },
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)
                )
            }
        }

        item {
            Spacer(modifier = Modifier.height(80.dp)) // Bottom padding for TV navigation
        }
    }
}

@Composable
private fun SeriesHeroSection(
    series: SeriesDetails,
    onNavigateBack: () -> Unit,
    onPlayFirstEpisode: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(400.dp)
    ) {
        // Background Image (Backdrop)
        AsyncImage(
            model = ImageRequest.Builder(LocalContext.current)
                .data(series.backdropUrl ?: series.content.imageUrl)
                .crossfade(true)
                .build(),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize()
        )

        // Gradient Overlay
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color.Black.copy(alpha = 0.3f),
                            Color.Black.copy(alpha = 0.6f),
                            Color.Black.copy(alpha = 0.9f)
                        ),
                        startY = 0f,
                        endY = 1200f
                    )
                )
        )

        // Back Button
        IconButton(
            onClick = onNavigateBack,
            modifier = Modifier
                .padding(12.dp)
                .align(Alignment.TopStart)
                .background(
                    Color.Black.copy(alpha = 0.5f),
                    CircleShape
                )
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = stringResource(R.string.nav_back),
                tint = Color.White,
                modifier = Modifier.size(20.dp)
            )
        }

        // Content with Poster
        Row(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(16.dp)
                .fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Poster
            Card(
                modifier = Modifier
                    .width(120.dp)
                    .height(180.dp),
                shape = RoundedCornerShape(8.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
            ) {
                AsyncImage(
                    model = ImageRequest.Builder(LocalContext.current)
                        .data(series.content.imageUrl) // In a real app, this should be posterUrl
                        .crossfade(true)
                        .build(),
                    contentDescription = series.content.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )
            }

            // Info Column
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(top = 20.dp)
            ) {
                // Title
                Text(
                    text = series.content.title,
                    style = MaterialTheme.typography.headlineMedium.copy(
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold
                    ),
                    color = Color.White,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )

                Spacer(modifier = Modifier.height(6.dp))

                // Year, Quality and Seasons
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Quality Badge
                    Surface(
                        color = AccentBlue,
                        shape = RoundedCornerShape(4.dp)
                    ) {
                        Text(
                            text = stringResource(R.string.common_hd),
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.Bold,
                                fontSize = 10.sp
                            ),
                            color = Color.White,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }

                    series.content.year?.let { year ->
                        Text(
                            text = year.toString(),
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.White.copy(alpha = 0.8f)
                        )
                    }

                    Text(
                        text = "•",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.6f)
                    )

                    Text(
                        text = stringResource(R.string.series_seasons_format, series.totalSeasons, if (series.totalSeasons > 1) "s" else ""),
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.8f)
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Description
                series.content.description?.let { description ->
                    Text(
                        text = description,
                        style = MaterialTheme.typography.bodySmall.copy(
                            lineHeight = 16.sp
                        ),
                        color = Color.White.copy(alpha = 0.9f),
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Action Buttons
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Play Button (principal)
                    Button(
                        onClick = onPlayFirstEpisode,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color.White,
                            contentColor = Color.Black
                        ),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier
                            .height(44.dp)
                            .googleTVFocusable(
                                scaleType = GoogleTVFocus.FocusScaleType.Small,
                                borderRadius = 8.dp,
                                elevation = true,
                                glow = true,
                                shimmer = false
                            ),
                        contentPadding = PaddingValues(horizontal = 18.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.PlayArrow,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = stringResource(R.string.play_button),
                            style = MaterialTheme.typography.labelMedium.copy(
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 13.sp
                            )
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SeasonSelector(
    seasons: List<Season>,
    selectedSeason: Season?,
    onSeasonSelected: (Season) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier) {
        Text(
            text = stringResource(R.string.seasons_title),
            style = MaterialTheme.typography.titleMedium.copy(
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold
            ),
            color = TextPrimary
        )

        Spacer(modifier = Modifier.height(12.dp))

        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            contentPadding = PaddingValues(horizontal = 0.dp)
        ) {
            items(seasons) { season ->
                SeasonChip(
                    season = season,
                    isSelected = selectedSeason?.id == season.id,
                    onClick = { onSeasonSelected(season) }
                )
            }
        }
    }
}

@Composable
private fun SeasonChip(
    season: Season,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    var focused by remember { mutableStateOf(false) }

    FilterChip(
        selected = isSelected,
        onClick = onClick,
        label = {
            Text(
                text = stringResource(R.string.series_season_abbr, season.seasonNumber),
                style = MaterialTheme.typography.bodyMedium.copy(
                    fontSize = 14.sp,
                    fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Medium
                )
            )
        },
        colors = FilterChipDefaults.filterChipColors(
            containerColor = Surface2,
            labelColor = OnSurface,
            selectedContainerColor = Primary,
            selectedLabelColor = OnPrimary
        ),
        border = FilterChipDefaults.filterChipBorder(
            enabled = true,
            selected = isSelected,
            borderColor = if (focused) Primary else SurfaceVariant,
            selectedBorderColor = Primary,
            borderWidth = if (isSelected || focused) 2.dp else 1.dp
        ),
        modifier = Modifier
            .height(36.dp)
            .onFocusChanged { focused = it.isFocused }
    )
}

@Composable
private fun EpisodeCard(
    episode: Episode,
    seasonNumber: Int,
    onPlayEpisode: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        onClick = onPlayEpisode,
        modifier = modifier
            .fillMaxWidth()
            .height(100.dp),
        colors = CardDefaults.cardColors(
            containerColor = SurfaceSecondary
        ),
        shape = RoundedCornerShape(8.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Episode Thumbnail
            Box(
                modifier = Modifier
                    .width(140.dp)
                    .height(76.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(Color.Black.copy(alpha = 0.1f))
            ) {
                AsyncImage(
                    model = ImageRequest.Builder(LocalContext.current)
                        .data(episode.imageUrl)
                        .crossfade(true)
                        .build(),
                    contentDescription = episode.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )

                // Play overlay
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black.copy(alpha = 0.3f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.PlayArrow,
                        contentDescription = stringResource(R.string.play_button),
                        tint = Color.White,
                        modifier = Modifier.size(32.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            // Episode Info
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                // Episode Number and Title
                Text(
                    text = stringResource(R.string.series_episode_detail_format, seasonNumber, episode.episodeNumber, episode.title),
                    style = MaterialTheme.typography.titleSmall.copy(
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold
                    ),
                    color = TextPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                // Episode info
                Text(
                    text = stringResource(R.string.series_episode_label, episode.episodeNumber),
                    style = MaterialTheme.typography.bodySmall.copy(
                        fontSize = 11.sp
                    ),
                    color = TextSecondary
                )

                // Description
                episode.description?.let { description ->
                    Text(
                        text = description,
                        style = MaterialTheme.typography.bodySmall.copy(
                            fontSize = 12.sp,
                            lineHeight = 16.sp
                        ),
                        color = TextSecondary,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            // More options icon
            IconButton(
                onClick = { 
                    // Episode options can include: Download, Add to Watchlist, Share
                    // These features require backend support
                },
                modifier = Modifier.size(32.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.MoreVert,
                    contentDescription = stringResource(R.string.common_more_options),
                    tint = TextSecondary,
                    modifier = Modifier.size(16.dp)
                )
            }
        }
    }
}
