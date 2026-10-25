package com.streamcore.tv.presentation.components.player

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import com.streamcore.tv.R
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.streamcore.tv.domain.model.AudioTrack
import com.streamcore.tv.presentation.theme.Primary
import com.streamcore.tv.presentation.theme.Surface2
import com.streamcore.tv.presentation.theme.Surface3
import com.streamcore.tv.presentation.theme.SurfaceVariant

/**
 * Audio Track Selector Component
 * 
 * Allows users to select between different audio languages
 * (e.g., Spanish/English for dual audio content)
 */
@Composable
fun AudioTrackSelector(
    isVisible: Boolean,
    audioTracks: List<AudioTrack>,
    selectedTrack: AudioTrack?,
    onTrackSelected: (AudioTrack) -> Unit,
    onResetToAuto: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier
) {
    if (isVisible) {
        Dialog(onDismissRequest = onDismiss) {
            Card(
                modifier = modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(
                    containerColor = Surface2
                )
            ) {
                Column(
                    modifier = Modifier.padding(24.dp)
                ) {
                    // Header
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.VolumeUp,
                            contentDescription = null,
                            tint = Color(0xFF58A6FF),
                            modifier = Modifier.size(24.dp)
                        )
                        
                        Text(
                            text = stringResource(R.string.audio_title),
                            color = Color.White,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    if (audioTracks.isEmpty()) {
                        // Loading state - show loading indicator
                        LinearProgressIndicator(
                            modifier = Modifier.fillMaxWidth(),
                            color = Primary,
                            trackColor = SurfaceVariant
                        )
                    } else {
                        // Audio tracks list
                        LazyColumn(
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.heightIn(max = 300.dp)
                        ) {
                            // Auto option
                            item {
                                AudioTrackOption(
                                    label = stringResource(R.string.auto_label),
                                    description = stringResource(R.string.audio_auto_description),
                                    isSelected = selectedTrack == null,
                                    onClick = onResetToAuto
                                )
                            }
                            
                            // Available tracks
                            items(audioTracks) { track ->
                                AudioTrackOption(
                                    label = track.getDisplayName(),
                                    description = stringResource(R.string.audio_language_prefix) + " ${track.language.uppercase()}",
                                    isSelected = selectedTrack?.let { it.rendererIndex == track.rendererIndex && it.groupIndex == track.groupIndex && it.trackIndex == track.trackIndex } ?: false,
                                    onClick = { onTrackSelected(track) }
                                )
                            }
                        }
                    }
                    
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    // Close button
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End
                    ) {
                        TextButton(
                            onClick = onDismiss,
                            colors = ButtonDefaults.textButtonColors(
                                contentColor = Color(0xFF4285F4)
                            )
                        ) {
                            Text(stringResource(R.string.audio_close))
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AudioTrackOption(
    label: String,
    description: String,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isSelected) Surface3 else Surface2
        ),
        border = if (isSelected)
            BorderStroke(2.dp, Primary)
        else BorderStroke(1.dp, SurfaceVariant)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(
                modifier = Modifier.weight(1f)
            ) {
                Text(
                    text = label,
                    color = Color.White,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Medium
                )
                
                Text(
                    text = description,
                    color = Color.White.copy(alpha = 0.7f),
                    fontSize = 12.sp
                )
            }
            
            if (isSelected) {
                Icon(
                    imageVector = Icons.Default.Check,
                    contentDescription = stringResource(R.string.audio_selected),
                    tint = Primary,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}
