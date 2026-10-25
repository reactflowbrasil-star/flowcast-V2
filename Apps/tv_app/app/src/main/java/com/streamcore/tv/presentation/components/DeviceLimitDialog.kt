package com.streamcore.tv.presentation.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.BorderStroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.zIndex
import com.streamcore.tv.domain.model.DeviceInfo
import com.streamcore.tv.presentation.theme.*

/**
 * Modern Google TV style dialog for device limit management
 * Features: Smooth animations, elegant design, intuitive UX
 */
@OptIn(ExperimentalAnimationApi::class)
@Composable
fun DeviceLimitDialog(
    devices: List<DeviceInfo>,
    maxDevices: Int,
    onDeviceSelected: (DeviceInfo) -> Unit,
    onDismiss: () -> Unit,
    isLoading: Boolean = false
) {
    var selectedDevice by remember { mutableStateOf<DeviceInfo?>(null) }
    var showConfirmationDialog by remember { mutableStateOf(false) }
    var deviceToReplace by remember { mutableStateOf<DeviceInfo?>(null) }
    val configuration = LocalConfiguration.current
    val isTablet = configuration.screenWidthDp > 600

    // Animation states
    var visible by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(
        targetValue = if (visible) 1f else 0.8f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessLow
        )
    )

    LaunchedEffect(Unit) {
        visible = true
    }

    Dialog(
        onDismissRequest = { if (!isLoading) onDismiss() },
        properties = DialogProperties(
            dismissOnBackPress = !isLoading,
            dismissOnClickOutside = !isLoading,
            usePlatformDefaultWidth = false
        )
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.7f))
                .clickable(enabled = !isLoading) { onDismiss() },
            contentAlignment = Alignment.Center
        ) {
            Card(
                modifier = Modifier
                    .fillMaxWidth(if (isTablet) 0.6f else 0.9f)
                    .scale(scale)
                    .clickable(enabled = false) { /* Prevent click through */ }
                    .shadow(
                        elevation = 24.dp,
                        shape = RoundedCornerShape(24.dp)
                    ),
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            ) {
                Column(
                    modifier = Modifier.padding(32.dp)
                ) {
                    // Modern Header with Gradient
                    GoogleTVHeader(maxDevices = maxDevices)

                    Spacer(modifier = Modifier.height(24.dp))

                    // Subtitle with more context
                    Text(
                        text = stringResource(R.string.device_limit_reached, maxDevices) + " " + stringResource(R.string.device_limit_description),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        lineHeight = 24.sp
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    // Clear explanation of what happens
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.7f)
                        ),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Row(
                            modifier = Modifier.padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Info,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.secondary,
                                modifier = Modifier.size(20.dp)
                            )
                            Text(
                                text = stringResource(R.string.device_limit_replacement_warning),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSecondaryContainer
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    // Warning message
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.3f)
                        ),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Row(
                            modifier = Modifier.padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Warning,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(20.dp)
                            )
                            Text(
                                text = stringResource(R.string.device_limit_disconnect_warning),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onErrorContainer
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(32.dp))

                    // Modern Device Grid
                    GoogleTVDeviceGrid(
                        devices = devices,
                        selectedDevice = selectedDevice,
                        onDeviceSelected = { selectedDevice = it },
                        enabled = !isLoading
                    )

                    Spacer(modifier = Modifier.height(32.dp))

                    // Modern Action Buttons
                    GoogleTVActionButtons(
                        selectedDevice = selectedDevice,
                        isLoading = isLoading,
                        onCancel = onDismiss,
                        onConfirm = {
                            selectedDevice?.let { device ->
                                // Show confirmation dialog before proceeding
                                showConfirmationDialog = true
                                deviceToReplace = device
                            }
                        }
                    )

                    // Progress indicator when loading
                    if (isLoading) {
                        Spacer(modifier = Modifier.height(16.dp))
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.8f)
                            ),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Row(
                                modifier = Modifier.padding(16.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(24.dp),
                                    color = MaterialTheme.colorScheme.primary,
                                    strokeWidth = 2.dp
                                )
                                Column {
                                    Text(
                                        text = stringResource(R.string.device_limit_replacing_message),
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                                        fontWeight = FontWeight.Medium
                                    )
                                    Text(
                                        text = stringResource(R.string.device_limit_waiting_message),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Confirmation Dialog
    if (showConfirmationDialog && deviceToReplace != null) {
        DeviceReplacementConfirmationDialog(
            deviceToReplace = deviceToReplace!!,
            onConfirm = {
                showConfirmationDialog = false
                onDeviceSelected(deviceToReplace!!)
                deviceToReplace = null
            },
            onCancel = {
                showConfirmationDialog = false
                deviceToReplace = null
            }
        )
    }
}

/**
 * Modern Google TV style header with gradient and icon
 */
@Composable
private fun GoogleTVHeader(maxDevices: Int) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Modern gradient icon
        Box(
            modifier = Modifier
                .size(56.dp)
                .background(
                    brush = Brush.linearGradient(
                        colors = listOf(
                            MaterialTheme.colorScheme.primary,
                            MaterialTheme.colorScheme.secondary
                        )
                    ),
                    shape = RoundedCornerShape(16.dp)
                ),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Outlined.Devices,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier.size(28.dp)
            )
        }

        Column {
            Text(
                text = stringResource(R.string.device_limit_title),
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = stringResource(R.string.device_limit_reached, maxDevices),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

/**
 * Modern device grid with 2 columns - Clean and simple design
 */
@Composable
private fun GoogleTVDeviceGrid(
    devices: List<DeviceInfo>,
    selectedDevice: DeviceInfo?,
    onDeviceSelected: (DeviceInfo) -> Unit,
    enabled: Boolean
) {
    // Create pairs of devices for 2-column layout
    val devicePairs = devices.chunked(2)

    LazyColumn(
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(vertical = 8.dp)
    ) {
        items(devicePairs) { devicePair ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                devicePair.forEachIndexed { index, device ->
                    GoogleTVDeviceCard(
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

/**
 * Simple and clean device card - 2 per row layout
 */
@Composable
private fun GoogleTVDeviceCard(
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
            isSelected -> 1.02f
            isFocused -> 1.01f
            else -> 1f
        },
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy)
    )

    Card(
        modifier = modifier
            .height(100.dp) // Slightly taller for 2-column layout
            .scale(scale)
            .focusable()
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                enabled = enabled
            ) { onSelect() },
        shape = RoundedCornerShape(8.dp), // Simpler rounded corners
        colors = CardDefaults.cardColors(
            containerColor = when {
                isSelected -> MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)
                isFocused -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.8f)
                else -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
            }
        ),
        elevation = CardDefaults.cardElevation(
            defaultElevation = if (isSelected || isFocused) 4.dp else 1.dp // Minimal elevation
        ),
        border = if (isSelected) {
            androidx.compose.foundation.BorderStroke(
                width = 2.dp,
                color = MaterialTheme.colorScheme.primary
            )
        } else null
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
                    imageVector = getDeviceIcon(device.name),
                    contentDescription = null,
                    tint = if (isSelected) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
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
                        tint = MaterialTheme.colorScheme.primary,
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
                    color = if (isSelected) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurface
                    },
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                Text(
                    text = formatDeviceType(device.type),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.7f),
                    fontWeight = FontWeight.Medium
                )

                Text(
                    text = formatLastActive(device.lastActive),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                if (device.isCurrentDevice) {
                    Text(
                        text = stringResource(R.string.device_limit_this_device),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.secondary,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
    }
}

/**
 * Modern action buttons with animations
 */
@Composable
private fun GoogleTVActionButtons(
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
            enabled = !isLoading,
            shape = RoundedCornerShape(16.dp),
            border = BorderStroke(
                width = 1.5.dp,
                color = MaterialTheme.colorScheme.outline
            )
        ) {
            Text(
                text = stringResource(R.string.device_limit_cancel),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Medium
            )
        }

        // Confirm button
        Button(
            onClick = onConfirm,
            modifier = Modifier
                .weight(1f)
                .height(56.dp),
            enabled = !isLoading && selectedDevice != null,
            shape = RoundedCornerShape(16.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.error,
                contentColor = MaterialTheme.colorScheme.onError
            )
        ) {
            if (isLoading) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = MaterialTheme.colorScheme.onError,
                        strokeWidth = 2.dp
                    )
                    Text(
                        text = stringResource(R.string.device_limit_disconnecting),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Medium
                    )
                }
            } else {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.PowerOff,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp)
                    )
                    Text(
                        text = stringResource(R.string.device_limit_disconnect),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
    }
}

/**
 * Get appropriate icon for device type
 */
private fun getDeviceIcon(deviceName: String): ImageVector {
    return when {
        deviceName.contains("TV", ignoreCase = true) -> Icons.Outlined.Tv
        deviceName.contains("Phone", ignoreCase = true) -> Icons.Outlined.Smartphone
        deviceName.contains("Tablet", ignoreCase = true) -> Icons.Outlined.Tablet
        deviceName.contains("Desktop", ignoreCase = true) -> Icons.Outlined.Computer
        deviceName.contains("Laptop", ignoreCase = true) -> Icons.Outlined.Laptop
        deviceName.contains("Chrome", ignoreCase = true) -> Icons.Outlined.Computer
        deviceName.contains("Android", ignoreCase = true) -> Icons.Outlined.Android
        deviceName.contains("iPhone", ignoreCase = true) -> Icons.Outlined.Smartphone
        deviceName.contains("iPad", ignoreCase = true) -> Icons.Outlined.Tablet
        deviceName.contains("Mac", ignoreCase = true) -> Icons.Outlined.Computer
        else -> Icons.Outlined.DevicesOther
    }
}

/**
 * Format device type for display
 */
private fun formatDeviceType(deviceType: String): String {
    return when (deviceType.lowercase()) {
        "android" -> "Android"
        "ios" -> "iOS"
        "web" -> "Web Browser"
        "tv" -> "Smart TV"
        "desktop" -> "Desktop"
        "mobile" -> "Mobile"
        "tablet" -> "Tablet"
        else -> deviceType.replaceFirstChar { it.uppercase() }
    }
}

/**
 * Format last active time for better readability
 */
private fun formatLastActive(lastActive: String): String {
    return try {
        // Assuming lastActive is in ISO format or similar
        // For now, just return a simplified version
        // Parse ISO date format and format for display
        when {
            lastActive.contains("ago") -> lastActive
            lastActive.contains("T") -> {
                // ISO format - extract date part
                val datePart = lastActive.split("T")[0]
                "on $datePart"
            }
            else -> lastActive
        }
    } catch (e: Exception) {
        lastActive
    }
}

/**
 * Confirmation dialog before replacing a device
 */
@Composable
private fun DeviceReplacementConfirmationDialog(
    deviceToReplace: DeviceInfo,
    onConfirm: () -> Unit,
    onCancel: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onCancel,
        icon = {
            Icon(
                imageVector = Icons.Default.Warning,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.error,
                modifier = Modifier.size(32.dp)
            )
        },
        title = {
            Text(
                text = stringResource(R.string.device_limit_confirm_replacement),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )
        },
        text = {
            Column {
                // Clear title
                Text(
                    text = stringResource(R.string.device_limit_confirm_message),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.Medium
                )

                Spacer(modifier = Modifier.height(16.dp))

                // What will happen section
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.7f)
                    ),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.SwapHoriz,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(20.dp)
                            )
                            Text(
                                text = stringResource(R.string.device_limit_what_happens),
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        Row(
                            verticalAlignment = Alignment.Top,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Cancel,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(16.dp).padding(top = 2.dp)
                            )
                            Text(
                                text = stringResource(R.string.device_limit_device_disconnected),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        }

                        Spacer(modifier = Modifier.height(4.dp))

                        Row(
                            verticalAlignment = Alignment.Top,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.CheckCircle,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(16.dp).padding(top = 2.dp)
                            )
                            Text(
                                text = stringResource(R.string.device_limit_device_replaced),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Device info card
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.3f)
                    ),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp)
                    ) {
                        Text(
                            text = stringResource(R.string.device_limit_device_to_disconnect),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                            fontWeight = FontWeight.Medium
                        )

                        Spacer(modifier = Modifier.height(8.dp))

                        Text(
                            text = deviceToReplace.name,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onErrorContainer
                        )

                        Spacer(modifier = Modifier.height(4.dp))

                        Text(
                            text = formatDeviceType(deviceToReplace.type),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onErrorContainer.copy(alpha = 0.8f)
                        )

                        Text(
                            text = stringResource(R.string.device_limit_last_access, formatLastActive(deviceToReplace.lastActive)),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onErrorContainer.copy(alpha = 0.7f)
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error
                )
            ) {
                Text(
                    text = stringResource(R.string.device_limit_yes_disconnect),
                    fontWeight = FontWeight.Medium
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onCancel) {
                Text(
                    text = stringResource(R.string.device_limit_cancel),
                    fontWeight = FontWeight.Medium
                )
            }
        }
    )
}
