package com.streamcore.tv.presentation.screens.home.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.streamcore.tv.R
import com.streamcore.tv.presentation.theme.*

@Composable
fun SimpleNavigationSidebar(
    selectedCategory: String,
    onCategorySelected: (String) -> Unit,
    onSearchClick: () -> Unit,
    onSettingsClick: () -> Unit,
    onNavigateToLiveTV: () -> Unit = {},
    userName: String = "",
    userAvatar: String? = null,
    modifier: Modifier = Modifier
) {
    // Semi-transparent background for better visual integration
    val gradientBrush = Brush.verticalGradient(
        colors = listOf(
            Surface1.copy(alpha = 0.85f),
            Surface.copy(alpha = 0.75f)
        )
    )

    // Get navigation items before LazyColumn (composable context)
    val mainNavigationItems = getMainNavigationItems()
    val contentNavigationItems = getContentNavigationItems()
    val settingsNavigationItems = getSettingsNavigationItems()

    Surface(
        modifier = modifier
            .width(260.dp)
            .fillMaxHeight(),
        color = Color.Transparent,
        shadowElevation = 16.dp
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(gradientBrush)
                .border(
                    width = 1.dp,
                    color = Color.White.copy(alpha = 0.08f),
                    shape = RectangleShape
                )
        ) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp, vertical = 24.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                // Logo Section
                item {
                    SidebarLogoSection()
                    Spacer(modifier = Modifier.height(24.dp))
                }

                // User Section
                item {
                    SidebarUserSection(
                        userName = userName.ifEmpty { "Usuario" },
                        userAvatar = userAvatar
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    SidebarDivider()
                    Spacer(modifier = Modifier.height(16.dp))
                }

                // Main Navigation
                item {
                    SidebarSectionTitle(stringResource(R.string.nav_home))
                }

                items(mainNavigationItems) { item ->
                    ModernNavigationItem(
                        item = item,
                        isSelected = selectedCategory == item.id,
                        onClick = {
                            when (item.id) {
                                "search" -> onSearchClick()
                                "live_tv" -> onNavigateToLiveTV()
                                else -> {
                                    val categoryId = getCategoryMapping()[item.id] ?: item.id
                                    onCategorySelected(categoryId)
                                }
                            }
                        }
                    )
                }

                // Content Section
                item {
                    Spacer(modifier = Modifier.height(16.dp))
                    SidebarDivider()
                    Spacer(modifier = Modifier.height(16.dp))
                    SidebarSectionTitle(stringResource(R.string.nav_library))
                }

                items(contentNavigationItems) { item ->
                    ModernNavigationItem(
                        item = item,
                        isSelected = selectedCategory == item.id,
                        onClick = {
                            val categoryId = getCategoryMapping()[item.id] ?: item.id
                            onCategorySelected(categoryId)
                        }
                    )
                }

                // Settings Section
                item {
                    Spacer(modifier = Modifier.height(16.dp))
                    SidebarDivider()
                    Spacer(modifier = Modifier.height(16.dp))
                }

                items(settingsNavigationItems) { item ->
                    ModernNavigationItem(
                        item = item,
                        isSelected = selectedCategory == item.id,
                        onClick = {
                            when (item.id) {
                                "settings" -> onSettingsClick()
                                else -> onCategorySelected(item.id)
                            }
                        }
                    )
                }

                // Bottom spacing
                item {
                    Spacer(modifier = Modifier.height(24.dp))
                }
            }
        }
    }
}

@Composable
private fun SidebarLogoSection() {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Logo Icon with gradient
        Box(
            modifier = Modifier
                .size(48.dp)
                .background(
                    brush = Brush.linearGradient(
                        colors = listOf(Primary, Secondary)
                    ),
                    shape = RectangleShape
                ),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Default.PlayCircle,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(28.dp)
            )
        }

        Column {
            Text(
                text = stringResource(R.string.auth_brand_name),
                style = MaterialTheme.typography.titleLarge.copy(
                    fontWeight = FontWeight.Black,
                    letterSpacing = 0.5.sp
                ),
                color = Color.White
            )
            Text(
                text = stringResource(id = R.string.nav_premium_streaming),
                style = MaterialTheme.typography.bodySmall,
                color = TextTertiary
            )
        }
    }
}

@Composable
private fun SidebarUserSection(
    userName: String,
    userAvatar: String?
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                color = Surface2.copy(alpha = 0.5f),
                shape = RectangleShape
            )
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Avatar
        Box(
            modifier = Modifier
                .size(44.dp)
                .background(
                    brush = Brush.linearGradient(
                        colors = listOf(Primary.copy(alpha = 0.3f), Secondary.copy(alpha = 0.3f))
                    ),
                    shape = CircleShape
                )
                .border(2.dp, Primary.copy(alpha = 0.5f), CircleShape)
                .clip(CircleShape),
            contentAlignment = Alignment.Center
        ) {
            if (userAvatar != null) {
                AsyncImage(
                    model = userAvatar,
                    contentDescription = stringResource(R.string.cd_user_avatar),
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop
                )
            } else {
                Icon(
                    imageVector = Icons.Default.Person,
                    contentDescription = null,
                    tint = Primary,
                    modifier = Modifier.size(24.dp)
                )
            }
        }

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = userName,
                style = MaterialTheme.typography.bodyLarge.copy(
                    fontWeight = FontWeight.SemiBold
                ),
                color = Color.White,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = stringResource(id = R.string.nav_premium_badge),
                style = MaterialTheme.typography.bodySmall,
                color = RatingGold
            )
        }

        // Status indicator
        Box(
            modifier = Modifier
                .size(10.dp)
                .background(Success, CircleShape)
        )
    }
}

@Composable
private fun SidebarSectionTitle(title: String) {
    Text(
        text = title.uppercase(),
        style = MaterialTheme.typography.labelSmall.copy(
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.5.sp
        ),
        color = TextTertiary,
        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
    )
}

@Composable
private fun SidebarDivider() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(
                brush = Brush.horizontalGradient(
                    colors = listOf(
                        Color.Transparent,
                        Color.White.copy(alpha = 0.1f),
                        Color.Transparent
                    )
                )
            )
    )
}

@Composable
private fun ModernNavigationItem(
    item: SimpleNavigationItem,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    var isFocused by remember { mutableStateOf(false) }

    val scale by animateFloatAsState(
        targetValue = when {
            isFocused -> 1.02f
            isSelected -> 1.0f
            else -> 1f
        },
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessHigh
        ),
        label = "scale"
    )

    val backgroundColor by animateColorAsState(
        targetValue = when {
            isFocused -> Primary.copy(alpha = 0.25f)
            isSelected -> Primary.copy(alpha = 0.15f)
            else -> Color.Transparent
        },
        animationSpec = tween(200),
        label = "background"
    )

    val iconTint by animateColorAsState(
        targetValue = when {
            isFocused -> Color.White
            isSelected -> Primary
            else -> TextSecondary
        },
        animationSpec = tween(200),
        label = "iconTint"
    )

    val textColor by animateColorAsState(
        targetValue = when {
            isFocused -> Color.White
            isSelected -> Color.White
            else -> TextSecondary
        },
        animationSpec = tween(200),
        label = "textColor"
    )

    val borderColor by animateColorAsState(
        targetValue = when {
            isFocused -> Primary
            isSelected -> Primary.copy(alpha = 0.5f)
            else -> Color.Transparent
        },
        animationSpec = tween(200),
        label = "border"
    )

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .scale(scale)
            .background(backgroundColor, RectangleShape)
            .border(
                width = if (isFocused || isSelected) 1.dp else 0.dp,
                color = borderColor,
                shape = RectangleShape
            )
            .focusable()
            .onFocusChanged { isFocused = it.isFocused }
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Selection indicator bar
        Box(
            modifier = Modifier
                .width(3.dp)
                .height(20.dp)
                .background(
                    color = if (isSelected || isFocused) Primary else Color.Transparent,
                    shape = RectangleShape
                )
        )

        // Icon with subtle background
        Box(
            modifier = Modifier
                .size(36.dp)
                .background(
                    color = if (isSelected || isFocused) 
                        Primary.copy(alpha = 0.15f) 
                    else 
                        Surface3.copy(alpha = 0.5f),
                    shape = RectangleShape
                ),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = if (isSelected) item.iconFilled else item.icon,
                contentDescription = item.label,
                tint = iconTint,
                modifier = Modifier.size(20.dp)
            )
        }

        // Label
        Text(
            text = item.label,
            style = MaterialTheme.typography.bodyMedium.copy(
                fontWeight = if (isSelected || isFocused) FontWeight.SemiBold else FontWeight.Normal
            ),
            color = textColor,
            modifier = Modifier.weight(1f)
        )

        // Badge for special items
        if (item.showBadge) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .background(Secondary, CircleShape)
            )
        }
    }
}

// Category mappings
private fun getCategoryMapping() = mapOf(
    "movies" to "1",
    "series" to "8",
    "live_tv" to "2",
    "kids" to "6",
    "anime" to "7"
)

// Navigation items data
@Composable
private fun getMainNavigationItems() = listOf(
    SimpleNavigationItem(
        id = "home",
        label = stringResource(R.string.nav_home),
        icon = Icons.Outlined.Home,
        iconFilled = Icons.Filled.Home
    ),
    SimpleNavigationItem(
        id = "search",
        label = stringResource(R.string.nav_search),
        icon = Icons.Outlined.Search,
        iconFilled = Icons.Filled.Search
    ),
    SimpleNavigationItem(
        id = "live_tv",
        label = stringResource(R.string.nav_live_tv),
        icon = Icons.Outlined.LiveTv,
        iconFilled = Icons.Filled.LiveTv,
        showBadge = true
    )
)

@Composable
private fun getContentNavigationItems() = listOf(
    SimpleNavigationItem(
        id = "movies",
        label = stringResource(R.string.nav_movies),
        icon = Icons.Outlined.Movie,
        iconFilled = Icons.Filled.Movie
    ),
    SimpleNavigationItem(
        id = "series",
        label = stringResource(R.string.nav_series),
        icon = Icons.Outlined.Tv,
        iconFilled = Icons.Filled.Tv
    ),
    SimpleNavigationItem(
        id = "anime",
        label = stringResource(R.string.nav_anime),
        icon = Icons.Outlined.Animation,
        iconFilled = Icons.Filled.Animation
    ),
    SimpleNavigationItem(
        id = "kids",
        label = stringResource(R.string.nav_kids),
        icon = Icons.Outlined.ChildCare,
        iconFilled = Icons.Filled.ChildCare
    )
)

@Composable
private fun getSettingsNavigationItems() = listOf(
    SimpleNavigationItem(
        id = "settings",
        label = stringResource(R.string.nav_settings),
        icon = Icons.Outlined.Settings,
        iconFilled = Icons.Filled.Settings
    )
)

private data class SimpleNavigationItem(
    val id: String,
    val label: String,
    val icon: ImageVector,
    val iconFilled: ImageVector = icon,
    val showBadge: Boolean = false
)
