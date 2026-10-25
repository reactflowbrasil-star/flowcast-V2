package com.streamcore.tv.presentation.screens.settings

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R
import com.streamcore.tv.core.utils.ShowToast
import com.streamcore.tv.domain.model.DeviceInfo
import com.streamcore.tv.presentation.theme.*

/**
 * Device Management Screen for Android TV
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeviceManagementScreen(
    onNavigateBack: () -> Unit,
    viewModel: DeviceManagementViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    
    // Show error messages
    uiState.error?.let { error ->
        ShowToast(message = error)
        LaunchedEffect(error) {
            viewModel.clearError()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        Column(
            modifier = Modifier.fillMaxSize()
        ) {
            // Header
            DeviceManagementHeader(
                onNavigateBack = onNavigateBack,
                deviceCount = uiState.currentDeviceCount,
                maxDevices = uiState.maxDevices,
                onRefresh = viewModel::refresh
            )

            // Device List
            if (uiState.isLoading && uiState.devices.isEmpty()) {
                LoadingDevicesContent()
            } else {
                DeviceListContent(
                    devices = uiState.devices,
                    onRemoveDevice = viewModel::showRemoveConfirmation,
                    isLoading = uiState.isLoading
                )
            }
        }
    }

    // Remove confirmation dialog
    if (uiState.showRemoveConfirmation && uiState.deviceToRemove != null) {
        DeviceRemovalConfirmationDialog(
            device = uiState.deviceToRemove!!,
            onConfirm = viewModel::confirmRemoveDevice,
            onDismiss = viewModel::hideRemoveConfirmation
        )
    }
}

@Composable
private fun DeviceManagementHeader(
    onNavigateBack: () -> Unit,
    deviceCount: Int,
    maxDevices: Int,
    onRefresh: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Back button
            IconButton(
                onClick = onNavigateBack,
                modifier = Modifier.size(48.dp)
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = stringResource(R.string.device_management_back_description),
                    tint = Primary,
                    modifier = Modifier.size(24.dp)
                )
            }

            Spacer(modifier = Modifier.width(16.dp))

            // Title and device count
            Column(
                modifier = Modifier.weight(1f)
            ) {
                Text(
                    text = stringResource(R.string.device_management_title),
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
                
                Text(
                    text = stringResource(R.string.devices_registered_count, deviceCount, maxDevices),
                    style = MaterialTheme.typography.bodyLarge,
                    color = Color.White.copy(alpha = 0.7f)
                )
            }

            // Refresh button
            IconButton(
                onClick = onRefresh,
                modifier = Modifier.size(48.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Refresh,
                    contentDescription = stringResource(R.string.device_management_refresh_description),
                    tint = Secondary,
                    modifier = Modifier.size(24.dp)
                )
            }
        }
    }
}

@Composable
private fun LoadingDevicesContent() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            CircularProgressIndicator(
                color = Primary,
                strokeWidth = 3.dp,
                modifier = Modifier.size(48.dp)
            )
            
            Spacer(modifier = Modifier.height(16.dp))
            
            Text(
                text = stringResource(R.string.device_loading),
                style = MaterialTheme.typography.bodyLarge,
                color = Color.White.copy(alpha = 0.7f)
            )
        }
    }
}

@Composable
private fun DeviceListContent(
    devices: List<DeviceInfo>,
    onRemoveDevice: (DeviceInfo) -> Unit,
    isLoading: Boolean
) {
    if (devices.isEmpty() && !isLoading) {
        EmptyDevicesContent()
    } else {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(devices) { device ->
                DeviceCard(
                    device = device,
                    onRemove = { onRemoveDevice(device) },
                    enabled = !isLoading
                )
            }
        }
    }
}

@Composable
private fun EmptyDevicesContent() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = Icons.Default.DevicesOther,
                contentDescription = null,
                tint = Color.White.copy(alpha = 0.3f),
                modifier = Modifier.size(64.dp)
            )
            
            Spacer(modifier = Modifier.height(16.dp))
            
            Text(
                text = stringResource(R.string.device_no_devices),
                style = MaterialTheme.typography.titleMedium,
                color = Color.White.copy(alpha = 0.7f),
                textAlign = TextAlign.Center
            )
            
            Text(
                text = stringResource(R.string.devices_empty_message),
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White.copy(alpha = 0.5f),
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
private fun DeviceCard(
    device: DeviceInfo,
    onRemove: () -> Unit,
    enabled: Boolean
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()
    
    val scale by animateFloatAsState(
        targetValue = if (isFocused) 1.02f else 1f,
        animationSpec = tween(150)
    )

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .scale(scale)
            .focusable(interactionSource = interactionSource),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(
            defaultElevation = 0.dp
        ),
        shape = RoundedCornerShape(12.dp),
        border = when {
            device.isCurrentDevice -> androidx.compose.foundation.BorderStroke(2.dp, Primary)
            isFocused -> androidx.compose.foundation.BorderStroke(2.dp, MaterialTheme.colorScheme.primary)
            else -> androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))
        }
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Device icon
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .background(
                        color = getDeviceColor(device.type).copy(alpha = 0.2f),
                        shape = RoundedCornerShape(14.dp)
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = getDeviceIcon(device.type),
                    contentDescription = null,
                    tint = getDeviceColor(device.type),
                    modifier = Modifier.size(28.dp)
                )
            }

            Spacer(modifier = Modifier.width(16.dp))

            // Device info
            Column(
                modifier = Modifier.weight(1f)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = device.name,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    
                    if (device.isCurrentDevice) {
                        Spacer(modifier = Modifier.width(8.dp))
                        Card(
                            colors = CardDefaults.cardColors(
                                containerColor = Primary.copy(alpha = 0.2f)
                            ),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text(
                                text = stringResource(R.string.current_device_label),
                                style = MaterialTheme.typography.labelSmall,
                                color = Primary,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                    }
                }
                
                Spacer(modifier = Modifier.height(4.dp))
                
                Text(
                    text = when (device.type.lowercase()) {
    "android" -> stringResource(R.string.device_management_device_type_android)
    "ios" -> stringResource(R.string.device_management_device_type_ios)
    "web" -> stringResource(R.string.device_management_device_type_web)
    "tv" -> stringResource(R.string.device_management_device_type_tv)
    else -> device.type.replaceFirstChar { it.uppercase() }
},
                    style = MaterialTheme.typography.bodyMedium,
                    color = getDeviceColor(device.type)
                )
                
                Text(
                    text = when {
                        device.lastActive.contains("ago") -> formatLastActive(device.lastActive)
                        device.lastActive.contains("T") -> "${stringResource(R.string.device_management_last_active_prefix)} ${formatLastActive(device.lastActive)}"
                        else -> formatLastActive(device.lastActive)
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.6f)
                )
            }

            // Remove button (only for other devices)
            if (!device.isCurrentDevice && enabled) {
                IconButton(
                    onClick = onRemove,
                    modifier = Modifier
                        .size(40.dp)
                        .background(
                            color = Color(0xFFEA4335).copy(alpha = 0.1f),
                            shape = RoundedCornerShape(10.dp)
                        )
                ) {
                    Icon(
                        imageVector = Icons.Default.Delete,
                        contentDescription = stringResource(R.string.device_management_delete_description),
                        tint = Color(0xFFEA4335),
                        modifier = Modifier.size(20.dp)
                    )
                }
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

private fun formatDeviceType(deviceType: String): String {
    return when (deviceType.lowercase()) {
        "android" -> "Android"
        "ios" -> "iOS"
        "web" -> "Web"
        "tv" -> "TV"
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
private fun DeviceRemovalConfirmationDialog(
    device: DeviceInfo,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = {
            Icon(
                imageVector = Icons.Default.Warning,
                contentDescription = null,
                tint = Color(0xFFEA4335),
                modifier = Modifier.size(32.dp)
            )
        },
        title = {
            Text(
                text = stringResource(R.string.device_management_delete_device_title),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )
        },
        text = {
            Column {
                Text(
                    text = stringResource(R.string.device_management_delete_device_confirm),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Device info card
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = Color(0xFFEA4335).copy(alpha = 0.1f)
                    ),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = getDeviceIcon(device.type),
                            contentDescription = null,
                            tint = getDeviceColor(device.type),
                            modifier = Modifier.size(24.dp)
                        )

                        Spacer(modifier = Modifier.width(12.dp))

                        Column {
                            Text(
                                text = device.name,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )

                            Text(
                                text = when (device.type.lowercase()) {
    "android" -> stringResource(R.string.device_management_device_type_android)
    "ios" -> stringResource(R.string.device_management_device_type_ios)
    "web" -> stringResource(R.string.device_management_device_type_web)
    "tv" -> stringResource(R.string.device_management_device_type_tv)
    else -> device.type.replaceFirstChar { it.uppercase() }
},
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                Text(
                    text = stringResource(R.string.device_management_delete_device_warning),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color(0xFFEA4335),
                    fontWeight = FontWeight.Medium
                )
            }
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFFEA4335)
                )
            ) {
                Text(
                    text = stringResource(R.string.device_management_delete_device_action),
                    fontWeight = FontWeight.Medium
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(
                    text = stringResource(R.string.device_management_delete_device_cancel),
                    fontWeight = FontWeight.Medium
                )
            }
        }
    )
}
