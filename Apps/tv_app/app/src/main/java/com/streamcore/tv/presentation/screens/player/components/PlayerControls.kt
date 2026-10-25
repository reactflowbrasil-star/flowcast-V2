package com.streamcore.tv.presentation.screens.player.components

import androidx.compose.animation.*
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import com.streamcore.tv.domain.model.ContentDetails
import com.streamcore.tv.domain.model.Episode
import com.streamcore.tv.presentation.theme.*

/**
 * Player controls overlay component
 */
@Suppress("UNUSED_PARAMETER")
@Composable
fun PlayerControls(
    content: ContentDetails,
    isPlaying: Boolean,
    currentPosition: Long,
    duration: Long,
    onPlayPause: () -> Unit,
    onSeek: (Long) -> Unit,
    onNavigateBack: () -> Unit,
    currentEpisodeId: String? = null,
    onPreviousEpisode: (Episode) -> Unit = {},
    onNextEpisode: (Episode) -> Unit = {},
    isChannelSidebarVisible: Boolean = false,
    controlsVisible: Boolean = true,
    modifier: Modifier = Modifier
) {
    val alpha by animateFloatAsState(
        targetValue = if (controlsVisible) 1f else 0f,
        animationSpec = tween(300)
    )

    Box(
        modifier = modifier.alpha(alpha)
    ) {
        // Top Controls
        TopControls(
            title = content.title,
            onNavigateBack = onNavigateBack,
            isChannelSidebarVisible = isChannelSidebarVisible,
            modifier = Modifier
                .align(Alignment.TopStart)
                .fillMaxWidth()
        )

        // Center Controls
        CenterControls(
            isPlaying = isPlaying,
            onPlayPause = onPlayPause,
            isChannelSidebarVisible = isChannelSidebarVisible,
            modifier = Modifier.align(Alignment.Center)
        )

        // Episode Navigation Controls (only for series content)
        EpisodeNavigationControls(
            content = content,
            currentEpisodeId = currentEpisodeId,
            onPreviousEpisode = onPreviousEpisode,
            onNextEpisode = onNextEpisode,
            controlsVisible = controlsVisible,
            modifier = Modifier.fillMaxSize()
        )
    }
}

@Composable
private fun TopControls(
    title: String,
    onNavigateBack: () -> Unit,
    isChannelSidebarVisible: Boolean = false,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .background(
                Color.Black.copy(alpha = 0.5f)
            )
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        var isFocused by remember { mutableStateOf(false) }

        IconButton(
            onClick = onNavigateBack,
            enabled = !isChannelSidebarVisible,
            modifier = Modifier
                .onFocusChanged { isFocused = it.isFocused }
                .then(
                    if (isFocused) {
                        Modifier
                            .clip(CircleShape)
                            .border(
                                width = 4.dp,
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
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = stringResource(R.string.nav_back),
                tint = if (isFocused) Color.Black else Color.White
            )
        }
        
        Text(
            text = title,
            style = MaterialTheme.typography.titleLarge,
            color = Color.White,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun CenterControls(
    isPlaying: Boolean,
    onPlayPause: () -> Unit,
    isChannelSidebarVisible: Boolean = false,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        var isFocused by remember { mutableStateOf(false) }

        IconButton(
            onClick = onPlayPause,
            enabled = !isChannelSidebarVisible,
            modifier = Modifier
                .size(64.dp)
                .onFocusChanged { isFocused = it.isFocused }
                .then(
                    if (isFocused) {
                        Modifier
                            .clip(CircleShape)
                            .border(
                                width = 4.dp,
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
                imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                contentDescription = if (isPlaying) stringResource(R.string.player_pause) else stringResource(R.string.player_play),
                tint = if (isFocused) Color.Black else Color.White,
                modifier = Modifier.size(48.dp)
            )
        }
    }
}


