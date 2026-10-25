package com.streamcore.tv.presentation.screens.settings

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.streamcore.tv.core.utils.ShowToast
import com.streamcore.tv.core.utils.getLanguageManager
import com.streamcore.tv.core.utils.rememberLanguage
import com.streamcore.tv.presentation.screens.settings.components.LanguageSelectionDialog
import com.streamcore.tv.presentation.screens.settings.components.AccountDialog
import com.streamcore.tv.presentation.theme.*
import timber.log.Timber


/**
 * Modern Google TV optimized settings screen with card-based layout
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GoogleTVSettingsScreen(
    onNavigateBack: () -> Unit,
    onNavigateToLogin: () -> Unit,
    onNavigateToDeviceManagement: () -> Unit = {},
    viewModel: SettingsViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val configuration = LocalConfiguration.current
    val isTablet = configuration.screenWidthDp > 600
    
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
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        Column(
            modifier = Modifier.fillMaxSize()
        ) {
            // Modern Header
            GoogleTVSettingsHeader(
                onNavigateBack = onNavigateBack,
                userProfile = uiState.userProfile
            )

            // Settings Grid
            GoogleTVSettingsGrid(
                modifier = Modifier.fillMaxSize(),
                isTablet = isTablet,
                userProfile = uiState.userProfile,
                onLogout = viewModel::logout,
                onChangePassword = viewModel::changePassword,
                onNavigateToDeviceManagement = onNavigateToDeviceManagement,
                onCheckUpdates = viewModel::checkForUpdates,
                isLoading = uiState.isLoading,
                isCheckingUpdate = uiState.isCheckingUpdate
            )
        }
    }
}

@Composable
private fun GoogleTVSettingsHeader(
    onNavigateBack: () -> Unit,
    userProfile: com.streamcore.tv.domain.model.UserProfile?
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
                    contentDescription = stringResource(R.string.cd_back_button),
                    tint = Primary,
                    modifier = Modifier.size(24.dp)
                )
            }

            Spacer(modifier = Modifier.width(16.dp))

            // Title and user info
            Column(
                modifier = Modifier.weight(1f)
            ) {
                Text(
                    text = stringResource(R.string.settings_title),
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
                
                userProfile?.let { profile ->
                    Text(
                        text = stringResource(R.string.auth_welcome) + ", ${profile.username}",
                        style = MaterialTheme.typography.bodyLarge,
                        color = Color.White.copy(alpha = 0.7f)
                    )
                }
            }

            // User avatar placeholder
            Icon(
                imageVector = Icons.Default.Person,
                contentDescription = stringResource(R.string.cd_user_avatar),
                tint = Color.White.copy(alpha = 0.9f),
                modifier = Modifier.size(28.dp)
            )
        }
    }
}

@Composable
private fun GoogleTVSettingsGrid(
    modifier: Modifier = Modifier,
    isTablet: Boolean,
    userProfile: com.streamcore.tv.domain.model.UserProfile?,
    onLogout: () -> Unit,
    onChangePassword: (String, String) -> Unit,
    onNavigateToDeviceManagement: () -> Unit,
    onCheckUpdates: () -> Unit,
    isLoading: Boolean,
    isCheckingUpdate: Boolean = false
) {
    val columns = if (isTablet) 3 else 2
    val context = LocalContext.current
    val languageManager = remember { context.getLanguageManager() }
    val currentLanguage = rememberLanguage(languageManager)
    var showLanguageDialog by remember { mutableStateOf(false) }
    var showAccountDialog by remember { mutableStateOf(false) }

    // Settings item strings
    val accountTitle = stringResource(R.string.settings_account_title)
    val accountSubtitle = stringResource(R.string.settings_manage_account)
    val devicesTitle = stringResource(R.string.settings_devices_title)
    val devicesSubtitle = stringResource(R.string.settings_device_management)
    val languageTitle = stringResource(R.string.settings_language)
    val languageSubtitle = stringResource(R.string.settings_language_subtitle)
    val updatesTitle = stringResource(R.string.settings_check_updates)
    val updatesSubtitle = stringResource(R.string.settings_check_updates_subtitle)

    // Settings items data
    val settingsItems = remember {
        mutableListOf<SettingsCardItem>().apply {
            add(
                SettingsCardItem(
                    id = "account",
                    title = accountTitle,
                    subtitle = accountSubtitle,
                    icon = Icons.Default.AccountCircle,
                    color = Color(0xFF4285F4)
                )
            )
            add(
                SettingsCardItem(
                    id = "devices",
                    title = devicesTitle,
                    subtitle = devicesSubtitle,
                    icon = Icons.Default.Devices,
                    color = Color(0xFF34A853)
                )
            )
            add(
                SettingsCardItem(
                    id = "language",
                    title = languageTitle,
                    subtitle = languageSubtitle,
                    icon = Icons.Default.Language,
                    color = Color(0xFFFBBC04)
                )
            )
            add(
                SettingsCardItem(
                    id = "updates",
                    title = updatesTitle,
                    subtitle = updatesSubtitle,
                    icon = Icons.Default.SystemUpdate,
                    color = Color(0xFF9C27B0)
                )
            )

        }
    }

    LazyVerticalGrid(
        columns = GridCells.Fixed(columns),
        modifier = modifier.padding(16.dp),
        contentPadding = PaddingValues(8.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        items(settingsItems, key = { it.id }) { item ->
            GoogleTVSettingsCard(
                item = item,
                onClick = {
                    when (item.id) {
                        "account" -> { showAccountDialog = true }
                        "devices" -> onNavigateToDeviceManagement()
                        "language" -> { showLanguageDialog = true }
                        "updates" -> {
                            // Call our backend API to check for updates
                            onCheckUpdates()
                        }
                    }
                }
            )
        }
    }
    if (showLanguageDialog) {
        LanguageSelectionDialog(
            currentLanguage = currentLanguage,
            onLanguageSelected = { selected ->
                languageManager.setLanguage(selected)
                showLanguageDialog = false
                
                // Force activity recreation for immediate UI update
                try {
                    (context as? android.app.Activity)?.recreate()
                } catch (e: Exception) {
                    Timber.tag("GoogleTVSettings").w(e, "Failed to recreate activity")
                }
            },
            onDismiss = { showLanguageDialog = false }
        )
    }
    if (showAccountDialog) {
        AccountDialog(
            userProfile = userProfile,
            onChangePassword = { current, new -> onChangePassword(current, new) },
            onLogout = onLogout,
            onDismiss = { showAccountDialog = false }
        )
    }
}

@Composable
private fun GoogleTVSettingsCard(
    item: SettingsCardItem,
    onClick: () -> Unit
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()
    var isPressed by remember { mutableStateOf(false) }
    
    val scale by animateFloatAsState(
        targetValue = when {
            isPressed -> 0.98f
            isFocused -> 1.02f
            else -> 1f
        },
        animationSpec = tween(durationMillis = 150)
    )

    val containerColor by animateColorAsState(
        targetValue = if (isFocused)
            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.12f)
        else
            MaterialTheme.colorScheme.surface,
        animationSpec = tween(150),
        label = "gtvCardContainer"
    )
    val outline = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)
    val borderColor by animateColorAsState(
        targetValue = if (isFocused) item.color else outline,
        animationSpec = tween(150),
        label = "gtvCardBorder"
    )

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(1.2f)
            .scale(scale)
            .focusable(interactionSource = interactionSource)
            .clickable(
                interactionSource = interactionSource,
                indication = null
            ) {
                isPressed = true
                onClick()
                // Reset pressed state after a short delay
                isPressed = false
            },
        colors = CardDefaults.cardColors(
            containerColor = containerColor
        ),
        elevation = CardDefaults.cardElevation(
            defaultElevation = 0.dp
        ),
        shape = RoundedCornerShape(12.dp),
        border = androidx.compose.foundation.BorderStroke(
            if (isFocused) 2.dp else 1.dp,
            borderColor
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = item.icon,
                contentDescription = item.title,
                tint = if (isFocused) item.color else Color.White.copy(alpha = 0.85f),
                modifier = Modifier.size(32.dp)
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Title
            Text(
                text = item.title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = if (isFocused) item.color else Color.White,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(4.dp))

            // Subtitle
            Text(
                text = item.subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.7f),
                textAlign = TextAlign.Center,
                lineHeight = 16.sp
            )
        }
    }
}

/**
 * Data class for settings card items
 */
private data class SettingsCardItem(
    val id: String,
    val title: String,
    val subtitle: String,
    val icon: ImageVector,
    val color: Color
)
