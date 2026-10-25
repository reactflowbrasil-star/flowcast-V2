package com.streamcore.tv.presentation.screens.player.components

import androidx.compose.animation.*
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import com.streamcore.tv.R
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.streamcore.tv.domain.model.ContentDetails
import com.streamcore.tv.domain.model.ContentType
import com.streamcore.tv.domain.model.Episode

/**
 * Modern episode navigation controls for series
 */
@Composable
fun EpisodeNavigationControls(
    content: ContentDetails,
    currentEpisodeId: String?,
    onPreviousEpisode: (Episode) -> Unit,
    onNextEpisode: (Episode) -> Unit,
    controlsVisible: Boolean = true,
    modifier: Modifier = Modifier
) {
    // Only show for series content (anime)
    if (content.type != ContentType.SERIES || content.episodes.isNullOrEmpty()) {
        return
    }

    val episodes = content.episodes
    val currentEpisodeIndex = episodes.indexOfFirst { it.id.toString() == currentEpisodeId }
    
    if (currentEpisodeIndex == -1) return

    @Suppress("UNUSED_VARIABLE")
    val currentEpisode = episodes[currentEpisodeIndex]
    val hasPrevious = currentEpisodeIndex > 0
    val hasNext = currentEpisodeIndex < episodes.size - 1

    val alpha by animateFloatAsState(
        targetValue = if (controlsVisible) 1f else 0f,
        animationSpec = tween(300)
    )

    Box(
        modifier = modifier.alpha(alpha)
    ) {
        // Quick navigation buttons on sides (for TV remote) - NO bottom bar
        if (hasPrevious) {
            QuickNavigationButton(
                icon = Icons.Default.SkipPrevious,
                contentDescription = stringResource(R.string.player_previous_episode),
                onClick = { onPreviousEpisode(episodes[currentEpisodeIndex - 1]) },
                modifier = Modifier
                    .align(Alignment.CenterStart)
                    .padding(start = 32.dp)
            )
        }

        if (hasNext) {
            QuickNavigationButton(
                icon = Icons.Default.SkipNext,
                contentDescription = stringResource(R.string.player_next_episode),
                onClick = { onNextEpisode(episodes[currentEpisodeIndex + 1]) },
                modifier = Modifier
                    .align(Alignment.CenterEnd)
                    .padding(end = 32.dp)
            )
        }
    }
}

@Composable
private fun EpisodeNavigationBar(
    currentEpisode: Episode,
    episodeNumber: Int,
    totalEpisodes: Int,
    hasPrevious: Boolean,
    hasNext: Boolean,
    onPrevious: (() -> Unit)?,
    onNext: (() -> Unit)?,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .padding(horizontal = 24.dp, vertical = 16.dp),
        colors = CardDefaults.cardColors(
            containerColor = Color.Black.copy(alpha = 0.8f)
        ),
        shape = RoundedCornerShape(16.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            // Previous button
            NavigationButton(
                icon = Icons.Default.SkipPrevious,
                text = stringResource(R.string.nav_previous),
                enabled = hasPrevious,
                onClick = onPrevious,
                modifier = Modifier.weight(0.2f)
            )

            // Episode info
            Column(
                modifier = Modifier.weight(0.6f),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = stringResource(R.string.nav_episode_info, episodeNumber, totalEpisodes),
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.7f),
                    textAlign = TextAlign.Center
                )
                
                Spacer(modifier = Modifier.height(4.dp))
                
                Text(
                    text = currentEpisode.title,
                    style = MaterialTheme.typography.titleMedium,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )

                if (!currentEpisode.description.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = currentEpisode.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.8f),
                        textAlign = TextAlign.Center,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            // Next button
            NavigationButton(
                icon = Icons.Default.SkipNext,
                text = stringResource(R.string.player_next),
                enabled = hasNext,
                onClick = onNext,
                modifier = Modifier.weight(0.2f)
            )
        }
    }
}

@Composable
private fun NavigationButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    text: String,
    enabled: Boolean,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier
) {
    var isFocused by remember { mutableStateOf(false) }

    Column(
        modifier = modifier
            .clickable(enabled = enabled) { onClick?.invoke() }
            .onFocusChanged { isFocused = it.isFocused }
            .padding(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        IconButton(
            onClick = { onClick?.invoke() },
            enabled = enabled,
            modifier = Modifier
                .size(48.dp)
                .then(
                    if (isFocused && enabled) {
                        Modifier
                            .clip(CircleShape)
                            .border(
                                width = 3.dp,
                                color = Color.Cyan,
                                shape = CircleShape
                            )
                            .background(
                                Color.Cyan.copy(alpha = 0.3f),
                                CircleShape
                            )
                    } else {
                        Modifier
                    }
                )
        ) {
            Icon(
                imageVector = icon,
                contentDescription = text,
                tint = when {
                    !enabled -> Color.White.copy(alpha = 0.3f)
                    isFocused -> Color.Black
                    else -> Color.White
                },
                modifier = Modifier.size(24.dp)
            )
        }
        
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall,
            color = when {
                !enabled -> Color.White.copy(alpha = 0.3f)
                isFocused -> Color.Cyan
                else -> Color.White
            },
            fontSize = 10.sp,
            textAlign = TextAlign.Center
        )
    }
}

@Composable
private fun QuickNavigationButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    var isFocused by remember { mutableStateOf(false) }

    IconButton(
        onClick = onClick,
        modifier = modifier
            .size(56.dp)
            .onFocusChanged { isFocused = it.isFocused }
            .then(
                if (isFocused) {
                    Modifier
                        .clip(CircleShape)
                        .border(
                            width = 3.dp,
                            color = Color.Cyan,
                            shape = CircleShape
                        )
                        .background(
                            Color.Black.copy(alpha = 0.8f),
                            CircleShape
                        )
                } else {
                    Modifier
                        .background(
                            Color.Black.copy(alpha = 0.6f),
                            CircleShape
                        )
                }
            )
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = if (isFocused) Color.Cyan else Color.White,
            modifier = Modifier.size(32.dp)
        )
    }
}
