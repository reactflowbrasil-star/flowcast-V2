package com.streamcore.tv.presentation.components.player

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ClosedCaption
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.streamcore.tv.R
import com.streamcore.tv.domain.model.SubtitleOption
import com.streamcore.tv.presentation.theme.Primary
import com.streamcore.tv.presentation.theme.Surface2
import com.streamcore.tv.presentation.theme.Surface3
import com.streamcore.tv.presentation.theme.SurfaceVariant

/**
 * Subtitle Selector Component
 * 
 * Allows users to select between different subtitle tracks
 * or disable them.
 */
@Composable
fun SubtitleSelector(
    isVisible: Boolean,
    subtitleOptions: List<SubtitleOption>,
    selectedSubtitle: SubtitleOption?,
    onSubtitleSelected: (SubtitleOption) -> Unit,
    onDisableSubtitles: () -> Unit,
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
                            imageVector = Icons.Default.ClosedCaption,
                            contentDescription = null,
                            tint = Color(0xFF58A6FF),
                            modifier = Modifier.size(24.dp)
                        )
                        
                        Text(
                            text = stringResource(R.string.player_subtitle_settings),
                            color = Color.White,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    if (subtitleOptions.isEmpty()) {
                        // Empty state
                        Text(
                            text = stringResource(R.string.player_no_subtitles),
                            color = Color.White.copy(alpha = 0.7f),
                            modifier = Modifier.padding(vertical = 16.dp)
                        )
                    } else {
                        // Subtitle options list
                        LazyColumn(
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.heightIn(max = 300.dp)
                        ) {
                            // Off option
                            item {
                                SubtitleOptionItem(
                                    label = stringResource(R.string.player_subtitle_off),
                                    description = stringResource(R.string.player_subtitle_off_desc),
                                    isSelected = selectedSubtitle == null,
                                    onClick = onDisableSubtitles
                                )
                            }
                            
                            // Available subtitles
                            items(subtitleOptions) { option ->
                                SubtitleOptionItem(
                                    label = option.getDisplayName(),
                                    description = option.language.uppercase(),
                                    isSelected = selectedSubtitle?.let { it.rendererIndex == option.rendererIndex && it.groupIndex == option.groupIndex && it.trackIndex == option.trackIndex } ?: false,
                                    onClick = { onSubtitleSelected(option) }
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
private fun SubtitleOptionItem(
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
                
                if (description.isNotEmpty()) {
                    Text(
                        text = description,
                        color = Color.White.copy(alpha = 0.7f),
                        fontSize = 12.sp
                    )
                }
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