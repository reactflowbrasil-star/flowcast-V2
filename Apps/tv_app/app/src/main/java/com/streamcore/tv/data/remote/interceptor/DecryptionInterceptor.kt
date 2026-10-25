package com.streamcore.tv.data.remote.interceptor

import android.util.Base64
import com.streamcore.tv.BuildConfig
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import timber.log.Timber
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import javax.inject.Inject
import javax.inject.Singleton

/**
 * OkHttp interceptor that:
 * 1. Adds HMAC-SHA256 signature headers (X-SC-Sig, X-SC-Ts) to all requests
 * 2. Decrypts AES-256-GCM encrypted responses when X-Encrypted header is present
 *
 * Only active when BuildConfig.API_ENCRYPTION_KEY is configured.
 */
@Singleton
class DecryptionInterceptor @Inject constructor() : Interceptor {

    companion object {
        private const val TAG = "DecryptionInterceptor"
        private const val GCM_TAG_LENGTH_BITS = 128
        private const val NONCE_SIZE_BYTES = 12
    }

    private val encryptionKey: String? by lazy {
        try {
            val key = BuildConfig.API_ENCRYPTION_KEY
            if (key.isNotEmpty() && key.length == 64) key else null
        } catch (e: Exception) {
            null
        }
    }

    override fun intercept(chain: Interceptor.Chain): Response {
        val key = encryptionKey ?: return chain.proceed(chain.request())

        // Add HMAC signature headers
        val originalRequest = chain.request()
        val timestamp = (System.currentTimeMillis() / 1000).toString()
        val method = originalRequest.method.uppercase()
        val path = originalRequest.url.encodedPath

        val signature = computeHmacSignature(key, timestamp, method, path)

        val signedRequest = originalRequest.newBuilder()
            .header("X-SC-Sig", signature)
            .header("X-SC-Ts", timestamp)
            .build()

        val response = chain.proceed(signedRequest)

        // Check if response is encrypted
        val encrypted = response.header("X-Encrypted")
        if (encrypted != "aes256gcm") {
            return response
        }

        // Decrypt the response body
        return try {
            val encryptedBody = response.body?.string() ?: return response
            val decryptedJson = decryptAesGcm(encryptedBody, key)

            response.newBuilder()
                .body(decryptedJson.toResponseBody("application/json".toMediaType()))
                .removeHeader("X-Encrypted")
                .header("Content-Type", "application/json")
                .build()
        } catch (e: Exception) {
            Timber.e(e, "$TAG: Failed to decrypt response")
            response
        }
    }

    /**
     * Compute HMAC-SHA256 signature.
     * Message format: "<timestamp>:<METHOD>:<path>"
     */
    private fun computeHmacSignature(
        hexKey: String,
        timestamp: String,
        method: String,
        path: String
    ): String {
        val keyBytes = hexToBytes(hexKey)
        val message = "$timestamp:$method:$path"

        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(keyBytes, "HmacSHA256"))
        val signature = mac.doFinal(message.toByteArray(Charsets.UTF_8))

        return bytesToHex(signature)
    }

    /**
     * Decrypt AES-256-GCM encrypted payload.
     * Input: base64(nonce_12bytes + ciphertext + gcm_tag_16bytes)
     */
    private fun decryptAesGcm(base64Body: String, hexKey: String): String {
        val keyBytes = hexToBytes(hexKey)
        val combined = Base64.decode(base64Body.trim(), Base64.DEFAULT)

        require(combined.size > NONCE_SIZE_BYTES) { "Encrypted payload too short" }

        val nonce = combined.copyOfRange(0, NONCE_SIZE_BYTES)
        val ciphertext = combined.copyOfRange(NONCE_SIZE_BYTES, combined.size)

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val spec = GCMParameterSpec(GCM_TAG_LENGTH_BITS, nonce)
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(keyBytes, "AES"), spec)

        val plaintext = cipher.doFinal(ciphertext)
        return String(plaintext, Charsets.UTF_8)
    }

    private fun hexToBytes(hex: String): ByteArray {
        val bytes = ByteArray(hex.length / 2)
        for (i in hex.indices step 2) {
            bytes[i / 2] = hex.substring(i, i + 2).toInt(16).toByte()
        }
        return bytes
    }

    private fun bytesToHex(bytes: ByteArray): String {
        return bytes.joinToString("") { "%02x".format(it) }
    }
}
