package com.streamcore.tv.presentation.player

import android.content.Context
import android.os.Handler
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.Renderer
import androidx.media3.exoplayer.audio.AudioRendererEventListener
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector
import androidx.media3.exoplayer.video.VideoRendererEventListener
import timber.log.Timber

/**
 * Custom RenderersFactory that forces FFmpeg decoders only (no MediaCodec video).
 * Use this for emulator compatibility where hardware decoders fail.
 */
@UnstableApi
class FfmpegOnlyRenderersFactory(context: Context) : DefaultRenderersFactory(context) {

    init {
        setExtensionRendererMode(EXTENSION_RENDERER_MODE_PREFER)
        setEnableDecoderFallback(false) // Don't fall back to MediaCodec
        Timber.d("FfmpegOnlyRenderersFactory: Initialized with FFmpeg-only mode")
    }

    override fun buildVideoRenderers(
        context: Context,
        extensionRendererMode: Int,
        mediaCodecSelector: MediaCodecSelector,
        enableDecoderFallback: Boolean,
        eventHandler: Handler,
        eventListener: VideoRendererEventListener,
        allowedVideoJoiningTimeMs: Long,
        out: ArrayList<Renderer>
    ) {
        // Only build extension (FFmpeg) video renderers, skip MediaCodec
        Timber.d("FfmpegOnlyRenderersFactory: Building ONLY FFmpeg video renderers (skipping MediaCodec)")
        
        // Call parent with EXTENSION_RENDERER_MODE_PREFER but then remove MediaCodec renderers
        val tempList = ArrayList<Renderer>()
        super.buildVideoRenderers(
            context,
            EXTENSION_RENDERER_MODE_PREFER,
            mediaCodecSelector,
            false, // Disable fallback
            eventHandler,
            eventListener,
            allowedVideoJoiningTimeMs,
            tempList
        )

        // Filter: only keep FFmpeg renderers (not MediaCodec)
        for (renderer in tempList) {
            val name = renderer.javaClass.simpleName
            if (name.contains("Ffmpeg", ignoreCase = true)) {
                Timber.d("FfmpegOnlyRenderersFactory: Adding FFmpeg video renderer: $name")
                out.add(renderer)
            } else {
                Timber.d("FfmpegOnlyRenderersFactory: Skipping non-FFmpeg video renderer: $name")
            }
        }

        // If no FFmpeg renderer was added, fall back to MediaCodec (safety)
        if (out.isEmpty()) {
            Timber.w("FfmpegOnlyRenderersFactory: No FFmpeg video renderer found, falling back to all renderers")
            out.addAll(tempList)
        }
    }

    override fun buildAudioRenderers(
        context: Context,
        extensionRendererMode: Int,
        mediaCodecSelector: MediaCodecSelector,
        enableDecoderFallback: Boolean,
        audioSink: AudioSink,
        eventHandler: Handler,
        eventListener: AudioRendererEventListener,
        out: ArrayList<Renderer>
    ) {
        // For audio, prefer FFmpeg but allow MediaCodec fallback (audio usually works)
        Timber.d("FfmpegOnlyRenderersFactory: Building audio renderers (FFmpeg preferred)")
        super.buildAudioRenderers(
            context,
            EXTENSION_RENDERER_MODE_PREFER,
            mediaCodecSelector,
            true, // Allow fallback for audio
            audioSink,
            eventHandler,
            eventListener,
            out
        )
    }
}
