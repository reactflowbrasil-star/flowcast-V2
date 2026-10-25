package com.streamcore.tv.domain.model

/**
 * Domain models for live TV channels and EPG
 */

// ========================================
// LIVE TV CHANNELS
// ========================================

data class Channel(
    val id: String,
    val name: String,
    val logoUrl: String?,
    val streamUrl: String,
    val category: String,
    val isActive: Boolean,
    val epgData: List<EPGProgram>?
)

data class ChannelCategory(
    val id: String,
    val name: String,
    val channels: List<Channel>
)

// ========================================
// EPG (Electronic Program Guide)
// ========================================

data class EPGProgram(
    val id: String,
    val title: String,
    val description: String?,
    val startTime: String,
    val endTime: String,
    val category: String?,
    val isLive: Boolean = false,
    val progress: Float = 0f // 0.0 - 1.0 for current program
)

data class EPGData(
    val channelId: String,
    val programs: List<EPGProgram>,
    val date: String
)

// ========================================
// LIVE TV STATES
// ========================================

data class LiveTVState(
    val currentChannel: Channel?,
    val currentProgram: EPGProgram?,
    val isPlaying: Boolean = false,
    val volume: Float = 1.0f,
    val isMuted: Boolean = false
)

// ========================================
// CHANNEL NAVIGATION
// ========================================

data class ChannelGuide(
    val channels: List<Channel>,
    val currentChannelIndex: Int = 0,
    val epgTimeRange: Pair<String, String> // start and end time
)

// ========================================
// STREAMING INFO
// ========================================

data class StreamInfo(
    val url: String,
    val quality: VideoQuality,
    val format: StreamFormat,
    val bitrate: Int? = null,
    val resolution: String? = null
)

enum class StreamFormat {
    HLS,
    DASH,
    MP4,
    RTMP
}
