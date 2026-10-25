package com.streamcore.tv.presentation.components.livetv.v1

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.streamcore.tv.domain.model.ContentStream
import com.streamcore.tv.presentation.screens.livetv.EPGViewModel
import com.streamcore.tv.presentation.components.common.ChannelLogo
import timber.log.Timber
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

// Flat, TV-friendly color palette
private val TvBg = Color(0xFF0F1114)
private val PanelBg = Color(0xFF12161B)
private val CardBg = Color(0xFF161B22)
private val SurfaceBg = Color(0xFF0F1318)
private val Accent = Color(0xFF58A6FF)
private val Success = Color(0xFF4CAF50)
private val Warning = Color(0xFFFF9800)
private val Danger = Color(0xFFE53E3E)
private val Muted = Color(0xFF8B949E)


// Safe modulo for circular indexing (replacement for kotlin.math.floorMod)
private fun floorMod(a: Int, n: Int): Int {
    if (n <= 0) return 0
    val mod = a % n
    return if (mod >= 0) mod else mod + n
}

// Navigation state enum - simplified
enum class NavigationSection {
    CHANNEL_LIST,
    EPG_OVERLAY
}

/**
 * Modern Channel Selector with Integrated EPG (V1 backup)
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ModernChannelSelectorV1(
    isVisible: Boolean,
    channels: List<ContentStream>,
    currentChannelId: String?,
    onChannelSelected: (ContentStream) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    epgViewModel: com.streamcore.tv.presentation.screens.livetv.EPGViewModel? = null,
    epgNow: Map<String, com.streamcore.tv.domain.model.EPGProgram?> = emptyMap(),
    epgNext: Map<String, com.streamcore.tv.domain.model.EPGProgram?> = emptyMap(),
    categories: List<String> = emptyList(),
    selectedCategory: String? = null,
    onSelectCategory: (String?) -> Unit = {}
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    // Simplified EPG data - use provided maps directly
    val currentEPGNow = epgNow
    val currentEPGNext = epgNext

    // Sort channels by ID
    val sortedChannels = remember(channels) {
        channels.sortedBy { it.id.toIntOrNull() ?: Int.MAX_VALUE }
    }

    AnimatedVisibility(
        visible = isVisible,
        enter = slideInHorizontally(
            initialOffsetX = { -it },
            animationSpec = tween(150, easing = EaseOutCubic)
        ) + fadeIn(animationSpec = tween(150)),
        exit = slideOutHorizontally(
            targetOffsetX = { -it },
            animationSpec = tween(120, easing = EaseInCubic)
        ) + fadeOut(animationSpec = tween(120))
    ) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.45f)) // Further reduced opacity for performance
        ) {
            // Wider Sidebar with Channels + EPG
            Card(
                modifier = Modifier
                    .fillMaxHeight()
                    .width(850.dp) // Much wider for better EPG display
                    .align(Alignment.CenterStart)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null
                    ) { /* Prevent dismiss when clicking sidebar */ },
                colors = CardDefaults.cardColors(
                    containerColor = Color.Transparent
                ),
                elevation = CardDefaults.cardElevation(0.dp),
                shape = RoundedCornerShape(
                    topStart = 0.dp,
                    topEnd = 16.dp,
                    bottomStart = 0.dp,
                    bottomEnd = 16.dp
                )
            ) {
                // Track selected channel for EPG
                var selectedChannel by remember { mutableStateOf<ContentStream?>(
                    channels.find { it.id == currentChannelId } ?: channels.firstOrNull()
                ) }


                // EPG ViewModel and data for focused channel - use provided ViewModel or create new one
                val actualEpgViewModel = epgViewModel ?: androidx.hilt.navigation.compose.hiltViewModel<com.streamcore.tv.presentation.screens.livetv.EPGViewModel>()
                val epgDataMap by actualEpgViewModel.epgData.collectAsState()
                val epgUiState by actualEpgViewModel.uiState.collectAsState()

                // Simplified navigation state tracking
                var currentSection by remember { mutableStateOf(NavigationSection.CHANNEL_LIST) }
                val channelsFocusRequester = remember { FocusRequester() }
                val epgFocusRequester = remember { FocusRequester() }

                // Track if initial EPG focus has been set
                var hasSetInitialFocus by remember { mutableStateOf(false) }

                // Track currently focused EPG item index
                var focusedItemIndex by remember { mutableIntStateOf(0) }
                // Remember last focused per channel to restore
                val lastFocusedPerChannel = remember { mutableMapOf<String, Int>() }

                // Focus requesters for each EPG item
                val itemFocusRequesters = remember { mutableMapOf<String, FocusRequester>() }

                // Track channel loading state for visual feedback
                var isChannelLoading by remember { mutableStateOf(false) }

                // Load EPG when focused channel changes
                LaunchedEffect(selectedChannel?.id) {
                    // Debounce EPG loads to avoid spamming when user scrolls fast
                    val id = selectedChannel?.id
                    if (id != null) {
                        // Restore last focused position per channel
                        focusedItemIndex = lastFocusedPerChannel[id] ?: 0
                        hasSetInitialFocus = false
                        delay(200)
                        // If we don't have data for this channel yet or it's empty, request it
                        val hasData = epgDataMap[id]?.programs?.isNotEmpty() == true
                        if (!hasData) {
                            actualEpgViewModel.loadEPGForChannel(id)
                        }
                    }
                }

                // Programs for the selected channel
                val selectedPrograms = remember(epgDataMap, selectedChannel?.id) {
                    epgDataMap[selectedChannel?.id ?: ""]?.programs ?: emptyList()
                }

                // Request initial focus
                LaunchedEffect(isVisible) {
                    if (isVisible) {
                        delay(100)
                        channelsFocusRequester.requestFocus()
                    }
                }

                Row(
                    modifier = Modifier.fillMaxSize()
                ) {
                    // Left: Channel List (30% - compact)
                    Box(
                        modifier = Modifier
                            .weight(0.3f)
                            .fillMaxHeight()
                            .background(
                                PanelBg.copy(alpha = 0.8f),
                                shape = RoundedCornerShape(6.dp)
                            )
                            .padding(16.dp)
                    ) {
                        Column(
                            modifier = Modifier.fillMaxSize()
                        ) {
                            // Header
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text(
                                        text = stringResource(R.string.channels_title),
                                        fontSize = 18.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFFF0F6FC)
                                    )
                                    Text(
                                        text = context.getString(R.string.channels_count, channels.size),
                                        fontSize = 12.sp,
                                        color = Color(0xFF8B949E)
                                    )
                                }

                                IconButton(
                                    onClick = onDismiss,
                                    colors = IconButtonDefaults.iconButtonColors(
                                        contentColor = Color(0xFF8B949E)
                                    )
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Close,
                                        contentDescription = stringResource(R.string.account_close),
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(12.dp))

                            // Category Chips Row
                            if (categories.isNotEmpty()) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .horizontalScroll(rememberScrollState())
                                ) {
                                    // Flatter look: keep slight rounding
                                    val chipShape = RoundedCornerShape(6.dp)
                                    // "All" chip
                                    FilterChip(
                                        selected = selectedCategory == null,
                                        onClick = { onSelectCategory(null) },
                                        label = { Text(text = stringResource(R.string.all)) },
                                        shape = chipShape,
                                        colors = FilterChipDefaults.filterChipColors(
                                            containerColor = CardBg,
                                            selectedContainerColor = Accent.copy(alpha = 0.25f),
                                            labelColor = Color.White,
                                            selectedLabelColor = Color.White
                                        ),
                                        modifier = Modifier.padding(end = 8.dp)
                                    )
                                    categories.forEach { cat ->
                                        FilterChip(
                                            selected = selectedCategory == cat,
                                            onClick = { onSelectCategory(cat) },
                                            label = {
                                                val labelText = when (cat.lowercase()) {
                                                    "entertainment" -> stringResource(R.string.category_entertainment)
                                                    "sports" -> stringResource(R.string.category_sports)
                                                    "news" -> stringResource(R.string.category_news)
                                                    "movies" -> stringResource(R.string.category_movies)
                                                    "series" -> stringResource(R.string.category_series)
                                                    "music" -> stringResource(R.string.category_music)
                                                    "kids" -> stringResource(R.string.category_kids)
                                                    // Category mapping updated
                                                    "documentary" -> stringResource(R.string.category_documentary)
                                                    "lifestyle" -> stringResource(R.string.category_lifestyle)
                                                    "culture & education" -> stringResource(R.string.category_culture_education)
                                                    "international" -> stringResource(R.string.category_international)
                                                    else -> cat
                                                }
                                                Text(text = labelText)
                                            },
                                            shape = chipShape,
                                            colors = FilterChipDefaults.filterChipColors(
                                                containerColor = CardBg,
                                                selectedContainerColor = Accent.copy(alpha = 0.25f),
                                                labelColor = Color.White,
                                                selectedLabelColor = Color.White
                                            ),
                                            modifier = Modifier.padding(end = 8.dp)
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.height(12.dp))
                            }

                            // Enhanced search box with D-pad support
                            var query by remember { mutableStateOf("") }
                            val searchFocusRequester = remember { FocusRequester() }
                            val searchInteractionSource = remember { MutableInteractionSource() }
                            var isSearchFocused by remember { mutableStateOf(false) }

                            Surface(
                                color = if (isSearchFocused) CardBg.copy(alpha = 0.95f) else CardBg,
                                shape = RoundedCornerShape(4.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(40.dp)
                                    .border(
                                        width = if (isSearchFocused) 2.dp else 1.dp,
                                        color = if (isSearchFocused) Accent else Color(0xFF2A2F36),
                                        shape = RoundedCornerShape(4.dp)
                                    )
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .padding(horizontal = 12.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Search,
                                        contentDescription = null,
                                        tint = if (isSearchFocused) Accent else Muted,
                                        modifier = Modifier.size(18.dp)
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    BasicTextField(
                                        value = query,
                                        onValueChange = { query = it },
                                        singleLine = true,
                                        textStyle = TextStyle(
                                            color = Color(0xFFF0F6FC),
                                            fontSize = 13.sp
                                        ),
                                        modifier = Modifier
                                            .weight(1f)
                                            .focusRequester(searchFocusRequester)
                                            .onFocusChanged {
                                                isSearchFocused = it.isFocused
                                            }
                                            .focusable(interactionSource = searchInteractionSource)
                                            .onKeyEvent { event ->
                                                if (event.nativeKeyEvent.action == android.view.KeyEvent.ACTION_DOWN) {
                                                    when (event.nativeKeyEvent.keyCode) {
                                                        android.view.KeyEvent.KEYCODE_DPAD_DOWN -> {
                                                            channelsFocusRequester.requestFocus()
                                                            true
                                                        }
                                                        else -> false
                                                    }
                                                } else false
                                            },
                                        decorationBox = { innerTextField ->
                                            if (query.isEmpty()) {
                                                Text(
                                                    text = stringResource(R.string.channels_search_hint),
                                                color = Muted.copy(alpha = 0.6f),
                                                    fontSize = 13.sp
                                                )
                                            }
                                            innerTextField()
                                        }
                                    )
                                    // Voice search button for channel search
                                    com.streamcore.tv.presentation.screens.search.components.VoiceSearchButton(
                                        onVoiceSearch = { text -> query = text },
                                        modifier = Modifier.padding(start = 8.dp)
                                    )
                                    if (query.isNotEmpty()) {
                                        IconButton(
                                            onClick = { query = "" },
                                            modifier = Modifier.size(24.dp)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Clear,
                                                contentDescription = stringResource(R.string.nav_clear),
                                                tint = Muted,
                                                modifier = Modifier.size(16.dp)
                                            )
                                        }
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(12.dp))

                            // Channels List
                            val filtered = remember(sortedChannels, query) {
                                if (query.isBlank()) sortedChannels
                                else sortedChannels.filter { it.title.contains(query, ignoreCase = true) || it.id.contains(query) }
                            }

                            // Enhanced LazyColumn with auto-scroll and D-pad navigation
                            val listState = rememberLazyListState()

                            fun handleChannelStep(step: Int): Boolean {
                                if (filtered.isEmpty()) return false

                                val resolvedIndex = selectedChannel?.let { channel ->
                                    filtered.indexOfFirst { it.id == channel.id }
                                }?.takeIf { it >= 0 }
                                    ?: currentChannelId?.let { id ->
                                        filtered.indexOfFirst { it.id == id }
                                    }?.takeIf { it >= 0 }

                                val currentIdx = when {
                                    resolvedIndex != null -> resolvedIndex
                                    step > 0 -> -1
                                    else -> 0
                                }

                                val nextIndex = floorMod(currentIdx + step, filtered.size)
                                val nextChannel = filtered.getOrNull(nextIndex) ?: return false

                                selectedChannel = nextChannel
                                currentSection = NavigationSection.CHANNEL_LIST
                                hasSetInitialFocus = false
                                focusedItemIndex = lastFocusedPerChannel[nextChannel.id] ?: 0

                                scope.launch {
                                    listState.animateScrollToItem(nextIndex)
                                    channelsFocusRequester.requestFocus()
                                }

                                return true
                            }

                            // Auto-scroll to current channel when opening
                            LaunchedEffect(currentChannelId, filtered) {
                                if (currentChannelId != null) {
                                    val currentIndex = filtered.indexOfFirst { it.id == currentChannelId }
                                    if (currentIndex >= 0) {
                                        listState.scrollToItem(
                                            index = currentIndex,
                                            scrollOffset = 0
                                        )
                                    }
                                }
                            }

                            LazyColumn(
                                state = listState,
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                                modifier = Modifier
                                    .weight(1f)
                                    .padding(vertical = 4.dp)
                                    .focusRequester(channelsFocusRequester)
                                    .onKeyEvent { event ->
                                        if (event.nativeKeyEvent.action == android.view.KeyEvent.ACTION_DOWN) {
                                            when (event.nativeKeyEvent.keyCode) {
                                                android.view.KeyEvent.KEYCODE_CHANNEL_UP,
                                                android.view.KeyEvent.KEYCODE_MEDIA_PREVIOUS -> handleChannelStep(-1)
                                                android.view.KeyEvent.KEYCODE_CHANNEL_DOWN,
                                                android.view.KeyEvent.KEYCODE_MEDIA_NEXT -> handleChannelStep(1)
                                                else -> false
                                            }
                                        } else false
                                    },
                                contentPadding = PaddingValues(vertical = 8.dp)
                            ) {
                                itemsIndexed(
                                    items = filtered,
                                    key = { _, channel -> channel.id }
                                ) { index, channel ->
                                    SimpleChannelItem(
                                        channel = channel,
                                        now = currentEPGNow[channel.id.toString()],
                                        isSelected = channel.id == currentChannelId,
                                        isFocused = channel.id == selectedChannel?.id,
                                        isActive = currentSection == NavigationSection.CHANNEL_LIST,
                                        onChannelSelected = { selected ->
                                            isChannelLoading = true
                                            onChannelSelected(selected)
                                        },
                                        onChannelFocused = { selectedChannel = channel },
                                        onNavigateRight = {
                                            currentSection = NavigationSection.EPG_OVERLAY
                                            // Reset focus state so first EPG item gets focus
                                            hasSetInitialFocus = false
                                        }
                                    )
                                }
                            }
                        }
                    }

                    // Right: EPG Panel (70% - larger space for EPG)
                    Box(
                        modifier = Modifier
                            .weight(0.7f)
                            .fillMaxHeight()
                            .padding(12.dp)
                    ) {
                        if (selectedChannel != null) {
                            EPGOverlaySection(
                                channel = selectedChannel!!,
                                epgPrograms = selectedPrograms,
                                focusRequester = epgFocusRequester,
                                hasSetInitialFocus = hasSetInitialFocus,
                                focusedItemIndex = focusedItemIndex,
                                itemFocusRequesters = itemFocusRequesters,
                                isChannelLoading = isChannelLoading,
                                isEpgLoading = epgUiState.isLoading,
                                isActive = currentSection == NavigationSection.EPG_OVERLAY,
                                onNavigateLeft = {
                                    currentSection = NavigationSection.CHANNEL_LIST
                                    channelsFocusRequester.requestFocus()
                                },
                                onInitialFocusSet = { hasSetInitialFocus = true },
                                onFocusedItemChanged = { newIndex ->
                                    focusedItemIndex = newIndex
                                    selectedChannel?.id?.let { cid ->
                                        lastFocusedPerChannel[cid] = newIndex
                                    }
                                },
                                onProgramSelected = { program ->
                                    // When user presses OK on EPG item, start the channel
                                    isChannelLoading = true
                                    onChannelSelected(selectedChannel!!)
                                    // Add small delay for visual feedback
                                    scope.launch {
                                        delay(500)
                                        onDismiss()
                                    }
                                }
                            )
                        } else {
                            Box(
                                modifier = Modifier.fillMaxSize(),
                                contentAlignment = Alignment.Center
                            ) {
                                                        Text(
                                text = stringResource(R.string.channels_select_channel),
                                color = Color(0xFF8B949E),
                                fontSize = 14.sp,
                                textAlign = TextAlign.Center
                            )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SimpleChannelItem(
    channel: ContentStream,
    now: com.streamcore.tv.domain.model.EPGProgram?,
    isSelected: Boolean,
    isFocused: Boolean,
    isActive: Boolean,
    onChannelSelected: (ContentStream) -> Unit,
    onChannelFocused: () -> Unit,
    onNavigateRight: () -> Unit,
    onNavigateToEPG: () -> Unit = {} // Explicit callback for EPG navigation
) {
    val focusRequester = remember { FocusRequester() }
    val interactionSource = remember { MutableInteractionSource() }
    var isItemFocused by remember { mutableStateOf(false) }

    val backgroundColor = when {
        isItemFocused || isFocused -> Accent.copy(alpha = 0.15f)
        isSelected -> Success.copy(alpha = 0.15f)
        else -> Color.Transparent
    }
 
    val borderColor = when {
        isItemFocused || isFocused -> Accent
        isSelected -> Success
        else -> Color.Transparent
    }

    // Auto-focus if this is the selected channel
    LaunchedEffect(isSelected) {
        if (isSelected) {
            delay(100)
            focusRequester.requestFocus()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(70.dp)
            .focusRequester(focusRequester)
            .onFocusChanged { focusState ->
                isItemFocused = focusState.isFocused
                if (focusState.isFocused) {
                    onChannelFocused()
                }
            }
            .focusable(interactionSource = interactionSource)
            .onKeyEvent { keyEvent ->
                if (keyEvent.nativeKeyEvent.action == android.view.KeyEvent.ACTION_DOWN) {
                    when (keyEvent.nativeKeyEvent.keyCode) {
                        android.view.KeyEvent.KEYCODE_DPAD_CENTER,
                        android.view.KeyEvent.KEYCODE_ENTER -> {
                            onChannelSelected(channel)
                            true
                        }
                        android.view.KeyEvent.KEYCODE_DPAD_RIGHT -> {
                            if (isActive && isItemFocused) {
                                // Select channel first, then navigate to EPG
                                onChannelFocused()
                                onNavigateRight()
                                true
                            } else false
                        }
                        else -> false
                    }
                } else {
                    false
                }
            }
            .clickable(
                interactionSource = interactionSource,
                indication = LocalIndication.current
            ) {
                onChannelSelected(channel)
            }
            .background(
                color = backgroundColor,
                shape = RoundedCornerShape(6.dp) // Subtle border radius
            )
            .border(
                width = when {
                    isSelected -> 2.dp
                    isFocused -> 1.dp
                    isItemFocused -> 1.dp
                    else -> 0.dp
                },
                color = borderColor,
                shape = RoundedCornerShape(6.dp) // Subtle border radius
            )
            .padding(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxSize(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Channel logo with SVG support
            ChannelLogo(
                imageUrl = channel.imageUrl,
                channelName = channel.title,
                size = 48.dp,
                fontSize = 14.sp,
                backgroundColor = Color(0xFF1E1E1E),
                cornerRadius = 2.dp,
                modifier = Modifier
            )

            Spacer(modifier = Modifier.width(12.dp))

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                // Channel name with live indicator for selected
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = channel.title,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (isSelected) Success else Color.White,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )

                    if (isSelected) {
                        Card(
                            colors = CardDefaults.cardColors(
                                containerColor = Danger
                            ),
                            shape = RoundedCornerShape(4.dp) // Small radius for status badge
                        ) {
                            Text(
                                text = stringResource(R.string.live_indicator),
                                color = Color.White,
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp)
                            )
                        }
                    }
                }

                // EPG Now program
                if (now != null) {
                    Text(
                        text = stringResource(R.string.now_playing) + " ${now.title}",
                        fontSize = 11.sp,
                        color = Success,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                } else {
                    // Check if this is the first time showing "no EPG" for this channel
                    val showEPGHint = remember(channel.id) { mutableStateOf(true) }

                    if (showEPGHint.value) {
                        Text(
                            text = stringResource(R.string.epg_not_available),
                            fontSize = 9.sp,
                            color = Color(0xFFFF6B35), // Orange color to draw attention
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            fontWeight = FontWeight.Medium
                        )
                    } else {
                        Text(
                            text = stringResource(R.string.channels_no_epg_info),
                            fontSize = 10.sp,
                            color = Muted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }

            // Channel number
            Text(
                text = channel.id,
                fontSize = 11.sp,
                color = Muted,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(start = 8.dp)
            )
        }
    }
}

@Composable
private fun EPGOverlaySection(
    channel: ContentStream,
    epgPrograms: List<com.streamcore.tv.domain.model.EPGProgram>,
    focusRequester: FocusRequester,
    hasSetInitialFocus: Boolean,
    focusedItemIndex: Int,
    itemFocusRequesters: MutableMap<String, FocusRequester>,
    isChannelLoading: Boolean,
    isEpgLoading: Boolean,
    isActive: Boolean,
    onNavigateLeft: () -> Unit,
    onInitialFocusSet: () -> Unit,
    onFocusedItemChanged: (Int) -> Unit,
    onProgramSelected: (com.streamcore.tv.domain.model.EPGProgram) -> Unit = {}
) {
    // Simplified EPG overlay - use available data first, then try to load more
    var displayPrograms by remember { mutableStateOf<List<com.streamcore.tv.domain.model.EPGProgram>>(emptyList()) }
    // External loading state is passed in

    // Initialize with full list of EPG programs
    LaunchedEffect(epgPrograms) {
        val now = try { Instant.now() } catch (_: Exception) { null }
        // Filter out programs that already ended; keep current and future
        val filtered = if (now != null) {
            epgPrograms.filter { p ->
                val end = runCatching { Instant.parse(p.endTime) }.getOrNull()
                end == null || end.isAfter(now)
            }
        } else epgPrograms
        // Limit for performance on low-end devices (more aggressive)
        displayPrograms = filtered.take(4)
        // Clear focus map to avoid stale references across dataset changes
        itemFocusRequesters.clear()
        Timber.d("EPGOverlay: Loaded programs - count: ${epgPrograms.size}, showing: ${displayPrograms.size}")
    }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(PanelBg.copy(alpha = 0.8f))
            .padding(16.dp)
            .focusRequester(focusRequester)
            .focusable(enabled = isActive)
            .onKeyEvent { keyEvent ->
                if (!isActive) return@onKeyEvent false
                if (keyEvent.nativeKeyEvent.action == android.view.KeyEvent.ACTION_DOWN) {
                    when (keyEvent.nativeKeyEvent.keyCode) {
                        android.view.KeyEvent.KEYCODE_DPAD_LEFT -> {
                            onNavigateLeft()
                            true
                        }
                        android.view.KeyEvent.KEYCODE_DPAD_DOWN -> {
                            // Move to next EPG item
                            if (focusedItemIndex < displayPrograms.size - 1) {
                                val nextIndex = focusedItemIndex + 1
                                val pid = displayPrograms.getOrNull(nextIndex)?.id
                                if (pid != null) itemFocusRequesters[pid]?.requestFocus()
                                onFocusedItemChanged(nextIndex)
                            }
                            true
                        }
                        android.view.KeyEvent.KEYCODE_DPAD_UP -> {
                            // Move to previous EPG item
                            if (focusedItemIndex > 0) {
                                val prevIndex = focusedItemIndex - 1
                                val pid = displayPrograms.getOrNull(prevIndex)?.id
                                if (pid != null) itemFocusRequesters[pid]?.requestFocus()
                                onFocusedItemChanged(prevIndex)
                            }
                            true
                        }
                        android.view.KeyEvent.KEYCODE_PAGE_DOWN -> {
                            val target = (focusedItemIndex + 5).coerceAtMost(displayPrograms.lastIndex)
                            val pid = displayPrograms.getOrNull(target)?.id
                            if (pid != null) itemFocusRequesters[pid]?.requestFocus()
                            onFocusedItemChanged(target)
                            true
                        }
                        android.view.KeyEvent.KEYCODE_PAGE_UP -> {
                            val target = (focusedItemIndex - 5).coerceAtLeast(0)
                            val pid = displayPrograms.getOrNull(target)?.id
                            if (pid != null) itemFocusRequesters[pid]?.requestFocus()
                            onFocusedItemChanged(target)
                            true
                        }
                        else -> false
                    }
                } else false
            }
    ) {
        // Channel Header simplified for low-end performance
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = channel.title,
                color = Color.White,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }

        // EPG Content - Show available programs
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
        ) {
            when {
                isEpgLoading && displayPrograms.isEmpty() -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(color = Accent, strokeWidth = 2.dp)
                    }
                }

                displayPrograms.isEmpty() -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                        Text(
                                text = stringResource(R.string.channels_no_programming),
                                color = Muted,
                                fontSize = 14.sp,
                                textAlign = TextAlign.Center
                            )
                        Text(
                                text = stringResource(R.string.channels_press_back),
                                color = Muted.copy(alpha = 0.6f),
                                fontSize = 12.sp,
                                textAlign = TextAlign.Center
                            )
                        }
                    }
                }

                else -> {
                    // Show available programs with auto-scroll
                    val listState = rememberLazyListState()

                    // Auto-scroll to focused item (no animation for low-end performance)
                    LaunchedEffect(focusedItemIndex) {
                        if (focusedItemIndex >= 0 && focusedItemIndex < displayPrograms.size) {
                            listState.scrollToItem(
                                index = focusedItemIndex + 1,
                                scrollOffset = 0
                            )
                        }
                    }

                    LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {

                        itemsIndexed(
                            items = displayPrograms,
                            key = { _, program -> program.id }
                        ) { index, program ->
                            val isCurrentProgram = program.isLive
                            val isNextProgram = false
                            val isFocused = index == focusedItemIndex

                            val itemFocusRequester = itemFocusRequesters.getOrPut(program.id) { FocusRequester() }

                            // Set initial focus on first item only when EPG overlay is active
                            LaunchedEffect(program.id, hasSetInitialFocus, isActive) {
                                if (isActive && !hasSetInitialFocus && index == 0) {
                                    itemFocusRequester.requestFocus()
                                    onInitialFocusSet()
                                    onFocusedItemChanged(0)
                                }
                            }

                            EPGProgramCard(
                                program = program,
                                isCurrentProgram = isCurrentProgram,
                                isNextProgram = isNextProgram,
                                isFocused = isFocused,
                                isActive = isActive,
                                focusRequester = itemFocusRequester,
                                index = index,
                                totalItems = displayPrograms.size,
                                onFocusChanged = { focused ->
                                    if (focused) {
                                        onFocusedItemChanged(index)
                                    }
                                },
                                onNavigateLeft = onNavigateLeft,
                                onNavigateUp = {
                                    if (index > 0) {
                                        val prevIndex = index - 1
                                        val pid = displayPrograms.getOrNull(prevIndex)?.id
                                        if (pid != null) itemFocusRequesters[pid]?.requestFocus()
                                        onFocusedItemChanged(prevIndex)
                                    }
                                },
                                onNavigateDown = {
                                    if (index < displayPrograms.size - 1) {
                                        val nextIndex = index + 1
                                        val pid = displayPrograms.getOrNull(nextIndex)?.id
                                        if (pid != null) itemFocusRequesters[pid]?.requestFocus()
                                        onFocusedItemChanged(nextIndex)
                                    }
                                },
                                onProgramSelected = onProgramSelected
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun EPGProgramCard(
    program: com.streamcore.tv.domain.model.EPGProgram,
    isCurrentProgram: Boolean,
    isNextProgram: Boolean,
    isFocused: Boolean,
    isActive: Boolean,
    focusRequester: FocusRequester,
    index: Int,
    totalItems: Int,
    onFocusChanged: (Boolean) -> Unit,
    onNavigateLeft: () -> Unit,
    onNavigateUp: () -> Unit = {},
    onNavigateDown: () -> Unit = {},
    onProgramSelected: (com.streamcore.tv.domain.model.EPGProgram) -> Unit = {}
) {
    // Simplified: remove scale animation for performance on low-end devices
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .focusRequester(focusRequester)
            .focusable(enabled = isActive)
            .onFocusChanged { focusState ->
                onFocusChanged(focusState.isFocused)
            }
            .onKeyEvent { keyEvent ->
                if (!isActive) return@onKeyEvent false
                if (keyEvent.nativeKeyEvent.action == android.view.KeyEvent.ACTION_DOWN) {
                    when (keyEvent.nativeKeyEvent.keyCode) {
                        android.view.KeyEvent.KEYCODE_DPAD_LEFT -> {
                            onNavigateLeft()
                            true
                        }
                        android.view.KeyEvent.KEYCODE_DPAD_UP -> {
                            onNavigateUp()
                            true
                        }
                        android.view.KeyEvent.KEYCODE_DPAD_DOWN -> {
                            onNavigateDown()
                            true
                        }
                        android.view.KeyEvent.KEYCODE_DPAD_CENTER,
                        android.view.KeyEvent.KEYCODE_ENTER -> {
                            // When user presses OK on EPG program, start the channel
                            onProgramSelected(program)
                            true
                        }
                        else -> false
                    }
                } else false
            },
        colors = CardDefaults.cardColors(
            containerColor = when {
                isFocused -> Color(0xFF1E2732)
                isCurrentProgram -> CardBg
                isNextProgram -> CardBg.copy(alpha = 0.9f)
                else -> CardBg
            }
        ),
        border = null,
        shape = RoundedCornerShape(0.dp),
        elevation = CardDefaults.cardElevation(
            defaultElevation = 0.dp
        )
    ) {
        Column(
            modifier = Modifier.padding(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Simplified status indicator (no background)
                Text(
                    text = when {
                        isCurrentProgram -> "● ${stringResource(R.string.channel_now)}"
                        isNextProgram -> "● ${stringResource(R.string.channel_next)}"
                        else -> formatTime(program.startTime)
                    },
                    color = if (isCurrentProgram) Danger else if (isNextProgram) Warning else Muted,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold
                )

                Text(
                    text = "${formatTime(program.startTime)} - ${formatTime(program.endTime)}",
                    color = Muted,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium
                )
            }

            Spacer(modifier = Modifier.height(4.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = program.title,
                    color = Color(0xFFF7FAFC),
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    lineHeight = 20.sp,
                    modifier = Modifier.weight(1f)
                )

                // Focus indicators removed for low-end performance
            }

            // Lightweight description (single line for performance)
            if (!program.description.isNullOrEmpty()) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = program.description.let { if (it.length > 100) it.take(100) + "..." else it },
                    color = Color(0xFFE2E8F0),
                    fontSize = 12.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            // Lightweight progress bar only for current program
            if (isCurrentProgram) {
                Spacer(modifier = Modifier.height(4.dp))
                LinearProgressIndicator(
                    progress = { program.progress.coerceIn(0f, 1f) },
                    color = Success,
                    trackColor = Color(0xFF2A2F36),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(3.dp)
                        .clip(RoundedCornerShape(1.dp))
                )
            }

            // Add category tag if available
            program.category?.takeIf { it.isNotEmpty() }?.let { category ->
                Spacer(modifier = Modifier.height(6.dp))
                Box(
                    modifier = Modifier
                        .background(
                            color = Color(0xFF4A5568),
                            shape = RoundedCornerShape(12.dp)
                        )
                        .padding(horizontal = 8.dp, vertical = 2.dp)
                ) {
                    androidx.compose.material3.Text(
                        text = category,
                        color = Color(0xFFA0AEC0),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
    }
}

@Composable
private fun PlaceholderProgramCard() {
    Card(
        colors = CardDefaults.cardColors(containerColor = CardBg),
        shape = RoundedCornerShape(6.dp)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Box(
                modifier = Modifier
                    .height(12.dp)
                    .fillMaxWidth(0.25f)
                    .background(Color(0xFF2A2F36), RoundedCornerShape(6.dp))
            )
            Spacer(modifier = Modifier.height(8.dp))
            Box(
                modifier = Modifier
                    .height(16.dp)
                    .fillMaxWidth(0.7f)
                    .background(Color(0xFF31363F), RoundedCornerShape(6.dp))
            )
            Spacer(modifier = Modifier.height(6.dp))
            Box(
                modifier = Modifier
                    .height(12.dp)
                    .fillMaxWidth()
                    .background(Color(0xFF2A2F36), RoundedCornerShape(6.dp))
            )
        }
    }
}

private fun formatTime(isoInstant: String): String {
    return try {
        val instant = Instant.parse(isoInstant)
        val local = instant.atZone(ZoneId.systemDefault()).toLocalTime()
        val formatter = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)
        local.format(formatter)
    } catch (e: Exception) {
        isoInstant.takeLast(9).take(5)
    }
}
