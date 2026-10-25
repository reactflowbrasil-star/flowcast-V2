package com.streamcore.tv.presentation.screens.detail

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.streamcore.tv.domain.model.ContentDetails
import com.streamcore.tv.domain.model.ContentType
import com.streamcore.tv.domain.model.Season
import com.streamcore.tv.domain.model.UiState
import com.streamcore.tv.presentation.components.ErrorScreen
import com.streamcore.tv.presentation.components.LoadingIndicator
import com.streamcore.tv.presentation.theme.*

/**
 * Detail screen showing comprehensive information about a movie/content
 * Based on StreamFlix design pattern
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DetailScreen(
    contentId: String,
    onNavigateBack: () -> Unit,
    onNavigateToPlayer: (contentId: String, streamLinkId: Long?) -> Unit,
    onNavigateToEpisodePlayer: (String) -> Unit = { onNavigateToPlayer(it, null) },
    viewModel: DetailViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    
    // Load content details when screen opens
    LaunchedEffect(contentId) {
        viewModel.loadContentDetails(contentId)
    }
    
    Box(modifier = Modifier.fillMaxSize()) {
        when (val contentState = uiState.contentState) {
            is UiState.Loading -> {
                LoadingIndicator()
            }
            
            is UiState.Success -> {
                DetailContent(
                    content = contentState.data,
                    onNavigateBack = onNavigateBack,
                    onPlayClick = {
                        if (contentState.data.type == ContentType.SERIES) {
                            onNavigateToEpisodePlayer(contentState.data.id)
                        } else if (uiState.hasMultipleStreams) {
                            viewModel.showStreamPicker()
                        } else {
                            onNavigateToPlayer(contentState.data.id, null)
                        }
                    },
                    onNavigateToEpisodePlayer = onNavigateToEpisodePlayer
                )
            }
            
            is UiState.Error -> {
                ErrorScreen(
                    message = contentState.message,
                    onRetry = { viewModel.loadContentDetails(contentId) }
                )
            }
        }
    }

    // Stream link version picker dialog
    if (uiState.showStreamPicker) {
        StreamLinkPickerDialog(
            streams = uiState.availableStreams,
            onStreamSelected = { selected ->
                viewModel.hideStreamPicker()
                onNavigateToPlayer(contentId, selected.id)
            },
            onDismiss = { viewModel.hideStreamPicker() }
        )
    }
}

@Composable
private fun TvPillChip(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector? = null,
    containerColor: Color = Color.White.copy(alpha = 0.08f),
    contentColor: Color = Color.White
) {
    Surface(
        color = containerColor,
        contentColor = contentColor,
        shape = RoundedCornerShape(20.dp),
        tonalElevation = 0.dp,
        shadowElevation = 0.dp
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
        ) {
            icon?.let {
                Icon(imageVector = it, contentDescription = null, modifier = Modifier.size(16.dp))
            }
            Text(text = label, color = contentColor, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
        }
    }
}
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DetailContent(
    content: ContentDetails,
    onNavigateBack: () -> Unit,
    onPlayClick: () -> Unit,
    onNavigateToEpisodePlayer: (String) -> Unit
) {
    val context = LocalContext.current
    
    Box(modifier = Modifier.fillMaxSize()) {
        // Background with multiple layers for depth

        // Primary background - backdrop image with blur
        content.backdropUrl?.let { backdropUrl ->
            AsyncImage(
                model = backdropUrl,
                contentDescription = null,
                modifier = Modifier
                    .fillMaxSize()
                    .blur(radius = 20.dp),
                contentScale = ContentScale.Crop,
                alpha = 0.6f
            )
        }

        // Fallback gradient background if no backdrop
        if (content.backdropUrl == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.radialGradient(
                            colors = listOf(
                                Primary.copy(alpha = 0.3f),
                                Color(0xFF1A1A2E),
                                Color.Black
                            ),
                            radius = 1000f
                        )
                    )
            )
        }

        // Enhanced overlay with improved text readability
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color.Black.copy(alpha = 0.2f),
                            Color.Black.copy(alpha = 0.6f),
                            Color.Black.copy(alpha = 0.8f),
                            Color.Black.copy(alpha = 0.9f)
                        )
                    )
                )
        )

        // Enhanced side gradient for better content readability
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.horizontalGradient(
                        colors = listOf(
                            Color.Black.copy(alpha = 0.85f),
                            Color.Black.copy(alpha = 0.3f),
                            Color.Black.copy(alpha = 0.6f),
                            Color.Black.copy(alpha = 0.2f)
                        ),
                        startX = 0f,
                        endX = 1400f
                    )
                )
        )

        // Decorative elements for visual interest

        // Top-right accent
        Box(
            modifier = Modifier
                .size(300.dp)
                .align(Alignment.TopEnd)
                .offset(x = 100.dp, y = (-100).dp)
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            Primary.copy(alpha = 0.15f),
                            Color.Transparent
                        ),
                        radius = 300f
                    ),
                    CircleShape
                )
        )

        // Bottom-left accent
        Box(
            modifier = Modifier
                .size(400.dp)
                .align(Alignment.BottomStart)
                .offset(x = (-150).dp, y = 150.dp)
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            Secondary.copy(alpha = 0.1f),
                            Color.Transparent
                        ),
                        radius = 400f
                    ),
                    CircleShape
                )
        )

        // Center accent for depth
        Box(
            modifier = Modifier
                .size(600.dp)
                .align(Alignment.Center)
                .offset(x = 200.dp, y = 0.dp)
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            Primary.copy(alpha = 0.08f),
                            Color.Transparent
                        ),
                        radius = 600f
                    ),
                    CircleShape
                )
        )
        
        Column(modifier = Modifier.fillMaxSize()) {
            // Top App Bar
            TopAppBar(
                title = { },
                navigationIcon = {
                    var backFocused by remember { mutableStateOf(false) }
                    IconButton(
                        onClick = onNavigateBack,
                        modifier = Modifier
                            .size(48.dp)
                            .onFocusChanged { backFocused = it.isFocused }
                            .then(
                                if (backFocused) {
                                    Modifier
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(Color.Cyan.copy(alpha = 0.18f), RoundedCornerShape(8.dp))
                                } else Modifier
                            )
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.detail_back_description),
                            tint = if (backFocused) Color.Black else Color.White
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.Transparent
                )
            )
            
            // Tabs and content switch (Overview / Seasons for series)
            var selectedTab by remember { mutableIntStateOf(0) }
            if (content.type == ContentType.SERIES && !content.seasons.isNullOrEmpty()) {
                TabRow(
                    selectedTabIndex = selectedTab,
                    containerColor = Color.Transparent,
                    contentColor = Color.White,
                    modifier = Modifier.padding(horizontal = 80.dp)
                ) {
                    Tab(
                        selected = selectedTab == 0,
                        onClick = { selectedTab = 0 },
                        text = { Text(text = stringResource(R.string.detail_overview), color = Color.White) }
                    )
                    Tab(
                        selected = selectedTab == 1,
                        onClick = { selectedTab = 1 },
                        text = { Text(text = stringResource(R.string.content_seasons_label), color = Color.White) }
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
            }

            // Main content - Enhanced layout
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 80.dp)
                    .verticalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(50.dp),
                verticalAlignment = Alignment.Top
            ) {
                // Poster image
                AsyncImage(
                    model = content.imageUrl,
                    contentDescription = content.title,
                    modifier = Modifier
                        .width(250.dp)
                        .aspectRatio(2f / 3f)
                        .clip(RoundedCornerShape(12.dp)),
                    contentScale = ContentScale.Crop
                )
                
                // Content information - Enhanced spacing
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .padding(top = 60.dp),
                    verticalArrangement = Arrangement.spacedBy(20.dp)
                ) {
                    // Title - Enhanced typography
                    Text(
                        text = content.title,
                        style = MaterialTheme.typography.displayLarge,
                        fontWeight = FontWeight.ExtraBold,
                        color = Color.White,
                        fontSize = 48.sp,
                        lineHeight = 56.sp,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis
                    )
                    
                    // Metadata row (chips: rating, quality, year, duration)
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Rating
                        content.rating?.let { rating ->
                            TvPillChip(
                                icon = Icons.Default.Star,
                                label = String.format(java.util.Locale.getDefault(), "%.1f", rating),
                                containerColor = Color(0xFFFFD700).copy(alpha = 0.2f),
                                contentColor = Color(0xFFFFD700)
                            )
                        }

                        // Quality badge
                        TvPillChip(
                            icon = Icons.Default.Hd,
                            label = stringResource(R.string.content_hd_label),
                            containerColor = Primary.copy(alpha = 0.25f),
                            contentColor = Color.White
                        )

                        // Year
                        content.year?.let { year ->
                            TvPillChip(
                                icon = Icons.Default.CalendarToday,
                                label = year.toString()
                            )
                        }

                        // Duration
                        content.duration?.let { duration ->
                            val hours = duration / 3600
                            val minutes = (duration % 3600) / 60
                            TvPillChip(
                                icon = Icons.Default.Schedule,
                                label = if (hours > 0) "${hours}h ${minutes}m" else "${minutes}m"
                            )
                        }
                    }
                    
                    // Genres as chips (max 4)
                    if (content.genres.isNotEmpty()) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            content.genres.take(4).forEach { g ->
                                TvPillChip(label = g, containerColor = Color.White.copy(alpha = 0.08f))
                            }
                        }
                    }
                    
                    // Description - Enhanced readability (Overview tab)
                    if (content.type != ContentType.SERIES || selectedTab == 0) {
                        Text(
                            text = content.description ?: stringResource(R.string.detail_no_description),
                            color = Color.White.copy(alpha = 0.95f),
                            style = MaterialTheme.typography.bodyLarge,
                            fontSize = 16.sp,
                            lineHeight = 26.sp,
                            fontWeight = FontWeight.Normal,
                            maxLines = 8,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    // Action buttons
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        var playFocused by remember { mutableStateOf(false) }
                        // Watch Now button - Enhanced design
                        Button(
                            onClick = onPlayClick,
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Primary,
                                contentColor = Color.White
                            ),
                            shape = RoundedCornerShape(8.dp),
                            elevation = ButtonDefaults.buttonElevation(
                                defaultElevation = 4.dp,
                                pressedElevation = 2.dp
                            ),
                            modifier = Modifier
                                .height(52.dp)
                                .widthIn(min = 140.dp)
                                .onFocusChanged { playFocused = it.isFocused }
                                .then(
                                    if (playFocused) Modifier.border(2.dp, Color.Cyan, RoundedCornerShape(8.dp)) else Modifier
                                )
                        ) {
                            Icon(
                                imageVector = Icons.Default.PlayArrow,
                                contentDescription = null,
                                modifier = Modifier.size(22.dp)
                            )
                            Spacer(modifier = Modifier.width(10.dp))
                            Text(
                                text = stringResource(R.string.detail_watch_now),
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 16.sp
                            )
                        }
                        
                        // Trailer button - Enhanced design (only for series)
                        if (!content.trailer.isNullOrBlank() && content.type == ContentType.SERIES) {
                            var trailerFocused by remember { mutableStateOf(false) }
                            OutlinedButton(
                                onClick = {
                                    // Open trailer in YouTube app or web browser
                                    content.trailer?.let { trailerUrl ->
                                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(trailerUrl))
                                        context.startActivity(intent)
                                    }
                                },
                                colors = ButtonDefaults.outlinedButtonColors(
                                    contentColor = Color.White,
                                    containerColor = Color.White.copy(alpha = if (trailerFocused) 0.18f else 0.1f)
                                ),
                                border = BorderStroke(2.dp, if (trailerFocused) Color.Cyan else Color.White.copy(alpha = 0.5f)),
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier
                                    .height(52.dp)
                                    .widthIn(min = 120.dp)
                                    .onFocusChanged { trailerFocused = it.isFocused }
                            ) {
                                Icon(
                                    imageVector = Icons.Default.PlayCircleOutline,
                                    contentDescription = null,
                                    modifier = Modifier.size(22.dp)
                                )
                                Spacer(modifier = Modifier.width(10.dp))
                                Text(
                                    text = stringResource(R.string.detail_trailer),
                                    fontWeight = FontWeight.Medium,
                                    fontSize = 16.sp
                                )
                            }
                        }
                        

                    }

                    // Seasons section (Seasons tab)
                    if (content.type == ContentType.SERIES && !content.seasons.isNullOrEmpty() && selectedTab == 1) {
                        Spacer(modifier = Modifier.height(24.dp))
                        SeasonsSection(
                            seasons = content.seasons,
                            onSeasonClick = { season ->
                                // Navigate to episode player with first episode of selected season
                                season.episodes.firstOrNull()?.let { firstEpisode ->
                                    onNavigateToEpisodePlayer(content.id)
                                }
                            }
                        )
                    }
                }
            }
        }
    }
}

/**
 * Seasons section component for series
 */
@Composable
private fun SeasonsSection(
    seasons: List<Season>,
    onSeasonClick: (Season) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier) {
        // Section title
        Text(
            text = stringResource(R.string.content_seasons_label),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = Color.White,
            modifier = Modifier.padding(bottom = 16.dp)
        )

        // Seasons horizontal list
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            contentPadding = PaddingValues(end = 16.dp)
        ) {
            items(seasons) { season ->
                SeasonCard(
                    season = season,
                    onClick = { onSeasonClick(season) }
                )
            }
        }
    }
}

/**
 * Individual season card component
 */
@Composable
private fun SeasonCard(
    season: Season,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .width(200.dp)
            .clickable { onClick() }
            .background(
                Color.White.copy(alpha = 0.1f),
                RoundedCornerShape(12.dp)
            )
            .padding(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Season poster or placeholder
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(2f / 1f)
                .background(
                    Color.Gray.copy(alpha = 0.3f),
                    RoundedCornerShape(8.dp)
                ),
            contentAlignment = Alignment.Center
        ) {
            // Season image if available
            season.episodes.firstOrNull()?.imageUrl?.let { imageUrl ->
                AsyncImage(
                    model = imageUrl,
                    contentDescription = stringResource(R.string.detail_season_content_description, season.seasonNumber),
                    modifier = Modifier
                        .fillMaxSize()
                        .clip(RoundedCornerShape(8.dp)),
                    contentScale = ContentScale.Crop
                )
            } ?: run {
                // Placeholder with season number
                Text(
                    text = "${stringResource(R.string.detail_season_prefix)}${season.seasonNumber}",
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    color = Color.White.copy(alpha = 0.7f)
                )
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Season title
        Text(
            text = "${stringResource(R.string.content_seasons_label)} ${stringResource(R.string.detail_season_prefix)}${season.seasonNumber}",
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Medium,
            color = Color.White,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )

        // Episode count
        Text(
            text = stringResource(R.string.content_episodes_count, season.episodes.size),
            style = MaterialTheme.typography.bodySmall,
            color = Color.White.copy(alpha = 0.7f)
        )
    }
}

/**
 * Stream link picker dialog for TV with spatial navigation
 */
@Composable
private fun StreamLinkPickerDialog(
    streams: List<StreamLinkInfo>,
    onStreamSelected: (StreamLinkInfo) -> Unit,
    onDismiss: () -> Unit
) {
    androidx.compose.ui.window.Dialog(
        onDismissRequest = onDismiss,
        properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth(0.5f)
                .clip(RoundedCornerShape(20.dp)),
            color = Color(0xFF1C1C2E),
            tonalElevation = 8.dp,
            shadowElevation = 24.dp
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Header
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.VideoLibrary,
                        contentDescription = null,
                        tint = Primary,
                        modifier = Modifier.size(28.dp)
                    )
                    Column {
                        Text(
                            text = stringResource(R.string.detail_select_stream_title),
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                        Text(
                            text = stringResource(R.string.detail_select_stream_subtitle),
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.White.copy(alpha = 0.6f)
                        )
                    }
                }

                HorizontalDivider(color = Color.White.copy(alpha = 0.1f))

                // Stream options
                streams.forEach { stream ->
                    var isFocused by remember { mutableStateOf(false) }
                    val bgColor = when {
                        isFocused -> Primary.copy(alpha = 0.25f)
                        stream.isDefault -> Color.White.copy(alpha = 0.08f)
                        else -> Color.White.copy(alpha = 0.04f)
                    }
                    val borderColor = when {
                        isFocused -> Color.Cyan
                        stream.isDefault -> Primary.copy(alpha = 0.4f)
                        else -> Color.Transparent
                    }

                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .border(
                                width = if (isFocused || stream.isDefault) 2.dp else 0.dp,
                                color = borderColor,
                                shape = RoundedCornerShape(14.dp)
                            )
                            .onFocusChanged { isFocused = it.isFocused }
                            .clickable { onStreamSelected(stream) },
                        color = bgColor,
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 14.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.weight(1f)
                            ) {
                                // Play icon
                                Icon(
                                    imageVector = Icons.Default.PlayCircleOutline,
                                    contentDescription = null,
                                    tint = if (isFocused) Color.Cyan else Color.White.copy(alpha = 0.6f),
                                    modifier = Modifier.size(24.dp)
                                )

                                // Quality badge
                                stream.quality?.let { q ->
                                    Surface(
                                        shape = RoundedCornerShape(6.dp),
                                        color = Primary.copy(alpha = 0.25f)
                                    ) {
                                        Text(
                                            text = q.uppercase(),
                                            style = MaterialTheme.typography.labelMedium,
                                            fontWeight = FontWeight.Bold,
                                            color = if (isFocused) Color.Cyan else Color.White,
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                        )
                                    }
                                }

                                // Language
                                stream.language?.let { lang ->
                                    Text(
                                        text = lang,
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = Color.White,
                                        fontWeight = FontWeight.Medium
                                    )
                                }

                                // Format badge
                                stream.format?.let { fmt ->
                                    Surface(
                                        shape = RoundedCornerShape(6.dp),
                                        color = Color.White.copy(alpha = 0.08f)
                                    ) {
                                        Text(
                                            text = fmt.uppercase(),
                                            style = MaterialTheme.typography.labelSmall,
                                            color = Color.White.copy(alpha = 0.7f),
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp)
                                        )
                                    }
                                }

                                // DRM badge
                                if (stream.hasDrm) {
                                    Surface(
                                        shape = RoundedCornerShape(6.dp),
                                        color = Color(0xFF4CAF50).copy(alpha = 0.2f)
                                    ) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Lock,
                                                contentDescription = null,
                                                tint = Color(0xFF4CAF50),
                                                modifier = Modifier.size(12.dp)
                                            )
                                            Spacer(Modifier.width(3.dp))
                                            Text(
                                                text = "DRM",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = Color(0xFF4CAF50)
                                            )
                                        }
                                    }
                                }
                            }

                            // Default star & arrow
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                if (stream.isDefault) {
                                    Icon(
                                        imageVector = Icons.Default.Star,
                                        contentDescription = null,
                                        tint = Color(0xFFFFD700),
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                                Icon(
                                    imageVector = Icons.Default.ChevronRight,
                                    contentDescription = null,
                                    tint = if (isFocused) Color.Cyan else Color.White.copy(alpha = 0.4f),
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }
                    }
                }

                // Close button
                var closeFocused by remember { mutableStateOf(false) }
                TextButton(
                    onClick = onDismiss,
                    modifier = Modifier
                        .align(Alignment.End)
                        .onFocusChanged { closeFocused = it.isFocused }
                        .then(
                            if (closeFocused) Modifier.border(1.dp, Color.Cyan, RoundedCornerShape(8.dp))
                            else Modifier
                        )
                ) {
                    Text(
                        text = stringResource(R.string.detail_close),
                        color = if (closeFocused) Color.Cyan else Primary
                    )
                }
            }
        }
    }
}
