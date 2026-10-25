package com.streamcore.tv.presentation.components.livetv

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.streamcore.tv.domain.model.ContentItem

/**
 * Favorites Manager Component
 * 
 * Manages favorite channels with Google TV styling
 */
@Suppress("UNUSED_PARAMETER")
@Composable
fun FavoritesManager(
    favoriteChannels: List<ContentItem>,
    onChannelClick: (ContentItem) -> Unit,
    onRemoveFromFavorites: (ContentItem) -> Unit,
    onAddToFavorites: (ContentItem) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF0F0F23))
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp)
    ) {
        // Header
        FavoritesHeader(
            favoriteCount = favoriteChannels.size
        )
        
        // Favorites List
        if (favoriteChannels.isNotEmpty()) {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(favoriteChannels) { channel ->
                    FavoriteChannelItem(
                        channel = channel,
                        onClick = { onChannelClick(channel) },
                        onRemoveFromFavorites = { onRemoveFromFavorites(channel) }
                    )
                }
            }
        } else {
            EmptyFavoritesState(
                onAddToFavorites = { 
                    // Channel selection is handled through the main Live TV screen
                    // Long-press on any channel to add to favorites
                }
            )
        }
    }
}

@Composable
private fun FavoritesHeader(
    favoriteCount: Int
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Icon(
            imageVector = Icons.Default.Favorite,
            contentDescription = null,
            tint = Color(0xFFFF4444),
            modifier = Modifier.size(28.dp)
        )
        
        Column {
            Text(
                text = stringResource(R.string.live_tv_favorites_title),
                color = Color.White,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold
            )
            
            Text(
                text = stringResource(R.string.live_tv_favorites_count, favoriteCount),
                color = Color(0xFFB0BEC5),
                fontSize = 14.sp
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FavoriteChannelItem(
    channel: ContentItem,
    onClick: () -> Unit,
    onRemoveFromFavorites: () -> Unit
) {
    var isFocused by remember { mutableStateOf(false) }
    
    val scale by animateFloatAsState(
        targetValue = if (isFocused) 1.02f else 1.0f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessMedium
        ),
        label = "scale"
    )

    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .scale(scale),
        colors = CardDefaults.cardColors(
            containerColor = if (isFocused) Color(0xFF1A1A2E) else Color(0xFF16213E)
        ),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.weight(1f)
            ) {
                // Channel Logo Placeholder
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .background(Color(0xFF4285F4), RoundedCornerShape(8.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = channel.title.take(2).uppercase(),
                        color = Color.White,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
                
                Column {
                    Text(
                        text = channel.title,
                        color = Color.White,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    
                    if (channel.description != null) {
                        Text(
                            text = channel.description,
                            color = Color(0xFFB0BEC5),
                            fontSize = 12.sp,
                            maxLines = 1
                        )
                    }
                }
            }
            
            // Remove from Favorites Button
            IconButton(
                onClick = onRemoveFromFavorites,
                colors = IconButtonDefaults.iconButtonColors(
                    contentColor = Color(0xFFFF4444)
                )
            ) {
                Icon(
                    imageVector = Icons.Default.Favorite,
                    contentDescription = stringResource(R.string.favorites_remove_description)
                )
            }
        }
    }
}

@Composable
private fun EmptyFavoritesState(
    onAddToFavorites: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(20.dp)
    ) {
        Icon(
            imageVector = Icons.Default.FavoriteBorder,
            contentDescription = null,
            tint = Color(0xFFB0BEC5),
            modifier = Modifier.size(80.dp)
        )
        
        Text(
            text = stringResource(R.string.live_tv_favorites_empty),
            color = Color.White,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold
        )
        
        Text(
            text = stringResource(R.string.favorites_hint),
            color = Color(0xFFB0BEC5),
            fontSize = 14.sp
        )
        
        Button(
            onClick = onAddToFavorites,
            colors = ButtonDefaults.buttonColors(
                containerColor = Color(0xFF4285F4)
            ),
            shape = RoundedCornerShape(12.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Star,
                contentDescription = null,
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = stringResource(R.string.favorites_explore),
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium
            )
        }
    }
}

/**
 * Favorite Button Component
 */
@Composable
fun FavoriteButton(
    isFavorite: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier
) {
    val scale by animateFloatAsState(
        targetValue = if (isFavorite) 1.2f else 1.0f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessHigh
        ),
        label = "scale"
    )
    
    val color by animateColorAsState(
        targetValue = if (isFavorite) Color(0xFFFF4444) else Color(0xFFB0BEC5),
        animationSpec = tween(250),
        label = "color"
    )

    IconButton(
        onClick = onToggle,
        modifier = modifier.scale(scale),
        colors = IconButtonDefaults.iconButtonColors(
            contentColor = color
        )
    ) {
        Icon(
            imageVector = if (isFavorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
            contentDescription = if (isFavorite) stringResource(R.string.favorites_remove_description) else stringResource(R.string.favorites_add_description),
            modifier = Modifier.size(24.dp)
        )
    }
}

/**
 * Compact Favorites Row
 */
@Composable
fun CompactFavoritesRow(
    favoriteChannels: List<ContentItem>,
    onChannelClick: (ContentItem) -> Unit,
    onSeeAll: () -> Unit,
    modifier: Modifier = Modifier
) {
    if (favoriteChannels.isNotEmpty()) {
        ChannelCategoryRow(
            categoryTitle = stringResource(R.string.favorites_category_title),
            channels = favoriteChannels,
            onChannelClick = onChannelClick,
            onSeeAllClick = onSeeAll,
            modifier = modifier,
            showCompactCards = true
        )
    }
}
