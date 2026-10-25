package com.streamcore.tv.presentation.screens.livetv

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.streamcore.tv.R
import com.streamcore.tv.domain.model.Result
import com.streamcore.tv.presentation.components.LoadingIndicator
import com.streamcore.tv.presentation.components.ErrorMessage

/**
 * Live TV Direct Screen
 * 
 * Automatically loads the first available channel and navigates to player
 */
@Suppress("UNUSED_PARAMETER")
@Composable
fun LiveTVDirectScreen(
    onNavigateToPlayer: (String) -> Unit,
    onNavigateBack: () -> Unit,
    viewModel: LiveTVViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    
    LaunchedEffect(Unit) {
        viewModel.loadChannels()
    }
    
    // Handle navigation to first channel when channels are loaded
    LaunchedEffect(uiState.channelsState) {
        when (val channelsState = uiState.channelsState) {
            is Result.Success -> {
                val channels = channelsState.data
                if (channels.isNotEmpty()) {
                    // Navigate to the first channel
                    val firstChannel = channels.first()
                    onNavigateToPlayer(firstChannel.id.toString())
                }
            }
            else -> {
                // Handle loading or error states
            }
        }
    }
    
    // Show loading or error states while getting channels
    when (val channelsState = uiState.channelsState) {
        is Result.Loading -> {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                LoadingIndicator()
            }
        }

        is Result.Success -> {
            val channels = channelsState.data
            if (channels.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = stringResource(id = R.string.category_no_channels),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                // Show loading while navigating to player
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    LoadingIndicator()
                }
            }
        }
        
        is Result.Error -> {
            ErrorMessage(
                message = channelsState.exception.message ?: stringResource(id = R.string.error_network),
                onRetry = { viewModel.loadChannels() }
            )
        }
    }
}
