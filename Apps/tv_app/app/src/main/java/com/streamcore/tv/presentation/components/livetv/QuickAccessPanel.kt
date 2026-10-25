package com.streamcore.tv.presentation.components.livetv

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Help
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.streamcore.tv.domain.model.ContentItem
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R

/**
 * Quick Access Panel Component
 * 
 * Provides quick access to favorite channels, recently watched,
 * and trending content following Google TV design patterns
 */
@Composable
fun QuickAccessPanel(
    favoriteChannels: List<ContentItem>,
    recentChannels: List<ContentItem>,
    trendingChannels: List<ContentItem>,
    onChannelClick: (ContentItem) -> Unit,
    onSeeAllFavorites: () -> Unit,
    onSeeAllRecent: () -> Unit,
    onSeeAllTrending: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(Color(0xFF0F0F23))
            .padding(vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp)
    ) {
        // Quick Access Header with enhanced features
        QuickAccessHeader()

        // Quick Navigation Numbers
        QuickNavigationNumbers(
            onNumberClick = { _ ->
                // Handle direct channel navigation
            }
        )
        
        // Favorites Section
        if (favoriteChannels.isNotEmpty()) {
            QuickAccessSection(
                title = stringResource(R.string.quick_access_favorites),
                icon = Icons.Default.Favorite,
                iconColor = Color(0xFFFF4444),
                channels = favoriteChannels,
                onChannelClick = onChannelClick,
                onSeeAll = onSeeAllFavorites
            )
        }
        
        // Recently Watched Section
        if (recentChannels.isNotEmpty()) {
            QuickAccessSection(
                title = stringResource(R.string.quick_access_recently_watched),
                icon = Icons.Default.History,
                iconColor = Color(0xFF4285F4),
                channels = recentChannels,
                onChannelClick = onChannelClick,
                onSeeAll = onSeeAllRecent
            )
        }
        
        // Trending Section
        if (trendingChannels.isNotEmpty()) {
            QuickAccessSection(
                title = stringResource(R.string.quick_access_trending),
                icon = Icons.AutoMirrored.Filled.TrendingUp,
                iconColor = Color(0xFF34A853),
                channels = trendingChannels,
                onChannelClick = onChannelClick,
                onSeeAll = onSeeAllTrending
            )
        }
        
        // Quick Actions
        QuickActionsRow()
    }
}

@Composable
private fun QuickAccessHeader() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Icon(
            imageVector = Icons.Default.Star,
            contentDescription = null,
            tint = Color(0xFF4285F4),
            modifier = Modifier.size(24.dp)
        )
        
        Text(
            text = stringResource(R.string.quick_access),
            color = Color.White,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun QuickAccessSection(
    title: String,
    icon: ImageVector,
    iconColor: Color,
    channels: List<ContentItem>,
    onChannelClick: (ContentItem) -> Unit,
    onSeeAll: () -> Unit
) {
    val visibleChannels = remember(channels) { channels.take(10) }

    Column(
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Section Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = iconColor,
                    modifier = Modifier.size(20.dp)
                )
                
                Text(
                    text = title,
                    color = Color.White,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
            
            if (channels.size > 5) {
                TextButton(
                    onClick = onSeeAll,
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = Color(0xFF4285F4)
                    )
                ) {
                    Text(
                        text = stringResource(R.string.quick_access_see_all),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
        
        // Channels Row
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(horizontal = 24.dp)
        ) {
            items(visibleChannels, key = { it.id }) { channel ->
                CompactChannelPreview(
                    channel = channel,
                    onClick = { onChannelClick(channel) }
                )
            }
        }
    }
}

@Composable
private fun QuickActionsRow() {
    Column(
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            text = stringResource(R.string.quick_access_actions_title),
            color = Color.White,
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 24.dp)
        )
        
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(horizontal = 24.dp)
        ) {
            items(QUICK_ACTIONS, key = { it.id }) { action ->
                QuickActionCard(
                    action = action,
                    onClick = { 
                        // Quick actions are handled at parent level via navigation
                        // EPG, Search, Settings, and Help can be navigated from main menu
                    }
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun QuickActionCard(
    action: QuickAction,
    onClick: () -> Unit
) {
    Card(
        onClick = onClick,
        modifier = Modifier.size(width = 140.dp, height = 80.dp),
        colors = CardDefaults.cardColors(
            containerColor = Color(0xFF1A1A2E)
        ),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = action.icon,
                contentDescription = stringResource(action.titleRes),
                tint = action.color,
                modifier = Modifier.size(24.dp)
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Text(
                text = stringResource(action.titleRes),
                color = Color.White,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium
            )
        }
    }
}

/**
 * Quick Action Data Class
 */
data class QuickAction(
    val id: String,
    val titleRes: Int,
    val icon: ImageVector,
    val color: Color
)

/**
 * Get predefined quick actions
 */
private fun getQuickActions(): List<QuickAction> = listOf(
    QuickAction(
        id = "epg",
        titleRes = R.string.quick_action_guide_tv,
        icon = Icons.Default.Tv,
        color = Color(0xFF4285F4)
    ),
    QuickAction(
        id = "search",
        titleRes = R.string.quick_action_search,
        icon = Icons.Default.Search,
        color = Color(0xFF34A853)
    ),
    QuickAction(
        id = "settings",
        titleRes = R.string.quick_action_settings,
        icon = Icons.Default.Settings,
        color = Color(0xFFFF6B35)
    ),
    QuickAction(
        id = "help",
        titleRes = R.string.quick_action_help,
        icon = Icons.AutoMirrored.Filled.Help,
        color = Color(0xFF9C27B0)
    )
)

/**
 * Empty Quick Access State
 */
@Composable
fun EmptyQuickAccessPanel(
    onSetupFavorites: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Icon(
            imageVector = Icons.Default.Star,
            contentDescription = null,
            tint = Color(0xFFB0BEC5),
            modifier = Modifier.size(48.dp)
        )
        
        Text(
            text = stringResource(R.string.quick_access_customize_experience),
            color = Color.White,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold
        )
        
        Text(
            text = stringResource(R.string.quick_access_description),
            color = Color(0xFFB0BEC5),
            fontSize = 14.sp
        )
        
        Button(
            onClick = onSetupFavorites,
            colors = ButtonDefaults.buttonColors(
                containerColor = Color(0xFF4285F4)
            ),
            shape = RoundedCornerShape(12.dp)
        ) {
            Text(
                text = stringResource(R.string.quick_access_setup_favorites),
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium
            )
        }
    }
}

/**
 * Quick Navigation Numbers Component
 */
@Composable
fun QuickNavigationNumbers(
    onNumberClick: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.fillMaxWidth()
    ) {
        Text(
            text = stringResource(R.string.quick_access),
            color = Color.White,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp)
        )

        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(horizontal = 24.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            items(QUICK_NAV_NUMBERS, key = { it }) { number ->
                QuickNumberButton(
                    number = number,
                    onClick = { onNumberClick(number) }
                )
            }
        }
    }
}

private val QUICK_NAV_NUMBERS = listOf("1", "2", "3", "4", "5", "24", "26", "34")
private val QUICK_ACTIONS = getQuickActions()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun QuickNumberButton(
    number: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        onClick = onClick,
        modifier = modifier.size(48.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = Color(0xFF16213E)
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = number,
                color = Color.White,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold
            )
        }
    }
}
