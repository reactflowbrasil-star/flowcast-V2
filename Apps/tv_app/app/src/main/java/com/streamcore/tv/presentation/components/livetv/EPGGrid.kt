package com.streamcore.tv.presentation.components.livetv

import androidx.compose.foundation.background
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import com.streamcore.tv.R
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.streamcore.tv.domain.model.ContentItem
import com.streamcore.tv.domain.model.EPGProgram
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.platform.LocalDensity

/**
 * EPG (Electronic Program Guide) Grid Component
 *
 * Modern EPG implementation following Google TV design patterns
 * Shows channels and their programming in a time-based grid
 */
@Composable
fun EPGGrid(
    channels: List<ContentItem>,
    epgData: Map<String, List<EPGProgram>>, // channelId -> programs
    currentTime: LocalDateTime = LocalDateTime.now(),
    onProgramClick: (EPGProgram) -> Unit,
    onChannelClick: (ContentItem) -> Unit,
    onProgramSelected: (EPGProgram, ContentItem) -> Unit = { _, _ -> }, // New callback for OK button
    modifier: Modifier = Modifier
) {
    // Flat palette to match player UI
    val Accent = Color(0xFF58A6FF)
    val Bg = Color(0xFF0F0F23)
    val HeaderHeight = 64.dp
    val ChannelColumnWidth = 184.dp
    val HourWidth = 180.dp
    val ChannelRowHeight = 88.dp

    val timeSlots = remember(currentTime) {
        generateTimeSlots(currentTime)
    }
    
    val channelListState = rememberLazyListState()
    val timelineState = rememberLazyListState()
    val density = LocalDensity.current
    
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Bg)
    ) {
        Column(
            modifier = Modifier.fillMaxSize()
        ) {
            // Time Header
            EPGTimeHeader(
                timeSlots = timeSlots,
                currentTime = currentTime,
                listState = timelineState,
                channelColumnWidth = ChannelColumnWidth,
                hourWidth = HourWidth
            )
            
            // Channels and Programs Grid
            LazyColumn(
                state = channelListState,
                verticalArrangement = Arrangement.spacedBy(2.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                items(channels) { channel ->
                    EPGChannelRow(
                        channel = channel,
                        programs = epgData[channel.id.toString()] ?: emptyList(),
                        timeSlots = timeSlots,
                        currentTime = currentTime,
                        onProgramClick = onProgramClick,
                        onChannelClick = onChannelClick,
                        timelineState = timelineState,
                        channelColumnWidth = ChannelColumnWidth,
                        hourWidth = HourWidth,
                        rowHeight = ChannelRowHeight
                    )
                }
            }
        }

        // NOW indicator overlay (vertical line)
        Canvas(modifier = Modifier.fillMaxSize()) {
            val pxHour = with(density) { HourWidth.toPx() }
            val headerHeightPx = with(density) { HeaderHeight.toPx() }
            val channelColPx = with(density) { ChannelColumnWidth.toPx() }

            val start = timeSlots.firstOrNull() ?: return@Canvas
            val minutesFromStart = java.time.Duration.between(start, currentTime).toMinutes().toFloat()
            val nowPxFromStart = (minutesFromStart / 60f) * pxHour
            val scrollPx = timelineState.firstVisibleItemIndex * pxHour + timelineState.firstVisibleItemScrollOffset
            val x = channelColPx + nowPxFromStart - scrollPx

            if (x in 0f..size.width) {
                drawLine(
                    color = Accent,
                    start = androidx.compose.ui.geometry.Offset(x, headerHeightPx),
                    end = androidx.compose.ui.geometry.Offset(x, size.height),
                    strokeWidth = 2f
                )
            }
        }
    }
}

/**
 * EPG Time Header showing time slots
 */
@Composable
private fun EPGTimeHeader(
    timeSlots: List<LocalDateTime>,
    currentTime: LocalDateTime,
    listState: LazyListState,
    channelColumnWidth: Dp,
    hourWidth: Dp
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFF1A1A2E))
            .padding(vertical = 10.dp)
    ) {
        // Channel column spacer
        Box(
            modifier = Modifier.width(channelColumnWidth)
        )
        
        // Time slots
        LazyRow(
            state = listState,
            horizontalArrangement = Arrangement.spacedBy(1.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            items(timeSlots) { timeSlot ->
                EPGTimeSlot(
                    time = timeSlot,
                    isCurrentTime = timeSlot.hour == currentTime.hour,
                    modifier = Modifier.width(hourWidth)
                )
            }
        }
    }
}

/**
 * Individual time slot in the header
 */
@Composable
private fun EPGTimeSlot(
    time: LocalDateTime,
    isCurrentTime: Boolean,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .height(44.dp)
            .background(
                if (isCurrentTime) Color(0xFF4285F4) else Color.Transparent
            )
            .padding(8.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = time.format(DateTimeFormatter.ofPattern("HH:mm")),
            color = if (isCurrentTime) Color.White else Color(0xFFB0BEC5),
            fontSize = 16.sp,
            fontWeight = if (isCurrentTime) FontWeight.Bold else FontWeight.Normal
        )
    }
}

/**
 * Channel row with programs
 */
@Composable
private fun EPGChannelRow(
    channel: ContentItem,
    programs: List<EPGProgram>,
    timeSlots: List<LocalDateTime>,
    currentTime: LocalDateTime,
    onProgramClick: (EPGProgram) -> Unit,
    onChannelClick: (ContentItem) -> Unit,
    timelineState: LazyListState,
    channelColumnWidth: Dp,
    hourWidth: Dp,
    rowHeight: Dp
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(rowHeight)
    ) {
        // Channel Info
        EPGChannelInfo(
            channel = channel,
            onClick = { onChannelClick(channel) },
            modifier = Modifier.width(channelColumnWidth)
        )
        
        // Programs Timeline
        LazyRow(
            state = timelineState,
            horizontalArrangement = Arrangement.spacedBy(1.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            items(timeSlots) { timeSlot ->
                val program = findProgramForTime(programs, timeSlot)
                EPGProgramSlot(
                    program = program,
                    timeSlot = timeSlot,
                    isCurrentTime = timeSlot.hour == currentTime.hour,
                    onClick = { program?.let { onProgramClick(it) } },
                    modifier = Modifier.width(hourWidth)
                )
            }
        }
    }
}

/**
 * Channel information column
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EPGChannelInfo(
    channel: ContentItem,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    var isFocused by remember { mutableStateOf(false) }
    
    Card(
        onClick = onClick,
        modifier = modifier
            .fillMaxHeight()
            .onFocusChanged { isFocused = it.isFocused }
            .focusable(),
        colors = CardDefaults.cardColors(
            containerColor = if (isFocused) Color(0xFF1976D2) else Color(0xFF1A1A1A) // Cleaner colors
        ),
        shape = RoundedCornerShape(2.dp) // Flat design
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // Channel logo placeholder
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(Color(0xFF1976D2), RoundedCornerShape(2.dp)), // Blue instead of green, flat design
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = channel.title.take(2).uppercase(),
                    color = Color.White,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                )
            }
            
            Text(
                text = channel.title,
                color = Color.White,
                fontSize = 15.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )
        }
    }
}

/**
 * Program slot in the timeline
 */
@OptIn(ExperimentalMaterial3Api::class)
@Suppress("UNUSED_PARAMETER")
@Composable
private fun EPGProgramSlot(
    program: EPGProgram?,
    timeSlot: LocalDateTime,
    isCurrentTime: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    var isFocused by remember { mutableStateOf(false) }
    
    val backgroundColor = when {
        isFocused -> Color(0xFF1E88E5).copy(alpha = 0.85f)
        program?.isLive == true -> Color(0xFFE53E3E) // Better red color
        isCurrentTime -> Color(0xFF1976D2).copy(alpha = 0.3f)
        program != null -> Color(0xFF1A1A1A) // Clean dark gray instead of blue-ish
        else -> Color(0xFF0A0A0A) // Very dark background
    }
    
    Card(
        enabled = program != null,
        onClick = onClick,
        modifier = modifier
            .fillMaxHeight()
            .onFocusChanged { isFocused = it.isFocused }
            .focusable(enabled = program != null)
            .border(
                width = if (isFocused) 3.dp else 0.dp,
                color = Color(0xFF1976D2),
                shape = RoundedCornerShape(2.dp) // Flat design
            ),
        colors = CardDefaults.cardColors(
            containerColor = backgroundColor
        ),
        shape = RoundedCornerShape(2.dp) // Flat design
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(4.dp),
            contentAlignment = Alignment.CenterStart
        ) {
            if (program != null) {
                Column(
                    verticalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    Text(
                        text = program.title,
                        color = Color.White,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    
                    if (program.isLive) {
                        Text(
                            text = stringResource(R.string.live_indicator),
                            color = Color.White,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                    } else {
                        Text(
                            text = "${program.startTime.take(5)} - ${program.endTime.take(5)}",
                            color = Color(0xFFB0BEC5),
                            fontSize = 11.sp
                        )
                    }
                }
            }
        }
    }
}

/**
 * Helper functions
 */
private fun generateTimeSlots(startTime: LocalDateTime): List<LocalDateTime> {
    val slots = mutableListOf<LocalDateTime>()
    var current = startTime.withMinute(0).withSecond(0).withNano(0)
    
    repeat(24) { // 24 hours
        slots.add(current)
        current = current.plusHours(1)
    }
    
    return slots
}

private fun findProgramForTime(programs: List<EPGProgram>, timeSlot: LocalDateTime): EPGProgram? {
    if (programs.isEmpty()) return null

    fun parseProgramTime(raw: String, fallbackDate: LocalDateTime): LocalDateTime? {
        return try {
            // Try ISO-8601 with date
            val dateTime = try { java.time.LocalDateTime.parse(raw) } catch (e: Exception) { null }
            if (dateTime != null) return dateTime
            // Try Instant then convert to local
            val instant = try { java.time.Instant.parse(raw) } catch (e: Exception) { null }
            if (instant != null) return java.time.LocalDateTime.ofInstant(instant, java.time.ZoneId.systemDefault())
            // Try HH:mm and combine with fallback date
            val localTime = try { java.time.LocalTime.parse(raw.substring(0, 5)) } catch (e: Exception) { null }
            if (localTime != null) return fallbackDate.withHour(localTime.hour).withMinute(localTime.minute).withSecond(0).withNano(0)
            null
        } catch (_: Exception) {
            null
        }
    }

    // Choose the program whose [start,end) interval contains the given time slot
    return programs.firstOrNull { program ->
        val start = parseProgramTime(program.startTime, timeSlot)
        val end = parseProgramTime(program.endTime, timeSlot)
        if (start != null && end != null) {
            !timeSlot.isBefore(start) && timeSlot.isBefore(end)
        } else {
            false
        }
    }
}
