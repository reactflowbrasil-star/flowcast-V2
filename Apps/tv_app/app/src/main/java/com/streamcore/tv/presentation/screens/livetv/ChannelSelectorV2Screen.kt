@file:OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)
package com.streamcore.tv.presentation.screens.livetv

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.draw.scale
import androidx.compose.material.icons.filled.Close
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.clickable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.ui.PlayerView
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R
import android.net.Uri

import androidx.media3.common.MimeTypes
import androidx.media3.common.MediaItem
import androidx.media3.common.C
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.exoplayer.trackselection.AdaptiveTrackSelection
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import com.streamcore.tv.domain.model.ContentStream
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.common.Player
import com.streamcore.tv.domain.model.EPGProgram
import com.streamcore.tv.presentation.components.livetv.v2.ChannelListPane
import com.streamcore.tv.presentation.player.DrmHelper
import com.streamcore.tv.presentation.player.DrmConfig
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.compose.runtime.collectAsState
import com.streamcore.tv.presentation.components.livetv.v2.ChannelPreviewViewModel
import com.streamcore.tv.core.network.NetworkSecurityHelper
import com.streamcore.tv.core.network.PlaybackHeaderBuilder
import timber.log.Timber
import java.util.Locale
import coil.compose.AsyncImage
import androidx.compose.ui.layout.ContentScale
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.foundation.shape.CircleShape

import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.Shape

// Modern Slates for Blueish-Black premium feel
private val DarkGradientStart = Color(0xFF0F172A)
private val DarkGradientEnd = Color(0xFF020617)
private val GlassSurface = Color(0xFF1E293B).copy(alpha = 0.7f) 
private val GlassBorder = Color(0xFF334155).copy(alpha = 0.5f)
private val SelectionGradientStart = Color(0xFF3B82F6) // Blue 500
private val SelectionGradientEnd = Color(0xFF1D4ED8)   // Blue 700
private val TextPrimary = Color(0xFFF8FAFC)
private val TextSecondary = Color(0xFF94A3B8)
private val TV_ACCENT = Color(0xFF3B82F6) // Solid Blue

/**
 * Full-screen Channel Selector V2
 */
@OptIn(UnstableApi::class)
@Composable
fun ChannelSelectorV2Screen(
    isVisible: Boolean,
    channels: List<ContentStream>,
    currentChannelId: String?,
    onChannelSelected: (ContentStream) -> Unit,
    onDismiss: () -> Unit,
    epgNow: Map<String, EPGProgram?> = emptyMap(),
    epgNext: Map<String, EPGProgram?> = emptyMap(),
    categories: List<String> = emptyList(),
    selectedCategory: String? = null,
    onSelectCategory: (String?) -> Unit = {},
    // Optional: when provided, the selector renders this player in the preview window instead of
    // creating a second ExoPlayer instance. This avoids double-playback conflicts in PlayerScreen.
    sharedPreviewPlayer: ExoPlayer? = null
) {
    val accent = MaterialTheme.colorScheme.primary
    val panelBg = MaterialTheme.colorScheme.surface
    val cardBg = MaterialTheme.colorScheme.surfaceVariant
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    
    val epgVm = hiltViewModel<com.streamcore.tv.presentation.screens.livetv.EPGViewModel>()
    val epgDataMap by epgVm.epgData.collectAsState()
    
    // Initialize DrmHelper with dependencies from ViewModel
    val drmHelper = remember(epgVm) { epgVm.createDrmHelper() }

    // Use channels directly as they are already sorted in the ViewModel
    val sortedChannels = channels
    val normalizedCategories = remember(categories) {
        val distinct = categories.mapNotNull { it?.trim()?.takeIf { name -> name.isNotEmpty() } }
            .distinctBy { it.lowercase(Locale.ROOT) }
        distinct.sortedWith(String.CASE_INSENSITIVE_ORDER)
    }
    val categoryListFocus = remember { FocusRequester() }
    var categoryQuery by remember { mutableStateOf("") }
    val categorySearchFocus = remember { FocusRequester() }
    val allLabel = stringResource(R.string.all)

    var focusedIndex by remember { mutableIntStateOf(0) }
    var selected by remember { mutableStateOf<ContentStream?>(null) }

    BackHandler(enabled = isVisible) {
        onDismiss()
    }
    val clockFormatter = remember { java.time.format.DateTimeFormatter.ofPattern("HH:mm") }
    var gridCurrentTime by remember {
        mutableStateOf(java.time.LocalDateTime.now().withSecond(0).withNano(0))
    }

    LaunchedEffect(isVisible) {
        if (isVisible) {
            val idx = sortedChannels.indexOfFirst { it.id == currentChannelId }
            focusedIndex = if (idx >= 0) idx else 0
            selected = sortedChannels.getOrNull(focusedIndex)
        }
    }

    val previewVm = hiltViewModel<ChannelPreviewViewModel>()
    val previewStream by previewVm.previewStream.collectAsState()

    // When selected changes, load its preview if no streamUrl
    LaunchedEffect(selected?.id, isVisible) {
        val sel = selected
        if (isVisible && sel != null && sel.streamUrl.isNullOrBlank()) {
            Timber.d("ChannelSelector: Triggering preview load for channel ${sel.id} (streamUrl blank)")
            previewVm.loadPreview(sel.id)
        } else if (sel != null) {
            Timber.d("ChannelSelector: Selected channel ${sel.id} already has streamUrl")
        }
    }

    // Compute previewChannel: prefer selected if it has streamUrl, otherwise use loaded previewStream
    val previewChannel = remember(selected, previewStream) {
        val sel = selected
        if (sel == null) {
            Timber.d("ChannelSelector: previewChannel = null (no selection)")
            return@remember null
        }
        
        val result = if (!sel.streamUrl.isNullOrBlank()) {
            Timber.d("ChannelSelector: previewChannel = selected (has streamUrl: ${sel.streamUrl?.take(50)})")
            sel
        } else {
            // Only use previewStream if it matches the selected channel ID
            val preview = previewStream?.takeIf { it.id == sel.id }
            if (preview != null) {
                Timber.d("ChannelSelector: previewChannel = previewStream (loaded for ${preview.id}, url: ${preview.streamUrl.take(50)})")
            } else {
                Timber.d("ChannelSelector: previewChannel = null (previewStream not loaded or ID mismatch, sel=${sel.id}, previewStream=${previewStream?.id})")
            }
            preview
        }
        result
    }

    // Filter channels globally (ignoring category for search)
    val filteredChannels = remember(sortedChannels, categoryQuery, selectedCategory) {
        val query = categoryQuery.trim()
        if (query.isNotEmpty()) {
            // Global channel search (ignores selectedCategory to find all matches)
            sortedChannels.filter { it.title.contains(query, ignoreCase = true) || it.id.contains(query) }
        } else {
            // No search: filter by selected category
            val selectedNormalized = selectedCategory?.trim()
            if (selectedNormalized.isNullOrEmpty()) {
                sortedChannels
            } else {
                sortedChannels.filter { channel ->
                    channel.channelCategory?.let { cat ->
                        cat.equals(selectedNormalized, ignoreCase = true)
                    } ?: false
                }
            }
        }
    }
    
    // Load EPG for ALL filtered channels when the list changes
    LaunchedEffect(filteredChannels, isVisible) {
        if (isVisible && filteredChannels.isNotEmpty()) {
             val ids = filteredChannels.map { it.id }
             // Load 200 channels to ensure EPG visibility for most
             epgVm.loadMultiChannelEPG(ids.take(200)) 
        }
    }
    
    // Dynamic Categories: If searching, show only categories containing results
    val cats = remember(normalizedCategories, filteredChannels, categoryQuery, allLabel) {
        if (categoryQuery.trim().isNotEmpty()) {
            // Extract unique categories from matched channels
            val matchedCats = filteredChannels.mapNotNull { it.channelCategory?.trim() }
                .filter { it.isNotEmpty() }
                .distinctBy { it.lowercase(Locale.ROOT) }
                .sortedWith(String.CASE_INSENSITIVE_ORDER)
            
            // Always include "All" (which now means "All Results")
            listOf(allLabel) + matchedCats
        } else {
            // Normal category list
            listOf(allLabel) + normalizedCategories
        }
    }

    LaunchedEffect(selectedCategory, categoryQuery, filteredChannels) {
        if (categoryQuery.isEmpty()) {
             // Normal category selection behavior
            if (filteredChannels.isNotEmpty()) {
                val currentSel = selected
                // if current selection is not in the new list, select first
                if (currentSel == null || filteredChannels.none { it.id == currentSel.id }) {
                    focusedIndex = 0
                    selected = filteredChannels.first()
                }
            } else {
                 selected = null
            }
        } else {
            // Search behavior
             focusedIndex = 0
             selected = filteredChannels.firstOrNull()
        }
    }


    // NOTE: We load multi-channel EPG in the LaunchedEffect(filteredChannels, isVisible) above.
    // Loading single-channel EPG here would REPLACE the entire map, causing data loss.
    // Instead, EPG data for the selected channel should already be in epgDataMap from multi-load.
    LaunchedEffect(selected?.id, isVisible, epgDataMap) {
        val id = selected?.id
        if (isVisible && id != null) {
            val existingData = epgDataMap[id]
            if (existingData == null || existingData.programs.isEmpty()) {
                // Only load for single channel if NOT already present from multi-load
                Timber.d("EPG: Loading single-channel EPG for $id (not in multi-load cache)")
                epgVm.loadEPGForChannel(id)
            } else {
                Timber.d("EPG: Using cached multi-load data for $id (${existingData.programs.size} programs)")
            }
        }
    }

    val selectedPrograms = remember(epgDataMap, selected?.id) {
        epgDataMap[selected?.id ?: ""]?.programs ?: emptyList()
    }
    
    // Compute NOW and NEXT from epgDataMap (which is loaded on-demand for selected channel)
    val localNowProgram = remember(selectedPrograms) {
        selectedPrograms.firstOrNull { it.isLive }
    }
    val localNextProgram = remember(selectedPrograms) {
        selectedPrograms.filter { !it.isLive }.sortedBy { it.startTime }.firstOrNull()
    }

    LaunchedEffect(isVisible) {
        if (isVisible) {
            while (true) {
                gridCurrentTime = java.time.LocalDateTime.now().withSecond(0).withNano(0)
                kotlinx.coroutines.delay(30_000)
            }
        }
    }
    val liveChannelsDescription = stringResource(R.string.live_channels_title)
    AnimatedVisibility(
        visible = isVisible,
        enter = slideInHorizontally(initialOffsetX = { -it }) + fadeIn(),
        exit = slideOutHorizontally(targetOffsetX = { -it }) + fadeOut()
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(DarkGradientEnd)
                .semantics {
                    contentDescription = liveChannelsDescription
                    liveRegion = LiveRegionMode.Polite
                }
        ) {
            Card(
                modifier = Modifier
                    .fillMaxHeight()
                    .fillMaxWidth()
                    .padding(0.dp),
                colors = CardDefaults.cardColors(containerColor = Color.Transparent),
                elevation = CardDefaults.cardElevation(0.dp),
                shape = RoundedCornerShape(0.dp)
            ) {
                Column(Modifier.fillMaxSize()) {


                    // --- TiviMate Style Layout ---
                    Column(modifier = Modifier.fillMaxSize()) {
                        // 1. TOP SECTION: Video Preview & Info (Height: 40%)
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(0.40f)
                                .background(DarkGradientEnd)
                                .padding(16.dp)
                        ) {
                            // 1A. Video Preview (Aspect Ratio 16:9)
                            Box(
                                modifier = Modifier
                                    .fillMaxHeight()
                                    .aspectRatio(16f / 9f)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(Color.Black)
                                    .border(2.dp, MaterialTheme.colorScheme.onSurface.copy(alpha = 0.1f), RoundedCornerShape(12.dp))
                            ) {
                                if (sharedPreviewPlayer != null) {
                                    SharedPreviewPlayer(
                                        player = sharedPreviewPlayer,
                                        modifier = Modifier.fillMaxSize()
                                    )
                                } else {
                                    PreviewPlayer(
                                        channel = previewChannel,
                                        isVisible = isVisible,
                                        drmHelper = drmHelper,
                                        playerHeight = 200.dp,
                                        modifier = Modifier.fillMaxSize()
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.width(20.dp))

                            // 1B. Program Info
                            Column(
                                modifier = Modifier
                                    .fillMaxHeight()
                                    .weight(1f)
                            ) {
                                selected?.let { ch ->
                                    Text(
                                        text = ch.title,
                                        style = MaterialTheme.typography.headlineMedium,
                                        color = MaterialTheme.colorScheme.onBackground,
                                        fontWeight = FontWeight.Bold
                                    )
                                    
                                    val program = localNowProgram
                                    if (program != null) {
                                        Text(
                                            text = program.title,
                                            style = MaterialTheme.typography.titleLarge,
                                            color = MaterialTheme.colorScheme.secondary,
                                            modifier = Modifier.padding(top = 8.dp)
                                        )
                                        Text(
                                            text = readableProgramTimeRange(program),
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier.padding(top = 4.dp)
                                        )
                                        
                                        // Progress Bar
                                        val progress = calculateProgress(program.startTime, program.endTime)
                                        if (progress >= 0) {
                                             androidx.compose.material3.LinearProgressIndicator(
                                                progress = { progress },
                                                modifier = Modifier
                                                    .padding(top = 12.dp)
                                                    .fillMaxWidth(0.5f)
                                                    .height(6.dp)
                                                    .clip(RoundedCornerShape(3.dp)),
                                                color = MaterialTheme.colorScheme.primary,
                                                trackColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.2f),
                                            )
                                        }

                                        if (!program.description.isNullOrBlank()) {
                                            Text(
                                                text = program.description!!,
                                                style = MaterialTheme.typography.bodyMedium,
                                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.8f),
                                                maxLines = 4,
                                                overflow = TextOverflow.Ellipsis,
                                                modifier = Modifier.padding(top = 16.dp)
                                            )
                                        }
                                    } else {
                                        Text(
                                            text = stringResource(R.string.channels_no_epg_available),
                                            style = MaterialTheme.typography.bodyLarge,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier.padding(top = 8.dp)
                                        )
                                    }
                                }
                            }
                            
                            // Clock
                            Text(
                                text = gridCurrentTime.toLocalTime().format(clockFormatter),
                                style = MaterialTheme.typography.headlineSmall,
                                color = MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.align(Alignment.Top)
                            )
                        }

                        // 2. BOTTOM SECTION: Navigation (Height: 60%)
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(0.60f)
                                .background(DarkGradientEnd)
                        ) {
                            // 2A. Main Content Layer (Sidebar + Grid)
                            Row(modifier = Modifier.fillMaxSize()) {
                                // Sidebar (170dp)
                                Column(
                                    modifier = Modifier
                                        .width(170.dp)
                                        .fillMaxHeight()
                                        .drawBehind {
                                            // Vertical separator between sidebar and grid
                                            val strokeWidth = 1.dp.toPx()
                                            drawLine(
                                                color = GlassBorder,
                                                start = androidx.compose.ui.geometry.Offset(size.width, 0f),
                                                end = androidx.compose.ui.geometry.Offset(size.width, size.height),
                                                strokeWidth = strokeWidth
                                            )
                                        }
                                ) {
                                    // Space for the overlapping Search Bar
                                    Spacer(modifier = Modifier.height(48.dp))

                                    CategoryListPane(
                                        categories = cats,
                                        selectedCategory = selectedCategory,
                                        onSelectCategory = { cat ->
                                            if (cat == allLabel) onSelectCategory(null) else onSelectCategory(cat)
                                        },
                                        modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
                                        initialFocusRequester = categoryListFocus
                                    )
                                }

                                // 2B. EPG Grid (Main) - Occupies rest of screen
                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .fillMaxHeight()
                                ) {
                                    val finalDisplayChannels = remember(filteredChannels, selectedCategory, categoryQuery, allLabel) {
                                        val cat = selectedCategory?.trim()
                                        val query = categoryQuery.trim()
                                        // When search is active, show all matching results
                                        // Otherwise, filter by category if one is selected
                                        if (query.isNotEmpty() || cat.isNullOrEmpty() || cat == allLabel) {
                                            filteredChannels
                                        } else {
                                            filteredChannels.filter { 
                                                it.channelCategory?.equals(cat, ignoreCase = true) == true 
                                            }
                                        }
                                    }

                                    com.streamcore.tv.presentation.components.livetv.v2.ChannelSwitcherV2Grid(
                                        channels = finalDisplayChannels,
                                        epgData = epgDataMap,
                                        channelColumnWidth = 170.dp, 
                                        hourWidth = 180.dp,
                                        slotHours = 24, // Extended to 24h to show programs scheduled for tomorrow
                                        currentTime = gridCurrentTime,
                                        onProgramClick = { /* No-op */ },
                                        onChannelClick = { ch -> onChannelSelected(ch) },
                                        onChannelFocused = { ch ->
                                            if (selected?.id != ch.id) {
                                                selected = ch
                                            }
                                        }
                                    )
                                }
                            }

                            // 2C. Overlapping Wide Search Bar (340dp)
                            // Covers Categories (170) + Channel Column (170)
                            val keyboardController = LocalSoftwareKeyboardController.current

                            Row(
                                modifier = Modifier
                                    .width(340.dp)
                                    .height(48.dp)
                                    .background(DarkGradientEnd)
                                    .drawBehind {
                                        // Bottom separator to match Grid horizontal header line
                                        val strokeWidth = 1.dp.toPx()
                                        drawLine(
                                            color = GlassBorder,
                                            start = androidx.compose.ui.geometry.Offset(0f, size.height),
                                            end = androidx.compose.ui.geometry.Offset(size.width, size.height),
                                            strokeWidth = strokeWidth
                                        )
                                    }
                                    .padding(horizontal = 12.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                var isSearchFocused by remember { mutableStateOf(false) }
                                
                                Box(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .clip(RoundedCornerShape(4.dp))
                                        .background(if (isSearchFocused) Color.White.copy(alpha = 0.12f) else Color.White.copy(alpha = 0.06f))
                                        .border(
                                            width = if (isSearchFocused) 1.dp else 0.dp,
                                            color = if (isSearchFocused) SelectionGradientStart.copy(alpha = 0.5f) else Color.Transparent,
                                            shape = RoundedCornerShape(4.dp)
                                        )
                                        .onFocusChanged { isSearchFocused = it.isFocused }
                                        .clickable { 
                                            categorySearchFocus.requestFocus()
                                            keyboardController?.show()
                                        }
                                        .padding(horizontal = 12.dp),
                                    contentAlignment = Alignment.CenterStart
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(
                                            imageVector = Icons.Filled.Search,
                                            contentDescription = null,
                                            tint = if (isSearchFocused) Color.White else TextSecondary,
                                            modifier = Modifier.size(16.dp)
                                        )
                                        
                                        Spacer(modifier = Modifier.width(10.dp))
                                        
                                        androidx.compose.foundation.text.BasicTextField(
                                            value = categoryQuery,
                                            onValueChange = { categoryQuery = it },
                                            singleLine = true,
                                            textStyle = androidx.compose.ui.text.TextStyle(
                                                color = Color.White,
                                                fontSize = 14.sp
                                            ),
                                            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                                                imeAction = androidx.compose.ui.text.input.ImeAction.Search
                                            ),
                                            keyboardActions = androidx.compose.foundation.text.KeyboardActions(
                                                onSearch = { 
                                                    keyboardController?.hide()
                                                }
                                            ),
                                            decorationBox = { innerTextField ->
                                                Box(contentAlignment = Alignment.CenterStart) {
                                                    if (categoryQuery.isEmpty()) {
                                                        Text(
                                                            text = stringResource(R.string.channel_search_placeholder),
                                                            color = TextSecondary,
                                                            fontSize = 14.sp
                                                        )
                                                    }
                                                    innerTextField()
                                                }
                                            },
                                            modifier = Modifier
                                                .weight(1f)
                                                .focusRequester(categorySearchFocus)
                                        )

                                        if (categoryQuery.isNotEmpty()) {
                                            IconButton(
                                                onClick = { categoryQuery = "" },
                                                modifier = Modifier.size(24.dp)
                                            ) {
                                                Icon(
                                                    imageVector = Icons.Filled.Close,
                                                    contentDescription = stringResource(R.string.category_clear_search_description),
                                                    tint = TextSecondary,
                                                    modifier = Modifier.size(14.dp)
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    LaunchedEffect(isVisible) {
                        if (isVisible) {
                            // Delay to ensure composables are mounted before requesting focus
                            kotlinx.coroutines.delay(100)
                            try {
                                categoryListFocus.requestFocus()
                            } catch (e: IllegalStateException) {
                                Timber.w("FocusRequester not yet initialized, skipping focus request")
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(UnstableApi::class)
@Composable
private fun PreviewPlayer(
    channel: ContentStream?,
    isVisible: Boolean,
    drmHelper: DrmHelper,
    playerHeight: androidx.compose.ui.unit.Dp = 190.dp,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    var player by remember { mutableStateOf<ExoPlayer?>(null) }

    // Key on BOTH channel ID AND streamUrl to react when stream loads asynchronously
    LaunchedEffect(channel?.id, channel?.streamUrl, isVisible) {
        Timber.d("PreviewPlayer: LaunchedEffect triggered - id=${channel?.id}, streamUrl=${channel?.streamUrl?.take(50)}, isVisible=$isVisible")
        
        if (!isVisible) {
            Timber.d("PreviewPlayer: Not visible, releasing player")
            try { player?.release() } catch (_: Exception) {}
            player = null
            return@LaunchedEffect
        }
        val streamUrl = channel?.streamUrl
        if (streamUrl.isNullOrBlank()) {
            Timber.d("PreviewPlayer: No stream URL available for channel ${channel?.id}, waiting...")
            try { player?.release() } catch (_: Exception) {}
            player = null
            return@LaunchedEffect
        }
        
        Timber.d("PreviewPlayer: Setting up player for ${channel?.id} with URL: ${streamUrl.take(60)}...")
        try {
            try { player?.release() } catch (_: Exception) {}

            val helper = drmHelper
            val drmType = channel?.drmType?.lowercase()
            val licenseServerUrl = channel?.licenseServerUrl
            
            val newPlayer: ExoPlayer = when {
                // Widevine/PlayReady with license server
                (drmType == "widevine" || drmType == "playready") && !licenseServerUrl.isNullOrBlank() -> {
                    timber.log.Timber.d("PreviewPlayer: Using $drmType DRM with license server: $licenseServerUrl")
                    val drmConfig = DrmConfig.fromContentStream(
                        drmType = channel?.drmType,
                        licenseServerUrl = channel?.licenseServerUrl,
                        drmHeaders = channel?.drmHeaders,
                        drmKeysExo = channel?.drmKeysExo,
                        drmKeysHex = channel?.drmKeys,
                        userAgent = channel?.userAgent
                    )
                    helper.setupExoPlayerWithDrmConfig(
                        context = context,
                        streamUrl = streamUrl,
                        drmConfig = drmConfig,
                        proxyUrl = channel?.proxyUrl,
                        dohUrl = channel?.dohUrl
                    ).player
                }
                // ClearKey with hex keys
                !channel?.drmKeys.isNullOrBlank() -> {
                    timber.log.Timber.d("PreviewPlayer: Using ClearKey DRM")
                    val comps = helper.setupExoPlayerWithDrm(
                        context = context,
                        streamUrl = streamUrl,
                        drmKeysHex = channel!!.drmKeys,
                        proxyUrl = channel.proxyUrl,
                        forceClearKey = true,
                        dohUrl = channel.dohUrl,
                        userAgent = channel.userAgent
                    )
                    comps.player
                }
                // No DRM
                else -> {
                    timber.log.Timber.d("PreviewPlayer: No DRM, using regular player")
                    buildPreviewPlayerWithHeaders(context, channel!!)
                }
            }

            newPlayer.volume = 0f
            newPlayer.repeatMode = Player.REPEAT_MODE_ALL
            newPlayer.playWhenReady = true
            
            // Add listener to ensure playback starts when ready
            newPlayer.addListener(object : Player.Listener {
                override fun onPlaybackStateChanged(state: Int) {
                    timber.log.Timber.d("PreviewPlayer: State changed to $state for channel ${channel?.id}")
                    if (state == Player.STATE_READY && !newPlayer.isPlaying) {
                        timber.log.Timber.d("PreviewPlayer: Forcing play on STATE_READY")
                        newPlayer.play()
                    }
                }
                
                override fun onRenderedFirstFrame() {
                    timber.log.Timber.d("PreviewPlayer: ✅ First frame rendered for channel ${channel?.id}")
                }
            })
            
            // Assign to state first to trigger update, then prepare
            player = newPlayer
            newPlayer.prepare()
            
            timber.log.Timber.d("PreviewPlayer: Player prepared for channel ${channel?.id}")
        } catch (e: Exception) {
            timber.log.Timber.e(e, "PreviewPlayer: Error setting up player")
            try { player?.release() } catch (_: Exception) {}
            player = null
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            try { player?.release() } catch (_: Exception) {}
            player = null
        }
    }

    Column(modifier = modifier) {
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    useController = false
                    setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING)
                }
            },
            update = { view ->
                try {
                    // Assign player directly in update - called on every recomposition
                    val currentPlayer = player
                    if (view.player != currentPlayer) {
                        view.player = currentPlayer
                        // Force play if player is ready but not playing
                        currentPlayer?.let { p ->
                            if (p.playbackState == Player.STATE_READY && !p.isPlaying) {
                                p.play()
                            }
                        }
                    }
                } catch (e: Exception) {
                    Timber.e(e, "PreviewPlayer: Error updating PlayerView")
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .clip(RoundedCornerShape(12.dp))
                .border(1.dp, TV_ACCENT.copy(alpha = 0.18f), RoundedCornerShape(12.dp))
                .background(Color(0xFF0F1620))
        )
    }
}

@OptIn(UnstableApi::class)
@Composable
private fun SharedPreviewPlayer(
    player: ExoPlayer,
    modifier: Modifier = Modifier
) {
    AndroidView(
        factory = { ctx ->
            PlayerView(ctx).apply {
                useController = false
                setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING)
            }
        },
        update = { view ->
            if (view.player !== player) {
                view.player = player
            }
        },
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, TV_ACCENT.copy(alpha = 0.18f), RoundedCornerShape(12.dp))
            .background(Color(0xFF0F1620))
    )
}

@Composable
private fun SimpleEPGPane(
    now: EPGProgram?,
    next: EPGProgram?
) {
    val muted = Color(0xFF8B949E)
    val success = Color(0xFF4CAF50)
    val warn = Color(0xFFFF9800)

    Column {
        Text(
            text = stringResource(id = R.string.channel_now),
            color = success,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold
        )
        if (now != null) {
            ProgramLine(now, Color.White, muted)
        } else {
            Text(
                text = stringResource(id = R.string.no_program_info),
                color = muted,
                fontSize = 12.sp
            )
        }

        Spacer(Modifier.height(8.dp))

        Text(
            text = stringResource(id = R.string.channel_next),
            color = warn,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold
        )
        if (next != null) {
            ProgramLine(next, Color.White, muted)
        } else {
            Text(
                text = stringResource(id = R.string.no_upcoming_info),
                color = muted,
                fontSize = 12.sp
            )
        }
    }
}

@Composable
private fun EPGLinearChipsRow(programs: List<EPGProgram>) {
    val chipShape = RoundedCornerShape(6.dp)
    val cardBg = Color(0xFF161B22)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        programs.take(10).forEach { program ->
            val timeRange = readableProgramTimeRange(program)
            FilterChip(
                selected = program.isLive,
                onClick = { },
                label = { Text("$timeRange  ${program.title}", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                shape = chipShape,
                colors = FilterChipDefaults.filterChipColors(
                    containerColor = cardBg,
                    selectedContainerColor = TV_ACCENT.copy(alpha = 0.25f),
                    labelColor = Color.White,
                    selectedLabelColor = Color.White
                )
            )
        }
    }
}

// ... (inside the file)

@Composable
fun GlassPanel(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    Box(
        modifier = modifier
            .background(
                brush = Brush.linearGradient(
                    colors = listOf(GlassSurface, GlassSurface.copy(alpha = 0.4f)),
                    start = androidx.compose.ui.geometry.Offset(0f, 0f),
                    end = androidx.compose.ui.geometry.Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY)
                ),
                shape = RoundedCornerShape(16.dp)
            )
            .border(
                width = 1.dp,
                brush = Brush.linearGradient(
                    colors = listOf(GlassBorder, Color.Transparent),
                    start = androidx.compose.ui.geometry.Offset(0f, 0f),
                    end = androidx.compose.ui.geometry.Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY)
                ),
                shape = RoundedCornerShape(16.dp)
            )
            .clip(RoundedCornerShape(16.dp))
    ) {
        content()
    }
}

// Updated CategoryListPane item
@Composable
private fun CategoryListPane(
    categories: List<String>,
    selectedCategory: String?,
    onSelectCategory: (String?) -> Unit,
    modifier: Modifier = Modifier,
    initialFocusRequester: FocusRequester? = null
) {
    LazyColumn(
        modifier = modifier,
        contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        items(items = categories, key = { it.lowercase(Locale.ROOT) }) { rawCat: String ->
            val cat = rawCat.trim()
            val normalizedSelected = selectedCategory?.trim()
            val isAllOption = cat.equals("All", ignoreCase = true)
            val isSelected = if (isAllOption) {
                normalizedSelected.isNullOrEmpty()
            } else {
                normalizedSelected != null && cat.equals(normalizedSelected, ignoreCase = true)
            }
            
            var isFocused by remember { mutableStateOf(false) }
            
            val surfaceModifier = if (isAllOption && initialFocusRequester != null) {
                Modifier.focusRequester(initialFocusRequester)
            } else {
                Modifier
            }
            
            val scale by animateFloatAsState(if (isFocused) 1.05f else 1f, label = "scale")

            Box(
                modifier = surfaceModifier
                    .scale(scale)
                    .onFocusChanged { isFocused = it.isFocused }
                    .fillMaxWidth()
                    .height(44.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(
                        if (isSelected) Brush.horizontalGradient(listOf(SelectionGradientStart, SelectionGradientEnd))
                        else if (isFocused) androidx.compose.ui.graphics.SolidColor(Color.White.copy(alpha = 0.1f))
                        else androidx.compose.ui.graphics.SolidColor(Color.Transparent)
                    )
                    .border(
                        width = if (isFocused && !isSelected) 2.dp else 0.dp,
                        color = if (isFocused && !isSelected) SelectionGradientStart.copy(alpha = 0.6f) else Color.Transparent,
                        shape = RoundedCornerShape(8.dp)
                    )
                    .clickable { onSelectCategory(if (isAllOption) null else cat) }
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = cat,
                        color = if (isSelected) Color.White else TextSecondary,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = if (isSelected || isFocused) FontWeight.Bold else FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    if (isSelected) {
                         Icon(
                            imageVector = Icons.Filled.ChevronRight,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.scale(0.8f)
                        )
                    }
                }
            }
        }
    }
}

// Updated ProgramLine to show visual progress
@Composable
private fun ProgramLine(
    program: EPGProgram,
    titleColor: Color,
    descColor: Color,
    showProgress: Boolean = false
) {
    Column {
        Text(
            text = program.title,
            color = titleColor,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        if (!program.description.isNullOrBlank()) {
            Text(
                text = program.description!!,
                color = descColor,
                style = MaterialTheme.typography.bodySmall,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 2.dp)
            )
        }
        
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = readableProgramTimeRange(program),
                color = descColor.copy(alpha = 0.7f),
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(top = 4.dp)
            )
            
            if (showProgress) {
                val progress = calculateProgress(program.startTime, program.endTime)
                if (progress >= 0f) {
                    Spacer(modifier = Modifier.width(8.dp))
                    LinearProgressIndicator(
                        progress = { progress },
                        modifier = Modifier
                            .weight(1f)
                            .height(4.dp)
                            .clip(RoundedCornerShape(2.dp)),
                        color = SelectionGradientStart,
                        trackColor = Color.White.copy(alpha = 0.1f),
                    )
                }
            }
        }
    }
}

private fun calculateProgress(start: String, end: String): Float {
    return try {
        val now = java.time.Instant.now().toEpochMilli()
        val s = java.time.Instant.parse(start).toEpochMilli()
        val e = java.time.Instant.parse(end).toEpochMilli()
        if (now < s) 0f
        else if (now > e) 1f
        else (now - s).toFloat() / (e - s).toFloat()
    } catch (e: Exception) {
        0f
    }
}

// In SimpleEPGPane:
// if (now != null) { ProgramLine(now, TextPrimary, TextSecondary, showProgress = true) }



private fun readableProgramTimeRange(program: EPGProgram): String {
    fun hhmm(iso: String): String = try {
        val inst = java.time.Instant.parse(iso)
        val zoned = java.time.ZonedDateTime.ofInstant(inst, java.time.ZoneId.systemDefault())
        zoned.format(java.time.format.DateTimeFormatter.ofPattern("HH:mm"))
    } catch (_: Exception) {
        // Fallback if server sends unexpected format
        iso.takeLast(5)
    }
    return "${hhmm(program.startTime)} - ${hhmm(program.endTime)}"
}

// --- Preview player helper (top-level) ---
@OptIn(UnstableApi::class)
private fun buildPreviewPlayerWithHeaders(
    context: android.content.Context,
    channel: com.streamcore.tv.domain.model.ContentStream
): ExoPlayer {
    val headerResult = PlaybackHeaderBuilder.build(
        userAgent = channel.userAgent,
        referer = channel.referer,
        origin = channel.origin,
        customHeaders = channel.customHeaders,
        fallbackUserAgent = "IPTV-Android/1.0"
    )
    val headersMap = headerResult.headers.toMutableMap()
    val userAgent = headerResult.effectiveUserAgent ?: "IPTV-Android/1.0"

    val needsDoH = !channel.dohUrl.isNullOrBlank()

    val clientBuilder = okhttp3.OkHttpClient.Builder()
        .apply { com.streamcore.tv.core.network.NetworkSecurityHelper.applyLenientSsl(this) }
        .followRedirects(true)
        .followSslRedirects(true)
        .retryOnConnectionFailure(true)
        .connectTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
        .readTimeout(15, java.util.concurrent.TimeUnit.SECONDS)

    // Apply Proxy if configured
    if (!channel.proxyUrl.isNullOrBlank()) {
        val regex = Regex("^http://([^:@]+):([^@]+)@([^:]+):(\\d+)$")
        val match = regex.find(channel.proxyUrl!!)
        if (match != null) {
            val (user, pass, host, portStr) = match.destructured
            val port = portStr.toIntOrNull() ?: 80
            val proxy = java.net.Proxy(java.net.Proxy.Type.HTTP, java.net.InetSocketAddress(host, port))
            clientBuilder.proxy(proxy)
                .proxyAuthenticator { _, response ->
                    val credential = okhttp3.Credentials.basic(user, pass)
                    response.request.newBuilder()
                        .header("Proxy-Authorization", credential)
                        .build()
                }
        }
    }

    // Apply DoH if configured
    if (!channel.dohUrl.isNullOrBlank()) {
         try {
             NetworkSecurityHelper.configureOkHttpClientBuilder(clientBuilder, channel.dohUrl)
         } catch (_: Exception) {}
    }

    val client = clientBuilder.build()
    val okFactory = OkHttpDataSource.Factory(client)
    // Keep factory UA and headers UA consistent.
    okFactory.setUserAgent(userAgent)
    if (headersMap.isNotEmpty()) okFactory.setDefaultRequestProperties(headersMap)
    
    val dataSourceFactory: DataSource.Factory = DefaultDataSource.Factory(context, okFactory)

    val adaptive = AdaptiveTrackSelection.Factory()
    val trackSelector = DefaultTrackSelector(context, adaptive).apply {
        setParameters(
            buildUponParameters()
                .setForceLowestBitrate(false)
                .setForceHighestSupportedBitrate(false)
                .setMaxVideoBitrate(Int.MAX_VALUE)
                .setPreferredVideoMimeType(MimeTypes.VIDEO_H264)
                .setTunnelingEnabled(false)
        )
    }

    val renderersFactory = DefaultRenderersFactory(context).apply {
        setEnableDecoderFallback(true)
        setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER)
    }

    val player = ExoPlayer.Builder(context)
        .setRenderersFactory(renderersFactory)
        .setTrackSelector(trackSelector)
        .setMediaSourceFactory(DefaultMediaSourceFactory(dataSourceFactory))
        .build()
 
    val url = channel.streamUrl
    val fixedUrl = url.replace("(", "%28").replace(")", "%29")

    val subtitleConfigurations = if (!channel.subtitleUrl.isNullOrBlank()) {
        try {
            val subUri = Uri.parse(channel.subtitleUrl)
            val mime = when {
                channel.subtitleUrl.endsWith(".vtt", ignoreCase = true) -> MimeTypes.TEXT_VTT
                channel.subtitleUrl.endsWith(".srt", ignoreCase = true) -> "application/x-subrip"
                else -> MimeTypes.TEXT_VTT
            }
            listOf(
                MediaItem.SubtitleConfiguration.Builder(subUri)
                    .setMimeType(mime)
                    .setLanguage("es")
                    .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
                    .build()
            )
        } catch (e: Exception) {
            emptyList()
        }
    } else {
        emptyList()
    }

    val mediaItemBuilder = MediaItem.Builder()
        .setUri(Uri.parse(fixedUrl))
        .setSubtitleConfigurations(subtitleConfigurations)

    if (fixedUrl.contains(".mpd", ignoreCase = true)) {
        mediaItemBuilder.setMimeType(MimeTypes.APPLICATION_MPD)
    }

    val mediaSource = DefaultMediaSourceFactory(dataSourceFactory)
        .createMediaSource(mediaItemBuilder.build())
 
    player.setMediaSource(mediaSource)
    return player
}
