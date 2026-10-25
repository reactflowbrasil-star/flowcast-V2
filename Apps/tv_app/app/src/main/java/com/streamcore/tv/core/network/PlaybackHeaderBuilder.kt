package com.streamcore.tv.core.network

import android.net.Uri
import org.json.JSONObject

data class PlaybackHeaderResult(
    val headers: Map<String, String>,
    val effectiveUserAgent: String?
)

object PlaybackHeaderBuilder {
    fun build(
        userAgent: String?,
        referer: String?,
        origin: String?,
        customHeaders: String?,
        fallbackUserAgent: String? = null,
        fallbackRefererFromUrl: String? = null
    ): PlaybackHeaderResult {
        val headers = linkedMapOf<String, String>()
        headers.putAll(parseCustomHeaders(customHeaders))

        if (!origin.isNullOrBlank() && !headers.containsKey("Origin")) {
            headers["Origin"] = origin.trim()
        }

        if (!referer.isNullOrBlank() && !headers.containsKey("Referer")) {
            headers["Referer"] = referer.trim()
        } else if (!headers.containsKey("Referer")) {
            val fallback = buildFallbackReferer(fallbackRefererFromUrl)
            if (fallback != null) headers["Referer"] = fallback
        }

        if (!userAgent.isNullOrBlank() && !headers.containsKey("User-Agent")) {
            headers["User-Agent"] = userAgent.trim()
        }

        var effectiveUa = headers["User-Agent"]?.takeIf { it.isNotBlank() }
        if (effectiveUa == null && !fallbackUserAgent.isNullOrBlank()) {
            effectiveUa = fallbackUserAgent.trim()
            headers["User-Agent"] = effectiveUa
        }

        return PlaybackHeaderResult(headers, effectiveUa)
    }

    private fun buildFallbackReferer(streamUrl: String?): String? {
        if (streamUrl.isNullOrBlank()) return null
        return try {
            val uri = Uri.parse(streamUrl)
            val scheme = uri.scheme ?: return null
            val host = uri.host ?: return null
            "$scheme://$host/"
        } catch (_: Exception) {
            null
        }
    }

    private fun parseCustomHeaders(raw: String?): Map<String, String> {
        if (raw.isNullOrBlank()) return emptyMap()
        val trimmed = raw.trim()
        val out = linkedMapOf<String, String>()

        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            val jsonParsed = parseJsonHeaders(trimmed)
            if (jsonParsed.isNotEmpty()) return jsonParsed

            val fallbackParsed = parseCommaSeparatedHeaders(trimmed.substring(1, trimmed.length - 1))
            if (fallbackParsed.isNotEmpty()) return fallbackParsed
        }

        return parseDelimitedHeaders(trimmed, ';')
    }

    private fun parseJsonHeaders(json: String): Map<String, String> {
        return try {
            val out = linkedMapOf<String, String>()
            val obj = JSONObject(json)
            val keys = obj.keys()
            while (keys.hasNext()) {
                val key = keys.next() ?: continue
                if (obj.isNull(key)) continue
                val value = obj.get(key)?.toString() ?: continue
                addHeader(out, key, value)
            }
            out
        } catch (_: Exception) {
            emptyMap()
        }
    }

    private fun parseCommaSeparatedHeaders(raw: String): Map<String, String> {
        if (raw.isBlank()) return emptyMap()
        val out = linkedMapOf<String, String>()
        raw.split(",").forEach { pair ->
            val parts = pair.split(":", limit = 2)
            if (parts.size == 2) {
                val key = parts[0].trim().removeSurrounding("\"")
                val value = parts[1].trim().removeSurrounding("\"")
                addHeader(out, key, value)
            }
        }
        return out
    }

    private fun parseDelimitedHeaders(raw: String, delimiter: Char): Map<String, String> {
        if (raw.isBlank()) return emptyMap()
        val out = linkedMapOf<String, String>()
        raw.split(delimiter).forEach { pair ->
            val parts = pair.split(":", limit = 2)
            if (parts.size == 2) {
                val key = parts[0].trim()
                val value = parts[1].trim()
                addHeader(out, key, value)
            }
        }
        return out
    }

    private fun addHeader(target: MutableMap<String, String>, key: String, value: String) {
        val normalizedKey = canonicalHeaderKey(key)
        val normalizedValue = value.trim()
        if (normalizedKey.isEmpty() || normalizedValue.isEmpty()) return
        target[normalizedKey] = normalizedValue
    }

    private fun canonicalHeaderKey(key: String): String {
        return when (key.trim().lowercase()) {
            "user-agent" -> "User-Agent"
            "referer", "referrer" -> "Referer"
            "origin" -> "Origin"
            else -> key.trim()
        }
    }
}
