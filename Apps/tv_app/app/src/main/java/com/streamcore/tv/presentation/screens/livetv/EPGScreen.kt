package com.streamcore.tv.presentation.screens.livetv

import android.app.DatePickerDialog
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.streamcore.tv.domain.model.Result
import com.streamcore.tv.domain.model.ContentItem
import com.streamcore.tv.domain.model.EPGProgram
import com.streamcore.tv.presentation.components.LoadingIndicator
import com.streamcore.tv.presentation.components.ErrorMessage
import com.streamcore.tv.presentation.components.livetv.EPGGrid
import com.streamcore.tv.presentation.components.livetv.ProgramInfoCard
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R

/**
 * EPG (Electronic Program Guide) Screen
 * 
 * Shows the programming guide for all channels
 * with time-based navigation and program details
 */
@Suppress("UNUSED_PARAMETER")
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EPGScreen(
    onNavigateBack: () -> Unit,
    onChannelClick: (String) -> Unit,
    onProgramClick: (EPGProgram) -> Unit,
    viewModel: LiveTVViewModel = hiltViewModel(),
    epgViewModel: EPGViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val epgUiState by epgViewModel.uiState.collectAsStateWithLifecycle()
    val epgData by epgViewModel.epgData.collectAsStateWithLifecycle()
    
    var selectedProgram by remember { mutableStateOf<EPGProgram?>(null) }
    var selectedChannel by remember { mutableStateOf<ContentItem?>(null) }
    var currentTime by remember { mutableStateOf(LocalDateTime.now()) }
    var selectedDate by remember { mutableStateOf(LocalDate.now()) }

    BackHandler(enabled = selectedProgram != null) {
        selectedProgram = null
        selectedChannel = null
    }
    
    // Context for DatePicker
    val context = LocalContext.current
    
    // Date picker dialog
    val datePickerDialog = remember(selectedDate) {
        DatePickerDialog(
            context,
            { _, year, month, dayOfMonth ->
                selectedDate = LocalDate.of(year, month + 1, dayOfMonth)
                currentTime = selectedDate.atStartOfDay().withHour(LocalDateTime.now().hour)
            },
            selectedDate.year,
            selectedDate.monthValue - 1,
            selectedDate.dayOfMonth
        )
    }
    
    // Load channels and EPG data
    LaunchedEffect(Unit) {
        viewModel.loadChannels()
    }
    
    // Load EPG data when channels are loaded
    LaunchedEffect(uiState.channelsState, selectedDate) {
        val channelsState = uiState.channelsState
        if (channelsState is Result.Success && channelsState.data.isNotEmpty()) {
            val channelIds = channelsState.data.map { it.id.toString() }
            val dateStr = selectedDate.format(DateTimeFormatter.ISO_LOCAL_DATE)
            epgViewModel.loadMultiChannelEPG(channelIds, dateStr)
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0F0F23))
    ) {
        Column(
            modifier = Modifier.fillMaxSize()
        ) {
            // Top Bar
            EPGTopBar(
                currentTime = currentTime,
                onNavigateBack = onNavigateBack,
                onTimeChange = { currentTime = it },
                onDatePickerClick = { datePickerDialog.show() }
            )
            
            // Content
            when (val channelsState = uiState.channelsState) {
                is Result.Loading -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        LoadingIndicator()
                    }
                }
                
                is Result.Success -> {
                    val channels = channelsState.data
                    
                    if (channels.isEmpty()) {
                        EmptyEPGState()
                    } else {
                        // Transform EPGData map to List<EPGProgram> map for EPGGrid
                        val epgProgramsMap = remember(epgData) {
                            epgData.mapValues { (_, data) -> data.programs }
                        }
                        
                        Row(
                            modifier = Modifier.fillMaxSize()
                        ) {
                            // EPG Grid
                            EPGGrid(
                                channels = channels,
                                epgData = epgProgramsMap,
                                currentTime = currentTime,
                                onProgramClick = { program ->
                                    selectedProgram = program
                                    // Find the channel that contains this program
                                    selectedChannel = channels.find { channel ->
                                        epgData[channel.id.toString()]?.programs?.any { it.id == program.id } == true
                                    }
                                },
                                onChannelClick = { channel ->
                                    selectedChannel = channel
                                    onChannelClick(channel.id.toString())
                                },
                                modifier = Modifier.weight(1f)
                            )
                            
                            // Program Info Sidebar
                            if (selectedProgram != null && selectedChannel != null) {
                                // Calculate next program
                                val channelPrograms = epgData[selectedChannel!!.id.toString()]?.programs ?: emptyList()
                                val currentIndex = channelPrograms.indexOfFirst { it.id == selectedProgram!!.id }
                                val nextProgram = if (currentIndex >= 0 && currentIndex < channelPrograms.size - 1) {
                                    channelPrograms[currentIndex + 1]
                                } else null
                                
                                ProgramInfoSidebar(
                                    channel = selectedChannel!!,
                                    program = selectedProgram!!,
                                    nextProgram = nextProgram,
                                    onWatchNow = {
                                        onChannelClick(selectedChannel!!.id.toString())
                                    },
                                    onClose = {
                                        selectedProgram = null
                                        selectedChannel = null
                                    },
                                    modifier = Modifier.width(400.dp)
                                )
                            }
                        }
                    }
                }
                
                is Result.Error -> {
                    ErrorMessage(
                        message = channelsState.exception.message ?: stringResource(R.string.epg_error_loading),
                        onRetry = { viewModel.loadChannels() }
                    )
                }
            }
        }
    }
}

@Suppress("UNUSED_PARAMETER")
@Composable
private fun EPGTopBar(
    currentTime: LocalDateTime,
    onNavigateBack: () -> Unit,
    onTimeChange: (LocalDateTime) -> Unit,
    onDatePickerClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFF1A1A2E))
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
                    contentDescription = stringResource(R.string.cd_back)
                )
            }
            
            Text(
                text = stringResource(R.string.epg_title),
                color = Color.White,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold
            )
        }
        
        // Time Navigation
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.Schedule,
                contentDescription = null,
                tint = Color(0xFF4285F4),
                modifier = Modifier.size(20.dp)
            )
            
            Text(
                text = currentTime.format(DateTimeFormatter.ofPattern("HH:mm")),
                color = Color.White,
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium
            )
            
            Text(
                text = currentTime.format(DateTimeFormatter.ofPattern("dd/MM/yyyy")),
                color = Color(0xFFB0BEC5),
                fontSize = 14.sp
            )
            
            IconButton(
                onClick = onDatePickerClick,
                colors = IconButtonDefaults.iconButtonColors(
                    contentColor = Color(0xFF4285F4)
                )
            ) {
                Icon(
                    imageVector = Icons.Default.CalendarToday,
                    contentDescription = stringResource(R.string.change_date)
                )
            }
        }
    }
}

@Composable
private fun ProgramInfoSidebar(
    channel: ContentItem,
    program: EPGProgram,
    nextProgram: EPGProgram?,
    onWatchNow: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxHeight()
            .background(Color(0xFF16213E))
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Close Button
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End
        ) {
            IconButton(
                onClick = onClose,
                colors = IconButtonDefaults.iconButtonColors(
                    contentColor = Color.White
                )
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = stringResource(R.string.close_button)
                )
            }
        }
        
        // Program Info Card
        ProgramInfoCard(
            channel = channel,
            currentProgram = program,
            nextProgram = nextProgram,
            onWatchNow = onWatchNow,
            isExpanded = true
        )
        
        Spacer(modifier = Modifier.weight(1f))
    }
}

@Composable
private fun EmptyEPGState() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Schedule,
                contentDescription = null,
                tint = Color(0xFFB0BEC5),
                modifier = Modifier.size(64.dp)
            )
            
            Text(
                text = stringResource(R.string.channels_no_programming),
                color = Color.White,
                fontSize = 18.sp,
                fontWeight = FontWeight.Medium
            )
            
            Text(
                text = stringResource(R.string.epg_auto_update),
                color = Color(0xFFB0BEC5),
                fontSize = 14.sp
            )
        }
    }
}
