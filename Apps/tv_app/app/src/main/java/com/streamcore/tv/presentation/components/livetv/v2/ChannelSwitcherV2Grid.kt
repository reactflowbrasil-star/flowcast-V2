package com.streamcore.tv.presentation.components.livetv.v2

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.ui.draw.drawBehind
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.ScrollState
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.streamcore.tv.R
import com.streamcore.tv.domain.model.ContentStream
import com.streamcore.tv.domain.model.EPGData
import com.streamcore.tv.domain.model.EPGProgram
import java.time.Duration
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
private val DarkGradientEnd = Color(0xFF020617)
private val HourMinuteFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

/**
 * Lightweight EPG grid tuned for ChannelSwitcher V2 overlay.
 *
 * - Left sticky channel list with virtualized rows
 * - Top sticky time axis (hour ticks)
 * - Rows = channels, Columns = time slots
 * - NOW marker and simple focusable program slots for D-pad navigation
 *
 * This is intentionally simpler than the full-screen EPGGrid and optimized
 * for overlay usage inside the ChannelSwitcherV2 panel.
 */
@Composable
fun ChannelSwitcherV2Grid(
    channels: List<ContentStream>,
    epgData: Map<String, EPGData>,           // channelId -> EPGData
    currentTime: LocalDateTime = LocalDateTime.now(),
    slotHours: Int = 6,                      // how many hours to show in the overlay
    channelColumnWidth: Dp = 120.dp,
    hourWidth: Dp = 120.dp,
    onProgramClick: (EPGProgram) -> Unit = {},
    onChannelClick: (ContentStream) -> Unit = {},
    onChannelFocused: (ContentStream) -> Unit = {},
    modifier: Modifier = Modifier
) {
    val accent = MaterialTheme.colorScheme.primary
    val headerHeight = 48.dp

    val normalizedCurrentTime = remember(currentTime) {
        currentTime.withSecond(0).withNano(0)
    }
    val timeSlots = remember(normalizedCurrentTime, slotHours) {
        generateTimeSlots(normalizedCurrentTime, slotHours)
    }

    val channelListState = rememberLazyListState()
    val horizontalScrollState = rememberScrollState()

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(DarkGradientEnd)
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Time header (sticky)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(headerHeight)
                    .background(DarkGradientEnd)
            ) {
                Box(modifier = Modifier.width(channelColumnWidth)) // spacer for channel column

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(horizontalScrollState)
                        .background(DarkGradientEnd)
                ) {
                    timeSlots.forEach { slot ->
                        TimeHeaderSlot(slot = slot, width = hourWidth)
                    }
                }
            }

            // Channel rows (virtualized)
            LazyColumn(
                state = channelListState,
                modifier = Modifier.fillMaxSize()
            ) {
                items(channels) { channel ->
                    val programs = epgData[channel.id]?.programs ?: emptyList()
                    ChannelRow(
                        channel = channel,
                        programs = programs,
                        timeSlots = timeSlots,
                        hourWidth = hourWidth,
                        channelColumnWidth = channelColumnWidth,
                        scrollState = horizontalScrollState,
                        onProgramClick = onProgramClick,
                        onChannelClick = { onChannelClick(channel) },
                        onChannelFocused = { onChannelFocused(channel) }
                    )
                }
            }
        }

        // NOW marker (vertical line) overlay
        Canvas(modifier = Modifier.fillMaxSize()) {
            val pxHour = hourWidth.toPx()
            val headerPx = headerHeight.toPx()
            val channelColPx = channelColumnWidth.toPx()

            val start = timeSlots.firstOrNull() ?: return@Canvas
            val minutesFromStart = Duration.between(start, normalizedCurrentTime).toMinutes().toFloat()
            val nowPxFromStart = (minutesFromStart / 60f) * pxHour

            val scrollPx = horizontalScrollState.value.toFloat()
            val x = channelColPx + nowPxFromStart - scrollPx

            if (x in 0f..size.width) {
                drawLine(
                    color = accent,
                    start = androidx.compose.ui.geometry.Offset(x, headerPx),
                    end = androidx.compose.ui.geometry.Offset(x, size.height),
                    strokeWidth = 2f
                )
            }
        }
    }
}

@Composable
private fun TimeHeaderSlot(slot: LocalDateTime, width: Dp) {
    Box(
        modifier = Modifier
            .width(width)
            .fillMaxHeight()
            .drawBehind {
                val strokeWidth = 1.dp.toPx()
                drawLine(
                    color = Color.White.copy(alpha = 0.05f),
                    start = androidx.compose.ui.geometry.Offset(0f, 0f),
                    end = androidx.compose.ui.geometry.Offset(0f, size.height),
                    strokeWidth = strokeWidth
                )
            },
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = slot.format(HourMinuteFormatter),
            color = Color(0xFF94A3B8), // Slate 400
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun ChannelRow(
    channel: ContentStream,
    programs: List<EPGProgram>,
    timeSlots: List<LocalDateTime>, // Kept for reference but not iteration
    hourWidth: Dp,
    channelColumnWidth: Dp,
    scrollState: ScrollState,
    onProgramClick: (EPGProgram) -> Unit,
    onChannelClick: () -> Unit,
    onChannelFocused: () -> Unit
) {
    // Generate display items (Programs + Gaps)
    val displayItems = remember(programs, timeSlots) {
        if (timeSlots.isEmpty()) return@remember emptyList<TimelineItem>()
        
        val startWindow = timeSlots.first()
        val endWindow = timeSlots.last().plusHours(1)
        val items = mutableListOf<TimelineItem>()
        var currentPointer = startWindow

        // Parse each program once, then filter/sort using parsed values.
        val relevantPrograms = programs.mapNotNull { program ->
            val pStart = parseProgramTime(program.startTime) ?: return@mapNotNull null
            val pEnd = parseProgramTime(program.endTime) ?: return@mapNotNull null
            if (pEnd.isAfter(startWindow) && pStart.isBefore(endWindow)) {
                ParsedProgram(program = program, start = pStart, end = pEnd)
            } else {
                null
            }
        }.sortedBy { it.start }

        for (parsed in relevantPrograms) {
            val prog = parsed.program
            val pStart = parsed.start
            val pEnd = parsed.end
            
            // 1. Fill Gap before program
            if (pStart.isAfter(currentPointer)) {
                val gapMinutes = java.time.Duration.between(currentPointer, pStart).toMinutes()
                if (gapMinutes > 0) {
                     items.add(TimelineItem.Gap(durationMinutes = gapMinutes.toInt()))
                }
            }
            currentPointer = if (pStart.isAfter(currentPointer)) pStart else currentPointer
            
            // 2. Add Program
            // Clip to window start
            val effectiveStart = if (pStart.isBefore(startWindow)) startWindow else pStart
            // Clip to window end
            val effectiveEnd = if (pEnd.isAfter(endWindow)) endWindow else pEnd
            
            val durationMinutes = java.time.Duration.between(effectiveStart, effectiveEnd).toMinutes()
            if (durationMinutes > 0) {
                items.add(TimelineItem.Program(prog, durationMinutes = durationMinutes.toInt()))
            }
            
            // Move pointer
            if (pEnd.isAfter(currentPointer)) {
                currentPointer = pEnd
            }
        }
        
        // 3. Fill remaining Gap to end of window
        if (currentPointer.isBefore(endWindow)) {
             val remainingGap = java.time.Duration.between(currentPointer, endWindow).toMinutes()
             if (remainingGap > 0) {
                 items.add(TimelineItem.Gap(durationMinutes = remainingGap.toInt()))
             }
        }
        
        items
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(72.dp)
    ) {
        ChannelInfoColumn(
            channel = channel,
            modifier = Modifier
                .width(channelColumnWidth)
                .fillMaxHeight(),
            onClick = onChannelClick,
            onFocused = onChannelFocused
        )

        Row(
            modifier = Modifier
                .fillMaxHeight()
                .horizontalScroll(scrollState)
        ) {
            displayItems.forEach { item ->
                when (item) {
                     is TimelineItem.Program -> {
                         val width = (hourWidth / 60) * item.durationMinutes
                         ProgramSlot(
                             program = item.program,
                             width = width,
                             isCurrent = false, // Simplified for now
                             onClick = { onProgramClick(item.program) },
                             onFocused = onChannelFocused
                         )
                     }
                     is TimelineItem.Gap -> {
                         val width = (hourWidth / 60) * item.durationMinutes
                         // Empty slot
                         Box(modifier = Modifier.width(width).fillMaxHeight().padding(4.dp).border(0.dp, Color.Transparent))
                     }
                }
            }
        }
    }
}

private sealed class TimelineItem {
    data class Program(val program: EPGProgram, val durationMinutes: Int) : TimelineItem()
    data class Gap(val durationMinutes: Int) : TimelineItem()
}

private data class ParsedProgram(
    val program: EPGProgram,
    val start: LocalDateTime,
    val end: LocalDateTime
)

@Composable
private fun ChannelInfoColumn(
    channel: ContentStream,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
    onFocused: () -> Unit
) {
    var focused by remember { mutableStateOf(false) }
    val activeColor = Color(0xFF3B82F6)
    val focusBorder = Color(0xFF60A5FA)

    Card(
        onClick = onClick,
        modifier = modifier
            .padding(4.dp)
            .fillMaxHeight()
            .onFocusChanged { 
                focused = it.isFocused
                if (focused) onFocused()
            }
            .focusable()
            .border(
                width = if (focused) 2.dp else 0.dp, 
                color = if (focused) focusBorder else Color.Transparent,
                shape = RoundedCornerShape(4.dp)
            ),
        shape = RoundedCornerShape(4.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (focused) activeColor.copy(alpha = 0.9f) else DarkGradientEnd
        ),
        elevation = CardDefaults.cardElevation(0.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Start
        ) {
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(Color.White.copy(alpha = 0.1f)),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = channel.title.take(1).uppercase(),
                    color = Color.White,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            Spacer(modifier = Modifier.width(12.dp))

            Text(
                text = channel.title,
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center
            )
        }
    }
}

@Composable
private fun ProgramSlot(
    program: EPGProgram?,
    width: Dp,
    isCurrent: Boolean,
    onClick: () -> Unit,
    onFocused: () -> Unit
) {
    var focused by remember { mutableStateOf(false) }
    
    // Modern Slate-Blue Theme Colors
    val activeColor = Color(0xFF3B82F6) // Blue 500
    val liveColor = Color(0xFF06B6D4)   // Cyan 500 (Modern Live)
    val surfaceColor = Color(0xFF1E293B).copy(alpha = 0.6f) // Glassy Slate
    val focusBorder = Color(0xFF60A5FA) 
    
    val bgColor = when {
        focused -> activeColor.copy(alpha = 0.9f)
        isCurrent -> activeColor.copy(alpha = 0.2f)
        program != null -> surfaceColor
        else -> Color.Transparent
    }

    Card(
        onClick = onClick,
        modifier = Modifier
            .width(width)
            .padding(2.dp) // Reduced padding for tighter grid
            .fillMaxHeight()
            .onFocusChanged { 
                focused = it.isFocused
                if (focused) onFocused()
            }
            .focusable()
            .border(
                width = if (focused) 2.dp else 0.dp, 
                color = if (focused) focusBorder else Color.Transparent,
                shape = RoundedCornerShape(4.dp)
            ),
        shape = RoundedCornerShape(4.dp), // Flatter look
        colors = CardDefaults.cardColors(containerColor = bgColor),
        elevation = CardDefaults.cardElevation(defaultElevation = if (focused) 4.dp else 0.dp)
    ) {
        Box(
            modifier = Modifier.fillMaxSize().padding(horizontal = 8.dp, vertical = 6.dp), 
            contentAlignment = Alignment.CenterStart
        ) {
            if (program != null) {
                Column(verticalArrangement = Arrangement.Center) {
                    Text(
                        text = program.title,
                        color = if (focused) Color.White else Color(0xFFE2E8F0),
                        fontSize = 13.sp,
                        fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Normal,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    
                    Row(verticalAlignment = Alignment.CenterVertically) {
                         if (program.isLive) {
                            Box(
                                modifier = Modifier
                                    .padding(end = 6.dp)
                                    .background(liveColor, RoundedCornerShape(4.dp))
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            ) {
                                Text(
                                    text = stringResource(R.string.live_indicator),
                                    color = Color.White,
                                    fontSize = 9.sp,
                                    fontWeight = FontWeight.Black
                                )
                            }
                        }
                        
                        Text(
                            text = readableProgramTime(program),
                            color = if (focused) Color.White.copy(alpha = 0.9f) else Color(0xFF94A3B8),
                            fontSize = 11.sp
                        )
                    }
                }
            }
        }
    }
}

/**
 * Build a human readable time label for program (start - end)
 */
private fun readableProgramTime(program: EPGProgram): String {
    // Try to parse ISO instants first
    val start = parseProgramTime(program.startTime)
    val end = parseProgramTime(program.endTime)
    return if (start != null && end != null) {
        "${start.format(HourMinuteFormatter)} - ${end.format(HourMinuteFormatter)}"
    } else {
        ""
    }
}

/**
 * Helpers: generate time slots and find program for slot
 */
private fun generateTimeSlots(startTime: LocalDateTime, hours: Int): List<LocalDateTime> {
    val slots = mutableListOf<LocalDateTime>()
    var current = startTime.withMinute(0).withSecond(0).withNano(0)
    repeat(hours) {
        slots.add(current)
        current = current.plusHours(1)
    }
    return slots
}

private fun parseProgramTime(raw: String): LocalDateTime? {
    return try {
        // ISO-8601 with zone/instant
        val instant = try { Instant.parse(raw) } catch (_: Exception) { null }
        if (instant != null) return LocalDateTime.ofInstant(instant, ZoneId.systemDefault())

        // LocalDateTime parse
        val local = try { LocalDateTime.parse(raw) } catch (_: Exception) { null }
        if (local != null) return local

        // HH:mm fallback
        val timePart = raw.takeIf { it.length >= 5 }?.substring(0, 5)
        if (timePart != null) {
            val t = java.time.LocalTime.parse(timePart)
            return LocalDateTime.now().withHour(t.hour).withMinute(t.minute).withSecond(0).withNano(0)
        }

        null
    } catch (_: Exception) {
        null
    }
}

private fun findProgramForTime(programs: List<EPGProgram>, timeSlot: LocalDateTime): EPGProgram? {
    if (programs.isEmpty()) return null

    val slotStart = timeSlot
    val slotEnd = timeSlot.plusHours(1)

    return programs.firstOrNull { program ->
        val start = parseProgramTime(program.startTime) ?: return@firstOrNull false
        val end = parseProgramTime(program.endTime) ?: return@firstOrNull false
        
        // EPG Program overlaps with this 1-hour slot
        // start < slotEnd && end > slotStart
        start.isBefore(slotEnd) && end.isAfter(slotStart)
    }
}
