package com.streamcore.tv.presentation.screens.player

import android.app.Activity
import android.content.ContextWrapper
import android.content.Context
import android.graphics.SurfaceTexture
import android.view.Surface
import android.view.TextureView
import android.view.KeyEvent as AndroidKeyEvent
import android.view.WindowManager
import androidx.activity.compose.BackHandler
import androidx.compose.animation.*
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.HoverInteraction
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.GridView
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.*
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import com.streamcore.tv.R
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import com.streamcore.tv.core.utils.ShowToast
import timber.log.Timber
import com.streamcore.tv.domain.model.*
import com.streamcore.tv.presentation.components.LoadingIndicator
import com.streamcore.tv.presentation.components.ErrorScreen
import android.net.Uri
import com.streamcore.tv.presentation.screens.player.components.PlayerControls
import com.streamcore.tv.presentation.screens.player.components.LiveTVPlayerControls
import com.streamcore.tv.presentation.screens.player.components.VODPlayerControls
import com.streamcore.tv.presentation.screens.player.components.PlayerSettingsDialog
import com.streamcore.tv.presentation.components.livetv.ModernChannelSelector
import com.streamcore.tv.presentation.components.livetv.ChannelNumberInput
import com.streamcore.tv.presentation.components.player.AudioTrackSelector
import com.streamcore.tv.presentation.components.player.QualitySelector
import com.streamcore.tv.presentation.components.player.SubtitleSelector
import com.streamcore.tv.presentation.theme.*
import dagger.hilt.EntryPoints
import com.streamcore.tv.core.featureflags.FeatureFlagsEntryPoint
import com.streamcore.tv.core.constants.AppConstants
import com.streamcore.tv.presentation.screens.livetv.ChannelSelectorV2Screen
import com.streamcore.tv.presentation.components.livetv.v3.ZapInfoV3

/**
 * Player screen for video playback
 *
 * Supports both VOD and Live TV content
 */
@OptIn(UnstableApi::class)
@Composable
fun PlayerScreen(
    contentId: String,
    contentType: String = "content", // "content", "episode"
    streamLinkId: Long? = null,
    onNavigateBack: () -> Unit,
    viewModel: PlayerViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    @Suppress("UNUSED_VARIABLE")
    val context = LocalContext.current

    // Feature Flags (observe for live updates)
    val featureFlagManager = remember {
        EntryPoints.get(
            context.applicationContext,
            FeatureFlagsEntryPoint::class.java
        ).featureFlagManager()
    }
    val channelSwitcherV2Enabled by featureFlagManager
        .observe(AppConstants.PreferenceKeys.CHANNEL_SWITCHER_V2, default = true)
        .collectAsState(initial = false)
    val channelSwitcherV2PipEnabled by featureFlagManager
        .observe(AppConstants.PreferenceKeys.CHANNEL_SWITCHER_V2_PIP, default = false)
        .collectAsState(initial = false)

    // Debug which UI path is active at runtime
    // Keep screen on at the window level while this screen is visible
    DisposableEffect(Unit) {
        val activity = context.findActivity()
        activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose {
            activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    // Live TV channel sidebar state
    val liveTVChannels by viewModel.liveTVChannels.collectAsState()
    val isChannelSidebarVisible by viewModel.isChannelSidebarVisible.collectAsState()
    val channelCategories by viewModel.channelCategories.collectAsState()
    val selectedChannelCategory by viewModel.selectedChannelCategory.collectAsState()

    // Audio track selector state
    val isAudioSelectorVisible by viewModel.isAudioSelectorVisible.collectAsState()

    // Subtitle selector state
    val isSubtitleSelectorVisible by viewModel.isSubtitleSelectorVisible.collectAsState()

    // Quality selector state
    val isQualitySelectorVisible by viewModel.isQualitySelectorVisible.collectAsState()
    val availableQualities by viewModel.availableQualities.collectAsState()
    val selectedQuality by viewModel.selectedQuality.collectAsState()
    val subtitleOptions by viewModel.availableSubtitleOptions.collectAsState()
    val playerType by viewModel.playerType.collectAsState()
    val preferredPlayerType by viewModel.preferredPlayerTypeFlow.collectAsState(initial = "auto")
    val hwdecMode by viewModel.hwdecModeFlow.collectAsState(initial = "auto")
    var showSettingsDialog by remember { mutableStateOf(false) }
    val exoPlayer by viewModel.exoPlayerState.collectAsState()
    val surfaceKey by viewModel.surfaceKey.collectAsState()
    // When external subtitles are loaded via Compose overlay but MPV has no tracks,
    // inject virtual SubtitleOptions from the content's subtitleTracks metadata.
    val effectiveSubtitleOptions = if (subtitleOptions.isEmpty() && uiState.hasExternalSubtitles) {
        if (uiState.subtitleTracks.isNotEmpty()) {
            // Build per-track options with real language/label info from the backend
            uiState.subtitleTracks.mapIndexed { index, track ->
                SubtitleOption(
                    rendererIndex = -1,
                    groupIndex = 0,
                    trackIndex = index,
                    language = track.language,
                    label = track.label.ifBlank { track.language.uppercase() },
                    isSelected = uiState.currentSubtitleText != null
                )
            }
        } else {
            // Fallback: single generic option when no track metadata is available
            listOf(
                SubtitleOption(
                    rendererIndex = -1,
                    groupIndex = 0,
                    trackIndex = 0,
                    language = "und",
                    label = "Subtitles",
                    isSelected = uiState.currentSubtitleText != null
                )
            )
        }
    } else {
        subtitleOptions
    }
    val selectedSubtitleOption = effectiveSubtitleOptions.firstOrNull { it.isSelected }
    val hasQualityOptions = if (playerType == "mpv") {
        availableQualities.isNotEmpty()
    } else {
        availableQualities.size > 1
    }
    val liveChannelsById = remember(liveTVChannels) { liveTVChannels.associateBy { it.id } }
    val liveChannelIndexById = remember(liveTVChannels) {
        buildMap(liveTVChannels.size) {
            liveTVChannels.forEachIndexed { index, channel ->
                put(channel.id, index)
            }
        }
    }

    // Controls visibility + inactivity timer (auto-hide after 10s of no input)
    var controlsVisible by remember { mutableStateOf(true) }
    var inactivityKey by remember { mutableIntStateOf(0) }
    // Numeric channel jump buffer (2s window, max 4 digits)
    var channelNumberBuffer by remember { mutableStateOf("") }
    var isChannelNumberOverlayVisible by remember { mutableStateOf(false) }
    var channelNumberTick by remember { mutableIntStateOf(0) }

    // Zap overlay (V3) state
    var zapVisible by remember { mutableStateOf(false) }
    var zapChannel by remember { mutableStateOf<ContentStream?>(null) }
    var zapTick by remember { mutableIntStateOf(0) }
    var previousChannelId by remember { mutableStateOf<String?>(null) }

    // Helper to show zap and auto-hide
    val showZap: (ContentStream?) -> Unit = { ch ->
        zapChannel = ch
        zapVisible = true
        zapTick++
    }

    LaunchedEffect(zapTick) {
        if (zapVisible) {
            delay(2500)
            zapVisible = false
        }
    }

    // Removed explicit focus requester for channel button; bottom bar handles focus naturally

    // Auto-submit numeric channel buffer after 2s of inactivity
    LaunchedEffect(channelNumberTick) {
        if (channelNumberBuffer.isNotEmpty()) {
            val tickSnapshot = channelNumberTick
            delay(2000)
            if (tickSnapshot == channelNumberTick && channelNumberBuffer.isNotEmpty()) {
                val match = liveTVChannels.firstOrNull { ch ->
                    ch.channelNumber?.toString() == channelNumberBuffer || ch.id == channelNumberBuffer
                }
                if (match != null) {
                    viewModel.switchToChannel(match)
                }
                channelNumberBuffer = ""
                isChannelNumberOverlayVisible = false
            }
        }
    }

    // Initialize player with content based on type
    LaunchedEffect(contentId, contentType, streamLinkId) {
        when (contentType) {
            "episode" -> viewModel.loadEpisodeStream(contentId)
            else -> viewModel.loadContentStream(contentId, streamLinkId) // Always use DRM-capable path for content (incl. Eventos/LiveTV)
        }
    }

    // Auto-hide controls after 10s of inactivity (only if no overlays are open)
    LaunchedEffect(inactivityKey, controlsVisible, isChannelSidebarVisible, isAudioSelectorVisible, isQualitySelectorVisible, isSubtitleSelectorVisible) {
        if (controlsVisible && !isChannelSidebarVisible && !isAudioSelectorVisible && !isQualitySelectorVisible && !isSubtitleSelectorVisible) {
            val snapshot = inactivityKey
            delay(4_000)
            if (snapshot == inactivityKey) {
                controlsVisible = false
            }
        }
    }

    // Removed forced focus to channel button to avoid FocusRequester crash when not attached

    // Clean up player when leaving the screen
    DisposableEffect(Unit) {
        onDispose {
            // This will be called when the PlayerScreen is removed from composition
            viewModel.onPlayerDestroyed()
        }
    }

    // Show error messages
    uiState.error?.let { error ->
        ShowToast(message = error)
        LaunchedEffect(error) {
            viewModel.clearError()
        }
    }

    BackHandler(
        enabled = isChannelSidebarVisible || isAudioSelectorVisible || isQualitySelectorVisible || isSubtitleSelectorVisible || controlsVisible
    ) {
        when {
            isChannelSidebarVisible -> viewModel.hideChannelSidebar()
            isAudioSelectorVisible -> viewModel.hideAudioSelector()
            isQualitySelectorVisible -> viewModel.hideQualitySelector()
            isSubtitleSelectorVisible -> viewModel.hideSubtitleSelector()
            controlsVisible -> controlsVisible = false
            else -> onNavigateBack()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .onPreviewKeyEvent { _ -> false }
            .onKeyEvent { keyEvent ->
                if (isChannelSidebarVisible || isAudioSelectorVisible || isQualitySelectorVisible || isSubtitleSelectorVisible) {
                    // When any overlay is visible, allow child composables to handle keys
                    false
                } else {
                    val nativeKeyEvent = keyEvent.nativeKeyEvent
                    when {
                    // Numeric channel entry: digits buffer (2s, max 4)
                    viewModel.isLiveTV() &&
                    nativeKeyEvent?.action == AndroidKeyEvent.ACTION_DOWN &&
                    (
                        (nativeKeyEvent.keyCode in AndroidKeyEvent.KEYCODE_0..AndroidKeyEvent.KEYCODE_9) ||
                        (nativeKeyEvent.keyCode in AndroidKeyEvent.KEYCODE_NUMPAD_0..AndroidKeyEvent.KEYCODE_NUMPAD_9)
                    ) -> {
                        val code = nativeKeyEvent.keyCode
                        val digit = when (code) {
                            AndroidKeyEvent.KEYCODE_0, AndroidKeyEvent.KEYCODE_NUMPAD_0 -> '0'
                            AndroidKeyEvent.KEYCODE_1, AndroidKeyEvent.KEYCODE_NUMPAD_1 -> '1'
                            AndroidKeyEvent.KEYCODE_2, AndroidKeyEvent.KEYCODE_NUMPAD_2 -> '2'
                            AndroidKeyEvent.KEYCODE_3, AndroidKeyEvent.KEYCODE_NUMPAD_3 -> '3'
                            AndroidKeyEvent.KEYCODE_4, AndroidKeyEvent.KEYCODE_NUMPAD_4 -> '4'
                            AndroidKeyEvent.KEYCODE_5, AndroidKeyEvent.KEYCODE_NUMPAD_5 -> '5'
                            AndroidKeyEvent.KEYCODE_6, AndroidKeyEvent.KEYCODE_NUMPAD_6 -> '6'
                            AndroidKeyEvent.KEYCODE_7, AndroidKeyEvent.KEYCODE_NUMPAD_7 -> '7'
                            AndroidKeyEvent.KEYCODE_8, AndroidKeyEvent.KEYCODE_NUMPAD_8 -> '8'
                            AndroidKeyEvent.KEYCODE_9, AndroidKeyEvent.KEYCODE_NUMPAD_9 -> '9'
                            else -> null
                        }
                        if (digit != null) {
                            channelNumberBuffer = (channelNumberBuffer + digit).take(4)
                            isChannelNumberOverlayVisible = true
                            channelNumberTick++
                            controlsVisible = true
                            inactivityKey++
                            true
                        } else {
                            false
                        }
                    }

                    // Submit numeric buffer with OK/Enter
                    viewModel.isLiveTV() &&
                    channelNumberBuffer.isNotEmpty() &&
                    keyEvent.type == KeyEventType.KeyDown &&
                    (keyEvent.key == Key.DirectionCenter || keyEvent.key == Key.Enter) -> {
                        val match = liveTVChannels.firstOrNull { ch ->
                            ch.channelNumber?.toString() == channelNumberBuffer || ch.id == channelNumberBuffer
                        }
                        if (match != null) {
                            previousChannelId = viewModel.getCurrentChannelId()
                            viewModel.switchToChannel(match)
                            showZap(match)
                        }
                        channelNumberBuffer = ""
                        isChannelNumberOverlayVisible = false
                        controlsVisible = true
                        inactivityKey++
                        true
                    }

                    // Dedicated key to open overlay (GUIDE)
                    viewModel.isLiveTV() &&
                    !isChannelSidebarVisible &&
                    nativeKeyEvent?.action == AndroidKeyEvent.ACTION_DOWN &&
                    nativeKeyEvent.keyCode == AndroidKeyEvent.KEYCODE_GUIDE -> {
                        viewModel.showChannelSidebar()
                        controlsVisible = true
                        inactivityKey++
                        true
                    }

                    // If controls are visible, OK/Enter should not open a sidebar; keep it lightweight
                    viewModel.isLiveTV() &&
                    !isChannelSidebarVisible &&
                    controlsVisible &&
                    keyEvent.type == KeyEventType.KeyDown &&
                    (keyEvent.key == Key.DirectionCenter || keyEvent.key == Key.Enter) -> {
                        controlsVisible = true
                        inactivityKey++
                        false
                    }

                    viewModel.isLiveTV() &&
                    !isChannelSidebarVisible &&
                    nativeKeyEvent?.action == AndroidKeyEvent.ACTION_DOWN &&
                    (nativeKeyEvent.keyCode == AndroidKeyEvent.KEYCODE_CHANNEL_UP ||
                     nativeKeyEvent.keyCode == AndroidKeyEvent.KEYCODE_MEDIA_NEXT) -> {
                        val currentId = viewModel.getCurrentChannelId()
                        val idx = currentId?.let(liveChannelIndexById::get) ?: -1
                        val nextCh = if (liveTVChannels.isNotEmpty()) {
                            if (idx >= 0) liveTVChannels[(idx + 1) % liveTVChannels.size] else liveTVChannels.first()
                        } else null
                        previousChannelId = currentId
                        viewModel.switchToNextChannel()
                        if (nextCh != null) showZap(nextCh)
                        controlsVisible = true
                        inactivityKey++
                        true
                    }

                    viewModel.isLiveTV() &&
                    !isChannelSidebarVisible &&
                    nativeKeyEvent?.action == AndroidKeyEvent.ACTION_DOWN &&
                    (nativeKeyEvent.keyCode == AndroidKeyEvent.KEYCODE_CHANNEL_DOWN ||
                     nativeKeyEvent.keyCode == AndroidKeyEvent.KEYCODE_MEDIA_PREVIOUS) -> {
                        val currentId = viewModel.getCurrentChannelId()
                        val idx = currentId?.let(liveChannelIndexById::get) ?: -1
                        val prevCh = if (liveTVChannels.isNotEmpty()) {
                            if (idx >= 0) liveTVChannels[(idx - 1 + liveTVChannels.size) % liveTVChannels.size] else liveTVChannels.last()
                        } else null
                        previousChannelId = currentId
                        viewModel.switchToPreviousChannel()
                        if (prevCh != null) showZap(prevCh)
                        controlsVisible = true
                        inactivityKey++
                        true
                    }

                    // Recall last channel (LAST/Prev key): swap back to previous channel
                    viewModel.isLiveTV() &&
                    !isChannelSidebarVisible &&
                    nativeKeyEvent?.action == AndroidKeyEvent.ACTION_DOWN &&
                    nativeKeyEvent.keyCode == AndroidKeyEvent.KEYCODE_LAST_CHANNEL -> {
                        val currentId = viewModel.getCurrentChannelId()
                        val targetId = previousChannelId
                        val recall = targetId?.let(liveChannelsById::get)
                        if (recall != null) {
                            previousChannelId = currentId
                            viewModel.switchToChannel(recall)
                            showZap(recall)
                            controlsVisible = true
                            inactivityKey++
                            true
                        } else {
                            false
                        }
                    }

                    // DPAD Left/Right: Always change channel (with or without UI visible)
                    viewModel.isLiveTV() &&
                    !isChannelSidebarVisible &&
                    nativeKeyEvent?.action == AndroidKeyEvent.ACTION_DOWN &&
                    nativeKeyEvent.keyCode == AndroidKeyEvent.KEYCODE_DPAD_RIGHT -> {
                        val currentId = viewModel.getCurrentChannelId()
                        val idx = currentId?.let(liveChannelIndexById::get) ?: -1
                        val nextCh = if (liveTVChannels.isNotEmpty()) {
                            if (idx >= 0) liveTVChannels[(idx + 1) % liveTVChannels.size] else liveTVChannels.first()
                        } else null
                        previousChannelId = currentId
                        viewModel.switchToNextChannel()
                        if (nextCh != null) showZap(nextCh)
                        controlsVisible = true
                        inactivityKey++
                        true
                    }

                    viewModel.isLiveTV() &&
                    !isChannelSidebarVisible &&
                    nativeKeyEvent?.action == AndroidKeyEvent.ACTION_DOWN &&
                    nativeKeyEvent.keyCode == AndroidKeyEvent.KEYCODE_DPAD_LEFT -> {
                        val currentId = viewModel.getCurrentChannelId()
                        val idx = currentId?.let(liveChannelIndexById::get) ?: -1
                        val prevCh = if (liveTVChannels.isNotEmpty()) {
                            if (idx >= 0) liveTVChannels[(idx - 1 + liveTVChannels.size) % liveTVChannels.size] else liveTVChannels.last()
                        } else null
                        previousChannelId = currentId
                        viewModel.switchToPreviousChannel()
                        if (prevCh != null) showZap(prevCh)
                        controlsVisible = true
                        inactivityKey++
                        true
                    }

                    // DPAD Up/Down: Show controls and navigate UI (don't change channel)
                    viewModel.isLiveTV() &&
                    !isChannelSidebarVisible &&
                    nativeKeyEvent?.action == AndroidKeyEvent.ACTION_DOWN &&
                    (nativeKeyEvent.keyCode == AndroidKeyEvent.KEYCODE_DPAD_UP ||
                     nativeKeyEvent.keyCode == AndroidKeyEvent.KEYCODE_DPAD_DOWN) -> {
                        controlsVisible = true
                        inactivityKey++
                        false // Let the event propagate to UI components for navigation
                    }

                    // Show zap banner with INFO key
                    viewModel.isLiveTV() &&
                    !isChannelSidebarVisible &&
                    nativeKeyEvent?.action == AndroidKeyEvent.ACTION_DOWN &&
                    nativeKeyEvent.keyCode == AndroidKeyEvent.KEYCODE_INFO -> {
                        val current = viewModel.getCurrentChannelId()?.let(liveChannelsById::get)
                        showZap(current)
                        controlsVisible = true
                        inactivityKey++
                        true
                    }

                    // Handle Back button to close channel sidebar
                    keyEvent.key == Key.Back && keyEvent.type == KeyEventType.KeyUp -> {
                        if (isChannelSidebarVisible) {
                            viewModel.hideChannelSidebar()
                            true
                        } else {
                            false // Let the system handle back navigation
                        }
                    }

                    // If overlays are hidden, only OK/Enter shows controls (no selector)
                    uiState.isLiveTV &&
                    !isChannelSidebarVisible &&
                    !controlsVisible &&
                    keyEvent.type == KeyEventType.KeyDown && (
                        keyEvent.key == Key.DirectionCenter ||
                        keyEvent.key == Key.Enter
                    ) -> {
                        controlsVisible = true
                        inactivityKey++
                        false
                    }

                    // Show controls on any D-pad interaction and reset inactivity timer
                    keyEvent.type == KeyEventType.KeyDown && (
                        keyEvent.key == Key.DirectionUp ||
                        keyEvent.key == Key.DirectionDown ||
                        keyEvent.key == Key.DirectionLeft ||
                        keyEvent.key == Key.DirectionRight ||
                        keyEvent.key == Key.DirectionCenter ||
                        keyEvent.key == Key.Enter
                    ) -> {
                        controlsVisible = true
                        inactivityKey++
                        false // Let the event continue to be processed
                    }

                    else -> false
                }
                }
            }
            .pointerInput(Unit) {
                detectTapGestures {
                    controlsVisible = true
                    inactivityKey++
                }
            }
    ) {
        when (val contentState = uiState.contentState) {
            is UiState.Loading -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    LoadingIndicator(color = Color.White)
                }
            }

            is UiState.Success -> {
                val content = contentState.data

                // ExoPlayer View - hide when channel selector is visible to avoid double rendering and audio overlap
                // Revert to reusing the view (key only on playerType) as TextureView handles surface updates better
                // and destroying/creating surfaces too frequently confuses the codec (BAD_INDEX errors)
                if (!isChannelSidebarVisible) {
                    key(playerType, surfaceKey) {
                        if (playerType == "mpv") {
                            AndroidView(
                                factory = { context ->
                                    TextureView(context).apply {
                                        keepScreenOn = true
                                        surfaceTextureListener = object : TextureView.SurfaceTextureListener {
                                            override fun onSurfaceTextureAvailable(st: SurfaceTexture, width: Int, height: Int) {
                                                viewModel.attachMpvSurface(Surface(st))
                                            }

                                            override fun onSurfaceTextureSizeChanged(st: SurfaceTexture, width: Int, height: Int) = Unit

                                            override fun onSurfaceTextureDestroyed(st: SurfaceTexture): Boolean {
                                                viewModel.detachMpvSurface()
                                                return true
                                            }

                                            override fun onSurfaceTextureUpdated(st: SurfaceTexture) = Unit
                                        }
                                    }
                                },
                                modifier = Modifier.fillMaxSize()
                            )
                        } else {
                            AndroidView(
                                factory = { context ->
                                    val inflater = android.view.LayoutInflater.from(context)
                                    val parent = android.widget.FrameLayout(context)
                                    val view = inflater.inflate(R.layout.player_view_texture, parent, false) as PlayerView
                                    view.apply {
                                        player = exoPlayer
                                        // defined in XML: useController=false, keepScreenOn=true, showBuffering=when_playing

                                        // Enable subtitle rendering
                                        subtitleView?.apply {
                                            setStyle(androidx.media3.ui.CaptionStyleCompat.DEFAULT)
                                            setFractionalTextSize(androidx.media3.ui.SubtitleView.DEFAULT_TEXT_SIZE_FRACTION)
                                        }
                                    }
                                },
                                modifier = Modifier.fillMaxSize(),
                                update = { playerView ->
                                    playerView.player = exoPlayer
                                    // Ensure subtitle view is visible
                                    playerView.subtitleView?.apply {
                                        visibility = android.view.View.VISIBLE
                                    }
                                    // Ensure flag remains while this view is attached
                                    playerView.keepScreenOn = true
                                }
                            )
                        }
                    }
                }

                // Custom Player Controls Overlay - Different for Live TV vs VOD
                val contentDetails = content as? ContentDetails ?: ContentDetails(
                    id = "0",
                    title = when (content) {
                        is ContentStream -> content.title
                        is EpisodeStream -> content.title
                        else -> stringResource(R.string.unknown_label)
                    },
                    description = null,
                    imageUrl = null,
                    posterUrl = null,
                    backdropUrl = null,
                    duration = null,
                    year = null,
                    rating = 0f,
                    genres = emptyList(),
                    type = ContentType.MOVIE,
                    originalType = null,
                    streamUrl = null,

                    cast = emptyList(),
                    director = null,
                    trailer = null,
                    episodes = emptyList(),
                    seasons = emptyList(),
                    relatedContent = emptyList(),
                    createdAt = "",
                    updatedAt = ""
                )

                // Compose-based subtitle overlay (bypasses MPV's libass rendering)
                uiState.currentSubtitleText?.let { subtitleText ->
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(bottom = if (controlsVisible) 140.dp else 40.dp, start = 48.dp, end = 48.dp),
                        contentAlignment = Alignment.BottomCenter
                    ) {
                        Text(
                            text = subtitleText,
                            color = Color.White,
                            fontSize = 24.sp,
                            fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                            style = androidx.compose.ui.text.TextStyle(
                                shadow = androidx.compose.ui.graphics.Shadow(
                                    color = Color.Black,
                                    offset = androidx.compose.ui.geometry.Offset(2f, 2f),
                                    blurRadius = 8f
                                ),
                                background = Color(0x66000000)
                            ),
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                        )
                    }
                }

                if (uiState.isLiveTV) {
                    // Autoplay logic is now handled by loadContentStream - no need for duplicate loading
                    // The initial LaunchedEffect(contentId, contentType) already loads the channel
                    // This was causing double-loading issues
                    // Live TV Controls - Simple play/pause only
                    LiveTVPlayerControls(
                        content = contentDetails,
                        isPlaying = uiState.isPlaying,
                        onShowSettings = { showSettingsDialog = true },
                        onPlayPause = {
                            viewModel.togglePlayPause()
                            controlsVisible = true
                            inactivityKey++
                        },
                        onNavigateBack = onNavigateBack,
                        // Use explicit show/hide to avoid duplicate-toggle races that open then immediately close
                        onToggleChannelSidebar = {
                            if (!isChannelSidebarVisible) {
                                viewModel.showChannelSidebar()
                            } else {
                                viewModel.hideChannelSidebar()
                            }
                            controlsVisible = true
                            inactivityKey++
                        },
                        isChannelSidebarVisible = isChannelSidebarVisible,
                        controlsVisible = controlsVisible,
                        onToggleAudioSelector = {
                            viewModel.toggleAudioSelector()
                            controlsVisible = true
                            inactivityKey++
                        },
                        onToggleQualitySelector = {
                            viewModel.toggleQualitySelector()
                            controlsVisible = true
                            inactivityKey++
                        },
                        onToggleSubtitleSelector = {
                            viewModel.toggleSubtitleSelector()
                            controlsVisible = true
                            inactivityKey++
                        },
                        hasMultipleAudioTracks = uiState.availableAudioTracks.isNotEmpty(),
                        hasMultipleQualities = hasQualityOptions,
                        hasSubtitles = effectiveSubtitleOptions.isNotEmpty(),
                        modifier = Modifier.fillMaxSize()
                    )
                } else {
                    // VOD Controls - Full controls with seek, progress bar, etc.
                    VODPlayerControls(
                        content = contentDetails,
                        isPlaying = uiState.isPlaying,
                        currentPosition = uiState.currentPosition,
                        duration = uiState.duration,
                        onPlayPause = {
                            viewModel.togglePlayPause()
                            controlsVisible = true
                            inactivityKey++
                        },
                        onSeek = viewModel::seekTo,
                        onSeekBackward = {
                            val newPosition = (uiState.currentPosition - 10000).coerceAtLeast(0)
                            viewModel.seekTo(newPosition)
                            controlsVisible = true
                            inactivityKey++
                        },
                        onSeekForward = {
                            val newPosition = (uiState.currentPosition + 10000).coerceAtMost(uiState.duration)
                            viewModel.seekTo(newPosition)
                            controlsVisible = true
                            inactivityKey++
                        },
                        onNavigateBack = onNavigateBack,
                        currentEpisodeId = viewModel.getCurrentEpisodeId(),
                        onPreviousEpisode = { episode ->
                            viewModel.navigateToEpisode(episode)
                            controlsVisible = true
                            inactivityKey++
                        },
                        onNextEpisode = { episode ->
                            viewModel.navigateToEpisode(episode)
                            controlsVisible = true
                            inactivityKey++
                        },
                        controlsVisible = controlsVisible,
                        availableAudioTracks = uiState.availableAudioTracks,
                        selectedAudioTrack = uiState.selectedAudioTrack,
                        onToggleAudioSelector = {
                            viewModel.toggleAudioSelector()
                            controlsVisible = true
                            inactivityKey++
                        },
                        onAudioTrackSelected = { track ->
                            viewModel.selectAudioTrack(track)
                            controlsVisible = true
                            inactivityKey++
                        },
                        onResetAudioTrack = {
                            viewModel.resetAudioTrack()
                            controlsVisible = true
                            inactivityKey++
                        },
                        availableSubtitleOptions = effectiveSubtitleOptions,
                        selectedSubtitleOption = selectedSubtitleOption,
                        onSubtitleSelected = { opt ->
                            if (opt.rendererIndex == -1) {
                                // Virtual external subtitle option — toggle Compose overlay
                                viewModel.toggleComposeSubtitles()
                            } else {
                                viewModel.selectSubtitleOption(opt)
                            }
                            controlsVisible = true
                            inactivityKey++
                        },
                        onDisableSubtitles = {
                            viewModel.disableSubtitles()
                            if (uiState.hasExternalSubtitles && uiState.currentSubtitleText != null) {
                                viewModel.toggleComposeSubtitles()
                            }
                            controlsVisible = true
                            inactivityKey++
                        },
                        hasMultipleAudioTracks = uiState.availableAudioTracks.isNotEmpty(),
                        hasMultipleQualities = hasQualityOptions,
                        hasMultipleSubtitles = effectiveSubtitleOptions.isNotEmpty(),
                        onToggleQualitySelector = {
                            viewModel.toggleQualitySelector()
                            controlsVisible = true
                            inactivityKey++
                        },
                        modifier = Modifier.fillMaxSize()
                    )
                }

                // Removed floating channel button; the bottom controls include it now.

                // Channel Switcher Overlay, feature-flagged (only for Live TV)
                if (viewModel.isLiveTV()) {
                    // EPG ViewModel shared across overlays
                    val epgViewModel = androidx.hilt.navigation.compose.hiltViewModel<com.streamcore.tv.presentation.screens.livetv.EPGViewModel>()
                    val epgData by epgViewModel.epgData.collectAsState()

                    // Load EPG for visible channels
                    LaunchedEffect(liveTVChannels) {
                        if (liveTVChannels.isNotEmpty()) {
                            val channelIds = liveTVChannels.map { it.id.toString() }
                            Timber.d("PlayerScreen: Loading EPG for ${channelIds.size} channels")
                            epgViewModel.loadMultiChannelEPG(channelIds)
                        }
                    }

                    // EPG Now/Next maps
                    val epgNowMap = remember(epgData) {
                        val result = mutableMapOf<String, com.streamcore.tv.domain.model.EPGProgram?>()
                        epgData.forEach { (channelId, data) ->
                            result[channelId] = data.programs.find { it.isLive }
                        }
                        result
                    }
                    val epgNextMap = remember(epgData) {
                        val result = mutableMapOf<String, com.streamcore.tv.domain.model.EPGProgram?>()
                        epgData.forEach { (channelId, data) ->
                            val nextProgram = data.programs
                                .filter { !it.isLive }
                                .sortedBy { it.startTime }
                                .firstOrNull()
                            result[channelId] = nextProgram
                        }
                        result
                    }

                    // Show V2 overlay only if feature flag is enabled; default experience is lightweight zapping
                    if (channelSwitcherV2Enabled) {ChannelSelectorV2Screen(
                            isVisible = isChannelSidebarVisible,
                            channels = liveTVChannels,
                            currentChannelId = viewModel.getCurrentChannelId(),
                            onChannelSelected = { channel ->
                                previousChannelId = viewModel.getCurrentChannelId()
                                viewModel.switchToChannel(channel)
                                showZap(channel)
                                controlsVisible = true
                                inactivityKey++
                            },
                            onDismiss = { viewModel.hideChannelSidebar() },
                            epgNow = epgNowMap,
                            epgNext = epgNextMap,
                            categories = channelCategories,
                            selectedCategory = selectedChannelCategory,
                            onSelectCategory = { cat -> viewModel.selectChannelCategory(cat) },
                            // Reuse the fullscreen player's ExoPlayer in the selector preview window to avoid
                            // Reuse the fullscreen player's ExoPlayer in the selector preview window to avoid
                            // running two concurrent players against the same stream (causes EOF/source errors on some CDNs).
                            sharedPreviewPlayer = exoPlayer
                        )
                    } else {
                        ModernChannelSelector(
                            isVisible = isChannelSidebarVisible,
                            channels = liveTVChannels,
                            currentChannelId = viewModel.getCurrentChannelId(),
                            onChannelSelected = { channel ->
                                previousChannelId = viewModel.getCurrentChannelId()
                                viewModel.switchToChannel(channel)
                                showZap(channel)
                                controlsVisible = true
                                inactivityKey++
                            },
                            onDismiss = { viewModel.hideChannelSidebar() },
                            epgViewModel = epgViewModel,
                            epgNow = epgNowMap,
                            epgNext = epgNextMap,
                            categories = channelCategories,
                            selectedCategory = selectedChannelCategory,
                            onSelectCategory = { cat -> viewModel.selectChannelCategory(cat) },
                            modifier = Modifier.fillMaxSize()
                        )
                    }

                    // V3 Zap banner (lightweight info)
                    ZapInfoV3(
                        visible = zapVisible,
                        channel = zapChannel,
                        now = zapChannel?.let { epgNowMap[it.id] },
                        next = zapChannel?.let { epgNextMap[it.id] },
                        modifier = Modifier.fillMaxSize()
                    )
                }

                // Player Settings Dialog
                if (showSettingsDialog) {
                    PlayerSettingsDialog(
                        currentPlayerType = preferredPlayerType,
                        currentHwdecMode = hwdecMode,
                        onPlayerTypeSelected = viewModel::updatePlayerType,
                        onHwdecModeSelected = viewModel::updateHwdecMode,
                        onDismiss = { showSettingsDialog = false }
                    )
                }

                // Audio Track Selector
                AudioTrackSelector(
                    isVisible = isAudioSelectorVisible,
                    audioTracks = uiState.availableAudioTracks,
                    selectedTrack = uiState.selectedAudioTrack,
                    onTrackSelected = { track ->
                        viewModel.selectAudioTrack(track)
                        viewModel.hideAudioSelector()
                    },
                    onResetToAuto = {
                        viewModel.resetAudioTrack()
                        viewModel.hideAudioSelector()
                    },
                    onDismiss = { viewModel.hideAudioSelector() }
                )

                SubtitleSelector(
                    isVisible = isSubtitleSelectorVisible,
                    subtitleOptions = effectiveSubtitleOptions,
                    selectedSubtitle = selectedSubtitleOption,
                    onSubtitleSelected = { option ->
                        if (option.rendererIndex == -1) {
                            viewModel.toggleComposeSubtitles()
                        } else {
                            viewModel.selectSubtitleOption(option)
                        }
                        viewModel.hideSubtitleSelector()
                    },
                    onDisableSubtitles = {
                        viewModel.disableSubtitles()
                        viewModel.hideSubtitleSelector()
                    },
                    onDismiss = { viewModel.hideSubtitleSelector() }
                )

                // Quality Selector
                QualitySelector(
                    isVisible = isQualitySelectorVisible,
                    qualities = availableQualities,
                    selectedQuality = selectedQuality,
                    onQualitySelected = { quality ->
                        viewModel.selectVideoQuality(quality)
                        viewModel.hideQualitySelector()
                    },
                    onResetToAuto = {
                        viewModel.resetVideoQuality()
                        viewModel.hideQualitySelector()
                    },
                    onDismiss = { viewModel.hideQualitySelector() }
                )

                // Numeric channel input overlay (visual feedback and manual submit)
                ChannelNumberInput(
                    isVisible = isChannelNumberOverlayVisible,
                    currentNumber = channelNumberBuffer,
                    onNumberChange = { newVal ->
                        channelNumberBuffer = newVal.take(4)
                        if (channelNumberBuffer.isNotEmpty()) {
                            isChannelNumberOverlayVisible = true
                            channelNumberTick++
                        }
                    },
                    onChannelSelected = { entered ->
                        val match = liveTVChannels.firstOrNull { ch ->
                            ch.channelNumber?.toString() == entered || ch.id == entered
                        }
                        if (match != null) {
                            viewModel.switchToChannel(match)
                            showZap(match)
                        }
                        channelNumberBuffer = ""
                        isChannelNumberOverlayVisible = false
                    },
                    onDismiss = {
                        channelNumberBuffer = ""
                        isChannelNumberOverlayVisible = false
                    }
                )

            }

            is UiState.Error -> {
                ErrorScreen(
                    message = contentState.message,
                    onRetry = { viewModel.loadContent(contentId) }
                )

                // Back button for error state
                IconButton(
                    onClick = onNavigateBack,
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(16.dp)
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = stringResource(R.string.cd_back),
                        tint = Color.White
                    )
                }
            }
        }
    }
}

 // Helper to find the hosting Activity from a Compose LocalContext
 private tailrec fun Context.findActivity(): Activity? {
     return when (this) {
         is Activity -> this
         is ContextWrapper -> baseContext.findActivity()
         else -> null
     }
 }

/**
 * Simple player screen for testing without ExoPlayer
 */
@Composable
fun SimplePlayerScreen(
    contentId: String,
    onNavigateBack: () -> Unit,
    viewModel: PlayerViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(contentId) {
        viewModel.loadContent(contentId)
    }

    uiState.error?.let { error ->
        ShowToast(message = error)
        LaunchedEffect(error) {
            viewModel.clearError()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
    ) {
        when (val contentState = uiState.contentState) {
            is UiState.Loading -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        LoadingIndicator(color = Color.White)
                        Text(
                            text = stringResource(R.string.player_loading),
                            color = Color.White,
                            style = MaterialTheme.typography.bodyLarge
                        )
                    }
                }
            }

            is UiState.Success -> {
                val content = contentState.data
                val title = when (content) {
                    is ContentStream -> content.title
                    is EpisodeStream -> content.title
                    is ContentDetails -> content.title
                    else -> "Unknown Content"
                }

                // Placeholder player view
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Text(
                        text = "🎬",
                        style = MaterialTheme.typography.displayLarge,
                        color = Color.White
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    Text(
                        text = title,
                        style = MaterialTheme.typography.headlineMedium,
                        color = Color.White
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = stringResource(R.string.player_placeholder_message),
                        style = MaterialTheme.typography.bodyLarge,
                        color = Color.White.copy(alpha = 0.7f)
                    )

                    Spacer(modifier = Modifier.height(24.dp))

                    Button(
                        onClick = { viewModel.togglePlayPause() },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Primary
                        )
                    ) {
                        Text(
                            text = if (uiState.isPlaying) {
                                stringResource(R.string.player_pause)
                            } else {
                                stringResource(R.string.player_play)
                            }
                        )
                    }
                }
            }

            is UiState.Error -> {
                ErrorScreen(
                    message = contentState.message,
                    onRetry = { viewModel.loadContent(contentId) }
                )
            }
        }

        // Back button
        IconButton(
            onClick = onNavigateBack,
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(16.dp)
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = stringResource(R.string.cd_back),
                tint = Color.White
            )
        }
    }
}
