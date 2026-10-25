package com.streamcore.tv.core.streaming

import com.streamcore.tv.R
import com.streamcore.tv.core.utils.StringProvider
import com.streamcore.tv.presentation.components.player.VideoQuality
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import timber.log.Timber
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Service to parse streaming manifests and extract quality information
 * Supports M3U8 (HLS) and MPD (DASH) formats
 */
@Singleton
class StreamQualityParser @Inject constructor(
    private val stringProvider: StringProvider
) {

    /**
     * Parse stream URL and extract available qualities
     */
    suspend fun parseStreamQualities(streamUrl: String): List<VideoQuality> {
        return withContext(Dispatchers.IO) {
            try {
                Timber.d("Parsing stream qualities for: $streamUrl")
                
                when {
                    streamUrl.contains(".m3u8", ignoreCase = true) -> {
                        parseM3U8Qualities(streamUrl)
                    }
                    streamUrl.contains(".mpd", ignoreCase = true) -> {
                        parseMPDQualities(streamUrl)
                    }
                    else -> {
                        Timber.w("Unknown stream format, returning default quality")
                        listOf(createDefaultQuality())
                    }
                }
            } catch (e: Exception) {
                Timber.e(e, "Failed to parse stream qualities")
                listOf(createDefaultQuality())
            }
        }
    }

    /**
     * Parse M3U8 (HLS) manifest for quality variants
     */
    private suspend fun parseM3U8Qualities(streamUrl: String): List<VideoQuality> {
        return withContext(Dispatchers.IO) {
            try {
                val manifestContent = downloadManifest(streamUrl)
                val qualities = mutableListOf<VideoQuality>()
                
                // Add auto quality option
                qualities.add(VideoQuality(
                    id = "auto",
                    label = stringProvider.getString(R.string.auto_label),
                    resolution = stringProvider.getString(R.string.auto_label),
                    isAuto = true
                ))

                val lines = manifestContent.split("\n")
                var i = 0
                
                while (i < lines.size) {
                    val line = lines[i].trim()
                    
                    if (line.startsWith("#EXT-X-STREAM-INF:")) {
                        val streamInfo = parseStreamInfo(line)
                        val streamUrl = if (i + 1 < lines.size) lines[i + 1].trim() else ""
                        
                        if (streamUrl.isNotEmpty() && !streamUrl.startsWith("#")) {
                            val quality = VideoQuality(
                                id = "quality_${qualities.size}",
                                label = streamInfo.resolution ?: "${streamInfo.bandwidth / 1000}k",
                                resolution = streamInfo.resolution ?: stringProvider.getString(R.string.unknown_label),
                                bandwidth = streamInfo.bandwidth
                            )
                            qualities.add(quality)
                        }
                        i += 2
                    } else {
                        i++
                    }
                }
                
                // Sort by bandwidth (highest first)
                val sortedQualities = qualities.filter { !it.isAuto }
                    .sortedByDescending { it.bandwidth ?: 0L }
                
                Timber.d("Found ${sortedQualities.size} M3U8 quality variants")
                listOf(qualities.first()) + sortedQualities // Auto + sorted qualities
                
            } catch (e: Exception) {
                Timber.e(e, "Failed to parse M3U8 manifest")
                listOf(createDefaultQuality())
            }
        }
    }

    /**
     * Parse MPD (DASH) manifest for quality representations
     */
    private suspend fun parseMPDQualities(streamUrl: String): List<VideoQuality> {
        return withContext(Dispatchers.IO) {
            try {
                val manifestContent = downloadManifest(streamUrl)
                val qualities = mutableListOf<VideoQuality>()
                
                // Add auto quality option
                qualities.add(VideoQuality(
                    id = "auto",
                    label = stringProvider.getString(R.string.auto_label),
                    resolution = stringProvider.getString(R.string.auto_label),
                    isAuto = true
                ))

                // Parse MPD content more intelligently - extract only main video AdaptationSet
                val mainVideoAdaptationSet = extractMainVideoAdaptationSet(manifestContent)

                if (mainVideoAdaptationSet.isNotEmpty()) {
                    Timber.d("Found main video AdaptationSet, parsing representations...")

                    // Parse representations in a way that's agnostic to attribute order (.m4v/.m4s providers)
                    val repTagRegex = Regex("""(?is)<Representation\b[^>]*/?>""")
                    val repTags = repTagRegex.findAll(mainVideoAdaptationSet)
    
                    repTags.forEach { tagMatch ->
                        val tag = tagMatch.value
                        val bw = Regex("""\bbandwidth\s*=\s*"\s*(\d+)\s*"""", RegexOption.IGNORE_CASE)
                            .find(tag)?.groupValues?.get(1)?.toLongOrNull() ?: 0L
                        if (bw <= 0) return@forEach
    
                        val w = Regex("""\bwidth\s*=\s*"\s*(\d+)\s*"""", RegexOption.IGNORE_CASE)
                            .find(tag)?.groupValues?.get(1)?.toIntOrNull() ?: 0
                        val h = Regex("""\bheight\s*=\s*"\s*(\d+)\s*"""", RegexOption.IGNORE_CASE)
                            .find(tag)?.groupValues?.get(1)?.toIntOrNull() ?: 0
    
                        val resolution = if (w > 0 && h > 0) "${w}x${h}" else "${bw / 1000}k"
                        val label = getQualityLabel(w, h)
    
                        val quality = VideoQuality(
                            id = "quality_${qualities.size}",
                            label = label,
                            resolution = resolution,
                            bandwidth = bw
                        )
                        qualities.add(quality)
                        Timber.d("Added quality: ${quality.label} (${quality.resolution}) - ${bw}bps")
                    }
                } else {
                    Timber.w("No main video AdaptationSet found, falling back to simple parsing")
                    // Fallback: parse all Representation tags from entire MPD (attribute-order agnostic)
                    val repTagRegex = Regex("""(?is)<Representation\b[^>]*/?>""")
                    val repTags = repTagRegex.findAll(manifestContent)
    
                    repTags.forEach { tagMatch ->
                        val tag = tagMatch.value
                        val bw = Regex("""\bbandwidth\s*=\s*"\s*(\d+)\s*"""", RegexOption.IGNORE_CASE)
                            .find(tag)?.groupValues?.get(1)?.toLongOrNull() ?: 0L
                        if (bw <= 0) return@forEach
    
                        val w = Regex("""\bwidth\s*=\s*"\s*(\d+)\s*"""", RegexOption.IGNORE_CASE)
                            .find(tag)?.groupValues?.get(1)?.toIntOrNull() ?: 0
                        val h = Regex("""\bheight\s*=\s*"\s*(\d+)\s*"""", RegexOption.IGNORE_CASE)
                            .find(tag)?.groupValues?.get(1)?.toIntOrNull() ?: 0
    
                        val resolution = if (w > 0 && h > 0) "${w}x${h}" else "${bw / 1000}k"
                        val label = getQualityLabel(w, h)
    
                        val quality = VideoQuality(
                            id = "quality_${qualities.size}",
                            label = label,
                            resolution = resolution,
                            bandwidth = bw
                        )
                        qualities.add(quality)
                    }
                }
                
                // Sort by bandwidth (highest first)
                val sortedQualities = qualities.filter { !it.isAuto }
                    .sortedByDescending { it.bandwidth ?: 0L }
                
                Timber.d("Found ${sortedQualities.size} MPD quality representations")
                listOf(qualities.first()) + sortedQualities // Auto + sorted qualities
                
            } catch (e: Exception) {
                Timber.e(e, "Failed to parse MPD manifest")
                listOf(createDefaultQuality())
            }
        }
    }

    /**
     * Download manifest content from URL
     */
    private fun downloadManifest(url: String): String {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.requestMethod = "GET"
        connection.connectTimeout = 10000
        connection.readTimeout = 10000
        
        return connection.inputStream.use { inputStream ->
            BufferedReader(InputStreamReader(inputStream)).use { reader ->
                reader.readText()
            }
        }
    }

    /**
     * Parse stream info line from M3U8
     */
    private fun parseStreamInfo(line: String): StreamInfo {
        val bandwidthRegex = Regex("""BANDWIDTH=(\d+)""")
        val resolutionRegex = Regex("""RESOLUTION=(\d+x\d+)""")
        
        val bandwidth = bandwidthRegex.find(line)?.groupValues?.get(1)?.toLongOrNull() ?: 0L
        val resolution = resolutionRegex.find(line)?.groupValues?.get(1)
        
        return StreamInfo(bandwidth, resolution)
    }

    /**
     * Get quality label based on resolution
     */
    private fun getQualityLabel(width: Int, height: Int): String {
        return when {
            height >= 2160 -> "4K UHD"
            height >= 1440 -> "1440p QHD"
            height >= 1080 -> "1080p FHD"
            height >= 720 -> "720p HD"
            height >= 480 -> "480p SD"
            height >= 360 -> "360p"
            height >= 240 -> "240p"
            else -> stringProvider.getString(R.string.auto_label)
        }
    }

    /**
     * Create default quality option
     */
    private fun createDefaultQuality(): VideoQuality {
        return VideoQuality(
            id = "auto",
            label = stringProvider.getString(R.string.auto_label),
            resolution = stringProvider.getString(R.string.auto_label),
            isAuto = true
        )
    }

    /**
     * Extract main video AdaptationSet from MPD content
     * Tolerant of providers: accepts either contentType="video" or mimeType="video/..."
     * Skips trick-play/trickmode sets. Prefers Role value="main" when present; otherwise picks first video set.
     */
    private fun extractMainVideoAdaptationSet(mpdContent: String): String {
        return try {
            val allSets = Regex("""(?is)<AdaptationSet([^>]*)>(.*?)</AdaptationSet>""")
                .findAll(mpdContent)

            var firstVideo: String? = null

            for (m in allSets) {
                val openingAttrs = m.groupValues[1]
                val inner = m.groupValues[2]

                val isVideo = openingAttrs.contains(Regex("""contentType\s*=\s*"\s*video""", RegexOption.IGNORE_CASE)) ||
                              openingAttrs.contains(Regex("""mimeType\s*=\s*"\s*video/""", RegexOption.IGNORE_CASE))

                if (!isVideo) continue

                val isTrick = openingAttrs.contains(Regex("""mode\s*=\s*"\s*trik""", RegexOption.IGNORE_CASE)) ||
                              inner.contains(Regex("""<Role[^>]*value\s*=\s*"\s*trick""", RegexOption.IGNORE_CASE))

                if (isTrick) continue

                val hasMainRole = inner.contains(Regex("""<Role[^>]*value\s*=\s*"\s*main\s*"""", RegexOption.IGNORE_CASE))

                if (hasMainRole) {
                    Timber.d("Successfully extracted main video AdaptationSet (role=main)")
                    return inner
                }

                if (firstVideo == null) {
                    firstVideo = inner
                }
            }

            if (firstVideo != null) {
                Timber.d("Using first video AdaptationSet (no explicit role=main)")
                firstVideo!!
            } else {
                Timber.w("No suitable video AdaptationSet found")
                ""
            }
        } catch (e: Exception) {
            Timber.e(e, "Error extracting main video AdaptationSet")
            ""
        }
    }

    /**
     * Data class for stream information
     */
    private data class StreamInfo(
        val bandwidth: Long,
        val resolution: String?
    )
}
