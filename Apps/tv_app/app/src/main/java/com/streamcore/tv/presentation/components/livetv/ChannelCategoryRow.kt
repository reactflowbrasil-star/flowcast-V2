package com.streamcore.tv.presentation.components.livetv

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
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
import java.util.Locale
/**
 * Channel Category Row Component
 * 
 * Displays a horizontal row of channels for a specific category
 * following Google TV design patterns
 */
@Composable
fun ChannelCategoryRow(
    categoryTitle: String,
    channels: List<ContentItem>,
    onChannelClick: (ContentItem) -> Unit,
    onSeeAllClick: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
    showCompactCards: Boolean = false,
    showProgramInfo: Boolean = true,
    epgData: Map<String, EPGData> = emptyMap()
) {
    val listState = rememberLazyListState()
    
    Column(
        modifier = modifier.fillMaxWidth()
    ) {
        // Category Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = categoryTitle,
                color = Color.White,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold
            )
            
            if (onSeeAllClick != null && channels.size > 6) {
                TextButton(
                    onClick = onSeeAllClick,
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = Color(0xFF4285F4)
                    )
                ) {
                    Text(
                        text = stringResource(id = R.string.quick_access_see_all),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
        
        // Channels Row
        if (channels.isNotEmpty()) {
            LazyRow(
                state = listState,
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                contentPadding = PaddingValues(horizontal = 24.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                items(channels) { channel ->
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
                    
                    if (showCompactCards) {
                        GoogleTVChannelCardCompact(
                            channel = channel,
                            onClick = { onChannelClick(channel) }
                        )
                    } else {
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
        } else {
            // Empty State
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(120.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = stringResource(id = R.string.category_no_channels),
                    color = Color(0xFFB0BEC5),
                    fontSize = 14.sp
                )
            }
        }
    }
}

/**
 * Channel Categories Data Class
 */
data class ChannelCategory(
    val id: String,
    val name: String,
    val channels: List<ContentItem>,
    val icon: String? = null
)

/**
 * Predefined Channel Categories
 */
object ChannelCategories {
    @Composable
    fun getDefaultCategories(): List<String> = listOf(
        "Recently Watched",
        "News",
        "Sports",
        "Entertainment",
        stringResource(R.string.category_movies),
        "Series",
        "Documentaries",
        "Music",
        "Kids",
        "International"
    )
    
    fun categorizeChannels(
        channels: List<ContentItem>,
        moviesCategoryText: String
    ): List<ChannelCategory> {
        val categories = mutableListOf<ChannelCategory>()

        categories.add(
            ChannelCategory(
                id = "recent",
                name = "Recently Watched",
                channels = emptyList()
            )
        )

        categories.add(
            ChannelCategory(
                id = "all",
                name = "All channels",
                channels = channels
            )
        )

        val groupedByCategory = channels.groupBy { item ->
            item.channelCategory?.takeIf { it.isNotBlank() } ?: "Other"
        }

        groupedByCategory.entries
            .sortedBy { it.key.lowercase(Locale.ROOT) }
            .forEach { (name, items) ->
                val slug = name.lowercase(Locale.ROOT)
                    .replace("[^a-z0-9]+".toRegex(), "-")
                    .trim('-')
                    .ifEmpty { "category" }

                categories.add(
                    ChannelCategory(
                        id = slug,
                        name = name,
                        channels = items.sortedBy { it.title.lowercase(Locale.ROOT) }
                    )
                )
            }

        if (categories.size == 2) {
            val moviesChannels = channels.filter { channel ->
                channel.title.lowercase(Locale.ROOT).contains(moviesCategoryText.lowercase(Locale.ROOT))
            }
            if (moviesChannels.isNotEmpty()) {
                categories.add(
                    ChannelCategory(
                        id = "movies",
                        name = moviesCategoryText,
                        channels = moviesChannels
                    )
                )
            }
        }

        return categories
    }
}
