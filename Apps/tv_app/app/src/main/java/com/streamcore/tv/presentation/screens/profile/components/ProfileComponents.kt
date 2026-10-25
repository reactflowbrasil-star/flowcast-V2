package com.streamcore.tv.presentation.screens.profile.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.streamcore.tv.domain.model.*
import com.streamcore.tv.presentation.components.IPTVButton
import com.streamcore.tv.presentation.components.ButtonVariant
import com.streamcore.tv.presentation.theme.*

/**
 * Subscription card component
 */
@Composable
fun SubscriptionCard(
    subscription: SubscriptionInfo,
    onUpgradeClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (subscription.isActive) {
                Success.copy(alpha = 0.1f)
            } else {
                Warning.copy(alpha = 0.1f)
            }
        ),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = stringResource(R.string.profile_subscription),
                        style = MaterialTheme.typography.titleMedium,
                        color = TextPrimary,
                        fontWeight = FontWeight.Bold
                    )
                    
                    Text(
                        text = subscription.plan,
                        style = MaterialTheme.typography.bodyLarge,
                        color = TextSecondary,
                        fontWeight = FontWeight.Medium
                    )
                }
                
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = if (subscription.isActive) Success else Warning
                    ),
                    shape = RoundedCornerShape(6.dp)
                ) {
                    Text(
                        text = if (subscription.isActive) stringResource(R.string.account_active).uppercase() else stringResource(R.string.account_inactive).uppercase(),
                        style = MaterialTheme.typography.labelSmall,
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }
            
            // Expiration Date
            Text(
                text = subscription.expiresAt?.let { stringResource(R.string.profile_expires_at, it) } ?: stringResource(R.string.profile_date_not_available),
                style = MaterialTheme.typography.bodyMedium,
                color = TextTertiary
            )
            
            // Features
            if (subscription.features.isNotEmpty()) {
                Column(
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        text = stringResource(R.string.profile_features_title),
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextSecondary,
                        fontWeight = FontWeight.Medium
                    )
                    
                    subscription.features.forEach { feature ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Check,
                                contentDescription = null,
                                tint = Success,
                                modifier = Modifier.size(16.dp)
                            )
                            
                            Text(
                                text = feature,
                                style = MaterialTheme.typography.bodySmall,
                                color = TextSecondary
                            )
                        }
                    }
                }
            }
            
            // Upgrade Button
            if (!subscription.isActive) {
                IPTVButton(
                    text = stringResource(R.string.profile_renew_subscription),
                    onClick = onUpgradeClick,
                    variant = ButtonVariant.Primary,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}

/**
 * Devices section component
 */
@Composable
fun DevicesSection(
    devices: List<DeviceInfo>,
    onRemoveDevice: (String) -> Unit,
    onRenameDevice: (String, String) -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = Surface
        ),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = stringResource(R.string.profile_connected_devices),
                    style = MaterialTheme.typography.titleMedium,
                    color = TextPrimary,
                    fontWeight = FontWeight.Bold
                )
                
                Text(
                    text = stringResource(R.string.profile_devices_count_format, devices.size),
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextTertiary
                )
            }
            
            devices.forEach { device ->
                DeviceItem(
                    device = device,
                    onRemove = { onRemoveDevice(device.id) },
                    onRename = { newName -> onRenameDevice(device.id, newName) }
                )
            }
        }
    }
}

/**
 * Device item component
 */
@Composable
private fun DeviceItem(
    device: DeviceInfo,
    onRemove: () -> Unit,
    onRename: (String) -> Unit
) {
    var showRenameDialog by remember { mutableStateOf(false) }
    var showRemoveDialog by remember { mutableStateOf(false) }
    
    Card(
        colors = CardDefaults.cardColors(
            containerColor = if (device.isCurrentDevice) {
                Primary.copy(alpha = 0.1f)
            } else {
                SurfaceVariant
            }
        ),
        shape = RoundedCornerShape(8.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Icon(
                    imageVector = getDeviceIcon(device.type),
                    contentDescription = null,
                    tint = if (device.isCurrentDevice) Primary else TextSecondary,
                    modifier = Modifier.size(24.dp)
                )
                
                Column {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = device.name,
                            style = MaterialTheme.typography.bodyMedium,
                            color = TextPrimary,
                            fontWeight = FontWeight.Medium
                        )
                        
                        if (device.isCurrentDevice) {
                            Card(
                                colors = CardDefaults.cardColors(
                                    containerColor = Primary
                                ),
                                shape = RoundedCornerShape(4.dp)
                            ) {
                                Text(
                                    text = stringResource(R.string.current_label),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                        }
                    }
                    
                    Text(
                        text = stringResource(R.string.profile_last_activity, device.lastActive),
                        style = MaterialTheme.typography.bodySmall,
                        color = TextTertiary
                    )
                }
            }
            
            // Actions
            Row {
                IconButton(onClick = { showRenameDialog = true }) {
                    Icon(
                        imageVector = Icons.Default.Edit,
                        contentDescription = stringResource(R.string.profile_rename),
                        tint = TextSecondary
                    )
                }
                
                if (!device.isCurrentDevice) {
                    IconButton(onClick = { showRemoveDialog = true }) {
                        Icon(
                            imageVector = Icons.Default.Delete,
                            contentDescription = stringResource(R.string.profile_delete),
                            tint = Error
                        )
                    }
                }
            }
        }
    }
    
    // Rename Dialog
    if (showRenameDialog) {
        RenameDeviceDialog(
            currentName = device.name,
            onConfirm = { newName ->
                onRename(newName)
                showRenameDialog = false
            },
            onDismiss = { showRenameDialog = false }
        )
    }
    
    // Remove Dialog
    if (showRemoveDialog) {
        RemoveDeviceDialog(
            deviceName = device.name,
            onConfirm = {
                onRemove()
                showRemoveDialog = false
            },
            onDismiss = { showRemoveDialog = false }
        )
    }
}

/**
 * Quick actions section
 */
@Composable
fun QuickActionsSection(
    onClearHistory: () -> Unit,
    onExportData: () -> Unit,
    onDeleteAccount: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = Surface
        ),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = stringResource(R.string.profile_quick_actions),
                style = MaterialTheme.typography.titleMedium,
                color = TextPrimary,
                fontWeight = FontWeight.Bold
            )
            
            QuickActionItem(
                icon = Icons.Default.History,
                title = stringResource(R.string.profile_clear_history),
                subtitle = stringResource(R.string.profile_clear_history_desc),
                onClick = onClearHistory
            )
            
            QuickActionItem(
                icon = Icons.Default.Download,
                title = stringResource(R.string.profile_export_data),
                subtitle = stringResource(R.string.profile_export_data_desc),
                onClick = onExportData
            )
            
            QuickActionItem(
                icon = Icons.Default.DeleteForever,
                title = stringResource(R.string.profile_delete_account),
                subtitle = stringResource(R.string.profile_delete_account_desc),
                onClick = onDeleteAccount,
                isDestructive = true
            )
        }
    }
}

@Composable
private fun QuickActionItem(
    icon: ImageVector,
    title: String,
    subtitle: String,
    onClick: () -> Unit,
    isDestructive: Boolean = false
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = if (isDestructive) Error else TextSecondary,
            modifier = Modifier.size(24.dp)
        )
        
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyMedium,
                color = if (isDestructive) Error else TextPrimary,
                fontWeight = FontWeight.Medium
            )
            
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = TextTertiary
            )
        }
        
        Icon(
            imageVector = Icons.Default.ChevronRight,
            contentDescription = null,
            tint = TextTertiary
        )
    }
}

/**
 * Rename device dialog
 */
@Composable
private fun RenameDeviceDialog(
    currentName: String,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit
) {
    var newName by remember { mutableStateOf(currentName) }
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(stringResource(R.string.profile_rename_device))
        },
        text = {
            OutlinedTextField(
                value = newName,
                onValueChange = { newName = it },
                label = { Text(stringResource(R.string.profile_device_name)) },
                singleLine = true
            )
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(newName) },
                enabled = newName.isNotBlank() && newName != currentName
            ) {
                Text(stringResource(R.string.profile_save))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.profile_cancel))
            }
        }
    )
}

/**
 * Remove device dialog
 */
@Composable
private fun RemoveDeviceDialog(
    deviceName: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(stringResource(R.string.profile_delete_device))
        },
        text = {
            Text(stringResource(R.string.profile_delete_device_confirm, deviceName))
        },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(stringResource(R.string.profile_delete_device_action), color = Error)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.profile_cancel))
            }
        }
    )
}

/**
 * Get device icon based on type
 */
private fun getDeviceIcon(type: String): ImageVector {
    return when (type.lowercase()) {
        "tv", "android_tv" -> Icons.Default.Tv
        "phone", "mobile" -> Icons.Default.Phone
        "tablet" -> Icons.Default.Tablet
        "computer", "desktop" -> Icons.Default.Computer
        "laptop" -> Icons.Default.Laptop
        else -> Icons.Default.DeviceUnknown
    }
}
