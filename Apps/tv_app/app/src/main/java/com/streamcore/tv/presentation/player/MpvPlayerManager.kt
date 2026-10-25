package com.streamcore.tv.presentation.player

import android.content.Context
import android.os.Build
import android.view.Surface
import androidx.annotation.MainThread
import com.streamcore.tv.domain.model.AudioTrack
import com.streamcore.tv.domain.model.SubtitleOption
import com.streamcore.tv.domain.model.VideoTrack
import dagger.hilt.android.qualifiers.ApplicationContext
import dev.jdtech.mpv.MPVLib
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class MpvPlayerManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    companion object {
        private const val TAG = "MpvPlayerManager"
    }

    var onError: ((Exception) -> Unit)? = null
    var onPositionUpdate: ((Long) -> Unit)? = null
    var onDurationUpdate: ((Long) -> Unit)? = null
    var onPlayingStateChanged: ((Boolean) -> Unit)? = null
    var onFileLoaded: (() -> Unit)? = null
    var onHwdecFallbackUsed: (() -> Unit)? = null

    private var initialized = false
    private var observerRegistered = false
    private var lastKnownPause = true
    private var surfaceAttached = false
    private var pendingStreamUrl: String? = null
    private var pendingHeaders: Map<String, String> = emptyMap()
    private var currentHwdecMode: String = "auto-safe"
    private var hwdecFallbackNotified = false
    private val runningOnEmulator: Boolean by lazy { isLikelyEmulator() }
    private data class TrackEntry(val index: Int, val id: Int)

    private val observer = object : MPVLib.EventObserver {
        override fun eventProperty(property: String) = Unit

        override fun eventProperty(property: String, value: Long) = Unit

        override fun eventProperty(property: String, value: Double) {
            when (property) {
                "time-pos" -> onPositionUpdate?.invoke((value * 1000.0).toLong())
                "duration" -> onDurationUpdate?.invoke((value * 1000.0).toLong())
            }
        }

        override fun eventProperty(property: String, value: Boolean) {
            if (property == "pause") {
                lastKnownPause = value
                onPlayingStateChanged?.invoke(!value)
            }
        }

        override fun eventProperty(property: String, value: String) {
            if (property == "hwdec-current") {
                Timber.d("$TAG: hwdec-current changed to: $value")
                // If current hwdec mode is auto-safe or auto, and MPV fell back to software ("no")
                if (!hwdecFallbackNotified && currentHwdecMode != "no" && value == "no") {
                    hwdecFallbackNotified = true
                    onHwdecFallbackUsed?.invoke()
                    Timber.w("$TAG: Hardware decoding failed, MPV fell back to software decoding")
                }
            }
        }

        override fun event(event: Int) {
            when (event) {
                MPVLib.MPV_EVENT_FILE_LOADED -> {
                    onPlayingStateChanged?.invoke(!lastKnownPause)
                    onFileLoaded?.invoke()
                }
                MPVLib.MPV_EVENT_END_FILE -> {
                    onPlayingStateChanged?.invoke(false)
                }
            }
        }
    }

    @MainThread
    fun initialize() {
        if (!isSupported()) {
            onError?.invoke(IllegalStateException("MPV requires Android 8.0+ (API 26)"))
            return
        }
        if (initialized) return
        try {
            MPVLib.create(context)
            // Reduce mpv log verbosity; unavailable optional track metadata is non-fatal.
            MPVLib.setOptionString("msg-level", "all=warn")
            MPVLib.setOptionString("msg-module", "no")
            // Must be configured before init() for libmpv to build a valid Android video output chain.
            MPVLib.setOptionString("vo", "gpu")
            MPVLib.setOptionString("gpu-context", "android")
            MPVLib.setOptionString("gpu-context", "android")
            
            // Apply current hwdec mode
            applyHwdecModeInternal()
            
            MPVLib.setOptionString("load-scripts", "no")
            // Emulator path: reduce GPU/decoder pressure and avoid A/V underruns on SwiftShader.
            if (runningOnEmulator) {
                MPVLib.setOptionString("profile", "fast")
                MPVLib.setOptionString("hwdec", "no")
                MPVLib.setOptionString("vd-lavc-threads", "2")
                MPVLib.setOptionString("video-sync", "audio")
                MPVLib.setOptionString("scale", "bilinear")
                MPVLib.setOptionString("cscale", "bilinear")
                MPVLib.setOptionString("dither", "no")
                Timber.w("$TAG: Emulator profile enabled for smoother software playback")
            }
            MPVLib.init()
            MPVLib.observeProperty("time-pos", MPVLib.MPV_FORMAT_DOUBLE)
            MPVLib.observeProperty("duration", MPVLib.MPV_FORMAT_DOUBLE)
            MPVLib.observeProperty("pause", MPVLib.MPV_FORMAT_FLAG)
            MPVLib.observeProperty("hwdec-current", MPVLib.MPV_FORMAT_STRING)
            MPVLib.addObserver(observer)
            observerRegistered = true
            initialized = true
            hwdecFallbackNotified = false
            Timber.d("$TAG: MPV initialized")
        } catch (e: Exception) {
            Timber.e(e, "$TAG: Failed to initialize MPV")
            onError?.invoke(e)
        }
    }

    fun prepareAndPlay(streamUrl: String, headers: Map<String, String> = emptyMap()) {
        if (!isSupported()) {
            onError?.invoke(IllegalStateException("MPV requires Android 8.0+ (API 26)"))
            return
        }
        initialize()
        if (!initialized) return
        if (!surfaceAttached) {
            pendingStreamUrl = streamUrl
            pendingHeaders = headers
            Timber.d("$TAG: Surface not attached yet, deferring loadfile")
            return
        }
        playInternal(streamUrl, headers)
    }

    private fun playInternal(streamUrl: String, headers: Map<String, String>) {
        try {
            val userAgent = headers["User-Agent"]?.trim().orEmpty()
            if (userAgent.isNotEmpty()) {
                MPVLib.setOptionString("user-agent", userAgent)
            }

            val passthroughHeaders = headers
                .filterKeys { !it.equals("User-Agent", ignoreCase = true) }
                .entries
                .joinToString(",") { "${it.key}: ${it.value}" }
            if (passthroughHeaders.isNotBlank()) {
                MPVLib.setOptionString("http-header-fields", passthroughHeaders)
            }

            hwdecFallbackNotified = false // Reset on new file
            MPVLib.command(arrayOf("loadfile", streamUrl, "replace"))
            MPVLib.setPropertyBoolean("pause", false)
            lastKnownPause = false
            onPlayingStateChanged?.invoke(true)
            Timber.d("$TAG: loadfile issued: ${streamUrl.take(80)}")
        } catch (e: Exception) {
            Timber.e(e, "$TAG: Failed to prepare/play MPV")
            onError?.invoke(e)
        }
    }

    fun attachSurface(surface: Surface) {
        if (!isSupported()) return
        if (!initialized) initialize()
        if (!initialized) return
        try {
            MPVLib.attachSurface(surface)
            surfaceAttached = true
            Timber.d("$TAG: Surface attached")
            val streamUrl = pendingStreamUrl
            if (!streamUrl.isNullOrBlank()) {
                val headers = pendingHeaders
                pendingStreamUrl = null
                pendingHeaders = emptyMap()
                playInternal(streamUrl, headers)
            }
        } catch (e: Exception) {
            Timber.e(e, "$TAG: Failed to attach surface")
            onError?.invoke(e)
        }
    }

    fun detachSurface() {
        if (!isSupported()) return
        if (!initialized) return
        try {
            MPVLib.detachSurface()
            surfaceAttached = false
            Timber.d("$TAG: Surface detached")
        } catch (_: Exception) {
            // Ignore teardown errors
        }
    }

    fun togglePlayPause() {
        if (!isSupported()) return
        if (!initialized) return
        try {
            val paused = MPVLib.getPropertyBoolean("pause") ?: false
            MPVLib.setPropertyBoolean("pause", !paused)
            lastKnownPause = !paused
            onPlayingStateChanged?.invoke(paused)
        } catch (e: Exception) {
            onError?.invoke(e)
        }
    }

    fun seekTo(positionMs: Long) {
        if (!isSupported()) return
        if (!initialized) return
        try {
            val seconds = (positionMs.coerceAtLeast(0L) / 1000.0).toString()
            MPVLib.command(arrayOf("seek", seconds, "absolute", "exact"))
        } catch (e: Exception) {
            onError?.invoke(e)
        }
    }

    fun setVolume(volume: Float) {
        if (!isSupported()) return
        if (!initialized) return
        try {
            MPVLib.setPropertyDouble("volume", (volume.coerceIn(0f, 1f) * 100.0))
        } catch (_: Exception) {
        }
    }

    fun getAvailableAudioTracks(): List<AudioTrack> {
        if (!initialized) return emptyList()
        val selectedAid = safeGetString("aid")?.toIntOrNull()
        val audioEntries = getTrackEntriesByType("audio")
        Timber.d("$TAG: getAvailableAudioTracks: found ${audioEntries.size} entries, selectedAid=$selectedAid")
        return audioEntries.map { entry ->
            val language = safeGetString("track-list/${entry.index}/lang") ?: "und"
            val label = if (language.equals("und", ignoreCase = true)) {
                "Track ${entry.id}"
            } else {
                ""
            }
            AudioTrack(
                rendererIndex = 1,
                groupIndex = 0,
                trackIndex = entry.id,
                language = language,
                label = label,
                isSelected = selectedAid == entry.id
            )
        }
    }

    fun selectAudioTrack(track: AudioTrack) {
        if (!initialized) return
        runCatching {
            MPVLib.setPropertyInt("aid", track.trackIndex)
        }.onFailure { error ->
            onError?.invoke(error.asException())
        }
    }

    fun resetAudioTrack() {
        if (!initialized) return
        runCatching {
            MPVLib.setPropertyString("aid", "auto")
        }.onFailure { error ->
            onError?.invoke(error.asException())
        }
    }

    fun getAvailableSubtitleOptions(): List<SubtitleOption> {
        if (!initialized) return emptyList()
        val selectedSid = safeGetString("sid")?.toIntOrNull()
        val subEntries = getTrackEntriesByType("sub")
        Timber.d("$TAG: getAvailableSubtitleOptions: found ${subEntries.size} entries, selectedSid=$selectedSid")
        return subEntries.map { entry ->
            val language = safeGetString("track-list/${entry.index}/lang") ?: "und"
            val label = if (language.equals("und", ignoreCase = true)) {
                "Subtitle ${entry.id}"
            } else {
                ""
            }
            SubtitleOption(
                rendererIndex = 2,
                groupIndex = 0,
                trackIndex = entry.id,
                language = language,
                label = label,
                isSelected = selectedSid == entry.id
            )
        }
    }

    fun selectSubtitle(option: SubtitleOption) {
        if (!initialized) return
        runCatching {
            MPVLib.setPropertyInt("sid", option.trackIndex)
        }.onFailure { error ->
            onError?.invoke(error.asException())
        }
    }

    fun disableSubtitles() {
        if (!initialized) return
        runCatching {
            MPVLib.setPropertyString("sid", "no")
        }.onFailure { error ->
            onError?.invoke(error.asException())
        }
    }

    fun getAvailableVideoTracks(): List<VideoTrack> {
        if (!initialized) return emptyList()

        val selectedVid = safeGetString("vid")?.toIntOrNull()
        val currentWidth = safeGetInt("width") ?: safeGetInt("dwidth") ?: 0
        val currentHeight = safeGetInt("height") ?: safeGetInt("dheight") ?: 0
        val currentFps = safeGetDouble("container-fps")?.toFloat() ?: 0f
        val currentBitrate = safeGetDouble("video-bitrate")?.toInt() ?: 0

        val videoEntries = getTrackEntriesByType("video")
        if (videoEntries.isEmpty()) {
            if (currentWidth <= 0 && currentHeight <= 0 && selectedVid == null) {
                return emptyList()
            }
            val fallbackTrackId = selectedVid ?: 1
            return listOf(
                VideoTrack(
                    rendererIndex = 0,
                    groupIndex = 0,
                    trackIndex = fallbackTrackId,
                    width = currentWidth,
                    height = currentHeight,
                    bitrate = currentBitrate,
                    frameRate = currentFps,
                    mimeType = "",
                    label = if (currentHeight > 0) "${currentHeight}p" else "Current",
                    isSelected = true
                )
            )
        }

        return videoEntries.mapIndexed { position, entry ->
            VideoTrack(
                rendererIndex = 0,
                groupIndex = 0,
                trackIndex = entry.id,
                width = currentWidth,
                height = currentHeight,
                bitrate = currentBitrate,
                frameRate = currentFps,
                mimeType = "",
                label = if (currentHeight > 0) "${currentHeight}p" else "Track ${entry.id}",
                isSelected = selectedVid == entry.id || (selectedVid == null && position == 0)
            )
        }.sortedByDescending { it.height }
    }

    fun selectVideoTrack(track: VideoTrack) {
        if (!initialized) return
        runCatching {
            MPVLib.setPropertyInt("vid", track.trackIndex)
        }.onFailure { error ->
            onError?.invoke(error.asException())
        }
    }

    fun resetVideoTrack() {
        if (!initialized) return
        runCatching {
            MPVLib.setPropertyString("vid", "auto")
        }.onFailure { error ->
            onError?.invoke(error.asException())
        }
    }

    @MainThread
    fun release() {
        if (!initialized) return
        try {
            detachSurface()
            if (observerRegistered) {
                MPVLib.removeObserver(observer)
                observerRegistered = false
            }
            MPVLib.destroy()
        } catch (_: Exception) {
        } finally {
            initialized = false
            lastKnownPause = true
            surfaceAttached = false
            pendingStreamUrl = null
            pendingHeaders = emptyMap()
            Timber.d("$TAG: MPV released")
        }
    }

    fun isSupported(): Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O

    private fun getTrackEntriesByType(type: String): List<TrackEntry> {
        val trackCount = safeGetInt("track-list/count") ?: return emptyList()
        if (trackCount <= 0) return emptyList()

        val entries = mutableListOf<TrackEntry>()
        for (index in 0 until trackCount) {
            val trackType = safeGetString("track-list/$index/type") ?: continue
            if (!trackType.equals(type, ignoreCase = true)) continue
            val trackId = safeGetInt("track-list/$index/id") ?: continue
            entries.add(TrackEntry(index = index, id = trackId))
        }
        return entries
    }

    private fun safeGetInt(property: String): Int? {
        return runCatching { MPVLib.getPropertyInt(property) }.getOrNull()
    }

    private fun safeGetDouble(property: String): Double? {
        return runCatching { MPVLib.getPropertyDouble(property) }.getOrNull()
    }

    private fun safeGetString(property: String): String? {
        return runCatching { MPVLib.getPropertyString(property) }
            .getOrNull()
            ?.takeIf { it.isNotBlank() }
    }

    private fun Throwable.asException(): Exception {
        return if (this is Exception) this else Exception(message, this)
    }

    private fun isLikelyEmulator(): Boolean {
        return Build.FINGERPRINT.startsWith("generic") ||
            Build.FINGERPRINT.startsWith("unknown") ||
            Build.FINGERPRINT.contains("emulator", ignoreCase = true) ||
            Build.MODEL.contains("Emulator", ignoreCase = true) ||
            Build.MODEL.contains("Android SDK built for", ignoreCase = true) ||
            Build.HARDWARE.contains("goldfish", ignoreCase = true) ||
            Build.HARDWARE.contains("ranchu", ignoreCase = true)
    }

    fun setHwdecMode(mode: String) {
        currentHwdecMode = mode
        if (initialized) {
            applyHwdecModeInternal()
        }
    }

    private fun applyHwdecModeInternal() {
        val mode = if (runningOnEmulator) "no" else currentHwdecMode
        try {
            MPVLib.setOptionString("hwdec", mode)
            Timber.d("$TAG: Applied hwdec mode: $mode")
        } catch (e: Exception) {
            Timber.e(e, "$TAG: Failed to set hwdec mode")
        }
    }
}
