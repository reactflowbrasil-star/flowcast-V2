package com.streamcore.tv.presentation.player

/**
 * A simple WebVTT parser that extracts subtitle cues (start, end, text).
 * This is used for Compose-based subtitle rendering as a fallback when
 * MPV's libass cannot render subtitles natively (e.g., on emulators with SwiftShader).
 */
data class SubtitleCue(
    val startMs: Long,
    val endMs: Long,
    val text: String
)

object WebVttParser {

    /**
     * Parse WebVTT content into a list of [SubtitleCue].
     * Handles both WebVTT and SRT formats (SRT uses comma for ms separator).
     */
    fun parse(content: String): List<SubtitleCue> {
        val cues = mutableListOf<SubtitleCue>()
        val lines = content.replace("\r\n", "\n").replace("\r", "\n").split("\n")
        var i = 0

        while (i < lines.size) {
            val line = lines[i].trim()
            // Look for timestamp lines: "00:00:01.000 --> 00:00:04.000"
            if (line.contains("-->")) {
                val parts = line.split("-->")
                if (parts.size == 2) {
                    val start = parseTimestamp(parts[0].trim())
                    val end = parseTimestamp(parts[1].trim().split(" ").first()) // strip position info
                    if (start >= 0 && end >= 0) {
                        // Collect text lines until blank line or end of file
                        val textLines = mutableListOf<String>()
                        i++
                        while (i < lines.size && lines[i].trim().isNotEmpty()) {
                            // Strip HTML-like tags (e.g., <i>, </i>, <b>, <c.color>)
                            textLines.add(stripTags(lines[i].trim()))
                            i++
                        }
                        val text = textLines.joinToString("\n").trim()
                        if (text.isNotEmpty()) {
                            cues.add(SubtitleCue(startMs = start, endMs = end, text = text))
                        }
                    }
                }
            }
            i++
        }
        return cues
    }

    /**
     * Find the active subtitle cue for the given position in milliseconds.
     * Uses binary search for efficiency on large subtitle files.
     */
    fun findCueAt(cues: List<SubtitleCue>, positionMs: Long): SubtitleCue? {
        if (cues.isEmpty()) return null
        // Linear scan is fine for typical subtitle files (~200-500 cues)
        return cues.firstOrNull { positionMs in it.startMs..it.endMs }
    }

    /**
     * Parse a VTT/SRT timestamp to milliseconds.
     * Formats: "HH:MM:SS.mmm", "MM:SS.mmm", "HH:MM:SS,mmm" (SRT)
     */
    private fun parseTimestamp(ts: String): Long {
        return try {
            // Normalize: replace comma with dot (SRT compatibility)
            val normalized = ts.replace(",", ".")
            val parts = normalized.split(":")
            when (parts.size) {
                3 -> {
                    val hours = parts[0].toLong()
                    val minutes = parts[1].toLong()
                    val secParts = parts[2].split(".")
                    val seconds = secParts[0].toLong()
                    val millis = if (secParts.size > 1) secParts[1].padEnd(3, '0').take(3).toLong() else 0L
                    hours * 3600000 + minutes * 60000 + seconds * 1000 + millis
                }
                2 -> {
                    val minutes = parts[0].toLong()
                    val secParts = parts[1].split(".")
                    val seconds = secParts[0].toLong()
                    val millis = if (secParts.size > 1) secParts[1].padEnd(3, '0').take(3).toLong() else 0L
                    minutes * 60000 + seconds * 1000 + millis
                }
                else -> -1
            }
        } catch (e: Exception) {
            -1
        }
    }

    /** Strip HTML-like tags from subtitle text (e.g., <i>, </b>, <c.yellow>) */
    private fun stripTags(text: String): String {
        return text.replace(Regex("<[^>]+>"), "")
    }
}
