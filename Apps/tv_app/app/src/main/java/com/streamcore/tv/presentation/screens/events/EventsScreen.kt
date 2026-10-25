package com.streamcore.tv.presentation.screens.events

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.streamcore.tv.R
import com.streamcore.tv.domain.model.Result
import com.streamcore.tv.presentation.components.ErrorMessage
import com.streamcore.tv.presentation.components.LoadingIndicator
import com.streamcore.tv.presentation.components.livetv.ChannelGrid
import com.streamcore.tv.presentation.components.livetv.ChannelGridHeader
import com.streamcore.tv.presentation.components.livetv.GridType

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EventsScreen(
    onEventClick: (String) -> Unit,
    onNavigateBack: () -> Unit,
    viewModel: EventsViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var currentGridType by remember { mutableStateOf(GridType.CATEGORIES) }
    val eventsCount = when (val s = uiState.eventsState) {
        is Result.Success -> s.data.size
        else -> 0
    }

    LaunchedEffect(Unit) {
        viewModel.loadEvents()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0F0F23))
    ) {
        Column(
            modifier = Modifier.fillMaxSize()
        ) {
            // Top bar with stronger contrast and pill controls
            Surface(color = Color(0xFF161a24)) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 24.dp, vertical = 16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        IconButton(
                            onClick = onNavigateBack,
                            colors = IconButtonDefaults.iconButtonColors(
                                contentColor = Color.White
                            )
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = stringResource(R.string.cd_back_button)
                            )
                        }

                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(
                            text = stringResource(id = R.string.nav_events),
                            color = Color.White,
                            fontSize = 24.sp,
                            fontWeight = FontWeight.Bold
                            )
                            if (eventsCount > 0) {
                                Text(
                                    text = stringResource(id = R.string.channels_available, eventsCount),
                                    color = Color(0xFFB0BEC5),
                                    fontSize = 12.sp
                                )
                            }
                        }
                    }

                    // Segmented view selector (pills)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        ViewPill(
                            text = stringResource(id = R.string.label_view_categories),
                            selected = currentGridType == GridType.CATEGORIES,
                            onClick = { currentGridType = GridType.CATEGORIES }
                        )
                        ViewPill(
                            text = stringResource(id = R.string.label_view_compact),
                            selected = currentGridType == GridType.COMPACT,
                            onClick = { currentGridType = GridType.COMPACT }
                        )
                        ViewPill(
                            text = stringResource(id = R.string.label_view_large),
                            selected = currentGridType == GridType.LARGE,
                            onClick = { currentGridType = GridType.LARGE }
                        )
                    }
                }
            }

            // Content
            when (val eventsState = uiState.eventsState) {
                is Result.Loading -> {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        LoadingIndicator()
                    }
                }

                is Result.Success -> {
                    val events = eventsState.data

                    ChannelGrid(
                        channels = events,
                        onChannelClick = { item -> onEventClick(item.id.toString()) },
                        gridType = currentGridType,
                        showProgramInfo = false,
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(top = 12.dp)
                    )
                }

                is Result.Error -> {
                    ErrorMessage(
                        message = eventsState.exception.message ?: stringResource(id = R.string.error_loading_events),
                        onRetry = { viewModel.loadEvents() }
                    )
                }
            }
        }
    }
}

@Composable
private fun ViewPill(text: String, selected: Boolean, onClick: () -> Unit) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = { Text(text) },
        colors = FilterChipDefaults.filterChipColors(
            containerColor = Color(0xFF212633),
            labelColor = Color.White,
            selectedContainerColor = Color(0xFF3B7BEB),
            selectedLabelColor = Color.White
        ),
        border = FilterChipDefaults.filterChipBorder(
            enabled = true,
            selected = selected,
            borderColor = Color(0xFF2A2F3A),
            selectedBorderColor = Color(0xFF3B7BEB)
        )
    )
}
