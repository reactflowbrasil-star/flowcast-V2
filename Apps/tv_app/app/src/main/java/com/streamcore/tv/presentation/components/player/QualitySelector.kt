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
import androidx.compose.material.icons.filled.HighQuality
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
import com.streamcore.tv.domain.model.VideoTrack

/**
 * Data class for video quality options
 */
data class VideoQuality(
    val id: String,
    val label: String,
    val resolution: String,
    val bandwidth: Long? = null,
    val isAuto: Boolean = false
)

/**
 * Convert VideoTrack to VideoQuality for UI display
 */
fun VideoTrack.toVideoQuality(): VideoQuality = VideoQuality(
    id = "${groupIndex}_${trackIndex}",
    label = getDisplayName(),
    resolution = getResolution(),
    bandwidth = bitrate.toLong(),
    isAuto = false
)

/**
 * Quality Selector Component
 * 
 * Allows users to select between different video quality options
 * (e.g., Auto, 1080p, 720p, 480p)
 */
@Composable
fun QualitySelector(
    isVisible: Boolean,
    qualities: List<VideoTrack>,
    selectedQuality: VideoTrack?,
    onQualitySelected: (VideoTrack) -> Unit,
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
                    containerColor = Color(0xFF0F1114)
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
                            imageVector = Icons.Default.HighQuality,
                            contentDescription = null,
                            tint = Color(0xFF58A6FF),
                            modifier = Modifier.size(24.dp)
                        )
                        
                        Text(
                            text = stringResource(R.string.quality_title),
                            color = Color.White,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    if (qualities.isEmpty()) {
                        // No quality options available
                        LinearProgressIndicator(
                            modifier = Modifier.fillMaxWidth(),
                            color = Color(0xFF58A6FF),
                            trackColor = Color(0xFF1E232A)
                        )
                    } else {
                        // Quality options list
                        LazyColumn(
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.heightIn(max = 300.dp)
                        ) {
                            // Auto option
                            item {
                                QualityOption(
                                    label = stringResource(R.string.auto_label),
                                    description = stringResource(R.string.quality_auto_description),
                                    isSelected = selectedQuality == null,
                                    onClick = onResetToAuto
                                )
                            }
                            
                            // Available qualities
                            items(qualities) { quality ->
                                val bitrateMbps = if (quality.bitrate > 0) {
                                    " • ${formatBandwidth(quality.bitrate.toLong())}"
                                } else ""
                                QualityOption(
                                    label = quality.getDisplayName(),
                                    description = quality.getResolution() + bitrateMbps,
                                    isSelected = selectedQuality == quality,
                                    onClick = { onQualitySelected(quality) }
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
                            Text(stringResource(R.string.quality_close))
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun QualityOption(
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
            containerColor = if (isSelected)
                Color(0xFF1E2732)
            else
                Color(0xFF12161B)
        ),
        border = if (isSelected)
            BorderStroke(2.dp, Color(0xFF58A6FF))
        else BorderStroke(1.dp, Color(0xFF1E232A))
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
                
                if (description.isNotBlank()) {
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
                    contentDescription = stringResource(R.string.quality_selected),
                    tint = Color(0xFF4285F4),
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}

/**
 * Format bandwidth for display
 */
private fun formatBandwidth(bandwidth: Long): String {
    return when {
        bandwidth >= 1_000_000 -> "${bandwidth / 1_000_000} Mbps"
        bandwidth >= 1_000 -> "${bandwidth / 1_000} Kbps"
        else -> "$bandwidth bps"
    }
}
