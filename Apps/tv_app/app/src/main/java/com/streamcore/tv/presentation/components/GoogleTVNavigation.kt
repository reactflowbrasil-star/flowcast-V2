package com.streamcore.tv.presentation.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.streamcore.tv.presentation.navigation.GoogleTVFocusableContainer
import com.streamcore.tv.presentation.navigation.useGoogleTVFocusManager
import com.streamcore.tv.presentation.theme.*

/**
 * Google TV Navigation Components
 * 
 * Provides navigation components optimized for TV remote control
 * with proper focus management and visual feedback
 */

/**
 * Navigation item data class
 */
data class GoogleTVNavItem(
    val id: String,
    val label: String,
    val icon: ImageVector,
    val route: String,
    val isSelected: Boolean = false
)

/**
 * Vertical navigation rail for Google TV
 */
@Composable
fun GoogleTVNavigationRail(
    modifier: Modifier = Modifier,
    items: List<GoogleTVNavItem>,
    onItemClick: (GoogleTVNavItem) -> Unit = {}
) {
    Column(
        modifier = modifier
            .fillMaxHeight()
            .width(80.dp)
            .background(
                color = Surface,
                shape = RoundedCornerShape(topEnd = 16.dp, bottomEnd = 16.dp)
            )
            .padding(vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        items.forEach { item ->
            GoogleTVNavigationItem(
                item = item,
                onClick = { onItemClick(item) }
            )
        }
    }
}

/**
 * Individual navigation item for Google TV
 */
@Composable
fun GoogleTVNavigationItem(
    modifier: Modifier = Modifier,
    item: GoogleTVNavItem,
    onClick: () -> Unit = {}
) {
    val focusRequester = remember { FocusRequester() }
    var isFocused by remember { mutableStateOf(false) }
    
    val backgroundColor by animateColorAsState(
        targetValue = when {
            item.isSelected -> Primary
            isFocused -> Surface2
            else -> Color.Transparent
        },
        animationSpec = tween(200),
        label = "nav_background_color"
    )
    
    val contentColor by animateColorAsState(
        targetValue = when {
            item.isSelected -> OnPrimary
            isFocused -> OnSurface
            else -> OnSurfaceVariant
        },
        animationSpec = tween(200),
        label = "nav_content_color"
    )
    
    val scale by animateFloatAsState(
        targetValue = if (isFocused) 1.1f else 1.0f,
        animationSpec = GoogleTVFocus.Animation.BOUNCE_SPRING,
        label = "nav_scale"
    )
    
    GoogleTVFocusableContainer(
        modifier = modifier
            .size(64.dp)
            .scale(scale)
            .clip(RoundedCornerShape(16.dp))
            .background(backgroundColor)
            .clickable { onClick() }
            .focusRequester(focusRequester)
            .onFocusChanged { focusState ->
                isFocused = focusState.isFocused
            }
            .focusable(),
        onFocusChanged = { focused ->
            isFocused = focused
        }
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = item.icon,
                contentDescription = item.label,
                tint = contentColor,
                modifier = Modifier.size(24.dp)
            )
            
            Spacer(modifier = Modifier.height(4.dp))
            
            Text(
                text = item.label,
                color = contentColor,
                fontSize = 10.sp,
                fontWeight = if (item.isSelected) FontWeight.Bold else FontWeight.Normal,
                maxLines = 1
            )
        }
    }
    
    // Auto-focus if selected
    LaunchedEffect(item.isSelected) {
        if (item.isSelected) {
            focusRequester.requestFocus()
        }
    }
}

/**
 * Horizontal navigation bar for Google TV
 */
@Composable
fun GoogleTVNavigationBar(
    modifier: Modifier = Modifier,
    items: List<GoogleTVNavItem>,
    onItemClick: (GoogleTVNavItem) -> Unit = {}
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(72.dp)
            .background(
                color = Surface,
                shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
            )
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically
    ) {
        items.forEach { item ->
            GoogleTVNavigationBarItem(
                item = item,
                onClick = { onItemClick(item) },
                modifier = Modifier.weight(1f)
            )
        }
    }
}

/**
 * Individual navigation bar item for Google TV
 */
@Composable
fun GoogleTVNavigationBarItem(
    modifier: Modifier = Modifier,
    item: GoogleTVNavItem,
    onClick: () -> Unit = {}
) {
    val focusRequester = remember { FocusRequester() }
    var isFocused by remember { mutableStateOf(false) }
    
    val backgroundColor by animateColorAsState(
        targetValue = when {
            item.isSelected -> Primary
            isFocused -> Surface2
            else -> Color.Transparent
        },
        animationSpec = tween(200),
        label = "nav_bar_background_color"
    )
    
    val contentColor by animateColorAsState(
        targetValue = when {
            item.isSelected -> OnPrimary
            isFocused -> OnSurface
            else -> OnSurfaceVariant
        },
        animationSpec = tween(200),
        label = "nav_bar_content_color"
    )
    
    val scale by animateFloatAsState(
        targetValue = if (isFocused) 1.05f else 1.0f,
        animationSpec = GoogleTVFocus.Animation.BOUNCE_SPRING,
        label = "nav_bar_scale"
    )
    
    GoogleTVFocusableContainer(
        modifier = modifier
            .height(56.dp)
            .scale(scale)
            .clip(RoundedCornerShape(12.dp))
            .background(backgroundColor)
            .clickable { onClick() }
            .focusRequester(focusRequester)
            .onFocusChanged { focusState ->
                isFocused = focusState.isFocused
            }
            .focusable(),
        onFocusChanged = { focused ->
            isFocused = focused
        }
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 12.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = item.icon,
                contentDescription = item.label,
                tint = contentColor,
                modifier = Modifier.size(20.dp)
            )
            
            Spacer(modifier = Modifier.width(8.dp))
            
            Text(
                text = item.label,
                color = contentColor,
                fontSize = 14.sp,
                fontWeight = if (item.isSelected) FontWeight.Bold else FontWeight.Normal,
                maxLines = 1
            )
        }
    }
    
    // Auto-focus if selected
    LaunchedEffect(item.isSelected) {
        if (item.isSelected) {
            focusRequester.requestFocus()
        }
    }
}

/**
 * Tab navigation for Google TV
 */
@Composable
fun GoogleTVTabRow(
    modifier: Modifier = Modifier,
    selectedTabIndex: Int,
    tabs: List<String>,
    onTabClick: (Int) -> Unit = {}
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(48.dp)
            .background(
                color = Surface1,
                shape = RoundedCornerShape(12.dp)
            )
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        tabs.forEachIndexed { index, tab ->
            GoogleTVTab(
                text = tab,
                selected = index == selectedTabIndex,
                onClick = { onTabClick(index) },
                modifier = Modifier.weight(1f)
            )
        }
    }
}

/**
 * Individual tab for Google TV
 */
@Composable
fun GoogleTVTab(
    modifier: Modifier = Modifier,
    text: String,
    selected: Boolean,
    onClick: () -> Unit = {}
) {
    val focusRequester = remember { FocusRequester() }
    var isFocused by remember { mutableStateOf(false) }
    
    val backgroundColor by animateColorAsState(
        targetValue = when {
            selected -> Primary
            isFocused -> Surface2
            else -> Color.Transparent
        },
        animationSpec = tween(200),
        label = "tab_background_color"
    )
    
    val contentColor by animateColorAsState(
        targetValue = when {
            selected -> OnPrimary
            isFocused -> OnSurface
            else -> OnSurfaceVariant
        },
        animationSpec = tween(200),
        label = "tab_content_color"
    )
    
    val scale by animateFloatAsState(
        targetValue = if (isFocused) 1.02f else 1.0f,
        animationSpec = GoogleTVFocus.Animation.SMOOTH_SPRING,
        label = "tab_scale"
    )
    
    GoogleTVFocusableContainer(
        modifier = modifier
            .fillMaxHeight()
            .scale(scale)
            .clip(RoundedCornerShape(8.dp))
            .background(backgroundColor)
            .clickable { onClick() }
            .focusRequester(focusRequester)
            .onFocusChanged { focusState ->
                isFocused = focusState.isFocused
            }
            .focusable(),
        onFocusChanged = { focused ->
            isFocused = focused
        }
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = text,
                color = contentColor,
                fontSize = 14.sp,
                fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                maxLines = 1
            )
        }
    }
    
    // Auto-focus if selected
    LaunchedEffect(selected) {
        if (selected) {
            focusRequester.requestFocus()
        }
    }
}
