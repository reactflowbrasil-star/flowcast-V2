package com.streamcore.tv.presentation.components.livetv

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R as AppR
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.foundation.ExperimentalFoundationApi

import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.painterResource
import com.streamcore.tv.R

/**
 * Channel Search Bar Component
 *
 * Modern search bar for filtering channels
 * following Google TV design specifications
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun ChannelSearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    onSearch: (String) -> Unit,
    placeholder: String = stringResource(R.string.channel_search_placeholder),
    modifier: Modifier = Modifier,
    isActive: Boolean = false,
    onActiveChange: (Boolean) -> Unit = {}
) {
    var isFocused by remember { mutableStateOf(false) }
    
    // Animation values
    val borderColor by animateColorAsState(
        targetValue = when {
            isFocused -> Color(0xFF4285F4)
            isActive -> Color(0xFF34A853)
            else -> Color(0xFF16213E)
        },
        animationSpec = tween(250),
        label = "borderColor"
    )
    
    val backgroundColor by animateColorAsState(
        targetValue = if (isFocused) Color(0xFF1A1A2E) else Color(0xFF16213E),
        animationSpec = tween(250),
        label = "backgroundColor"
    )

    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(56.dp)
            .background(backgroundColor, RoundedCornerShape(16.dp))
            .border(
                width = 2.dp,
                color = borderColor,
                shape = RoundedCornerShape(16.dp)
            )
            .clip(RoundedCornerShape(16.dp))
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Search Icon
        Icon(
            imageVector = Icons.Default.Search,
            contentDescription = stringResource(R.string.channel_search_description),
            tint = if (isFocused) Color(0xFF4285F4) else Color(0xFFB0BEC5),
            modifier = Modifier.size(24.dp)
        )
        
        // Search Input
        Box(
            modifier = Modifier.weight(1f)
        ) {
            BasicTextField(
                value = query,
                onValueChange = onQueryChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .onFocusChanged { focusState ->
                        isFocused = focusState.isFocused
                        onActiveChange(focusState.isFocused)
                    },
                textStyle = TextStyle(
                    color = Color.White,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Normal
                ),
                cursorBrush = SolidColor(Color(0xFF4285F4)),
                singleLine = true,
                keyboardOptions = KeyboardOptions(
                    imeAction = ImeAction.Search
                ),
                keyboardActions = KeyboardActions(
                    onSearch = {
                        onSearch(query)
                    }
                )
            )
            
            // Placeholder
            if (query.isEmpty() && !isFocused) {
                Text(
                    text = placeholder,
                    color = Color(0xFFB0BEC5),
                    fontSize = 16.sp
                )
            }
        }
        
        // Clear Button
        if (query.isNotEmpty()) {
            IconButton(
                onClick = { onQueryChange("") },
                colors = IconButtonDefaults.iconButtonColors(
                    contentColor = Color(0xFFB0BEC5)
                ),
                modifier = Modifier.size(24.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Clear,
                    contentDescription = stringResource(R.string.channel_clear_description),
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}

/**
 * Search Filters Component
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun ChannelSearchFilters(
    selectedCategory: String?,
    onCategoryChange: (String?) -> Unit,
    selectedQuality: String?,
    onQualityChange: (String?) -> Unit,
    modifier: Modifier = Modifier
) {
    val categories = listOf(
        stringResource(R.string.channel_category_all),
        stringResource(R.string.channel_category_news),
        stringResource(R.string.channel_category_sports),
        stringResource(R.string.channel_category_entertainment),
        stringResource(R.string.channel_category_movies),
        stringResource(R.string.channel_category_kids)
    )
    val qualities = listOf(
        stringResource(R.string.channel_quality_all),
        stringResource(R.string.channel_quality_hd),
        stringResource(R.string.channel_quality_4k),
        stringResource(R.string.channel_quality_sd)
    )
    
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Category Filters
        val categoryAllText = stringResource(R.string.channel_category_all)
        FilterSection(
            title = stringResource(R.string.channel_category_title),
            options = categories,
            selectedOption = selectedCategory ?: categoryAllText,
            onOptionSelected = { option ->
                onCategoryChange(if (option == categoryAllText) null else option)
            }
        )
        
        // Quality Filters
        val qualityAllText = stringResource(R.string.channel_quality_all)
        FilterSection(
            title = stringResource(R.string.channel_quality_title),
            options = qualities,
            selectedOption = selectedQuality ?: qualityAllText,
            onOptionSelected = { option ->
                onQualityChange(if (option == qualityAllText) null else option)
            }
        )
    }
}

@Composable
private fun FilterSection(
    title: String,
    options: List<String>,
    selectedOption: String,
    onOptionSelected: (String) -> Unit
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(
            text = title,
            color = Color.White,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold
        )
        
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            options.forEach { option ->
                FilterChip(
                    selected = option == selectedOption,
                    onClick = { onOptionSelected(option) },
                    label = {
                        Text(
                            text = option,
                            fontSize = 12.sp,
                            fontWeight = if (option == selectedOption) FontWeight.Bold else FontWeight.Normal
                        )
                    },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = Color(0xFF4285F4),
                        selectedLabelColor = Color.White,
                        containerColor = Color(0xFF16213E),
                        labelColor = Color(0xFFB0BEC5)
                    ),
                    border = FilterChipDefaults.filterChipBorder(
                        enabled = true,
                        selected = option == selectedOption,
                        selectedBorderColor = Color(0xFF4285F4),
                        borderColor = Color(0xFF16213E)
                    )
                )
            }
        }
    }
}

/**
 * Search Results Summary
 */
@Composable
fun SearchResultsSummary(
    query: String,
    resultCount: Int,
    totalCount: Int,
    onClearSearch: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(Color(0xFF16213E), RoundedCornerShape(8.dp))
            .padding(16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text(
                text = if (query.isNotEmpty()) stringResource(R.string.channel_search_results, query) else stringResource(R.string.channel_search_all_channels),
                color = Color.White,
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold
            )
            
            Text(
                text = stringResource(AppR.string.live_tv_channel_count, resultCount, totalCount),
                color = Color(0xFFB0BEC5),
                fontSize = 14.sp
            )
        }
        
        if (query.isNotEmpty()) {
            TextButton(
                onClick = onClearSearch,
                colors = ButtonDefaults.textButtonColors(
                    contentColor = Color(0xFF4285F4)
                )
            ) {
                Text(
                    text = stringResource(AppR.string.live_tv_channel_clear),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

/**
 * No Results State
 */
@Composable
fun NoSearchResults(
    query: String,
    onClearSearch: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Icon(
            imageVector = Icons.Default.Search,
            contentDescription = null,
            tint = Color(0xFFB0BEC5),
            modifier = Modifier.size(64.dp)
        )
        
        Text(
            text = stringResource(AppR.string.live_tv_channel_search_no_results),
            color = Color.White,
            fontSize = 18.sp,
            fontWeight = FontWeight.SemiBold
        )
        
        Text(
            text = stringResource(AppR.string.live_tv_channel_search_no_match, query),
            color = Color(0xFFB0BEC5),
            fontSize = 14.sp
        )
        
        Button(
            onClick = onClearSearch,
            colors = ButtonDefaults.buttonColors(
                containerColor = Color(0xFF4285F4)
            ),
            shape = RoundedCornerShape(12.dp)
        ) {
            Text(
                text = stringResource(AppR.string.live_tv_channel_clear),
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium
            )
        }
    }
}

/**
 * Smart Search Suggestions Component
 */
@Composable
fun ChannelSearchSuggestions(
    query: String,
    suggestions: List<String>,
    onSuggestionClick: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    if (suggestions.isNotEmpty() && query.isNotEmpty()) {
        Card(
            modifier = modifier.fillMaxWidth(),
            shape = RoundedCornerShape(bottomStart = 12.dp, bottomEnd = 12.dp),
            colors = CardDefaults.cardColors(
                containerColor = Color(0xFF1A1A2E)
            ),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
        ) {
            Column(
                modifier = Modifier.padding(8.dp)
            ) {
                suggestions.take(5).forEach { suggestion ->
                    SuggestionItem(
                        text = suggestion,
                        query = query,
                        onClick = { onSuggestionClick(suggestion) }
                    )
                }
            }
        }
    }
}

@Suppress("UNUSED_PARAMETER")
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SuggestionItem(
    text: String,
    query: String,
    onClick: () -> Unit
) {
    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(
            containerColor = Color.Transparent
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.Search,
                contentDescription = null,
                tint = Color.White.copy(alpha = 0.6f),
                modifier = Modifier.size(16.dp)
            )

            Spacer(modifier = Modifier.width(12.dp))

            Text(
                text = text,
                color = Color.White,
                fontSize = 14.sp,
                modifier = Modifier.weight(1f)
            )
        }
    }
}
