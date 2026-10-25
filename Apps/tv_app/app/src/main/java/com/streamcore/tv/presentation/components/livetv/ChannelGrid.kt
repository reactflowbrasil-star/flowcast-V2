package com.streamcore.tv.presentation.components.livetv

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.streamcore.tv.domain.model.ContentItem
import com.streamcore.tv.domain.model.EPGData
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R

/**
 * Channel Grid Layout
 * 
 * Modern grid layout for displaying channels with categories
 * following Google TV design patterns
 */
@Composable
fun ChannelGrid(
    channels: List<ContentItem>,
    onChannelClick: (ContentItem) -> Unit,
    modifier: Modifier = Modifier,
    gridType: GridType = GridType.CATEGORIES,
    showProgramInfo: Boolean = true,
    epgData: Map<String, EPGData> = emptyMap()
) {
    when (gridType) {
        GridType.CATEGORIES -> {
            ChannelCategoriesGrid(
                channels = channels,
                onChannelClick = onChannelClick,
                modifier = modifier,
                showProgramInfo = showProgramInfo,
                epgData = epgData
            )
        }
        GridType.COMPACT -> {
            ChannelCompactGrid(
                channels = channels,
                onChannelClick = onChannelClick,
                modifier = modifier
            )
        }
        GridType.LARGE -> {
            ChannelLargeGrid(
                channels = channels,
                onChannelClick = onChannelClick,
                modifier = modifier,
                showProgramInfo = showProgramInfo,
                epgData = epgData
            )
        }
    }
}

/**
 * Categories-based grid layout (like Pluto TV)
 */
@Composable
private fun ChannelCategoriesGrid(
    channels: List<ContentItem>,
    onChannelClick: (ContentItem) -> Unit,
    modifier: Modifier = Modifier,
    showProgramInfo: Boolean = true,
    epgData: Map<String, EPGData> = emptyMap()
) {
    val moviesCategoryText = stringResource(R.string.category_movies)
    val categories = remember(channels, moviesCategoryText) {
        ChannelCategories.categorizeChannels(channels, moviesCategoryText)
    }
    
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(24.dp),
        contentPadding = PaddingValues(vertical = 24.dp)
    ) {
        items(
            items = categories,
            key = { it.name }
        ) { category ->
            if (category.channels.isNotEmpty()) {
                ChannelCategoryRow(
                    categoryTitle = category.name,
                    channels = category.channels,
                    onChannelClick = onChannelClick,
                    onSeeAllClick = if (category.channels.size > 6) {
                        { 
                            // Category detail navigation handled by parent screen
                            // All channels in category shown when expanded
                        }
                    } else null,
                    showProgramInfo = showProgramInfo,
                    epgData = epgData
                )
            }
        }
    }
}

/**
 * Compact grid layout for all channels
 */
@Composable
private fun ChannelCompactGrid(
    channels: List<ContentItem>,
    onChannelClick: (ContentItem) -> Unit,
    modifier: Modifier = Modifier
) {
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = 120.dp),
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(24.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        items(
            items = channels,
            key = { it.id }
        ) { channel ->
            GoogleTVChannelCardCompact(
                channel = channel,
                onClick = { onChannelClick(channel) }
            )
        }
    }
}

/**
 * Large grid layout for featured channels
 */
@Composable
private fun ChannelLargeGrid(
    channels: List<ContentItem>,
    onChannelClick: (ContentItem) -> Unit,
    modifier: Modifier = Modifier,
    showProgramInfo: Boolean = true,
    epgData: Map<String, EPGData> = emptyMap()
) {
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = 280.dp),
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(24.dp),
        horizontalArrangement = Arrangement.spacedBy(20.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp)
    ) {
        items(
            items = channels,
            key = { it.id }
        ) { channel ->
            // Get EPG data for this channel
            val channelEpg = epgData[channel.id.toString()]
            val currentProgram = if (showProgramInfo && channelEpg != null) {
                channelEpg.programs.firstOrNull { it.isLive }?.title
                    ?: channelEpg.programs.firstOrNull()?.title
            } else null
            val nextProgram = if (showProgramInfo && channelEpg != null) {
                val programs = channelEpg.programs
                val currentIndex = programs.indexOfFirst { it.isLive }
                if (currentIndex >= 0 && currentIndex < programs.size - 1) {
                    programs[currentIndex + 1].title
                } else if (programs.size > 1) {
                    programs[1].title
                } else null
            } else null
            val isLive = channelEpg?.programs?.any { it.isLive } ?: false
            
            GoogleTVChannelCard(
                channel = channel,
                currentProgram = currentProgram,
                nextProgram = nextProgram,
                isLive = isLive,
                onClick = { onChannelClick(channel) }
            )
        }
    }
}

/**
 * Grid Type Enum
 */
enum class GridType {
    CATEGORIES,  // Categories with horizontal rows (like Pluto TV)
    COMPACT,     // Compact grid with small cards
    LARGE        // Large grid with detailed cards
}

/**
 * Channel Grid Header with view options
 */
@Composable
fun ChannelGridHeader(
    title: String,
    currentGridType: GridType,
    onGridTypeChange: (GridType) -> Unit,
    channelCount: Int,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp, vertical = 16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text(
                text = title,
                color = Color.White,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = stringResource(id = R.string.channels_available, channelCount),
                color = Color(0xFFB0BEC5),
                fontSize = 14.sp
            )
        }
        
        // Grid Type Selector
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            GridTypeButton(
                isSelected = currentGridType == GridType.CATEGORIES,
                onClick = { onGridTypeChange(GridType.CATEGORIES) },
                text = stringResource(id = R.string.label_view_categories)
            )
            GridTypeButton(
                isSelected = currentGridType == GridType.COMPACT,
                onClick = { onGridTypeChange(GridType.COMPACT) },
                text = stringResource(id = R.string.label_view_compact)
            )
            GridTypeButton(
                isSelected = currentGridType == GridType.LARGE,
                onClick = { onGridTypeChange(GridType.LARGE) },
                text = stringResource(id = R.string.label_view_large)
            )
        }
    }
}

@Composable
private fun GridTypeButton(
    isSelected: Boolean,
    onClick: () -> Unit,
    text: String
) {
    Button(
        onClick = onClick,
        colors = ButtonDefaults.buttonColors(
            containerColor = if (isSelected) Color(0xFF4285F4) else Color(0xFF1A1A2E),
            contentColor = if (isSelected) Color.White else Color(0xFFB0BEC5)
        ),
        modifier = Modifier.height(36.dp)
    ) {
        Text(
            text = text,
            fontSize = 12.sp,
            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
        )
    }
}
