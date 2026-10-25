package com.streamcore.tv.presentation.update

import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.NewReleases
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.streamcore.tv.R
import com.streamcore.tv.data.remote.dto.VersionCheckResponseDto
import com.streamcore.tv.presentation.theme.Primary

/**
 * Enhanced Update Dialog with support for:
 * - Mandatory updates: Only "Install" button, cannot be dismissed
 * - Recommended updates: "Cancel", "Postpone", "Install" buttons
 * - TV Remote/D-pad navigation support with proper focus handling
 */
@Composable
fun UpdateDialog(
    versionInfo: VersionCheckResponseDto,
    onUpdate: () -> Unit,
    onLater: () -> Unit,
    onPostpone: (() -> Unit)? = null,
    isDownloading: Boolean = false,
    downloadProgress: Int = 0
) {
    val isMandatory = versionInfo.forceUpdate
    
    // Focus requester for the primary action button (Install)
    val installButtonFocusRequester = remember { FocusRequester() }
    
    // Request focus on the install button when dialog opens
    LaunchedEffect(Unit) {
        try {
            installButtonFocusRequester.requestFocus()
        } catch (_: Exception) {
            // Ignore focus request failures
        }
    }
    
    Dialog(
        onDismissRequest = { if (!isMandatory && !isDownloading) onLater() },
        properties = DialogProperties(
            dismissOnBackPress = !isMandatory && !isDownloading,
            dismissOnClickOutside = !isMandatory && !isDownloading,
            usePlatformDefaultWidth = false
        )
    ) {
        Card(
            modifier = Modifier
                .width(480.dp)
                .wrapContentHeight()
                .focusable(),
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(
                containerColor = Color(0xFF1A1A2E)
            ),
            border = androidx.compose.foundation.BorderStroke(
                2.dp,
                if (isMandatory) Color.Red.copy(alpha = 0.5f) else Primary.copy(alpha = 0.3f)
            )
        ) {
            Column(
                modifier = Modifier.padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // Icon with gradient background
                Box(
                    modifier = Modifier
                        .size(80.dp)
                        .background(
                            brush = Brush.radialGradient(
                                colors = if (isMandatory) {
                                    listOf(Color.Red.copy(alpha = 0.3f), Color.Transparent)
                                } else {
                                    listOf(Primary.copy(alpha = 0.3f), Color.Transparent)
                                }
                            ),
                            shape = RoundedCornerShape(50)
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = if (isMandatory) Icons.Default.Warning else Icons.Default.NewReleases,
                        contentDescription = null,
                        tint = if (isMandatory) Color.Red else Primary,
                        modifier = Modifier.size(48.dp)
                    )
                }
                
                Spacer(modifier = Modifier.height(24.dp))
                
                // Title
                Text(
                    text = if (isMandatory) {
                        stringResource(R.string.update_required)
                    } else {
                        stringResource(R.string.update_new_available)
                    },
                    fontSize = 26.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    textAlign = TextAlign.Center
                )
                
                Spacer(modifier = Modifier.height(12.dp))
                
                // Version info
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Text(
                        text = stringResource(R.string.update_version_label),
                        fontSize = 18.sp,
                        color = Color.Gray
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = versionInfo.latestVersion,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Primary
                    )
                }
                
                // File size
                if (versionInfo.fileSize > 0) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = stringResource(R.string.update_size_label, formatFileSize(versionInfo.fileSize)),
                        fontSize = 16.sp,
                        color = Color.Gray.copy(alpha = 0.7f)
                    )
                }
                
                // Release notes
                if (!versionInfo.releaseNotes.isNullOrEmpty()) {
                    Spacer(modifier = Modifier.height(20.dp))
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = Color.White.copy(alpha = 0.05f)
                        ),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp)
                        ) {
                            Text(
                                text = stringResource(R.string.update_whats_new),
                                fontSize = 16.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Color.White.copy(alpha = 0.9f)
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = versionInfo.releaseNotes,
                                fontSize = 14.sp,
                                color = Color.White.copy(alpha = 0.7f),
                                lineHeight = 20.sp
                            )
                        }
                    }
                }
                
                // Download progress
                if (isDownloading) {
                    Spacer(modifier = Modifier.height(24.dp))
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        LinearProgressIndicator(
                            progress = { downloadProgress / 100f },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(8.dp),
                            color = Primary,
                            trackColor = Color.White.copy(alpha = 0.1f)
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = if (downloadProgress > 0) {
                                stringResource(R.string.update_downloading, downloadProgress)
                            } else {
                                stringResource(R.string.update_preparing)
                            },
                            fontSize = 16.sp,
                            color = Color.White.copy(alpha = 0.7f)
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = stringResource(R.string.update_install_prompt),
                            fontSize = 14.sp,
                            color = Primary.copy(alpha = 0.8f),
                            textAlign = TextAlign.Center
                        )
                    }
                }
                
                Spacer(modifier = Modifier.height(28.dp))
                
                // Buttons
                if (isDownloading) {
                    // Show only a cancel button while downloading (if not mandatory)
                    if (!isMandatory) {
                        OutlinedButton(
                            onClick = onLater,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(56.dp)
                                .focusRequester(installButtonFocusRequester)
                                .focusable(),
                            colors = ButtonDefaults.outlinedButtonColors(
                                contentColor = Color.Gray
                            ),
                            border = androidx.compose.foundation.BorderStroke(2.dp, Color.Gray.copy(alpha = 0.5f)),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Text(
                                text = stringResource(R.string.common_cancel),
                                fontSize = 18.sp
                            )
                        }
                    } else {
                        // For mandatory updates during download, show a disabled waiting state
                        Button(
                            onClick = { },
                            enabled = false,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(56.dp),
                            colors = ButtonDefaults.buttonColors(
                                disabledContainerColor = Color.Gray.copy(alpha = 0.3f),
                                disabledContentColor = Color.White.copy(alpha = 0.5f)
                            ),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(24.dp),
                                color = Color.White.copy(alpha = 0.5f),
                                strokeWidth = 2.dp
                            )
                            Spacer(modifier = Modifier.width(12.dp))
                            Text(
                                text = stringResource(R.string.update_downloading_wait),
                                fontSize = 18.sp
                            )
                        }
                    }
                } else {
                    if (isMandatory) {
                        // Mandatory update: Only Install button
                        Button(
                            onClick = onUpdate,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(60.dp)
                                .focusRequester(installButtonFocusRequester)
                                .focusable(),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color.Red
                            ),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Download,
                                contentDescription = null,
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(modifier = Modifier.width(12.dp))
                            Text(
                                text = stringResource(R.string.update_install_now),
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 20.sp
                            )
                        }
                        
                        Spacer(modifier = Modifier.height(12.dp))
                        
                        Text(
                            text = stringResource(R.string.update_mandatory_message),
                            fontSize = 14.sp,
                            color = Color.Red.copy(alpha = 0.7f),
                            textAlign = TextAlign.Center
                        )
                    } else {
                        // Recommended update: Install, Postpone, Cancel buttons
                        // Install button (primary action, gets initial focus)
                        Button(
                            onClick = onUpdate,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(60.dp)
                                .focusRequester(installButtonFocusRequester)
                                .focusable(),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Primary
                            ),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Download,
                                contentDescription = null,
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(modifier = Modifier.width(12.dp))
                            Text(
                                text = stringResource(R.string.update_install_now),
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 20.sp
                            )
                        }
                        
                        Spacer(modifier = Modifier.height(16.dp))
                        
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            // Postpone button (remind later)
                            if (onPostpone != null) {
                                OutlinedButton(
                                    onClick = onPostpone,
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(52.dp)
                                        .focusable(),
                                    colors = ButtonDefaults.outlinedButtonColors(
                                        contentColor = Color.White.copy(alpha = 0.8f)
                                    ),
                                    border = androidx.compose.foundation.BorderStroke(2.dp, Color.White.copy(alpha = 0.3f)),
                                    shape = RoundedCornerShape(12.dp)
                                ) {
                                    Text(
                                        text = stringResource(R.string.update_postpone),
                                        fontSize = 16.sp
                                    )
                                }
                            }
                            
                            // Cancel button
                            OutlinedButton(
                                onClick = onLater,
                                modifier = Modifier
                                    .weight(1f)
                                    .height(52.dp)
                                    .focusable(),
                                colors = ButtonDefaults.outlinedButtonColors(
                                    contentColor = Color.Gray
                                ),
                                border = androidx.compose.foundation.BorderStroke(2.dp, Color.Gray.copy(alpha = 0.5f)),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Text(
                                    text = stringResource(R.string.common_cancel),
                                    fontSize = 16.sp
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * Format file size to human readable format
 */
private fun formatFileSize(bytes: Long): String {
    return when {
        bytes >= 1_073_741_824 -> String.format(java.util.Locale.getDefault(), "%.1f GB", bytes / 1_073_741_824.0)
        bytes >= 1_048_576 -> String.format(java.util.Locale.getDefault(), "%.1f MB", bytes / 1_048_576.0)
        bytes >= 1_024 -> String.format(java.util.Locale.getDefault(), "%.1f KB", bytes / 1_024.0)
        else -> "$bytes B"
    }
}
