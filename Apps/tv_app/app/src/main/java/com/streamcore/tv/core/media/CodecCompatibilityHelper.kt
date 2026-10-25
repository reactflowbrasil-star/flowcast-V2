package com.streamcore.tv.core.media

import android.content.Context
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.os.Build
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Codec Compatibility Helper
 * 
 * Helps detect and handle codec compatibility issues, especially for HEVC/H.265 content
 * that might not be supported on all devices or emulators.
 */
@Singleton
class CodecCompatibilityHelper @Inject constructor(
    private val context: Context
) {
    
    companion object {
        private const val TAG = "CodecCompatibilityHelper"
        
        // Common problematic codecs in emulators
        private val PROBLEMATIC_CODECS = listOf(
            "c2.goldfish.hevc.decoder",
            "c2.android.hevc.decoder",
            "OMX.google.hevc.decoder"
        )
        
        // HEVC/H.265 MIME types
        private val HEVC_MIME_TYPES = listOf(
            "video/hevc",
            "video/x-vnd.on2.vp9",
            "video/av01"
        )
    }
    
    /**
     * Check if the device/emulator has reliable HEVC support
     */
    fun hasReliableHevcSupport(): Boolean {
        try {
            val codecList = MediaCodecList(MediaCodecList.REGULAR_CODECS)
            val codecInfos = codecList.codecInfos
            
            var hasHardwareHevc = false
            var hasSoftwareHevc = false
            
            for (codecInfo in codecInfos) {
                if (!codecInfo.isEncoder) {
                    val supportedTypes = codecInfo.supportedTypes
                    
                    for (type in supportedTypes) {
                        if (type.equals("video/hevc", ignoreCase = true)) {
                            val codecName = codecInfo.name.lowercase()
                            
                            // Check if it's a problematic codec
                            val isProblematic = PROBLEMATIC_CODECS.any { problematic ->
                                codecName.contains(problematic.lowercase())
                            }
                            
                            if (isProblematic) {
                                Timber.w("$TAG: Found problematic HEVC codec: ${codecInfo.name}")
                                continue
                            }
                            
                            // Determine if it's hardware or software
                            if (isHardwareAccelerated(codecInfo)) {
                                hasHardwareHevc = true
                                Timber.d("$TAG: Found hardware HEVC codec: ${codecInfo.name}")
                            } else {
                                hasSoftwareHevc = true
                                Timber.d("$TAG: Found software HEVC codec: ${codecInfo.name}")
                            }
                        }
                    }
                }
            }
            
            val hasReliableSupport = hasHardwareHevc || hasSoftwareHevc
            Timber.i("$TAG: HEVC support - Hardware: $hasHardwareHevc, Software: $hasSoftwareHevc, Reliable: $hasReliableSupport")
            
            return hasReliableSupport
            
        } catch (e: Exception) {
            Timber.e(e, "$TAG: Error checking HEVC support")
            return false
        }
    }
    
    /**
     * Check if we're running on an emulator
     */
    fun isEmulator(): Boolean {
        return (Build.FINGERPRINT.startsWith("generic") ||
                Build.FINGERPRINT.startsWith("unknown") ||
                Build.MODEL.contains("google_sdk") ||
                Build.MODEL.contains("Emulator") ||
                Build.MODEL.contains("Android SDK built for x86") ||
                Build.MANUFACTURER.contains("Genymotion") ||
                Build.BRAND.startsWith("generic") && Build.DEVICE.startsWith("generic") ||
                "google_sdk" == Build.PRODUCT ||
                Build.HARDWARE.contains("goldfish") ||
                Build.HARDWARE.contains("ranchu"))
    }
    
    /**
     * Get recommended action for HEVC playback issues
     */
    fun getHevcPlaybackRecommendation(): HevcRecommendation {
        val isEmulator = isEmulator()
        val hasReliableHevc = hasReliableHevcSupport()
        
        return when {
            isEmulator && !hasReliableHevc -> HevcRecommendation.USE_ALTERNATIVE_FORMAT
            isEmulator && hasReliableHevc -> HevcRecommendation.TRY_SOFTWARE_DECODER
            !isEmulator && !hasReliableHevc -> HevcRecommendation.DEVICE_NOT_SUPPORTED
            else -> HevcRecommendation.SHOULD_WORK
        }
    }
    
    /**
     * Log detailed codec information for debugging
     */
    fun logCodecInformation() {
        try {
            Timber.d("$TAG: === CODEC COMPATIBILITY ANALYSIS ===")
            Timber.d("$TAG: Device: ${Build.MANUFACTURER} ${Build.MODEL}")
            Timber.d("$TAG: Android: ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
            Timber.d("$TAG: Is Emulator: ${isEmulator()}")
            Timber.d("$TAG: Hardware: ${Build.HARDWARE}")
            
            val codecList = MediaCodecList(MediaCodecList.REGULAR_CODECS)
            val codecInfos = codecList.codecInfos
            
            Timber.d("$TAG: Available Video Decoders:")
            
            for (codecInfo in codecInfos) {
                if (!codecInfo.isEncoder) {
                    val supportedTypes = codecInfo.supportedTypes
                    
                    for (type in supportedTypes) {
                        if (type.startsWith("video/")) {
                            val isHardware = isHardwareAccelerated(codecInfo)
                            val isProblematic = PROBLEMATIC_CODECS.any { problematic ->
                                codecInfo.name.lowercase().contains(problematic.lowercase())
                            }
                            
                            val status = when {
                                isProblematic -> "⚠️ PROBLEMATIC"
                                isHardware -> "🔧 HARDWARE"
                                else -> "💻 SOFTWARE"
                            }
                            
                            Timber.d("$TAG: $status ${codecInfo.name} -> $type")
                        }
                    }
                }
            }
            
            Timber.d("$TAG: === END CODEC ANALYSIS ===")
            
        } catch (e: Exception) {
            Timber.e(e, "$TAG: Error logging codec information")
        }
    }
    
    /**
     * Check if a codec is hardware accelerated
     */
    private fun isHardwareAccelerated(codecInfo: MediaCodecInfo): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            codecInfo.isHardwareAccelerated
        } else {
            // For older versions, use heuristics
            val name = codecInfo.name.lowercase()
            !name.startsWith("omx.google.") && 
            !name.startsWith("c2.android.") && 
            !name.contains("sw")
        }
    }
    
    /**
     * Recommendations for HEVC playback
     */
    enum class HevcRecommendation {
        SHOULD_WORK,
        TRY_SOFTWARE_DECODER,
        USE_ALTERNATIVE_FORMAT,
        DEVICE_NOT_SUPPORTED
    }
}
