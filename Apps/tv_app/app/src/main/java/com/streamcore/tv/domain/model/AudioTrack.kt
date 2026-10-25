package com.streamcore.tv.domain.model

import java.text.Normalizer

/**
 * Represents an audio track in a media stream
 * 
 * Used for dual audio selection (e.g., Spanish/English)
 */
data class AudioTrack(
    val rendererIndex: Int,
    val groupIndex: Int,
    val trackIndex: Int,
    val language: String,
    val label: String,
    val isSelected: Boolean = false
) {
    /**
     * Get display name for UI
     */
    fun getDisplayName(): String {
        return when {
            label.isNotBlank() && label != language -> label
            else -> getLanguageDisplayName(language)
        }
    }
    
    private fun getLanguageDisplayName(languageCode: String): String {
        return when (languageCode.lowercase()) {
            "es", "spa" -> "Spanish"
            "en", "eng" -> "English"
            "fr", "fra" -> "French"
            "pt", "por" -> "Portuguese"
            "de", "ger" -> "German"
            "it", "ita" -> "Italian"
            else -> languageCode.uppercase()
        }
    }
    
    /**
     * Check if this is a Spanish audio track
     */
    fun isSpanish(): Boolean {
        val normalized = Normalizer.normalize(language.lowercase(), Normalizer.Form.NFD)
            .replace("\\p{M}+".toRegex(), "")

        return normalized in listOf("es", "spa", "spanish", "espanol")
    }
    
    /**
     * Check if this is an English audio track
     */
    fun isEnglish(): Boolean {
        return language.lowercase() in listOf("en", "eng", "english")
    }
}

/**
 * Represents a video quality track in a media stream
 *
 * Used for quality selection (e.g., 720p HD, 1080p, etc.)
 */
data class VideoTrack(
    val rendererIndex: Int,
    val groupIndex: Int,
    val trackIndex: Int,
    val width: Int,
    val height: Int,
    val bitrate: Int,
    val frameRate: Float,
    val mimeType: String,
    val label: String,
    val isSelected: Boolean = false
) {
    /**
     * Get resolution string (e.g., "1920x1080")
     */
    fun getResolution(): String {
        return "${width}x$height"
    }

    /**
     * Get bitrate in Mbps
     */
    fun getBitrateMbps(): Double {
        return bitrate.toDouble() / (1024 * 1024)
    }

    /**
     * Get display name for UI
     */
    fun getDisplayName(): String {
        return when {
            label.isNotBlank() -> label
            width >= 3840 && height >= 2160 -> "4K UHD"
            width >= 1920 && height >= 1080 -> "1080p FHD"
            width >= 1280 && height >= 720 -> "720p HD"
            width >= 854 && height >= 480 -> "480p"
            width >= 640 && height >= 360 -> "360p"
            else -> getResolution()
        }
    }

    /**
     * Check if this is a high quality track (720p+)
     */
    fun isHighQuality(): Boolean {
        return width >= 1280 && height >= 720
    }

    /**
     * Check if this is an ultra high quality track (1080p+)
     */
    fun isUltraHighQuality(): Boolean {
        return width >= 1920 && height >= 1080
    }
}
