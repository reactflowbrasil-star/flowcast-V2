@file:OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)
package com.streamcore.tv.presentation.components.livetv.v2

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import coil.compose.AsyncImage
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.streamcore.tv.domain.model.ContentStream
import com.streamcore.tv.presentation.screens.livetv.EPGViewModel
import androidx.hilt.navigation.compose.hiltViewModel
import com.streamcore.tv.presentation.components.livetv.v2.ChannelSwitcherV2ViewModel
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R
import kotlinx.coroutines.delay


import androidx.compose.ui.semantics.*
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController






import androidx.compose.ui.input.key.onKeyEvent

/**
 * ChannelSwitcherV2Overlay (skeleton)
 *
 * OTT-style overlay wrapper with:
 * - Left sticky channel list
 * - Right details area (now/next placeholders)
 * - Optional PiP placeholder guarded by pipEnabled
 * - Focusable, fast-to-open shell (<150ms) suitable for iterative build-out
 */
@Composable
fun ChannelSwitcherV2Overlay(
    isVisible: Boolean,
    channels: List<ContentStream>,
    currentChannelId: String?,
    onChannelSelected: (ContentStream) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    epgViewModel: EPGViewModel? = null,
    epgNow: Map<String, com.streamcore.tv.domain.model.EPGProgram?> = emptyMap(),
    epgNext: Map<String, com.streamcore.tv.domain.model.EPGProgram?> = emptyMap(),
    categories: List<String> = emptyList(),
    selectedCategory: String? = null,
    onSelectCategory: (String?) -> Unit = {},
    pipEnabled: Boolean = false,
    v2ViewModel: com.streamcore.tv.presentation.components.livetv.v2.ChannelSwitcherV2ViewModel? = null
) {
    val accent = MaterialTheme.colorScheme.primary
    val panelBg = MaterialTheme.colorScheme.surface
    val cardBg = MaterialTheme.colorScheme.surfaceVariant
    val muted = MaterialTheme.colorScheme.onSurfaceVariant

    // Local search query (text & numeric)
    var query by remember { mutableStateOf("") }
    var debouncedQuery by remember { mutableStateOf("") }
    
    // Debounce search input for 250-300ms to avoid filtering on every keypress
    LaunchedEffect(query) {
        val snapshot = query
        delay(300)
        if (snapshot == query) {
            debouncedQuery = snapshot
        }
    }
    
    // Stable focus requesters for first elements on each pane
    val leftFocus = remember { FocusRequester() }
    val rightFocus = remember { FocusRequester() }
    val allChipFocus = remember { FocusRequester() }
    var queryEnabled by remember { mutableStateOf(false) }
    val queryFocus = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current
    
    // V2 ViewModel (optional) - prefer provided v2ViewModel, otherwise obtain via Hilt
    val localV2ViewModel = v2ViewModel ?: hiltViewModel<com.streamcore.tv.presentation.components.livetv.v2.ChannelSwitcherV2ViewModel>()
    val v2State by localV2ViewModel.uiState.collectAsState()
    
    // Derive channels/categories/favorites from V2 ViewModel with fallbacks to provided params
    val overlayChannels = if (v2State.channels.isNotEmpty()) v2State.channels else channels
    val overlayCategories = if (v2State.categories.isNotEmpty()) v2State.categories else categories
    val overlaySelectedCategory = v2State.selectedCategory ?: selectedCategory
    val overlayFavorites = v2State.favorites

    // LazyList state for channel list and focused index for keyboard navigation
    val channelListState = androidx.compose.foundation.lazy.rememberLazyListState()
    var focusedIndex by remember { mutableIntStateOf(0) }
    var currentFocusPane by remember { mutableStateOf("left") } // Track which pane has focus: "left", "right"
    // Toggle for switching between Details and EPG Grid view
    var showGrid by remember { mutableStateOf(false) }
    var gridCurrentTime by remember {
        mutableStateOf(java.time.LocalDateTime.now().withSecond(0).withNano(0))
    }

    // Precompute filtered channels so key handlers can access the same list
    val filteredChannels = remember(overlayChannels, debouncedQuery) {
        val q = debouncedQuery.trim()
        if (q.isEmpty()) overlayChannels else {
            val lc = q.lowercase()
            overlayChannels.filter { ch ->
                ch.title.lowercase().contains(lc) ||
                ch.id.lowercase().contains(lc) ||
                (ch.channelNumber?.toString()?.contains(q) == true)
            }
        }
    }
    
    // Load channels when overlay becomes visible and set focus
    LaunchedEffect(isVisible) {
        if (isVisible) {
            localV2ViewModel.loadChannels()
            val idx = overlayChannels.indexOfFirst { it.id == currentChannelId }
            focusedIndex = if (idx >= 0) idx else 0
            if (overlayChannels.isNotEmpty()) {
                try {
                    channelListState.animateScrollToItem(focusedIndex)
                } catch (_: Exception) { }
            }
        }
    }

    // Ensure list scrolls when focusedIndex changes
    LaunchedEffect(focusedIndex) {
        if (filteredChannels.isNotEmpty()) {
            try {
                channelListState.animateScrollToItem(focusedIndex)
            } catch (_: Exception) {}
        }
    }
    
    // When channels update, request multi-channel EPG
    LaunchedEffect(v2State.channels) {
        val ids = v2State.channels.map { it.id }
        if (ids.isNotEmpty()) {
            localV2ViewModel.loadEPGForChannels(ids)
        }
    }

    LaunchedEffect(isVisible) {
        if (isVisible) {
            while (true) {
                gridCurrentTime = java.time.LocalDateTime.now().withSecond(0).withNano(0)
                delay(30_000)
            }
        }
    }
    
    // Now/Next maps preferring V2 ViewModel data
    val nowMap = if (v2State.epgData.isNotEmpty()) v2State.nowMap else epgNow
    val nextMap = if (v2State.epgData.isNotEmpty()) v2State.nextMap else epgNext
    val liveChannelsDescription = stringResource(R.string.live_channels_title)
    val channelSearchDescription = stringResource(R.string.channel_search_description)

    AnimatedVisibility(
        visible = isVisible,
        enter = slideInHorizontally(initialOffsetX = { -it }) + fadeIn(),
        exit = slideOutHorizontally(targetOffsetX = { -it }) + fadeOut()
    ) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.45f))
                .semantics {
                    liveRegion = LiveRegionMode.Assertive
                    contentDescription = liveChannelsDescription
                }
                .onKeyEvent { keyEvent ->
                    // Allow default Up/Down focus traversal to operate (so items receive focus and show ring).
                    // Intercept center/enter, left/right and back for explicit behavior.
                    val native = keyEvent.nativeKeyEvent
                    if (native.action != android.view.KeyEvent.ACTION_DOWN) return@onKeyEvent false
                    when (native.keyCode) {
                        android.view.KeyEvent.KEYCODE_DPAD_CENTER,
                        android.view.KeyEvent.KEYCODE_ENTER -> {
                            val ch = filteredChannels.getOrNull(focusedIndex)
                            if (ch != null) {
                                try { localV2ViewModel.saveLastViewedChannel(ch.id) } catch (_: Exception) {}
                                onChannelSelected(ch)
                                true
                            } else false
                        }
                        android.view.KeyEvent.KEYCODE_DPAD_RIGHT -> {
                            // move focus to right pane (details / grid)
                            rightFocus.requestFocus()
                            true
                        }
                        android.view.KeyEvent.KEYCODE_DPAD_LEFT -> {
                            // ensure categories ("All") receives focus (not the search input)
                            allChipFocus.requestFocus()
                            true
                        }
                        android.view.KeyEvent.KEYCODE_BACK -> {
                            onDismiss()
                            true
                        }
                        else -> false
                    }
                }
        ) {
            Card(
                modifier = Modifier
                    .fillMaxHeight()
                    .width(1100.dp)
                    .padding(vertical = 24.dp)
                    .align(Alignment.CenterStart),
                colors = CardDefaults.cardColors(containerColor = Color.Transparent),
                elevation = CardDefaults.cardElevation(0.dp),
                shape = RoundedCornerShape(topEnd = 16.dp, bottomEnd = 16.dp)
            ) {
                Column(
                    modifier = Modifier.fillMaxSize()
                ) {
                    // Header
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(panelBg.copy(alpha = 0.9f))
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = stringResource(R.string.live_channels_title),
                            color = Color(0xFFF0F6FC),
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.weight(1f).semantics { heading() }
                        )

                        // Grid toggle for switching between Details and EPG Grid view
                        IconButton(onClick = { showGrid = !showGrid }) {
                            Icon(
                                imageVector = Icons.Default.GridView,
                                contentDescription = if (showGrid) stringResource(R.string.label_view_large) else stringResource(R.string.category_grid_size_description),
                                tint = if (showGrid) accent else muted
                            )
                        }

                        IconButton(onClick = onDismiss) {
                            Icon(
                                imageVector = Icons.Default.Close,
                                contentDescription = stringResource(R.string.common_close),
                                tint = muted
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    // Body
                    Row(
                        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        // PANE 1: Categories
                        Column(
                            modifier = Modifier
                                .width(220.dp)
                                .fillMaxHeight()
                                .background(panelBg.copy(alpha = 0.85f), RoundedCornerShape(12.dp))
                                .padding(12.dp)
                        ) {
                            Text(
                                text = stringResource(R.string.categories_header).uppercase(),
                                style = MaterialTheme.typography.labelSmall,
                                color = muted,
                                modifier = Modifier.padding(bottom = 12.dp, start = 4.dp)
                            )

                            if (overlayCategories.isNotEmpty()) {
                                val cats = remember(overlayCategories) { listOf<String?>(null) + overlayCategories }
                                LazyColumn(
                                    modifier = Modifier.fillMaxSize(),
                                    verticalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    items(cats) { cat ->
                                        val isSelected = (overlaySelectedCategory == cat)
                                        Surface(
                                            modifier = if (cat == null) Modifier.focusRequester(allChipFocus) else Modifier,
                                            onClick = {
                                                localV2ViewModel.selectCategory(cat)
                                                onSelectCategory(cat)
                                            },
                                            shape = RoundedCornerShape(8.dp),
                                            color = if (isSelected) accent else cardBg.copy(alpha = 0.5f),
                                            border = if (isSelected) null else androidx.compose.foundation.BorderStroke(1.dp, Color.White.copy(alpha = 0.1f))
                                        ) {
                                            Row(
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .padding(horizontal = 12.dp, vertical = 10.dp),
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Text(
                                                    text = cat ?: stringResource(R.string.categories_all),
                                                    color = if (isSelected) Color.White else Color.LightGray,
                                                    fontSize = 14.sp,
                                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                                    modifier = Modifier.weight(1f),
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // PANE 2: Channels
                        Column(
                            modifier = Modifier
                                .width(320.dp)
                                .fillMaxHeight()
                                .background(panelBg.copy(alpha = 0.85f), RoundedCornerShape(12.dp))
                                .padding(12.dp)
                        ) {
                            // Search field + Voice input
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(bottom = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                               androidx.compose.material3.TextField(
                                    value = query,
                                    onValueChange = { query = it },
                                    singleLine = true,
                                    placeholder = { Text(stringResource(R.string.channels_search_hint), fontSize = 14.sp) },
                                    readOnly = !queryEnabled,
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(48.dp)
                                        .semantics { contentDescription = channelSearchDescription }
                                        .focusProperties { canFocus = queryEnabled }
                                        .focusRequester(queryFocus)
                                        .onFocusChanged {
                                            if (it.isFocused && !queryEnabled) {
                                                focusManager.clearFocus()
                                            }
                                        },
                                    shape = RoundedCornerShape(8.dp),
                                    colors = androidx.compose.material3.TextFieldDefaults.colors(
                                        unfocusedContainerColor = cardBg.copy(alpha = 0.7f),
                                        focusedContainerColor = cardBg.copy(alpha = 0.7f),
                                        focusedTextColor = Color.White,
                                        unfocusedIndicatorColor = Color.Transparent,
                                        focusedIndicatorColor = Color.Transparent,
                                        cursorColor = accent,
                                        focusedPlaceholderColor = muted,
                                        unfocusedPlaceholderColor = muted.copy(alpha = 0.7f)
                                    ),
                                    textStyle = androidx.compose.ui.text.TextStyle(fontSize = 14.sp)
                                )
                               IconButton(onClick = {
                                   queryEnabled = !queryEnabled
                                   if (queryEnabled) {
                                       try { queryFocus.requestFocus() } catch (_: Exception) {}
                                   }
                               }) {
                                   Icon(
                                       imageVector = Icons.Filled.Search,
                                       contentDescription = stringResource(R.string.search_description),
                                       tint = muted
                                   )
                               }
                            }

                            if (filteredChannels.isEmpty()) {
                                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                    Text(stringResource(R.string.live_tv_channel_search_no_results), color = muted, fontSize = 14.sp)
                                }
                            } else {
                                // Channels list
                                ChannelListPane(
                                    channels = filteredChannels,
                                    currentChannelId = currentChannelId,
                                    onChannelSelected = { ch ->
                                        localV2ViewModel.saveLastViewedChannel(ch.id)
                                        onChannelSelected(ch)
                                    },
                                    favorites = overlayFavorites,
                                    onToggleFavorite = { id -> localV2ViewModel.toggleFavorite(id) },
                                    focusedIndex = focusedIndex,
                                    listState = channelListState,
                                    onItemFocused = { idx -> focusedIndex = idx },
                                    searchQuery = debouncedQuery,
                                    modifier = Modifier
                                        .weight(1f)
                                        .focusRequester(leftFocus)
                                        .focusable()
                                )
                            }
                        }

                        // PANE 3: Preview & EPG
                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxHeight()
                                .background(panelBg.copy(alpha = 0.85f), RoundedCornerShape(12.dp))
                                .padding(12.dp)
                                .focusRequester(rightFocus)
                                .focusable()
                        ) {
                            // PiP placeholder (behind flag)
                            if (pipEnabled) {
                                PiPPreviewPlaceholder(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(160.dp)
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                            }

                            // Details area mirrors current selection or show EPG grid when toggled
                            if (showGrid) {
                                ChannelSwitcherV2Grid(
                                    channels = overlayChannels,
                                    epgData = v2State.epgData,
                                    currentTime = gridCurrentTime,
                                    modifier = Modifier
                                        .weight(1f)
                                        .fillMaxWidth()
                                )
                            } else {
                                DetailsPane(
                                    now = currentChannelId?.let { nowMap[it] },
                                    next = currentChannelId?.let { nextMap[it] },
                                    channelTitle = overlayChannels.firstOrNull { it.id == currentChannelId }?.title,
                                    previewImageUrl = overlayChannels.firstOrNull { it.id == currentChannelId }?.imageUrl,
                                    modifier = Modifier
                                        .weight(1f)
                                        .fillMaxWidth()
                                )
                            }
                        }
                    }
                }
            }

           // Initial focus when opening
           LaunchedEffect(isVisible) {
               if (isVisible) {
                   delay(100) // Give time for UI to compose
                   try {
                       if (showGrid) rightFocus.requestFocus() else allChipFocus.requestFocus()
                   } catch (e: Exception) {
                       // Ignore focus errors during transitions
                   }
               }
           }

            // When toggling between Details and Grid ensure focus moves to the appropriate pane
            LaunchedEffect(showGrid, isVisible) {
                if (isVisible) {
                    // allow layout to settle then request focus
                    delay(100) // Give time for layout change
                    try {
                        if (showGrid) {
                            rightFocus.requestFocus()
                        } else {
                            // always focus the "All" chip when returning to categories
                            allChipFocus.requestFocus()
                        }
                    } catch (e: Exception) {
                        // Ignore focus errors
                    }
                }
            }
        }
    }
}

@Composable
fun ChannelListPane(
    channels: List<ContentStream>,
    currentChannelId: String?,
    onChannelSelected: (ContentStream) -> Unit,
    favorites: Set<String> = emptySet(),
    onToggleFavorite: (String) -> Unit = {},
    focusedIndex: Int = -1,
    listState: androidx.compose.foundation.lazy.LazyListState? = null,
    onItemFocused: (Int) -> Unit = {},
    searchQuery: String = "",
    modifier: Modifier = Modifier,
    itemVerticalPadding: androidx.compose.ui.unit.Dp = 8.dp,
    numberWidth: androidx.compose.ui.unit.Dp = 56.dp,
    verticalSpacing: androidx.compose.ui.unit.Dp = 6.dp
) {
    val accent = MaterialTheme.colorScheme.primary
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val currentColor = MaterialTheme.colorScheme.tertiary
    val state = listState ?: androidx.compose.foundation.lazy.rememberLazyListState()

    LazyColumn(
        state = state,
        modifier = modifier,
        contentPadding = PaddingValues(vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(verticalSpacing)
    ) {
        itemsIndexed(items = channels, key = { _, channel -> channel.id }) { index, channel ->
            val isCurrent = channel.id == currentChannelId
            val isFavorite = favorites.contains(channel.id)
            val isFocused = index == focusedIndex

            // Visual: selected = white pill, focused = light highlight, current = green title
            val listBg = Color(0xFF0F1114)
            val rowBg = when {
                isCurrent -> Color.White
                isFocused -> Color.White.copy(alpha = 0.12f)
                else -> Color.Transparent
            }
            val titleColor = when {
                isCurrent -> currentColor
                isFocused -> Color.White
                else -> Color.White
            }

            // Build annotated title with highlighted query matches only when search is active.
            val annotatedTitle = if (searchQuery.isBlank()) {
                null
            } else {
                buildAnnotatedString {
                    val title = channel.title
                    val lowerTitle = title.lowercase()
                    val qLower = searchQuery.lowercase()
                    var last = 0
                    var idx = lowerTitle.indexOf(qLower, last)
                    while (idx >= 0) {
                        if (idx > last) {
                            withStyle(SpanStyle(color = if (isCurrent) currentColor else titleColor, fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.SemiBold)) {
                                append(title.substring(last, idx))
                            }
                        }
                        // Highlight match
                        withStyle(SpanStyle(color = Color(0xFFFFD700), fontWeight = FontWeight.Bold)) {
                            append(title.substring(idx, idx + qLower.length))
                        }
                        last = idx + qLower.length
                        idx = lowerTitle.indexOf(qLower, last)
                    }
                    if (last < title.length) {
                        withStyle(SpanStyle(color = if (isCurrent) currentColor else titleColor, fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.SemiBold)) {
                            append(title.substring(last))
                        }
                    }
                }
            }
 
            run {
                val shape = RoundedCornerShape(12.dp)
                androidx.compose.material3.Card(
                    onClick = { onChannelSelected(channel) },
                    modifier = Modifier
                        .semantics {
                            contentDescription = channel.title
                            role = Role.Button
                        }
                        .onFocusChanged { if (it.isFocused) onItemFocused(index) }
                        .focusable()
                        .shadow(
                            elevation = if (isCurrent) 6.dp else if (isFocused) 2.dp else 0.dp,
                            shape = shape
                        ),
                    colors = androidx.compose.material3.CardDefaults.cardColors(containerColor = rowBg),
                    shape = shape,
                    border = androidx.compose.foundation.BorderStroke(
                        width = if (isCurrent || isFocused) 2.dp else 0.dp,
                        color = when {
                            isFocused -> MaterialTheme.colorScheme.onSurface
                            isCurrent -> MaterialTheme.colorScheme.primary.copy(alpha = 0.5f)
                            else -> Color.Transparent
                        }
                    )
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp, vertical = itemVerticalPadding),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Number badge
                        Box(
                            modifier = Modifier
                                .width(numberWidth)
                                .height(28.dp)
                                .background(
                                    color = if (isCurrent) Color(0xFFF1F5F9) else Color.Transparent,
                                    shape = RoundedCornerShape(8.dp)
                                ),
                            contentAlignment = Alignment.CenterStart
                        ) {
                            Text(
                                text = channel.channelNumber?.toString() ?: channel.id,
                                color = if (isCurrent) Color(0xFF111827) else if (isFocused) listBg else muted,
                                fontSize = 12.sp,
                                modifier = Modifier.padding(start = 8.dp)
                            )
                        }
    
                        Spacer(modifier = Modifier.width(10.dp))
    
                        // Annotated Title (with highlights)
                        if (annotatedTitle != null) {
                            Text(
                                text = annotatedTitle,
                                fontSize = 16.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                color = titleColor,
                                modifier = Modifier.weight(1f)
                            )
                        } else {
                            Text(
                                text = channel.title,
                                fontSize = 16.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                color = if (isCurrent) currentColor else titleColor,
                                fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.SemiBold,
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }
            }
 
            // subtle divider between rows
            androidx.compose.material3.HorizontalDivider(
                color = Color.White.copy(alpha = 0.04f),
                thickness = 0.5.dp,
                modifier = Modifier.padding(start = 14.dp, end = 14.dp)
            )
        }
    }
}

@Composable
private fun DetailsPane(
    now: com.streamcore.tv.domain.model.EPGProgram?,
    next: com.streamcore.tv.domain.model.EPGProgram?,
    channelTitle: String? = null,
    previewImageUrl: String? = null,
    modifier: Modifier = Modifier
) {
    val muted = Color(0xFF8B949E)
    val success = Color(0xFF4CAF50)
    val warning = Color(0xFFFF9800)

    Column(modifier = modifier) {
        // Preview card (image placeholder for video)
        if (!previewImageUrl.isNullOrBlank()) {
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFF0F1318)),
                shape = RoundedCornerShape(12.dp)
            ) {
                AsyncImage(
                    model = previewImageUrl,
                    contentDescription = stringResource(R.string.live_channels_title),
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(160.dp)
                        .clip(RoundedCornerShape(12.dp))
                )
            }
            Spacer(modifier = Modifier.height(12.dp))
        }

        // Channel title
        if (!channelTitle.isNullOrBlank()) {
            Text(
                text = stringResource(R.string.channel_prefix) + channelTitle,
                color = Color.White,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(8.dp))
        }

        // Now
        Text(
            text = stringResource(R.string.epg_now),
            color = success,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold
        )
        Text(
            text = now?.title ?: stringResource(R.string.no_program_info),
            color = Color.White,
            fontSize = 14.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        if (!now?.description.isNullOrBlank()) {
            Text(
                text = now?.description ?: "",
                color = muted,
                fontSize = 12.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Next
        Text(
            text = stringResource(R.string.epg_next),
            color = warning,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold
        )
        Text(
            text = next?.title ?: stringResource(R.string.no_upcoming_info),
            color = Color.White,
            fontSize = 14.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        if (!next?.description.isNullOrBlank()) {
            Text(
                text = next?.description ?: "",
                color = muted,
                fontSize = 12.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun PiPPreviewPlaceholder(
    modifier: Modifier = Modifier
) {
    val borderColor = Color(0xFF58A6FF).copy(alpha = 0.35f)
    Box(
        modifier = modifier
            .background(Color(0xFF0F1318), RoundedCornerShape(8.dp))
            .padding(8.dp)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(borderColor, RoundedCornerShape(6.dp)),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = stringResource(R.string.pip_preview),
                color = Color.White.copy(alpha = 0.85f),
                style = MaterialTheme.typography.bodyMedium
            )
        }
    }
}
