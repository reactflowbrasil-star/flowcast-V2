package com.streamcore.tv.presentation.screens.livetv

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.hilt.navigation.compose.hiltViewModel
import com.streamcore.tv.presentation.components.livetv.v2.ChannelSwitcherV2ViewModel

/**
 * Live TV Screen - Uses ChannelSelectorV2Screen (Full Screen 3-Panel Layout)
 */
@Composable
fun LiveTVScreen(
    onChannelClick: (String) -> Unit,
    onNavigateBack: () -> Unit,
    viewModel: ChannelSwitcherV2ViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    
    // Ensure channels are loaded when entering the screen
    LaunchedEffect(Unit) {
        viewModel.loadChannels()
    }

    // EPG Now/Next maps from state
    val nowMap = uiState.nowMap
    val nextMap = uiState.nextMap

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0F0F23))
    ) {
        ChannelSelectorV2Screen(
            isVisible = true,
            channels = uiState.channels,
            currentChannelId = null,
            onChannelSelected = { channel -> 
                onChannelClick(channel.id)
            },
            onDismiss = onNavigateBack,
            categories = uiState.categories,
            selectedCategory = uiState.selectedCategory,
            onSelectCategory = { viewModel.selectCategory(it) },
            epgNow = nowMap,
            epgNext = nextMap
        )
    }
}
