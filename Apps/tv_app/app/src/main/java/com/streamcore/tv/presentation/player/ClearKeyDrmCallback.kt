package com.streamcore.tv.presentation.player

import android.util.Base64
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.drm.ExoMediaDrm
import androidx.media3.exoplayer.drm.MediaDrmCallback
import timber.log.Timber
import java.util.UUID

/**
 * Local MediaDrmCallback for ClearKey DRM.
 * 
 * This handles ClearKey license requests locally without making HTTP requests,
 * avoiding the "unknown protocol: data" error when using data: URIs.
 * 
 * ClearKey keys are provided as a JSON string in the format:
 * {"keys":[{"kty":"oct","k":"<base64url_key>","kid":"<base64url_kid>"}],"type":"temporary"}
 */
@OptIn(UnstableApi::class)
class ClearKeyDrmCallback(
    private val clearKeyJson: String
) : MediaDrmCallback {

    companion object {
        private const val TAG = "ClearKeyDrmCallback"
        
        /**
         * Build a ClearKey JSON from kid:key hex format
         */
        fun buildClearKeyJson(kidHex: String, keyHex: String): String {
            val kidB64 = hexToBase64Url(kidHex.replace("-", ""))
            val keyB64 = hexToBase64Url(keyHex)
            return """{"keys":[{"kty":"oct","k":"$keyB64","kid":"$kidB64"}],"type":"temporary"}"""
        }
        
        /**
         * Build a ClearKey JSON from pre-encoded ExoPlayer format
         * Validates and returns the JSON as-is if it's valid
         */
        fun validateOrBuildClearKeyJson(drmKeysExo: String): String {
            return try {
                // If it's already valid JSON with the right structure, use it
                if (drmKeysExo.trim().startsWith("{") && drmKeysExo.contains("\"keys\"")) {
                    drmKeysExo
                } else {
                    // Try to parse as kid:key format
                    if (drmKeysExo.contains(":")) {
                        val parts = drmKeysExo.split(":")
                        if (parts.size >= 2) {
                            buildClearKeyJson(parts[0].trim(), parts[1].trim())
                        } else {
                            drmKeysExo
                        }
                    } else {
                        drmKeysExo
                    }
                }
            } catch (e: Exception) {
                Timber.w("$TAG: Failed to validate ClearKey JSON: ${e.message}")
                drmKeysExo
            }
        }
        
        /**
         * Convert hex string to Base64URL (URL-safe, no padding, no wrap)
         */
        private fun hexToBase64Url(hex: String): String {
            val bytes = hex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
            return Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
        }
    }

    override fun executeKeyRequest(
        uuid: UUID,
        request: ExoMediaDrm.KeyRequest
    ): ByteArray {
        Timber.d("$TAG: executeKeyRequest called for UUID: $uuid")
        Timber.d("$TAG: Request type: ${request.requestType}")
        Timber.d("$TAG: ClearKey JSON content: $clearKeyJson")
        Timber.d("$TAG: Returning ClearKey JSON (${clearKeyJson.length} bytes)")
        
        // Return the ClearKey JSON as bytes - this is what the CDM needs
        return clearKeyJson.toByteArray(Charsets.UTF_8)
    }

    override fun executeProvisionRequest(
        uuid: UUID,
        request: ExoMediaDrm.ProvisionRequest
    ): ByteArray {
        Timber.d("$TAG: executeProvisionRequest called - not supported for ClearKey")
        // ClearKey doesn't require provisioning
        throw UnsupportedOperationException("ClearKey DRM does not support provisioning")
    }
}
