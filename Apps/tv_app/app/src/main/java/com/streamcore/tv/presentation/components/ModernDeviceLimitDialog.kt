package com.streamcore.tv.presentation.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.streamcore.tv.domain.model.DeviceInfo
import com.streamcore.tv.presentation.theme.*
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R

/**
 * Modern Android TV optimized device limit dialog
 * Features: Large cards, focus navigation, smooth animations
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ModernDeviceLimitDialog(
    devices: List<DeviceInfo>,
    maxDevices: Int,
    onDeviceSelected: (DeviceInfo) -> Unit,
    onDismiss: () -> Unit,
    isLoading: Boolean = false
) {
    var selectedDevice by remember { mutableStateOf<DeviceInfo?>(null) }
    var showConfirmationDialog by remember { mutableStateOf(false) }
    val configuration = LocalConfiguration.current
    val isTablet = configuration.screenWidthDp > 600

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            dismissOnBackPress = true,
            dismissOnClickOutside = false,
            usePlatformDefaultWidth = false
        )
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.8f)),
            contentAlignment = Alignment.Center
        ) {
            Card(
                modifier = Modifier
                    .fillMaxWidth(if (isTablet) 0.7f else 0.95f)
                    .fillMaxHeight(0.8f),
                colors = CardDefaults.cardColors(
                    containerColor = Color(0xFF1A1A1A)
                ),
                elevation = CardDefaults.cardElevation(defaultElevation = 24.dp),
                shape = RoundedCornerShape(24.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(32.dp)
                ) {
                    // Header
                    ModernDialogHeader(
                        deviceCount = devices.size,
                        maxDevices = maxDevices,
                        onDismiss = onDismiss
                    )

                    Spacer(modifier = Modifier.height(32.dp))

                    // Device Grid
                    AndroidTVDeviceGrid(
                        devices = devices,
                        selectedDevice = selectedDevice,
                        onDeviceSelected = { selectedDevice = it },
                        enabled = !isLoading,
                        modifier = Modifier.weight(1f)
                    )

                    Spacer(modifier = Modifier.height(32.dp))

                    // Action Buttons
                    ModernActionButtons(
                        selectedDevice = selectedDevice,
                        isLoading = isLoading,
                        onCancel = onDismiss,
                        onConfirm = {
                            selectedDevice?.let { device ->
                                showConfirmationDialog = true
                            }
                        }
                    )
                }
            }
        }
    }

    // Confirmation Dialog
    if (showConfirmationDialog && selectedDevice != null) {
        ModernConfirmationDialog(
            device = selectedDevice!!,
            onConfirm = {
                showConfirmationDialog = false
                onDeviceSelected(selectedDevice!!)
            },
            onDismiss = {
                showConfirmationDialog = false
            }
        )
    }
}

@Composable
private fun ModernDialogHeader(
    deviceCount: Int,
    maxDevices: Int,
    onDismiss: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(
            modifier = Modifier.weight(1f)
        ) {
            Text(
                text = stringResource(id = R.string.device_limit_title),
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Text(
                text = stringResource(R.string.devices_registered_count, deviceCount, maxDevices),
                style = MaterialTheme.typography.bodyLarge,
                color = Color.White.copy(alpha = 0.7f)
            )
            
            Text(
                text = stringResource(id = R.string.select_device_to_replace),
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White.copy(alpha = 0.6f)
            )
        }

        IconButton(
            onClick = onDismiss,
            modifier = Modifier
                .size(48.dp)
                .background(
                    color = Color.White.copy(alpha = 0.1f),
                    shape = RoundedCornerShape(12.dp)
                )
        ) {
            Icon(
                imageVector = Icons.Default.Close,
                contentDescription = stringResource(R.string.close_button),
                tint = Color.White,
                modifier = Modifier.size(24.dp)
            )
        }
    }
}

@Composable
private fun AndroidTVDeviceGrid(
    devices: List<DeviceInfo>,
    selectedDevice: DeviceInfo?,
    onDeviceSelected: (DeviceInfo) -> Unit,
    enabled: Boolean,
    modifier: Modifier = Modifier
) {
    // Create pairs of devices for 2-column layout
    val devicePairs = devices.chunked(2)

    LazyColumn(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(12.dp),
        contentPadding = PaddingValues(vertical = 8.dp)
    ) {
        items(devicePairs) { devicePair ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                devicePair.forEachIndexed { index, device ->
                    AndroidTVDeviceCard(
                        device = device,
                        isSelected = selectedDevice?.id == device.id,
                        onSelect = { onDeviceSelected(device) },
                        enabled = enabled,
                        modifier = Modifier.weight(1f)
                    )
                }
                // Fill remaining space if odd number of devices
                if (devicePair.size == 1) {
                    Spacer(modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun AndroidTVDeviceCard(
    device: DeviceInfo,
    isSelected: Boolean,
    onSelect: () -> Unit,
    enabled: Boolean,
    modifier: Modifier = Modifier
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()
    
    val scale by animateFloatAsState(
        targetValue = when {
            isSelected -> 1.05f
            isFocused -> 1.02f
            else -> 1f
        },
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy)
    )

    val backgroundColor = when {
        isSelected -> Primary.copy(alpha = 0.2f)
        isFocused -> Color.White.copy(alpha = 0.1f)
        else -> Color.White.copy(alpha = 0.05f)
    }

    Card(
        modifier = modifier
            .height(100.dp) // Consistent height for 2-column layout
            .scale(scale)
            .focusable()
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                enabled = enabled
            ) { onSelect() },
        colors = CardDefaults.cardColors(
            containerColor = backgroundColor
        ),
        elevation = CardDefaults.cardElevation(
            defaultElevation = if (isFocused || isSelected) 4.dp else 1.dp // Minimal elevation
        ),
        shape = RoundedCornerShape(8.dp), // Simpler corners
        border = if (isSelected) {
            androidx.compose.foundation.BorderStroke(2.dp, Primary)
        } else null // Remove focus border for cleaner look
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // Header with icon and selection indicator
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Icon(
                    imageVector = getDeviceIcon(device.type),
                    contentDescription = null,
                    tint = getDeviceColor(device.type),
                    modifier = Modifier.size(24.dp)
                )

                // Selection indicator
                AnimatedVisibility(
                    visible = isSelected,
                    enter = scaleIn() + fadeIn(),
                    exit = scaleOut() + fadeOut()
                ) {
                    Icon(
                        imageVector = Icons.Default.CheckCircle,
                        contentDescription = stringResource(R.string.device_limit_selected_description),
                        tint = Primary,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }

            // Device info - vertical layout for 2-column design
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(
                    text = device.name,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = if (isSelected) Primary else Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                Text(
                    text = formatDeviceType(device.type),
                    style = MaterialTheme.typography.bodySmall,
                    color = getDeviceColor(device.type),
                    fontWeight = FontWeight.Medium
                )

                Text(
                    text = formatLastActive(device.lastActive),
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.7f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
private fun ModernActionButtons(
    selectedDevice: DeviceInfo?,
    isLoading: Boolean,
    onCancel: () -> Unit,
    onConfirm: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Cancel button
        OutlinedButton(
            onClick = onCancel,
            modifier = Modifier
                .weight(1f)
                .height(56.dp),
            colors = ButtonDefaults.outlinedButtonColors(
                contentColor = Color.White
            ),
            border = androidx.compose.foundation.BorderStroke(
                2.dp, 
                Color.White.copy(alpha = 0.3f)
            ),
            shape = RoundedCornerShape(16.dp)
        ) {
            Text(
                text = stringResource(R.string.dialog_cancel),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Medium
            )
        }

        // Confirm button
        Button(
            onClick = onConfirm,
            enabled = selectedDevice != null && !isLoading,
            modifier = Modifier
                .weight(1f)
                .height(56.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = Primary,
                disabledContainerColor = Color.Gray.copy(alpha = 0.6f)
            ),
            shape = RoundedCornerShape(16.dp)
        ) {
            if (isLoading) {
                CircularProgressIndicator(
                    color = Color.White,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(20.dp)
                )
            } else {
                Text(
                    text = if (selectedDevice != null) {
                        stringResource(id = R.string.replace_device_button)
                    } else {
                        stringResource(id = R.string.device_limit_select_device_prompt)
                    },
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = if (selectedDevice != null) Color.White else Color.White.copy(alpha = 0.7f)
                )
            }
        }
    }
}

// Helper functions
private fun getDeviceIcon(deviceType: String): ImageVector {
    return when (deviceType.lowercase()) {
        "android" -> Icons.Default.Android
        "ios" -> Icons.Default.PhoneIphone
        "web" -> Icons.Default.Computer
        "tv" -> Icons.Default.Tv
        else -> Icons.Default.DevicesOther
    }
}

private fun getDeviceColor(deviceType: String): Color {
    return when (deviceType.lowercase()) {
        "android" -> Color(0xFF3DDC84)
        "ios" -> Color(0xFF007AFF)
        "web" -> Color(0xFF4285F4)
        "tv" -> Color(0xFFFF6B35)
        else -> Color(0xFF9E9E9E)
    }
}

@Composable
private fun formatDeviceType(deviceType: String): String {
    return when (deviceType.lowercase()) {
        "android" -> stringResource(id = R.string.device_type_android)
        "ios" -> stringResource(id = R.string.device_type_ios)
        "web" -> stringResource(id = R.string.device_type_web_browser)
        "tv" -> stringResource(id = R.string.device_type_smart_tv)
        else -> deviceType.replaceFirstChar { it.uppercase() }
    }
}

private fun formatLastActive(lastActive: String): String {
    return try {
        when {
            lastActive.contains("ago") -> lastActive
            lastActive.contains("T") -> {
                val datePart = lastActive.split("T")[0]
                datePart
            }
            else -> lastActive
        }
    } catch (e: Exception) {
        lastActive
    }
}

@Composable
private fun ModernConfirmationDialog(
    device: DeviceInfo,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Color(0xFF1A1A1A),
        shape = RoundedCornerShape(24.dp),
        icon = {
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .background(
                        color = Color(0xFFEA4335).copy(alpha = 0.2f),
                        shape = RoundedCornerShape(16.dp)
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Warning,
                    contentDescription = null,
                    tint = Color(0xFFEA4335),
                    modifier = Modifier.size(32.dp)
                )
            }
        },
        title = {
            Text(
                text = stringResource(R.string.dialog_confirm_replacement),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                textAlign = TextAlign.Center
            )
        },
        text = {
            Column {
                Text(
                    text = stringResource(id = R.string.device_limit_confirm_message),
                    style = MaterialTheme.typography.bodyLarge,
                    color = Color.White.copy(alpha = 0.8f),
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(20.dp))

                // Device info card
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = Color(0xFFEA4335).copy(alpha = 0.1f)
                    ),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(20.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        Icon(
                            imageVector = getDeviceIcon(device.type),
                            contentDescription = null,
                            tint = getDeviceColor(device.type),
                            modifier = Modifier.size(32.dp)
                        )

                        Column {
                            Text(
                                text = device.name,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )

                            Text(
                                text = formatDeviceType(device.type),
                                style = MaterialTheme.typography.bodyMedium,
                                color = Color.White.copy(alpha = 0.7f)
                            )

                            Text(
                                text = stringResource(R.string.last_access, formatLastActive(device.lastActive)),
                                style = MaterialTheme.typography.bodySmall,
                                color = Color.White.copy(alpha = 0.6f)
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = stringResource(id = R.string.device_limit_replacement_warning),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color(0xFFEA4335),
                    fontWeight = FontWeight.Medium,
                    textAlign = TextAlign.Center
                )
            }
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFFEA4335)
                ),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text(
                    text = stringResource(id = R.string.device_selection_replace_description),
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                colors = ButtonDefaults.textButtonColors(
                    contentColor = Color.White.copy(alpha = 0.8f)
                )
            ) {
                Text(
                    text = stringResource(R.string.dialog_cancel),
                    fontWeight = FontWeight.Medium
                )
            }
        }
    )
}
