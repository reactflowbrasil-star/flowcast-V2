package com.streamcore.tv.presentation.components.livetv.v3

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.streamcore.tv.R
import com.streamcore.tv.domain.model.ContentStream
import com.streamcore.tv.domain.model.EPGProgram
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * V3 lightweight zapping info banner (TiviMate/OTT Navigator style).
 *
 * Shows channel identity and Now/Next info with a progress bar.
 * Designed to appear briefly on channel change and auto-hide.
 */
@Composable
fun ZapInfoV3(
    visible: Boolean,
    channel: ContentStream?,
    now: EPGProgram?,
    next: EPGProgram?,
    modifier: Modifier = Modifier
) {
    AnimatedVisibility(
        visible = visible,
        enter = slideInVertically(initialOffsetY = { it / 2 }) + fadeIn(),
        exit = slideOutVertically(targetOffsetY = { it / 2 }) + fadeOut()
    ) {
        Box(
            modifier = modifier.fillMaxSize(),
            contentAlignment = Alignment.BottomStart
        ) {
            val bg = Color(0xFF0E1116).copy(alpha = 0.85f)
            val accent = Color(0xFF58A6FF)
            val muted = Color(0xFF8B949E)

            Card(
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = bg),
                elevation = CardDefaults.cardElevation(6.dp),
                modifier = Modifier
                    .padding(start = 16.dp, bottom = 16.dp, end = 16.dp)
            ) {
                Row(
                    modifier = Modifier
                        .padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Channel Logo
                    AsyncImage(
                        model = channel?.imageUrl ?: "",
                        contentDescription = stringResource(R.string.cd_logo),
                        modifier = Modifier
                            .height(48.dp),
                        contentScale = ContentScale.Fit
                    )

                    Spacer(modifier = Modifier.padding(8.dp))

                    Column(
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        // Channel Number + Title
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = channel?.channelNumber?.toString() ?: channel?.id ?: "",
                                color = accent,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(modifier = Modifier.padding(horizontal = 6.dp))
                            Text(
                                text = channel?.title ?: "Unknown",
                                color = Color.White,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }

                        // Now program + progress
                        val (progress, nowTitle) = remember(now) {
                            val title = now?.title ?: "No program info"
                            val p = computeProgress(now)
                            p to title
                        }
                        Text(
                            text = nowTitle,
                            color = Color.White,
                            fontSize = 13.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        LinearProgressIndicator(
                            progress = { progress },
                            modifier = Modifier.height(3.dp),
                            trackColor = Color.White.copy(alpha = 0.2f),
                            color = accent
                        )

                        // Next program
                        val nextText = remember(next) {
                            val label = next?.title ?: "No upcoming info"
                            val whenStr = formatStartTime(next)
                            if (whenStr.isNotBlank()) "Next: $label  •  $whenStr" else "Next: $label"
                        }
                        Text(
                            text = nextText,
                            color = muted,
                            fontSize = 12.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }
        }
    }
}

/**
 * Compute progress [0f..1f] for 'now' program using ISO start/end.
 */
private fun computeProgress(now: EPGProgram?): Float {
    if (now == null) return 0f
    val start = runCatching { Instant.parse(now.startTime) }.getOrNull() ?: return 0f
    val end = runCatching { Instant.parse(now.endTime) }.getOrNull() ?: return 0f
    if (end.isBefore(start)) return 0f
    val nowIns = Instant.now()
    val total = (end.toEpochMilli() - start.toEpochMilli()).coerceAtLeast(1L)
    val elapsed = (nowIns.toEpochMilli() - start.toEpochMilli()).coerceAtLeast(0L)
    return (elapsed.toFloat() / total.toFloat()).coerceIn(0f, 1f)
}

/**
 * Format next program start time to local short string (HH:mm).
 */
private fun formatStartTime(next: EPGProgram?): String {
    if (next == null) return ""
    val start = runCatching { Instant.parse(next.startTime) }.getOrNull() ?: return ""
    val formatter = DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault())
    return formatter.format(start)
}
