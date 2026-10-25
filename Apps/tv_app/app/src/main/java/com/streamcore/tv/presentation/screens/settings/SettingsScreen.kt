package com.streamcore.tv.presentation.screens.settings

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import com.streamcore.tv.R
import com.streamcore.tv.core.utils.ShowToast
import com.streamcore.tv.domain.model.VideoQuality
import com.streamcore.tv.presentation.components.IPTVButton
import com.streamcore.tv.presentation.components.ButtonVariant
import com.streamcore.tv.presentation.screens.settings.components.SettingsSection
import com.streamcore.tv.presentation.screens.settings.components.SettingsItem
import com.streamcore.tv.presentation.screens.settings.components.SwitchSettingsItem
import com.streamcore.tv.presentation.screens.settings.components.DropdownSettingsItem
import com.streamcore.tv.presentation.screens.settings.components.ChangePasswordDialog
import com.streamcore.tv.presentation.screens.settings.components.LanguageSelector
import com.streamcore.tv.presentation.screens.settings.components.LanguageChangeNotification
import com.streamcore.tv.presentation.theme.*
import com.streamcore.tv.presentation.update.UpdateDialog
import com.streamcore.tv.presentation.update.UpdateManager
import com.streamcore.tv.data.remote.dto.VersionCheckResponseDto
import timber.log.Timber

// Helper function to calculate expiration text
@Composable
private fun calculateExpiresText(expiresAt: String?): String {
    return expiresAt?.let {
        runCatching {
            val instant = java.time.Instant.parse(it)
            val days = java.time.Duration.between(
                java.time.Instant.now(),
                instant
            ).toDays()
            if (days > 0) stringResource(R.string.settings_days_remaining, days) else stringResource(R.string.settings_expired)
        }.getOrElse {
            stringResource(R.string.settings_invalid_date)
        }
    } ?: stringResource(R.string.settings_no_expiry_date)
}

// Helper function to format subscription date
@Composable
private fun formatSubscriptionDate(expiresAt: String?): String {
    return expiresAt?.let {
        runCatching {
            val instant = java.time.Instant.parse(it)
            val locale = LocalContext.current.resources.configuration.locales[0]
            val formatter = java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy")
                .withLocale(locale)
            stringResource(
                R.string.settings_expires,
                instant.atZone(java.time.ZoneId.systemDefault()).format(formatter)
            )
        }.getOrElse {
            stringResource(R.string.settings_invalid_date)
        }
    } ?: stringResource(R.string.settings_no_expiry_date)
}

/**
 * Settings screen for app configuration
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onNavigateBack: () -> Unit,
    onNavigateToLogin: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    
    // Show messages
    uiState.message?.let { message ->
        ShowToast(message = message)
        LaunchedEffect(message) {
            viewModel.clearMessage()
        }
    }
    
    // Handle logout navigation
    LaunchedEffect(uiState.isLoggedOut) {
        if (uiState.isLoggedOut) {
            onNavigateToLogin()
        }
    }
    
    Box(
        modifier = Modifier.fillMaxSize()
    ) {
        // Modern gradient background
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Background,
                            Background.copy(alpha = 0.95f),
                            Surface1.copy(alpha = 0.8f)
                        )
                    )
                )
        )

        Column(
            modifier = Modifier.fillMaxSize()
        ) {
            // Modern Top App Bar with glassmorphism
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = Color.White.copy(alpha = 0.05f)
                ),
                shape = RoundedCornerShape(bottomStart = 24.dp, bottomEnd = 24.dp),
                border = androidx.compose.foundation.BorderStroke(
                    1.dp,
                    Color.White.copy(alpha = 0.1f)
                )
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // Back button with modern styling
                    Card(
                        modifier = Modifier.size(48.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = Color.White.copy(alpha = 0.1f)
                        ),
                        shape = RoundedCornerShape(12.dp),
                        onClick = onNavigateBack
                    ) {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = stringResource(R.string.cd_back),
                                tint = Color.White,
                                modifier = Modifier.size(24.dp)
                            )
                        }
                    }

                    // Title with modern typography
                    Column {
                        Text(
                            text = stringResource(R.string.settings_title),
                            style = MaterialTheme.typography.headlineMedium,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                        Text(
                            text = stringResource(R.string.settings_customize_experience),
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color.White.copy(alpha = 0.7f)
                        )
                    }
                }
            }

            // Settings Content with modern spacing
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(20.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp)
            ) {
                // Account Settings with animation
                item {
                    AnimatedVisibility(
                        visible = true,
                        enter = slideInVertically(
                            initialOffsetY = { it },
                            animationSpec = tween(600, delayMillis = 100)
                        ) + fadeIn(animationSpec = tween(600, delayMillis = 100))
                    ) {
                        AccountSettingsSection(
                            userProfile = uiState.userProfile,
                            onLogout = viewModel::logout,
                            onChangePassword = viewModel::changePassword,
                            isLoading = uiState.isLoading
                        )
                    }
                }

                // App Settings Section with animation
                item {
                    AnimatedVisibility(
                        visible = true,
                        enter = slideInVertically(
                            initialOffsetY = { it },
                            animationSpec = tween(600, delayMillis = 200)
                        ) + fadeIn(animationSpec = tween(600, delayMillis = 200))
                    ) {
                        AppSettingsSection(
                            isCheckingUpdate = uiState.isCheckingUpdate,
                            isUpToDate = uiState.isUpToDate,
                            onCheckForUpdates = viewModel::checkForUpdates
                        )
                    }
                }

                // Add some bottom padding for better scrolling
                item {
                    Spacer(modifier = Modifier.height(40.dp))
                }
            }
        }

        // Update Dialog
        val updateInfo = uiState.updateInfo
        if (uiState.showUpdateDialog && updateInfo != null) {
            val context = LocalContext.current
            UpdateDialog(
                versionInfo = updateInfo,
                onUpdate = {
                    UpdateManager.enqueueDownloadAndInstall(context, updateInfo)
                    viewModel.dismissUpdateDialog()
                },
                onLater = { viewModel.dismissUpdateDialog() },
                onPostpone = { viewModel.postponeUpdate() }
            )
        }
    }
}




@Composable
private fun AccountSettingsSection(
    userProfile: com.streamcore.tv.domain.model.UserProfile?,
    onLogout: () -> Unit,
    onChangePassword: (String, String) -> Unit,
    isLoading: Boolean
) {
    var showChangePasswordDialog by remember { mutableStateOf(false) }

    // Modern Account Section with enhanced design
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(
            defaultElevation = 0.dp
        ),
        shape = RoundedCornerShape(16.dp),
        border = androidx.compose.foundation.BorderStroke(
            1.dp,
            MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)
        )
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Modern Section Header with gradient and icon
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Profile icon with gradient background
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = Color.Transparent
                    ),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .background(
                                Brush.linearGradient(
                                    colors = listOf(
                                        Primary.copy(alpha = 0.2f),
                                        Primary.copy(alpha = 0.1f)
                                    )
                                )
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.AccountCircle,
                            contentDescription = null,
                            tint = Primary,
                            modifier = Modifier.size(28.dp)
                        )
                    }
                }

                Column {
                    Text(
                        text = stringResource(R.string.settings_account_title),
                        style = MaterialTheme.typography.headlineSmall,
                        color = Color.White,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = stringResource(R.string.settings_manage_account),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.7f)
                    )
                }
            }

            // Account Status Card - NEW
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = Color.White.copy(alpha = 0.05f)
                ),
                shape = RoundedCornerShape(12.dp),
                border = androidx.compose.foundation.BorderStroke(
                    1.dp,
                    MaterialTheme.colorScheme.outline.copy(alpha = 0.1f)
                )
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Status indicator
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .background(
                                    color = if (userProfile != null) Color.Green else Color.Yellow,
                                    shape = RoundedCornerShape(50)
                                )
                        )
                        Text(
                            text = if (userProfile != null) stringResource(R.string.settings_active_account) else stringResource(R.string.settings_loading_account),
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color.White,
                            fontWeight = FontWeight.Medium
                        )
                    }

                    // User info grid
                    if (userProfile != null) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            // Devices info
                            Column(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Text(
                                    text = stringResource(R.string.settings_active_devices, userProfile.deviceCount, userProfile.maxDevices),
                                    style = MaterialTheme.typography.titleMedium,
                                    color = Primary,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = stringResource(R.string.settings_devices_title),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Color.White.copy(alpha = 0.7f)
                                )
                            }

                            // Expiration info
                            Column(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                val expiresText = calculateExpiresText(userProfile.expiresAt)

                                Text(
                                    text = expiresText,
                                    style = MaterialTheme.typography.titleMedium,
                                    color = if (expiresText == "Expirado") Color.Red else Color.Green,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = stringResource(R.string.settings_remaining),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Color.White.copy(alpha = 0.7f)
                                )
                            }
                        }
                    }
                }
            }

            // User Name with modern design
            ModernAccountItem(
                title = stringResource(R.string.settings_username),
                subtitle = userProfile?.username ?: stringResource(R.string.settings_loading),
                icon = Icons.Default.Person,
                onClick = { 
                    // Username editing is typically handled server-side
                    // For now, this is read-only display
                },
                showArrow = false
            )

            // Change Password with modern design
            ModernAccountItem(
                title = stringResource(R.string.settings_change_password),
                subtitle = stringResource(R.string.settings_update_password_subtitle),
                icon = Icons.Default.Lock,
                onClick = { showChangePasswordDialog = true }
            )

            // Subscription Details
            ModernAccountItem(
                title = stringResource(R.string.settings_subscription_details),
                subtitle = formatSubscriptionDate(userProfile?.expiresAt),
                icon = Icons.Default.Schedule,
                onClick = { 
                    // Subscription details are displayed inline
                    // Contact admin for subscription changes
                }
            )

            // Device Management
            ModernAccountItem(
                title = stringResource(R.string.settings_device_management),
                subtitle = stringResource(R.string.settings_active_devices, userProfile?.deviceCount ?: 0, userProfile?.maxDevices ?: 0),
                icon = Icons.Default.Devices,
                onClick = { 
                    // Device management navigates to dedicated screen
                    // Available from profile or navigation menu
                }
            )

            // Spacer before logout
            Spacer(modifier = Modifier.height(8.dp))

            // Logout with modern danger styling
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = Color.Red.copy(alpha = 0.1f)
                ),
                shape = RoundedCornerShape(12.dp),
                border = androidx.compose.foundation.BorderStroke(
                    1.dp,
                    Color.Red.copy(alpha = 0.3f)
                ),
                onClick = onLogout,
                enabled = !isLoading
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.Logout,
                        contentDescription = null,
                        tint = Color.Red.copy(alpha = 0.8f),
                        modifier = Modifier.size(22.dp)
                    )

                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Text(
                            text = stringResource(R.string.settings_logout),
                            style = MaterialTheme.typography.bodyLarge,
                            color = Color.Red.copy(alpha = 0.9f),
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            text = stringResource(R.string.settings_logout_subtitle),
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color.Red.copy(alpha = 0.7f)
                        )
                    }

                    if (isLoading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            strokeWidth = 2.dp,
                            color = Color.Red.copy(alpha = 0.8f)
                        )
                    }
                }
            }
        }
    }

    // Change Password Dialog
    ChangePasswordDialog(
        isVisible = showChangePasswordDialog,
        onDismiss = { showChangePasswordDialog = false },
        onConfirm = { currentPassword, newPassword ->
            onChangePassword(currentPassword, newPassword)
            showChangePasswordDialog = false
        },
        isLoading = isLoading
    )
}

@Composable
private fun ModernAccountItem(
    title: String,
    subtitle: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit,
    showArrow: Boolean = true
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = Color.White.copy(alpha = 0.05f)
        ),
        shape = RoundedCornerShape(12.dp),
        border = androidx.compose.foundation.BorderStroke(
            1.dp,
            MaterialTheme.colorScheme.outline.copy(alpha = 0.1f)
        ),
        onClick = onClick
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Icon with subtle background
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(
                        color = Primary.copy(alpha = 0.1f),
                        shape = RoundedCornerShape(8.dp)
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = Primary,
                    modifier = Modifier.size(20.dp)
                )
            }

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyLarge,
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.White.copy(alpha = 0.7f)
                )
            }

            if (showArrow) {
                Icon(
                    imageVector = Icons.Default.ArrowDropDown,
                    contentDescription = null,
                    tint = Color.White.copy(alpha = 0.5f),
                    modifier = Modifier
                        .size(20.dp)
                        .animateContentSize()
                )
            }
        }
    }
}

@Composable
private fun AppSettingsSection(
    isCheckingUpdate: Boolean = false,
    isUpToDate: Boolean = false,
    onCheckForUpdates: () -> Unit = {}
) {
    var showLanguageNotification by remember { mutableStateOf(false) }
    val context = LocalContext.current

    SettingsSection(
        title = stringResource(R.string.settings_app_title),
        icon = Icons.Default.Settings
    ) {
        // Language Selector
        LanguageSelector(
            onLanguageChanged = { newLanguage ->
                showLanguageNotification = true
                
                // Force activity recreation for immediate language change
                try {
                    (context as? android.app.Activity)?.recreate()
                } catch (e: Exception) {
                    Timber.tag("SettingsScreen").w(e, "Failed to recreate activity")
                }
            }
        )

        Spacer(modifier = Modifier.height(12.dp))

        // Check for Updates Button
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = Color.White.copy(alpha = 0.05f)
            ),
            shape = RoundedCornerShape(12.dp),
            border = androidx.compose.foundation.BorderStroke(
                1.dp,
                MaterialTheme.colorScheme.outline.copy(alpha = 0.1f)
            ),
            onClick = { if (!isCheckingUpdate) onCheckForUpdates() },
            enabled = !isCheckingUpdate
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Icon with subtle background
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .background(
                            color = Primary.copy(alpha = 0.1f),
                            shape = RoundedCornerShape(8.dp)
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    if (isCheckingUpdate) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            strokeWidth = 2.dp,
                            color = Primary
                        )
                    } else {
                        Icon(
                            imageVector = if (isUpToDate) Icons.Default.CheckCircle else Icons.Default.SystemUpdate,
                            contentDescription = null,
                            tint = if (isUpToDate) Color.Green else Primary,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }

                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        text = stringResource(R.string.update_check_title),
                        style = MaterialTheme.typography.bodyLarge,
                        color = Color.White,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        text = if (isCheckingUpdate) {
                            stringResource(R.string.update_checking)
                        } else if (isUpToDate) {
                            stringResource(R.string.update_up_to_date)
                        } else {
                            stringResource(R.string.update_check_subtitle)
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (isUpToDate) Color.Green.copy(alpha = 0.8f) else Color.White.copy(alpha = 0.7f)
                    )
                }

                Icon(
                    imageVector = Icons.Default.ChevronRight,
                    contentDescription = null,
                    tint = Color.White.copy(alpha = 0.5f),
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }

    // Language change notification
    LanguageChangeNotification(
        isVisible = showLanguageNotification,
        onDismiss = { showLanguageNotification = false }
    )
}
