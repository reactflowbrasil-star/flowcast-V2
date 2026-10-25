package com.streamcore.tv.presentation.player

import android.content.Context
import android.net.Uri
import android.util.Base64
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import com.streamcore.tv.core.utils.LanguageManager
import java.util.Locale
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.dash.DashMediaSource
import androidx.media3.exoplayer.drm.DefaultDrmSessionManager
import androidx.media3.exoplayer.drm.DefaultDrmSessionManagerProvider
import androidx.media3.exoplayer.drm.FrameworkMediaDrm
import androidx.media3.exoplayer.drm.LocalMediaDrmCallback
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import com.streamcore.tv.core.network.NetworkSecurityHelper
import com.streamcore.tv.core.security.DynamicUserAgentManager
import com.streamcore.tv.data.local.datastore.TokenManager
import com.streamcore.tv.domain.model.ContentStream
import okhttp3.OkHttpClient
import org.json.JSONArray
import org.json.JSONObject
import timber.log.Timber
import java.util.UUID
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * DRM Configuration data class
 * 
 * Holds all DRM-related configuration for a stream including
 * Widevine, PlayReady, ClearKey, and AES-128 settings.
 */
data class DrmConfig(
    val drmType: DrmType,
    val licenseServerUrl: String? = null,
    val drmHeaders: Map<String, String>? = null,
    val clearKeyKid: String? = null,     // KID in UUID format for ClearKey
    val clearKeyKey: String? = null,     // Key in hex or base64 for ClearKey
    val drmKeysJson: String? = null,     // Full JSON for ExoPlayer ClearKey
    val drmKeysHex: String? = null,       // kid:key hex format
    val proxyUrl: String? = null,
    val dohUrl: String? = null,
    val userAgent: String? = null,
    val customHeaders: Map<String, String>? = null
) {
    enum class DrmType {
        NONE,
        CLEARKEY,
        WIDEVINE,
        PLAYREADY,
        AES128
    }

    companion object {
        /**
         * Create DrmConfig from ContentStream fields
         */
        fun fromContentStream(
            drmType: String?,
            licenseServerUrl: String?,
            drmHeaders: Map<String, String>?,
            drmKeysExo: String?,
            drmKeysHex: String?,
            proxyUrl: String? = null,
            dohUrl: String? = null,
            userAgent: String? = null,
            customHeaders: Map<String, String>? = null
        ): DrmConfig {
            // Accept both payload forms for compatibility:
            // - drmKeysExo as ExoPlayer JSON
            // - drmKeysHex as canonical kid:key hex
            val exoTrimmed = drmKeysExo?.trim()
            val exoLooksLikeJson = exoTrimmed?.startsWith("{") == true && exoTrimmed.contains("\"keys\"")
            val exoLooksLikeHexPair = exoTrimmed?.startsWith("{") != true && exoTrimmed?.contains(":") == true

            val effectiveDrmKeysJson = exoTrimmed?.takeIf { exoLooksLikeJson }
            val effectiveDrmKeysHex = drmKeysHex?.trim()?.takeIf { it.isNotEmpty() }
                ?: exoTrimmed?.takeIf { exoLooksLikeHexPair }

            val type = when (drmType?.lowercase()) {
                "widevine" -> DrmType.WIDEVINE
                "playready" -> DrmType.PLAYREADY
                "clearkey" -> DrmType.CLEARKEY
                "aes128", "aes-128" -> DrmType.AES128
                else -> {
                    // Infer from available keys
                    when {
                        !licenseServerUrl.isNullOrBlank() -> DrmType.WIDEVINE
                        !effectiveDrmKeysJson.isNullOrBlank() -> DrmType.CLEARKEY
                        !effectiveDrmKeysHex.isNullOrBlank() -> DrmType.CLEARKEY
                        else -> DrmType.NONE
                    }
                }
            }

            // Parse clearkey kid:key from hex format
            var kid: String? = null
            var key: String? = null
            if (!effectiveDrmKeysHex.isNullOrBlank() && effectiveDrmKeysHex.contains(":")) {
                val parts = effectiveDrmKeysHex.split(":")
                if (parts.size >= 2) {
                    kid = hexToUuid(parts[0].trim())
                    key = parts[1].trim()
                }
            }

            return DrmConfig(
                drmType = type,
                licenseServerUrl = licenseServerUrl,
                drmHeaders = drmHeaders,
                clearKeyKid = kid,
                clearKeyKey = key,
                drmKeysJson = effectiveDrmKeysJson,
                drmKeysHex = effectiveDrmKeysHex,
                proxyUrl = proxyUrl,
                dohUrl = dohUrl,
                userAgent = userAgent,
                customHeaders = customHeaders
            )
        }

        /**
         * Convert 32-char hex string to UUID format
         */
        fun hexToUuid(hex: String): String {
            val clean = hex.replace("-", "").lowercase()
            return if (clean.length == 32) {
                "${clean.substring(0, 8)}-${clean.substring(8, 12)}-${clean.substring(12, 16)}-${clean.substring(16, 20)}-${clean.substring(20, 32)}"
            } else {
                hex
            }
        }

        /**
         * Convert hex string to Base64
         */
        fun hexToBase64(hex: String): String {
            val bytes = hex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
            return Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
        }
    }

    /**
     * Check if DRM is enabled
     */
    fun isDrmEnabled(): Boolean = drmType != DrmType.NONE

    /**
     * Check if this is ClearKey DRM
     */
    fun isClearKey(): Boolean = drmType == DrmType.CLEARKEY

    /**
     * Check if this requires a license server
     */
    fun requiresLicenseServer(): Boolean = 
        drmType == DrmType.WIDEVINE || drmType == DrmType.PLAYREADY

    /**
     * Get ClearKey license data URI for ExoPlayer
     */
    fun getClearKeyLicenseUri(): String? {
        val json = getClearKeyJson() ?: return null
        return buildClearKeyDataUri(json)
    }

    private fun buildClearKeyJson(kidUuid: String, keyHex: String): String {
        val kidHex = kidUuid.replace("-", "")
        val kidB64 = hexToBase64(kidHex)
        val keyB64 = hexToBase64(keyHex)
        return """{"keys":[{"kty":"oct","k":"$keyB64","kid":"$kidB64"}],"type":"temporary"}"""
    }

    private fun buildClearKeyDataUri(json: String): String {
        val encoded = Base64.encodeToString(json.toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
        return "data:application/json;base64,$encoded"
    }

    /**
     * Get ClearKey license JSON (without data: URI wrapper)
     * Used by ClearKeyDrmCallback for local license handling
     */
    fun getClearKeyJson(): String? {
        if (!isClearKey()) return null

        // Priority 1: Use pre-built JSON from backend (drm_keys_exo)
        if (!drmKeysJson.isNullOrBlank()) {
            val trimmed = drmKeysJson.trim()
            if (trimmed.startsWith("{") && trimmed.contains("\"keys\"")) {
                Timber.d("DrmConfig: Using backend ClearKey JSON")
                return trimmed
            }
            // Treat as kid:key hex format
            if (trimmed.contains(":")) {
                val parts = trimmed.split(":")
                if (parts.size >= 2) {
                    val kidHex = parts[0].trim().replace("-", "")
                    val keyHex = parts[1].trim()
                    val kidB64 = hexToBase64(kidHex)
                    val keyB64 = hexToBase64(keyHex)
                    return """{"keys":[{"kty":"oct","k":"$keyB64","kid":"$kidB64"}],"type":"temporary"}"""
                }
            }
        }

        // Priority 2: Build from parsed kid:key fields
        if (!clearKeyKid.isNullOrBlank() && !clearKeyKey.isNullOrBlank()) {
            Timber.d("DrmConfig: Building ClearKey JSON from parsed kid/key fields")
            return buildClearKeyJson(clearKeyKid, clearKeyKey)
        }

        // Priority 3: Build from hex format (kid:key)
        if (!drmKeysHex.isNullOrBlank() && drmKeysHex.contains(":")) {
            val parts = drmKeysHex.split(":")
            if (parts.size >= 2) {
                val kidHex = parts[0].trim().replace("-", "")
                val keyHex = parts[1].trim()

                val kidB64 = hexToBase64(kidHex)
                val keyB64 = hexToBase64(keyHex)

                Timber.d("DrmConfig: Building ClearKey JSON from hex - KID: $kidHex, KEY: $keyHex")
                return """{"keys":[{"kty":"oct","k":"$keyB64","kid":"$kidB64"}],"type":"temporary"}"""
            }
        }

        return null
    }

    /**
     * Get KID in UUID format for manifest patching
     */
    fun getKidUuid(): String? {
        if (!clearKeyKid.isNullOrBlank()) return clearKeyKid

        // Extract from hex format
        if (!drmKeysHex.isNullOrBlank() && drmKeysHex.contains(":")) {
            val parts = drmKeysHex.split(":")
            if (parts.isNotEmpty()) {
                return hexToUuid(parts[0].trim())
            }
        }

        return null
    }
}

/**
 * Result of DRM player setup containing the configured player and related components
 */
@OptIn(UnstableApi::class)
data class DrmPlayerComponents(
    val player: ExoPlayer,
    val trackSelector: DefaultTrackSelector,
    val mediaSource: MediaSource? = null
)

/**
 * DRM Helper for configuring ExoPlayer with various DRM schemes
 */
@Singleton
class DrmHelper @Inject constructor(
    private val tokenManager: TokenManager,
    private val userAgentManager: DynamicUserAgentManager
) {
    companion object {
        private const val TAG = "DrmHelper"
        
        // DRM UUIDs
        val WIDEVINE_UUID: UUID = UUID.fromString("edef8ba9-79d6-4ace-a3c8-27dcd51d21ed")
        val PLAYREADY_UUID: UUID = UUID.fromString("9a04f079-9840-4286-ab92-e65be0885f95")
        val CLEARKEY_UUID: UUID = UUID.fromString("e2719d58-a985-b3c9-781a-b030af78d30e")
    }

    /**
     * Setup ExoPlayer with DrmConfig
     */
    @OptIn(UnstableApi::class)
    fun setupExoPlayerWithDrmConfig(
        context: Context,
        streamUrl: String,
        drmConfig: DrmConfig,
        proxyUrl: String? = null,
        dohUrl: String? = null,
        subtitleConfigs: List<MediaItem.SubtitleConfiguration> = emptyList()
    ): DrmPlayerComponents {
        Timber.d("$TAG: Setting up player with DrmConfig type=${drmConfig.drmType}")

        val trackSelector = DefaultTrackSelector(context).apply {
            setParameters(
                buildUponParameters()
                    .setForceLowestBitrate(false)
                    .setForceHighestSupportedBitrate(false)
                    .setMaxVideoBitrate(Int.MAX_VALUE)
                    .setPreferredVideoMimeType(MimeTypes.VIDEO_H264)
                    .also { builder ->
                        resolvePreferredAudioLanguage(context)?.let { lang ->
                            builder.setPreferredAudioLanguage(lang)
                            Timber.d("$TAG: 🔊 Preferred audio language set to: $lang")
                        }
                    }
            )
        }

        val finalProxyUrl = proxyUrl ?: drmConfig.proxyUrl
        val finalDohUrl = dohUrl ?: drmConfig.dohUrl
        val finalUserAgent = drmConfig.userAgent
        val finalHeaders = drmConfig.customHeaders ?: emptyMap()

        val dataSourceFactory = createDataSourceFactory(context, finalProxyUrl, finalDohUrl, finalUserAgent, finalHeaders)

        // Configure Audio Attributes for Dolby/AC3 support and proper system audio routing
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
            .build()

        // For ClearKey, we need to use a custom DrmSessionManager with local callback
        // This avoids the "unknown protocol: data" error when using data: URIs
        val renderersFactory = DefaultRenderersFactory(context)
            .setEnableDecoderFallback(true)
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER)
            .forceEnableMediaCodecAsynchronousQueueing()

        val playerBuilder = ExoPlayer.Builder(context)
            .setRenderersFactory(renderersFactory)
            .setTrackSelector(trackSelector)
            .setAudioAttributes(audioAttributes, true)
            .setHandleAudioBecomingNoisy(true)

        val fixedUrl = streamUrl.replace("(", "%28").replace(")", "%29")

        var mediaItemToSet: MediaItem? = null
        var mediaSourceToSet: MediaSource? = null

        when {
            drmConfig.requiresLicenseServer() -> {
                // Widevine/PlayReady with license server - use standard approach
                playerBuilder.setMediaSourceFactory(DefaultMediaSourceFactory(dataSourceFactory))

                val drmUuid = if (drmConfig.drmType == DrmConfig.DrmType.WIDEVINE) WIDEVINE_UUID else PLAYREADY_UUID
                mediaItemToSet = MediaItem.Builder()
                    .setUri(fixedUrl)
                    .setSubtitleConfigurations(subtitleConfigs)
                    .setDrmConfiguration(
                        MediaItem.DrmConfiguration.Builder(drmUuid)
                            .setLicenseUri(drmConfig.licenseServerUrl)
                            .apply {
                                drmConfig.drmHeaders?.let { headers ->
                                    setLicenseRequestHeaders(headers)
                                }
                            }
                            .build()
                    )
                    .build()
            }

            drmConfig.isClearKey() -> {
                val clearKeyJson = drmConfig.getClearKeyJson()
                if (clearKeyJson.isNullOrBlank()) {
                    Timber.w("$TAG: ClearKey enabled but no keys available, playing without DRM")
                    playerBuilder.setMediaSourceFactory(DefaultMediaSourceFactory(dataSourceFactory))
                    mediaItemToSet = MediaItem.fromUri(fixedUrl)
                } else {
                    Timber.d("$TAG: Setting up ClearKey with LocalMediaDrmCallback")
                    Timber.d("$TAG: ClearKey JSON: ${clearKeyJson.take(100)}...")

                    val clearKeyCallback = LocalMediaDrmCallback(clearKeyJson.toByteArray(Charsets.UTF_8))
                    val drmSessionManager = DefaultDrmSessionManager.Builder()
                        .setUuidAndExoMediaDrmProvider(CLEARKEY_UUID, FrameworkMediaDrm.DEFAULT_PROVIDER)
                        .setPlayClearSamplesWithoutKeys(true)
                        .setMultiSession(true)
                        .setSessionKeepaliveMs(60_000)
                        .build(clearKeyCallback)

                    if (fixedUrl.contains(".mpd", ignoreCase = true)) {
                        // Match backup behavior: explicit DASH MediaSource + manifest parser.
                        val kidUuid = drmConfig.getKidUuid()
                        Timber.d("$TAG: ClearKey DASH: using DashMediaSource + InjectClearKeyDashManifestParser (kidUuid=$kidUuid)")
                        val drmItemConfig = MediaItem.DrmConfiguration.Builder(CLEARKEY_UUID)
                            .setForceDefaultLicenseUri(true)
                            // Placeholder URL: license is served locally via LocalMediaDrmCallback.
                            .setLicenseUri("https://clearkey.local/placeholder")
                            .build()

                        val mediaItem = MediaItem.Builder()
                            .setUri(fixedUrl)
                            .setMimeType(MimeTypes.APPLICATION_MPD)
                            .setDrmConfiguration(drmItemConfig)
                            .setSubtitleConfigurations(subtitleConfigs)
                            .build()

                        mediaSourceToSet = DashMediaSource.Factory(dataSourceFactory)
                            .setManifestParser(InjectClearKeyDashManifestParser(kidUuid))
                            .setDrmSessionManagerProvider { _: MediaItem -> drmSessionManager }
                            .createMediaSource(mediaItem)
                    } else {
                        // Non-DASH: use DefaultMediaSourceFactory with the session manager.
                        val mediaSourceFactory = DefaultMediaSourceFactory(dataSourceFactory)
                            .setDrmSessionManagerProvider { drmSessionManager }
                        playerBuilder.setMediaSourceFactory(mediaSourceFactory)

                        mediaItemToSet = MediaItem.Builder()
                            .setUri(fixedUrl)
                            .setSubtitleConfigurations(subtitleConfigs)
                            .build()
                    }
                }
            }

            else -> {
                playerBuilder.setMediaSourceFactory(DefaultMediaSourceFactory(dataSourceFactory))
                mediaItemToSet = MediaItem.fromUri(fixedUrl)
            }
        }

        val player = playerBuilder.build()
        if (mediaSourceToSet != null) {
            player.setMediaSource(mediaSourceToSet!!)
        } else if (mediaItemToSet != null) {
            player.setMediaItem(mediaItemToSet!!)
        } else {
            // Should never happen, but avoid returning a player with nothing set.
            player.setMediaItem(MediaItem.fromUri(fixedUrl))
        }
        
        return DrmPlayerComponents(player, trackSelector)
    }

    /**
     * Setup ExoPlayer with DRM using hex keys (kid:key format)
     */
    @OptIn(UnstableApi::class)
    fun setupExoPlayerWithDrm(
        context: Context,
        streamUrl: String,
        drmKeysHex: String?,
        proxyUrl: String? = null,
        forceClearKey: Boolean = false,
        dohUrl: String? = null,
        userAgent: String? = null,
        subtitleConfigs: List<MediaItem.SubtitleConfiguration> = emptyList()
    ): DrmPlayerComponents {
        Timber.d("$TAG: Setting up player with DRM keys: ${drmKeysHex?.take(20)}...")

        val drmConfig = DrmConfig(
            drmType = DrmConfig.DrmType.CLEARKEY,
            drmKeysHex = drmKeysHex,
            userAgent = userAgent
        )

        return setupExoPlayerWithDrmConfig(context, streamUrl, drmConfig, proxyUrl, dohUrl, subtitleConfigs)
    }

    /**
     * Setup ExoPlayer for Widevine DRM with license server
     */
    @OptIn(UnstableApi::class)
    fun setupExoPlayerWithWidevine(
        context: Context,
        streamUrl: String,
        licenseServerUrl: String,
        drmHeaders: Map<String, String>? = null,
        proxyUrl: String? = null,
        dohUrl: String? = null,
        userAgent: String? = null,
        subtitleConfigs: List<MediaItem.SubtitleConfiguration> = emptyList()
    ): DrmPlayerComponents {
        Timber.d("$TAG: Setting up Widevine DRM with license server: $licenseServerUrl")

        val drmConfig = DrmConfig(
            drmType = DrmConfig.DrmType.WIDEVINE,
            licenseServerUrl = licenseServerUrl,
            drmHeaders = drmHeaders,
            userAgent = userAgent
        )

        return setupExoPlayerWithDrmConfig(context, streamUrl, drmConfig, proxyUrl, dohUrl, subtitleConfigs)
    }

    /**
     * Create OkHttp-based DataSource factory with optional proxy and DoH
     */
    @OptIn(UnstableApi::class)
    private fun createDataSourceFactory(
        context: Context,
        proxyUrl: String? = null,
        dohUrl: String? = null,
        userAgent: String? = null,
        customHeaders: Map<String, String>? = null
    ): DefaultDataSource.Factory {
        // Sanitize headers: avoid sending blank values (some CDNs close connections on "Header: ").
        val headers = mutableMapOf<String, String>()
        customHeaders?.forEach { (k, v) ->
            val key = k.trim()
            val value = v.trim()
            if (key.isNotEmpty() && value.isNotEmpty()) {
                headers[key] = value
            }
        }
        // Remove Referer regardless of key casing to avoid CDN/DRM source errors.
        headers.keys.firstOrNull { it.equals("Referer", ignoreCase = true) }?.let(headers::remove)

        // Resolve an effective UA: treat blank as missing.
        val effectiveUa = headers["User-Agent"]
            ?.takeIf { it.isNotBlank() }
            ?: userAgent?.takeIf { it.isNotBlank() }
            ?: userAgentManager.getCurrentUserAgent()?.takeIf { it.isNotBlank() }
            ?: "IPTV-Android/1.0"

        // Keep request-properties + factory UA consistent.
        headers["User-Agent"] = effectiveUa

        // A couple of safe defaults (matches the backup app behavior).
        headers.putIfAbsent("Accept", "*/*")
        headers.putIfAbsent("Connection", "keep-alive")

        // If we don't need proxy/DoH, prefer DefaultHttpDataSource (backup uses this and it tends to be
        // more tolerant than OkHttp on some IPTV/DASH origins that drop connections).
        val needsProxy = !proxyUrl.isNullOrBlank()
        val needsDoh = !dohUrl.isNullOrBlank()
        if (!needsProxy && !needsDoh) {
            Timber.d(
                "$TAG: DataSource=DefaultHttpDataSource (no proxy/DoH), " +
                    "UA=${effectiveUa.take(80)}, headers=${headers.keys.sorted()}"
            )
            val httpFactory = com.streamcore.tv.core.network.CleartextHttpDataSource.Factory()
                .setUserAgent(effectiveUa)
                .setConnectTimeoutMs(30_000)
                .setReadTimeoutMs(30_000)
                .setAllowCrossProtocolRedirects(true)
                .setDefaultRequestProperties(headers)
            return DefaultDataSource.Factory(context, httpFactory)
        }

        // Otherwise use OkHttp (proxy / DoH).
        Timber.d(
            "$TAG: DataSource=OkHttp (proxy/DoH), " +
                "UA=${effectiveUa.take(80)}, headers=${headers.keys.sorted()}"
        )
        val clientBuilder = OkHttpClient.Builder()
            .apply { NetworkSecurityHelper.applyLenientSsl(this) }
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .followRedirects(true)
            .followSslRedirects(true)

        // Configure proxy if provided
        proxyUrl?.let { proxy ->
            try {
                val uri = Uri.parse(proxy)
                val host = uri.host ?: return@let
                val port = uri.port.takeIf { it > 0 } ?: 8080
                clientBuilder.proxy(java.net.Proxy(java.net.Proxy.Type.HTTP, java.net.InetSocketAddress(host, port)))
                Timber.d("$TAG: Configured HTTP proxy: $host:$port")
            } catch (e: Exception) {
                Timber.w("$TAG: Failed to configure proxy: ${e.message}")
            }
        }

        // Configure DNS-over-HTTPS if provided
        if (!dohUrl.isNullOrBlank()) {
            NetworkSecurityHelper.configureOkHttpClientBuilder(clientBuilder, dohUrl)
        }

        val okHttpClient = clientBuilder.build()
        val okHttpDataSourceFactory = OkHttpDataSource.Factory(okHttpClient)
            .setUserAgent(effectiveUa)
            .setDefaultRequestProperties(headers)

        return DefaultDataSource.Factory(context, okHttpDataSourceFactory)
    }

    /**
     * Build ClearKey license JSON from kid:key hex format
     */
    fun buildClearKeyLicenseJson(kidHex: String, keyHex: String): String {
        val kidB64 = DrmConfig.hexToBase64(kidHex.replace("-", ""))
        val keyB64 = DrmConfig.hexToBase64(keyHex)
        return """{"keys":[{"kty":"oct","k":"$keyB64","kid":"$kidB64"}],"type":"temporary"}"""
    }

    /**
     * Parse kid:key format and return UUID-formatted KID
     */
    fun parseKidFromHex(drmKeysHex: String): String? {
        if (!drmKeysHex.contains(":")) return null
        val parts = drmKeysHex.split(":")
        if (parts.isEmpty()) return null
        return DrmConfig.hexToUuid(parts[0].trim())
    }

    /**
     * Resolve preferred audio language from app/device language settings.
     * Used to auto-select the appropriate audio track for multi-language content.
     */
    private fun resolvePreferredAudioLanguage(context: Context): String? {
        return try {
            val lm = LanguageManager.getInstance(context)
            val selected = lm.getCurrentLanguage()
            val rawCode = if (selected.equals("system", ignoreCase = true)) {
                val locales = context.resources.configuration.locales
                if (!locales.isEmpty) locales[0].language else Locale.getDefault().language
            } else selected

            // Normalize language codes to ISO 639-1 format
            when (rawCode.lowercase()) {
                "es", "spa" -> "es"
                "en", "eng" -> "en"
                "pt", "por", "pt-br", "pt_pt", "pt-pt" -> "pt"
                "zh", "zho", "chi", "cmn" -> "zh"
                "fr", "fra", "fre" -> "fr"
                "de", "deu", "ger" -> "de"
                "it", "ita" -> "it"
                else -> rawCode.take(2)
            }
        } catch (e: Exception) {
            Timber.w(e, "$TAG: Failed to resolve preferred audio language")
            null
        }
    }
}
