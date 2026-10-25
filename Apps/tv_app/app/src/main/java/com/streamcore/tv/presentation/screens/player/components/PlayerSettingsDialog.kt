package com.streamcore.tv.presentation.screens.player.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.streamcore.tv.presentation.theme.Primary

/**
 * Dialog for configuring Player settings (Engine and HWDEC)
 */
@Composable
fun PlayerSettingsDialog(
    currentPlayerType: String,
    currentHwdecMode: String,
    onPlayerTypeSelected: (String) -> Unit,
    onHwdecModeSelected: (String) -> Unit,
    onDismiss: () -> Unit
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            dismissOnBackPress = true,
            dismissOnClickOutside = true,
            usePlatformDefaultWidth = false
        )
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.8f))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null
                ) { onDismiss() }, // Close when clicking outside
            contentAlignment = Alignment.Center
        ) {
            Card(
                modifier = Modifier
                    .width(400.dp)
                    .fillMaxHeight(0.85f)
                    .padding(16.dp)
                    .clickable(enabled = false) {}, // Prevent clicks from passing through card
                colors = CardDefaults.cardColors(
                    containerColor = Color(0xFF1E1E1E)
                ),
                shape = RoundedCornerShape(16.dp),
                elevation = CardDefaults.cardElevation(8.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(24.dp)
                ) {
                    // Header
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.Settings,
                                contentDescription = null,
                                tint = Primary,
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(modifier = Modifier.width(12.dp))
                            Text(
                                text = "Player Settings",
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                        }
                        
                        IconButton(onClick = onDismiss) {
                            Icon(
                                imageVector = Icons.Default.Close,
                                contentDescription = "Close",
                                tint = Color.White.copy(alpha = 0.7f)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(24.dp))
                    
                    Divider(color = Color.White.copy(alpha = 0.1f))

                    // Content
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .verticalScroll(rememberScrollState())
                            .padding(vertical = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(24.dp)
                    ) {
                        // Player Engine Section
                        SettingsSection(
                            title = "Player Engine",
                            description = "Select the playback engine. Auto defaults to ExoPlayer for Live TV and MPV for VOD."
                        ) {
                            SettingsOption(
                                title = "Auto (Default)",
                                isSelected = currentPlayerType == "auto",
                                onClick = { onPlayerTypeSelected("auto") }
                            )
                            SettingsOption(
                                title = "ExoPlayer (Standard)",
                                isSelected = currentPlayerType == "exo",
                                onClick = { onPlayerTypeSelected("exo") }
                            )
                            SettingsOption(
                                title = "MPV (Libmpv)",
                                isSelected = currentPlayerType == "mpv",
                                onClick = { onPlayerTypeSelected("mpv") }
                            )
                        }

                        // HWDEC Section (MPV Only)
                        SettingsSection(
                            title = "Hardware Decoding",
                            description = "Video decoding method for MPV player. Auto-Safe is recommended — it uses hardware when possible and falls back to software automatically."
                        ) {
                            SettingsOption(
                                title = "Auto-Safe (Recommended)",
                                isSelected = currentHwdecMode == "auto-safe",
                                onClick = { onHwdecModeSelected("auto-safe") }
                            )
                            SettingsOption(
                                title = "Auto",
                                isSelected = currentHwdecMode == "auto",
                                onClick = { onHwdecModeSelected("auto") }
                            )
                            SettingsOption(
                                title = "MediaCodec (Hardware)",
                                isSelected = currentHwdecMode == "mediacodec",
                                onClick = { onHwdecModeSelected("mediacodec") }
                            )
                            SettingsOption(
                                title = "MediaCodec Copy",
                                isSelected = currentHwdecMode == "mediacodec-copy",
                                onClick = { onHwdecModeSelected("mediacodec-copy") }
                            )
                            SettingsOption(
                                title = "Software (CPU)",
                                isSelected = currentHwdecMode == "no",
                                onClick = { onHwdecModeSelected("no") }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SettingsSection(
    title: String,
    description: String? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = Primary
        )
        
        if (description != null) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.6f),
                lineHeight = 16.sp
            )
        }
        
        Spacer(modifier = Modifier.height(12.dp))
        
        Column(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            content = content
        )
    }
}

@Composable
private fun SettingsOption(
    title: String,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()
    
    val backgroundColor = when {
        isSelected -> Primary.copy(alpha = 0.2f)
        isFocused -> Color.White.copy(alpha = 0.1f)
        else -> Color.Transparent
    }
    
    val borderColor = when {
        isFocused -> Color.White.copy(alpha = 0.5f)
        isSelected -> Primary.copy(alpha = 0.5f)
        else -> Color.White.copy(alpha = 0.1f)
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(backgroundColor)
            .border(1.dp, borderColor, RoundedCornerShape(8.dp))
            .clickable(
                interactionSource = interactionSource,
                indication = null
            ) { onClick() }
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .focusable(interactionSource = interactionSource),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.bodyMedium,
            color = if (isSelected) Color.White else Color.White.copy(alpha = 0.9f),
            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
        )
        
        if (isSelected) {
            Icon(
                imageVector = Icons.Default.Check,
                contentDescription = null,
                tint = Primary,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}
