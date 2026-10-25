package com.streamcore.tv.presentation.screens.profile

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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.streamcore.tv.R
import com.streamcore.tv.core.utils.ShowToast
import com.streamcore.tv.domain.model.UiState
import com.streamcore.tv.presentation.components.*
import com.streamcore.tv.presentation.screens.profile.components.*
import com.streamcore.tv.presentation.theme.*

/**
 * Profile screen showing user information and account management
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    onNavigateBack: () -> Unit,
    onNavigateToSettings: () -> Unit,
    onNavigateToLogin: () -> Unit,
    viewModel: ProfileViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    
    // Load profile when screen opens
    LaunchedEffect(Unit) {
        viewModel.loadProfile()
    }
    
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
    
    Column(
        modifier = Modifier.fillMaxSize()
    ) {
        // Top App Bar
        TopAppBar(
            title = {
                Text(
                    text = stringResource(R.string.profile_title),
                    fontWeight = FontWeight.Bold
                )
            },
            navigationIcon = {
                IconButton(onClick = onNavigateBack) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = stringResource(R.string.cd_back)
                    )
                }
            },
            actions = {
                IconButton(onClick = onNavigateToSettings) {
                    Icon(
                        imageVector = Icons.Default.Settings,
                        contentDescription = stringResource(R.string.settings_title_alt)
                    )
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = Surface
            )
        )
        
        // Profile Content
        Box(
            modifier = Modifier
                .fillMaxSize()
                .weight(1f)
        ) {
            when (val profileState = uiState.profileState) {
                is UiState.Loading -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        LoadingIndicator()
                    }
                }
                
                is UiState.Success -> {
                    val profile = profileState.data
                    
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(24.dp)
                    ) {
                        // Profile Header
                        item {
                            ProfileHeader(
                                profile = profile,
                                onEditClick = { 
                                    // Profile editing requires server-side support
                                    // Currently read-only display
                                }
                            )
                        }
                        
                        // Subscription Info
                        profile.subscription?.let { subscription ->
                            item {
                                SubscriptionCard(
                                    subscription = subscription,
                                    onUpgradeClick = { 
                                        // Subscription upgrades handled externally
                                        // Contact admin for subscription changes
                                    }
                                )
                            }
                        }
                        
                        // Account Statistics
                        item {
                            AccountStatsSection(
                                watchHistory = uiState.watchHistoryCount,
                                favorites = uiState.favoritesCount,
                                devices = profile.devices.size
                            )
                        }
                        
                        // Devices Section
                        if (profile.devices.isNotEmpty()) {
                            item {
                                DevicesSection(
                                    devices = profile.devices,
                                    onRemoveDevice = viewModel::removeDevice,
                                    onRenameDevice = { deviceId, newName ->
                                        viewModel.renameDevice(deviceId, newName)
                                    }
                                )
                            }
                        }
                        
                        // Quick Actions
                        item {
                            QuickActionsSection(
                                onClearHistory = viewModel::clearWatchHistory,
                                onExportData = { 
                                    // Data export requires server-side implementation
                                    // Feature not yet available
                                },
                                onDeleteAccount = { 
                                    // Account deletion requires admin intervention
                                    // Contact support for account removal
                                }
                            )
                        }
                        
                        // Logout Section
                        item {
                            LogoutSection(
                                onLogout = viewModel::logout,
                                isLoading = uiState.isLoading
                            )
                        }
                    }
                }
                
                is UiState.Error -> {
                    ErrorScreen(
                        message = profileState.message,
                        onRetry = viewModel::loadProfile
                    )
                }
            }
        }
    }
}

@Composable
private fun ProfileHeader(
    profile: com.streamcore.tv.domain.model.UserProfile,
    onEditClick: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = Primary.copy(alpha = 0.1f)
        ),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Profile Avatar
                Card(
                    modifier = Modifier.size(64.dp),
                    shape = RoundedCornerShape(32.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = Primary
                    )
                ) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Person,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(32.dp)
                        )
                    }
                }
                
                // Edit Button
                IconButton(onClick = onEditClick) {
                    Icon(
                        imageVector = Icons.Default.Edit,
                        contentDescription = stringResource(R.string.profile_edit_profile),
                        tint = Primary
                    )
                }
            }
            
            // Profile Info
            Column(
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = profile.username ?: stringResource(R.string.user_label),
                    style = MaterialTheme.typography.headlineSmall,
                    color = TextPrimary,
                    fontWeight = FontWeight.Bold
                )
                
                profile.email?.let { email ->
                    Text(
                        text = email,
                        style = MaterialTheme.typography.bodyLarge,
                        color = TextSecondary
                    )
                }
                
                // User ID
                Text(
                    text = stringResource(R.string.profile_id_format, profile.id),
                    style = MaterialTheme.typography.bodySmall,
                    color = TextTertiary
                )
            }
        }
    }
}

@Composable
private fun AccountStatsSection(
    watchHistory: Int,
    favorites: Int,
    devices: Int
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
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
                text = stringResource(R.string.profile_stats_title),
                style = MaterialTheme.typography.titleMedium,
                color = TextPrimary,
                fontWeight = FontWeight.Bold
            )
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                StatItem(
                    icon = Icons.Default.History,
                    label = stringResource(R.string.nav_library), // Or add specific one
                    value = watchHistory.toString()
                )
                
                StatItem(
                    icon = Icons.Default.Favorite,
                    label = stringResource(R.string.nav_favorites),
                    value = favorites.toString()
                )
                
                StatItem(
                    icon = Icons.Default.Devices,
                    label = stringResource(R.string.devices_label),
                    value = devices.toString()
                )
            }
        }
    }
}

@Composable
private fun StatItem(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = Primary,
            modifier = Modifier.size(24.dp)
        )
        
        Text(
            text = value,
            style = MaterialTheme.typography.titleLarge,
            color = TextPrimary,
            fontWeight = FontWeight.Bold
        )
        
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = TextSecondary
        )
    }
}

@Composable
private fun LogoutSection(
    onLogout: () -> Unit,
    isLoading: Boolean
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = Error.copy(alpha = 0.1f)
        ),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.Logout,
                    contentDescription = null,
                    tint = Error,
                    modifier = Modifier.size(24.dp)
                )
                
                Text(
                    text = stringResource(R.string.profile_logout_title),
                    style = MaterialTheme.typography.titleMedium,
                    color = Error,
                    fontWeight = FontWeight.Bold
                )
            }
            
            Text(
                text = stringResource(R.string.profile_logout_message),
                style = MaterialTheme.typography.bodyMedium,
                color = TextSecondary
            )
            
            IPTVButton(
                text = if (isLoading) stringResource(R.string.logout_loading) else stringResource(R.string.logout_button),
                onClick = onLogout,
                enabled = !isLoading,
                variant = ButtonVariant.Primary,
                modifier = Modifier.fillMaxWidth(),
                isLoading = isLoading
            )
        }
    }
}
