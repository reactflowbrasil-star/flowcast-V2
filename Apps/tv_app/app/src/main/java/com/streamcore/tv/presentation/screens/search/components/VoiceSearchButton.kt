package com.streamcore.tv.presentation.screens.search.components

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R
import android.app.Activity
import androidx.compose.ui.platform.LocalContext
import com.streamcore.tv.presentation.components.voice.VoiceSearchManager

/**
 * Voice search button component
 */
@Composable
fun VoiceSearchButton(
    onVoiceSearch: (String) -> Unit,
    modifier: Modifier = Modifier,
    isEnabled: Boolean = true
) {
    var isListening by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val manager = remember { VoiceSearchManager(context) }
    
    IconButton(
        onClick = {
            if (!isEnabled) return@IconButton
            val activity = context as? Activity
            if (activity != null && !manager.hasAudioPermission()) {
                manager.requestAudioPermission(activity)
                return@IconButton
            }
            if (!manager.isAvailable()) {
                // No SpeechRecognizer available
                return@IconButton
            }
            isListening = true
            manager.startListening(
                onResult = { text ->
                    isListening = false
                    onVoiceSearch(text)
                },
                onError = { _ -> isListening = false }
            )
        },
        modifier = modifier,
        enabled = isEnabled
    ) {
        Icon(
            imageVector = Icons.Default.Mic,
            contentDescription = stringResource(R.string.nav_search),
            tint = if (isListening) {
                MaterialTheme.colorScheme.error
            } else if (isEnabled) {
                MaterialTheme.colorScheme.primary
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.38f)
            }
        )
    }
}

// VoiceSearchFAB removed for now; use VoiceSearchButton in headers/inputs

/**
 * Voice search status indicator
 */
@Composable
fun VoiceSearchStatus(
    isListening: Boolean,
    modifier: Modifier = Modifier
) {
    if (isListening) {
        Card(
            modifier = modifier,
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.errorContainer
            )
        ) {
            Row(
                modifier = Modifier.padding(12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Mic,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.error
                )
                
                Text(
                    text = stringResource(R.string.search_listening),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onErrorContainer
                )
            }
        }
    }
}

/**
 * Simulate voice input for demo purposes
 * In a real implementation, this would use Android's SpeechRecognizer
 */
// Removed demo simulator; real SpeechRecognizer is used via VoiceSearchManager

/**
 * Voice search suggestions based on common voice queries
 */
@Composable
fun getVoiceSearchSuggestions(): List<String> {
    return listOf(
        stringResource(R.string.search_action_movies),
        stringResource(R.string.search_comedy_series),
        stringResource(R.string.search_documentaries),
        stringResource(R.string.search_sports_channels),
        stringResource(R.string.search_year_movies),
        stringResource(R.string.search_drama_series),
        stringResource(R.string.search_horror_movies),
        stringResource(R.string.search_news_channels),
        stringResource(R.string.search_kids_content),
        stringResource(R.string.search_romantic_movies)
    )
}
