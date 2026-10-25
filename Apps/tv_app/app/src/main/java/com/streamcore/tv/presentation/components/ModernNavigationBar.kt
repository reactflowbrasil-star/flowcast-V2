package com.streamcore.tv.presentation.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
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
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R
import com.streamcore.tv.presentation.theme.*

/**
 * Modern navigation bar with glassmorphism effect
 */
@Composable
fun ModernNavigationBar(
    selectedItem: NavigationItemData,
    onItemSelected: (NavigationItemData) -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .height(80.dp),
        colors = CardDefaults.cardColors(
            containerColor = Color.White.copy(alpha = 0.05f)
        ),
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        border = androidx.compose.foundation.BorderStroke(
            1.dp,
            Color.White.copy(alpha = 0.1f)
        )
    ) {
        val navigationItems = getNavigationItems()

        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically
        ) {
            navigationItems.forEach { item ->
                ModernNavigationItem(
                    item = item,
                    isSelected = item.label == selectedItem.label,
                    onClick = { onItemSelected(item) }
                )
            }
        }
    }
}

@Composable
private fun ModernNavigationItem(
    item: NavigationItemData,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val focusRequester = remember { FocusRequester() }
    var isFocused by remember { mutableStateOf(false) }

    val scale by animateFloatAsState(
        targetValue = when {
            isSelected -> 1.1f
            isFocused -> 1.08f
            else -> 1f
        },
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessHigh
        ),
        label = "nav_scale"
    )

    val iconTint by animateColorAsState(
        targetValue = when {
            isSelected -> Primary
            isFocused -> Color.White
            else -> Color.White.copy(alpha = 0.6f)
        },
        animationSpec = tween(200),
        label = "icon_tint"
    )

    val textColor by animateColorAsState(
        targetValue = when {
            isSelected -> Color.White
            isFocused -> Color.White
            else -> Color.White.copy(alpha = 0.6f)
        },
        animationSpec = tween(200),
        label = "text_color"
    )

    Column(
        modifier = Modifier
            .scale(scale)
            .focusRequester(focusRequester)
            .onFocusChanged { isFocused = it.isFocused }
            .focusable()
            .clickable { onClick() }
            .padding(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        // Icon with background
        Box(
            modifier = Modifier
                .size(40.dp)
                .background(
                    brush = if (isSelected || isFocused) {
                        Brush.linearGradient(
                            colors = listOf(Primary, PrimaryLight)
                        )
                    } else {
                        Brush.linearGradient(
                            colors = listOf(
                                Color.Transparent,
                                Color.Transparent
                            )
                        )
                    },
                    shape = RoundedCornerShape(12.dp)
                )
                .clip(RoundedCornerShape(12.dp)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = item.icon,
                contentDescription = item.label,
                tint = if (isSelected) Color.White else iconTint,
                modifier = Modifier.size(24.dp)
            )
        }
        
        // Label
        Text(
            text = item.label,
            style = MaterialTheme.typography.labelSmall.copy(
                fontSize = 10.sp,
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
            ),
            color = textColor
        )
        
        // Selection indicator
        AnimatedVisibility(
            visible = isSelected,
            enter = scaleIn() + fadeIn(),
            exit = scaleOut() + fadeOut()
        ) {
            Box(
                modifier = Modifier
                    .width(20.dp)
                    .height(2.dp)
                    .background(
                        brush = Brush.horizontalGradient(
                            colors = listOf(Primary, PrimaryLight)
                        ),
                        shape = RoundedCornerShape(1.dp)
                    )
            )
        }
    }
}

/**
 * Modern sidebar navigation for larger screens
 */
@Composable
fun ModernSidebarNavigation(
    selectedItem: NavigationItemData,
    onItemSelected: (NavigationItemData) -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .width(240.dp)
            .fillMaxHeight(),
        colors = CardDefaults.cardColors(
            containerColor = Color.White.copy(alpha = 0.05f)
        ),
        shape = RoundedCornerShape(topEnd = 24.dp, bottomEnd = 24.dp),
        border = androidx.compose.foundation.BorderStroke(
            1.dp,
            Color.White.copy(alpha = 0.1f)
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Logo section
            ModernLogoSection()
            
            Spacer(modifier = Modifier.height(16.dp))

            val navigationItems = getNavigationItems()

            // Navigation items
            navigationItems.forEach { item ->
                ModernSidebarItem(
                    item = item,
                    isSelected = item.label == selectedItem.label,
                    onClick = { onItemSelected(item) }
                )
            }
            
            Spacer(modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun ModernLogoSection() {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .background(
                    brush = Brush.linearGradient(
                        colors = listOf(Primary, PrimaryLight)
                    ),
                    shape = RoundedCornerShape(12.dp)
                )
                .clip(RoundedCornerShape(12.dp)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Default.Tv,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(24.dp)
            )
        }
        
        Text(
            text = stringResource(R.string.auth_brand_name),
            style = MaterialTheme.typography.titleLarge.copy(
                fontWeight = FontWeight.Black,
                letterSpacing = 1.sp
            ),
            color = Color.White
        )
    }
}

@Composable
private fun ModernSidebarItem(
    item: NavigationItemData,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val focusRequester = remember { FocusRequester() }
    var isFocused by remember { mutableStateOf(false) }

    val backgroundColor by animateColorAsState(
        targetValue = when {
            isSelected -> Color.White.copy(alpha = 0.1f)
            isFocused -> Color.White.copy(alpha = 0.06f)
            else -> Color.Transparent
        },
        animationSpec = tween(200),
        label = "bg_color"
    )

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(48.dp)
            .background(
                color = backgroundColor,
                shape = RoundedCornerShape(12.dp)
            )
            .focusRequester(focusRequester)
            .onFocusChanged { isFocused = it.isFocused }
            .focusable()
            .clickable { onClick() }
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Icon(
            imageVector = item.icon,
            contentDescription = item.label,
            tint = when {
                isSelected -> Primary
                isFocused -> Color.White
                else -> Color.White.copy(alpha = 0.7f)
            },
            modifier = Modifier.size(24.dp)
        )

        Text(
            text = item.label,
            style = MaterialTheme.typography.bodyMedium.copy(
                fontWeight = if (isSelected || isFocused) FontWeight.SemiBold else FontWeight.Normal
            ),
            color = if (isSelected || isFocused) Color.White else Color.White.copy(alpha = 0.7f)
        )
    }
}



@Composable
private fun getNavigationItems(): List<NavigationItemData> {
    return listOf(
        NavigationItemData(stringResource(R.string.nav_home), Icons.Default.Home),
        NavigationItemData(stringResource(R.string.nav_search), Icons.Default.Search),
        NavigationItemData(stringResource(R.string.nav_library), Icons.Default.VideoLibrary),
        NavigationItemData(stringResource(R.string.nav_favorites), Icons.Default.Favorite),
        NavigationItemData(stringResource(R.string.nav_settings), Icons.Default.Settings)
    )
}

data class NavigationItemData(
    val label: String,
    val icon: ImageVector
)
