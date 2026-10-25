package com.streamcore.tv.presentation.player

import android.net.Uri
import android.util.Base64
import androidx.media3.exoplayer.dash.manifest.DashManifest
import androidx.media3.exoplayer.dash.manifest.DashManifestParser
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.upstream.ParsingLoadable
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID
import androidx.annotation.OptIn

/**
 * On-the-fly DASH manifest fixer for ClearKey playback.
 *
 * - Ensures cenc namespace.
 * - Removes <UTCTiming> (avoids bad SSL/OCSP on some vendors).
 * - Strips non-ClearKey ContentProtection (Widevine/PlayReady/Marlin).
 * - Injects ClearKey ContentProtection into all AdaptationSets when missing.
 * - Optionally injects cenc:default_KID with provided KID (UUID format).
 *
 * This runs on every live MPD refresh via DashMediaSource.Factory.setManifestParser(...).
 */
@OptIn(UnstableApi::class)
class InjectClearKeyDashManifestParser(
    private val clearKeyKidUuid: String? // e.g., "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" or null
) : ParsingLoadable.Parser<DashManifest> {

    private val delegate = DashManifestParser()

    // UUID strings
    private val CLEARKEY_UUID_STR = "e2719d58-a985-b3c9-781a-b030af78d30e" // ClearKey
    private val CLEARKEY_URN = "urn:uuid:$CLEARKEY_UUID_STR"
    private val WIDEVINE_UUID_STR = "edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"
    private val PLAYREADY_UUID_STR = "9a04f079-9840-4286-ab92-e65be0885f95"
    private val MARLIN_UUID_STR = "5e629af5-38da-4063-8977-97ffbd9902d4"
    private val MP4PROTECTION_SCHEME = "urn:mpeg:dash:mp4protection:2011"

    override fun parse(uri: Uri, inputStream: InputStream): DashManifest {
        val original = inputStream.readBytes().toString(Charsets.UTF_8)
        return try {
            val url = uri.toString()

            println("🔍 InjectClearKeyDashManifestParser: Processing URL: $url")
            println("🔍 KID UUID: $clearKeyKidUuid")

            // If no KID UUID provided or manifest already advertises ClearKey, leave untouched
            val hasExistingClearKey = original.contains(CLEARKEY_UUID_STR, ignoreCase = true)
            val hasDefaultKid = original.contains("default_KID", ignoreCase = true)
            if (clearKeyKidUuid.isNullOrBlank() || hasExistingClearKey || hasDefaultKid) {
                println("🔍 ClearKey already present or no KID provided - leaving manifest untouched")
                return delegate.parse(uri, ByteArrayInputStream(original.toByteArray(Charsets.UTF_8)))
            }

            var fixed = original
            println("🔍 Starting manifest fixes for ClearKey DRM...")

            // Ensure required namespace (safe)
            fixed = ensureCencNamespace(fixed)
            println("🔍 ✅ CENC namespace ensured")

            // Inject/replace mp4protection with default_KID on VIDEO and AUDIO
            fixed = ensureMp4ProtectionDefaultKidOnVideoAndAudio(fixed, clearKeyKidUuid!!)

            // Inject ClearKey on VIDEO (with PSSH) and AUDIO (self-closing, no PSSH)
            fixed = ensureClearKeyOnVideoAndAudioAdaptationSets(fixed, clearKeyKidUuid!!)
            println("🔍 ✅ ClearKey ContentProtection ensured on VIDEO and AUDIO AdaptationSets")

            println("🔍 ✅ All manifest fixes completed successfully")

            val bais = ByteArrayInputStream(fixed.toByteArray(Charsets.UTF_8))
            delegate.parse(uri, bais)
        } catch (e: Exception) {
            println("🔍 ❌ Error in manifest parser: ${e.message}")
            e.printStackTrace()
            // Fallback to original parser on any error
            delegate.parse(uri, ByteArrayInputStream(original.toByteArray(Charsets.UTF_8)))
        }
    }

    private fun ensureCencNamespace(xml: String): String {
        return if (xml.contains("xmlns:cenc=")) xml
        else xml.replaceFirst(Regex("<MPD\\b"), """<MPD xmlns:cenc="urn:mpeg:cenc:2013" """)
    }

    private fun stripUtcTiming(xml: String): String {
        var out = xml
        out = out.replace(Regex("(?is)<UTCTiming[^>]*/>"), "")
        out = out.replace(Regex("(?is)<UTCTiming\\b[\\s\\S]*?</UTCTiming>"), "")
        return out
    }

    private fun stripAllContentProtection(xml: String): String {
        var out = xml
        // Remove any ContentProtection block (with inner content) regardless of scheme
        out = out.replace(Regex("(?is)<ContentProtection\\b[\\s\\S]*?</ContentProtection>"), "")
        // Remove any self-closing ContentProtection
        out = out.replace(Regex("(?is)<ContentProtection\\b[^>]*/>"), "")
        return out
    }

    // Preferred: only strip non-ClearKey schemes to avoid breaking already working manifests
    private fun stripNonClearKeyContentProtection(xml: String): String {
        var out = xml
        listOf(WIDEVINE_UUID_STR, PLAYREADY_UUID_STR, MARLIN_UUID_STR).forEach { uuid ->
            // Remove block form for the given uuid
            out = out.replace(
                Regex("(?is)<ContentProtection[^>]*?schemeIdUri\\s*=\\s*\"[^\"]*${uuid}[^\"]*\"[\\s\\S]*?</ContentProtection>"),
                ""
            )
            // Remove self-closing form for the given uuid
            out = out.replace(
                Regex("(?is)<ContentProtection[^>]*?schemeIdUri\\s*=\\s*\"[^\"]*${uuid}[^\"]*\"[^>]*/>"),
                ""
            )
        }
        return out
    }

    /**
     * ENHANCED: Ensure each VIDEO AdaptationSet has mp4protection with cenc:default_KID="<kidUuid>".
     * This is critical for DRM quality switching to work properly.
     */
    private fun ensureMp4ProtectionDefaultKid(xml: String, kidUuid: String): String {
        println("🔍 ensureMp4ProtectionDefaultKid: Starting with KID UUID: $kidUuid")
        
        val sb = StringBuilder(xml.length + 4096)
        var cursor = 0
        var videoAdaptationSetsProcessed = 0
        
        while (true) {
            val start = xml.indexOf("<AdaptationSet", cursor)
            if (start == -1) {
                sb.append(xml.substring(cursor))
                break
            }
            val openEnd = xml.indexOf('>', start)
            if (openEnd == -1) {
                sb.append(xml.substring(cursor))
                break
            }
            val close = xml.indexOf("</AdaptationSet>", openEnd + 1)
            if (close == -1) {
                sb.append(xml.substring(cursor))
                break
            }

            // Capture opening tag and decide if this is a VIDEO AdaptationSet
            val openingTag = xml.substring(start, openEnd + 1)
            val isVideo = openingTag.contains(Regex("""mimeType\s*=\s*"\s*video/""", RegexOption.IGNORE_CASE)) ||
                          openingTag.contains(Regex("""contentType\s*=\s*"\s*video""", RegexOption.IGNORE_CASE))

            // Append up to end of opening tag
            sb.append(xml.substring(cursor, openEnd + 1))

            val block = xml.substring(openEnd + 1, close)

            if (!isVideo) {
                // Leave non-video AdaptationSets untouched
                sb.append(block)
                sb.append("</AdaptationSet>")
                cursor = close + "</AdaptationSet>".length
                continue
            }

            videoAdaptationSetsProcessed++
            println("🔍 Processing VIDEO AdaptationSet #$videoAdaptationSetsProcessed")

            // Find existing mp4protection CP
            val mp4OpenTagRegex = Regex("(?is)<ContentProtection([^>]*)schemeIdUri\\s*=\\s*\"\\s*${Regex.escape(MP4PROTECTION_SCHEME)}\\s*\"([^>]*)>")
            val mp4SelfClosingRegex = Regex("(?is)<ContentProtection([^>]*)schemeIdUri\\s*=\\s*\"\\s*${Regex.escape(MP4PROTECTION_SCHEME)}\\s*\"([^>]*)/>")

            var modifiedBlock = block
            val hasMp4 = mp4OpenTagRegex.containsMatchIn(block) || mp4SelfClosingRegex.containsMatchIn(block)

            if (hasMp4) {
                println("🔍 Found existing mp4protection - will remove and replace with proper one")
                // Instead of trying to modify existing mp4protection (which causes XML errors),
                // remove all mp4protection and inject a clean new one with default_KID
                
                // Remove existing mp4protection (both self-closing and open/close variants)
                modifiedBlock = modifiedBlock.replace(mp4OpenTagRegex, "")
                modifiedBlock = modifiedBlock.replace(mp4SelfClosingRegex, "")
                
                // Now inject a clean mp4protection with default_KID at the start
                val cleanMp4Protection = """<ContentProtection schemeIdUri="$MP4PROTECTION_SCHEME" value="cenc" cenc:default_KID="$kidUuid" />"""
                modifiedBlock = "\n      $cleanMp4Protection\n$modifiedBlock"
                println("🔍 ✅ REPLACED existing mp4protection with clean one: default_KID=$kidUuid")
            } else {
                // FORCE INJECT mp4protection with default_KID at start of VIDEO block
                val mp4Protection = """<ContentProtection schemeIdUri="$MP4PROTECTION_SCHEME" value="cenc" cenc:default_KID="$kidUuid" />"""
                modifiedBlock = "\n      $mp4Protection\n$block"
                println("🔍 ✅ FORCE INJECTED mp4protection with default_KID=$kidUuid")
            }

            sb.append(modifiedBlock)
            sb.append("</AdaptationSet>")
            cursor = close + "</AdaptationSet>".length
        }
        
        println("🔍 ensureMp4ProtectionDefaultKid: Processed $videoAdaptationSetsProcessed video AdaptationSets")
        return sb.toString()
    }

    // Inject/replace mp4protection with default_KID on both VIDEO and AUDIO AdaptationSets
    private fun ensureMp4ProtectionDefaultKidOnVideoAndAudio(xml: String, kidUuid: String): String {
        println("🔍 ensureMp4ProtectionDefaultKidOnVideoAndAudio: KID UUID: $kidUuid")

        val sb = StringBuilder(xml.length + 4096)
        var cursor = 0
        var processed = 0

        val mp4OpenTagRegex = Regex("(?is)<ContentProtection([^>]*)schemeIdUri\\s*=\\s*\"\\s*${Regex.escape(MP4PROTECTION_SCHEME)}\\s*\"([^>]*)>")
        val mp4SelfClosingRegex = Regex("(?is)<ContentProtection([^>]*)schemeIdUri\\s*=\\s*\"\\s*${Regex.escape(MP4PROTECTION_SCHEME)}\\s*\"([^>]*)/>")

        while (true) {
            val start = xml.indexOf("<AdaptationSet", cursor)
            if (start == -1) {
                sb.append(xml.substring(cursor))
                break
            }
            val openEnd = xml.indexOf('>', start)
            if (openEnd == -1) {
                sb.append(xml.substring(cursor))
                break
            }
            val close = xml.indexOf("</AdaptationSet>", openEnd + 1)
            if (close == -1) {
                sb.append(xml.substring(cursor))
                break
            }

            val openingTag = xml.substring(start, openEnd + 1)
            val isVideo = openingTag.contains(Regex("""mimeType\s*=\s*"\s*video/""", RegexOption.IGNORE_CASE)) ||
                          openingTag.contains(Regex("""contentType\s*=\s*"\s*video""", RegexOption.IGNORE_CASE))
            val isAudio = openingTag.contains(Regex("""mimeType\s*=\s*"\s*audio/""", RegexOption.IGNORE_CASE)) ||
                          openingTag.contains(Regex("""contentType\s*=\s*"\s*audio""", RegexOption.IGNORE_CASE))

            sb.append(xml.substring(cursor, openEnd + 1))
            val block = xml.substring(openEnd + 1, close)

            if (!isVideo && !isAudio) {
                sb.append(block)
                sb.append("</AdaptationSet>")
                cursor = close + "</AdaptationSet>".length
                continue
            }

            processed++
            val type = if (isVideo) "VIDEO" else "AUDIO"
            println("🔍 Processing $type AdaptationSet #$processed for mp4protection")

            var modifiedBlock = block
            val hasMp4 = mp4OpenTagRegex.containsMatchIn(block) || mp4SelfClosingRegex.containsMatchIn(block)
            if (hasMp4) {
                modifiedBlock = modifiedBlock.replace(mp4OpenTagRegex, "")
                modifiedBlock = modifiedBlock.replace(mp4SelfClosingRegex, "")
                val clean = """<ContentProtection schemeIdUri="$MP4PROTECTION_SCHEME" value="cenc" cenc:default_KID="$kidUuid" />"""
                modifiedBlock = "\n      $clean\n$modifiedBlock"
                println("🔍 ✅ REPLACED existing mp4protection with default_KID=$kidUuid on $type")
            } else {
                val inject = """<ContentProtection schemeIdUri="$MP4PROTECTION_SCHEME" value="cenc" cenc:default_KID="$kidUuid" />"""
                modifiedBlock = "\n      $inject\n$block"
                println("🔍 ✅ INJECTED mp4protection with default_KID=$kidUuid on $type")
            }

            sb.append(modifiedBlock)
            sb.append("</AdaptationSet>")
            cursor = close + "</AdaptationSet>".length
        }

        println("🔍 ensureMp4ProtectionDefaultKidOnVideoAndAudio: Processed $processed AdaptationSets")
        return sb.toString()
    }

    // Ensure ClearKey on VIDEO (with PSSH) and AUDIO (self-closing, no PSSH) AdaptationSets
    private fun ensureClearKeyOnVideoAndAudioAdaptationSets(xml: String, kidUuid: String?): String {
        val defaultKidAttr = kidUuid?.let { """ cenc:default_KID="$it"""" } ?: ""

        fun buildPsshV1Base64ForKid(kidUuid: String): String {
            val systemId = UUID.fromString(CLEARKEY_UUID_STR)
            val kid = UUID.fromString(kidUuid)
            val version = 1
            val flags = 0
            val kidCount = 1
            val dataSize = 0
            val totalSize = 4 + 4 + 4 + 16 + 4 + 16 * kidCount + 4 + dataSize
            val bb = ByteBuffer.allocate(totalSize).order(ByteOrder.BIG_ENDIAN)
            bb.putInt(totalSize)
            bb.put('p'.code.toByte()); bb.put('s'.code.toByte()); bb.put('s'.code.toByte()); bb.put('h'.code.toByte())
            bb.put(((version and 0xFF)).toByte())
            bb.put(((flags shr 16) and 0xFF).toByte())
            bb.put(((flags shr 8) and 0xFF).toByte())
            bb.put((flags and 0xFF).toByte())
            bb.putLong(systemId.mostSignificantBits)
            bb.putLong(systemId.leastSignificantBits)
            bb.putInt(kidCount)
            bb.putLong(kid.mostSignificantBits)
            bb.putLong(kid.leastSignificantBits)
            bb.putInt(dataSize)
            return Base64.encodeToString(bb.array(), Base64.NO_WRAP)
        }

        val sb = StringBuilder(xml.length + 4096)
        var cursor = 0
        var processedVideo = 0
        var processedAudio = 0

        while (true) {
            val start = xml.indexOf("<AdaptationSet", cursor)
            if (start == -1) {
                sb.append(xml.substring(cursor))
                break
            }
            val openEnd = xml.indexOf('>', start)
            if (openEnd == -1) {
                sb.append(xml.substring(cursor))
                break
            }
            val close = xml.indexOf("</AdaptationSet>", openEnd + 1)
            if (close == -1) {
                sb.append(xml.substring(cursor))
                break
            }

            val openingTag = xml.substring(start, openEnd + 1)
            val isVideo = openingTag.contains(Regex("""mimeType\s*=\s*"\s*video/""", RegexOption.IGNORE_CASE)) ||
                          openingTag.contains(Regex("""contentType\s*=\s*"\s*video""", RegexOption.IGNORE_CASE))
            val isAudio = openingTag.contains(Regex("""mimeType\s*=\s*"\s*audio/""", RegexOption.IGNORE_CASE)) ||
                          openingTag.contains(Regex("""contentType\s*=\s*"\s*audio""", RegexOption.IGNORE_CASE))

            sb.append(xml.substring(cursor, openEnd + 1))
            val block = xml.substring(openEnd + 1, close)

            var modifiedBlock = block

            if (isVideo) {
                processedVideo++
                val hasClearKey = block.contains(CLEARKEY_UUID_STR, ignoreCase = true)
                val hasPssh = block.contains("<cenc:pssh", ignoreCase = true)

                if (!hasClearKey) {
                    if (!kidUuid.isNullOrBlank()) {
                        val pssh = buildPsshV1Base64ForKid(kidUuid)
                        val cp = """
<ContentProtection schemeIdUri="$CLEARKEY_URN" value="ClearKey1.0">
  <cenc:pssh>$pssh</cenc:pssh>
</ContentProtection>
""".trimIndent()
                        modifiedBlock = "\n      $cp\n$modifiedBlock"
                    } else {
                        val self = """<ContentProtection schemeIdUri="$CLEARKEY_URN"$defaultKidAttr />"""
                        modifiedBlock = "\n      $self\n$modifiedBlock"
                    }
                } else if (!hasPssh && !kidUuid.isNullOrBlank()) {
                    val pssh = buildPsshV1Base64ForKid(kidUuid)
                    val cp = """
<ContentProtection schemeIdUri="$CLEARKEY_URN" value="ClearKey1.0">
  <cenc:pssh>$pssh</cenc:pssh>
</ContentProtection>
""".trimIndent()
                    modifiedBlock = "\n      $cp\n$modifiedBlock"
                }
            } else if (isAudio) {
                processedAudio++
                val hasClearKey = block.contains(CLEARKEY_UUID_STR, ignoreCase = true)
                if (!hasClearKey) {
                    // For AUDIO, inject self-closing ClearKey tag (no PSSH), as requested
                    val cpAudio = """<ContentProtection schemeIdUri="$CLEARKEY_URN" />"""
                    modifiedBlock = "\n      $cpAudio\n$modifiedBlock"
                }
            }

            sb.append(modifiedBlock)
            sb.append("</AdaptationSet>")
            cursor = close + "</AdaptationSet>".length
        }

        println("🔍 ensureClearKeyOnVideoAndAudioAdaptationSets: Processed VIDEO=$processedVideo AUDIO=$processedAudio")
        return sb.toString()
    }

    /**
     * Ensure <Role value="main"> exists on VIDEO AdaptationSet. If missing, insert right after the opening tag.
     */
    private fun ensureRoleMainOnVideoAdaptationSets(xml: String): String {
        val sb = StringBuilder(xml.length + 2048)
        var cursor = 0
        while (true) {
            val start = xml.indexOf("<AdaptationSet", cursor)
            if (start == -1) {
                sb.append(xml.substring(cursor))
                break
            }
            val openEnd = xml.indexOf('>', start)
            if (openEnd == -1) {
                sb.append(xml.substring(cursor))
                break
            }
            val close = xml.indexOf("</AdaptationSet>", openEnd + 1)
            if (close == -1) {
                sb.append(xml.substring(cursor))
                break
            }

            val openingTag = xml.substring(start, openEnd + 1)
            val block = xml.substring(openEnd + 1, close)
            val isVideo = openingTag.contains(Regex("""mimeType\s*=\s*"\s*video/""", RegexOption.IGNORE_CASE)) ||
                          openingTag.contains(Regex("""contentType\s*=\s*"\s*video""", RegexOption.IGNORE_CASE))
            val hasRoleMain = block.contains(Regex("""<Role[^>]*value\s*=\s*"\s*main\s*"""", RegexOption.IGNORE_CASE))

            // Append opening tag
            sb.append(xml.substring(cursor, openEnd + 1))

            var modifiedBlock = block
            if (isVideo && !hasRoleMain) {
                val roleMain = """<Role schemeIdUri="urn:mpeg:dash:role:2011" value="main" />"""
                modifiedBlock = "\n      $roleMain\n$block"
            }

            sb.append(modifiedBlock)
            sb.append("</AdaptationSet>")
            cursor = close + "</AdaptationSet>".length
        }
        return sb.toString()
    }

    private fun injectClearKeyIntoAllAdaptationSets(xml: String, kidUuid: String?): String {
        // Build a minimal PSSH v0 box for ClearKey system ID with empty data.
        fun buildPsshV0Base64(systemId: UUID): String {
            val data = ByteArray(0)
            val size = 4 /*size*/ + 4 /*'pssh'*/ + 4 /*version+flags*/ + 16 /*systemId*/ + 4 /*data size*/ + data.size
            val bb = ByteBuffer.allocate(size).order(ByteOrder.BIG_ENDIAN)
            // size
            bb.putInt(size)
            // 'pssh'
            bb.put('p'.code.toByte()); bb.put('s'.code.toByte()); bb.put('s'.code.toByte()); bb.put('h'.code.toByte())
            // version(0) + flags
            bb.putInt(0)
            // system id
            bb.putLong(systemId.mostSignificantBits)
            bb.putLong(systemId.leastSignificantBits)
            // data size + data
            bb.putInt(data.size)
            if (data.isNotEmpty()) bb.put(data)
            val arr = bb.array()
            return Base64.encodeToString(arr, Base64.NO_WRAP)
        }

        val clearKeyUuid = UUID.fromString(CLEARKEY_UUID_STR)
        val psshB64 = buildPsshV0Base64(clearKeyUuid)

        val defaultKidAttr = kidUuid?.let { """ cenc:default_KID="$it"""" } ?: ""

        val mp4Protection = if (kidUuid.isNullOrBlank()) {
            """<ContentProtection schemeIdUri="$MP4PROTECTION_SCHEME" value="cenc" />"""
        } else {
            """<ContentProtection schemeIdUri="$MP4PROTECTION_SCHEME" value="cenc" $defaultKidAttr />"""
        }

        val clearKeyCP = """
<ContentProtection schemeIdUri="$CLEARKEY_URN" value="ClearKey1.0">
  <cenc:pssh>$psshB64</cenc:pssh>
</ContentProtection>
        """.trimIndent()

        // Insert both protections right after every <AdaptationSet ...> opening tag
        return xml.replace(
            Regex("(?is)(<AdaptationSet[^>]*>)")
        ) { m ->
            val open = m.groupValues[1]
            "$open\n      $mp4Protection\n      $clearKeyCP"
        }
    }

    /**
     * Ensure ClearKey CP exists in VIDEO AdaptationSet only. Also ensure a usable SchemeData exists:
     * - When kidUuid is known and the VIDEO block lacks <cenc:pssh>, inject a ClearKey CP with a valid PSSH v1 (includes that KID).
     * - If ClearKey CP is missing on VIDEO, inject it (with pssh when kidUuid != null, else self-closing).
     */
    private fun ensureClearKeyOnVideoAdaptationSets(xml: String, kidUuid: String?): String {
        val defaultKidAttr = kidUuid?.let { """ cenc:default_KID="$it"""" } ?: ""

        fun buildPsshV1Base64ForKid(kidUuid: String): String {
            // PSSH v1 with one KID (ClearKey systemId)
            val systemId = UUID.fromString(CLEARKEY_UUID_STR)
            val kid = UUID.fromString(kidUuid)
            val version = 1
            val flags = 0
            val kidCount = 1
            val dataSize = 0
            val totalSize =
                4 + // size
                4 + // 'pssh'
                4 + // version+flags
                16 + // systemId
                4 + // KID_count
                16 * kidCount + // KIDs
                4 + // data_size
                dataSize // data
            val bb = ByteBuffer.allocate(totalSize).order(ByteOrder.BIG_ENDIAN)
            // size
            bb.putInt(totalSize)
            // 'pssh'
            bb.put('p'.code.toByte()); bb.put('s'.code.toByte()); bb.put('s'.code.toByte()); bb.put('h'.code.toByte())
            // version + flags
            bb.put(((version and 0xFF)).toByte())
            bb.put(((flags shr 16) and 0xFF).toByte())
            bb.put(((flags shr 8) and 0xFF).toByte())
            bb.put((flags and 0xFF).toByte())
            // systemId
            bb.putLong(systemId.mostSignificantBits)
            bb.putLong(systemId.leastSignificantBits)
            // KID_count
            bb.putInt(kidCount)
            // KID
            bb.putLong(kid.mostSignificantBits)
            bb.putLong(kid.leastSignificantBits)
            // data_size + data (empty)
            bb.putInt(dataSize)
            return Base64.encodeToString(bb.array(), Base64.NO_WRAP)
        }

        val clearKeySelfClosing = """<ContentProtection schemeIdUri="$CLEARKEY_URN"$defaultKidAttr />"""

        val sb = StringBuilder(xml.length + 2048)
        var cursor = 0
        while (true) {
            val start = xml.indexOf("<AdaptationSet", cursor)
            if (start == -1) {
                sb.append(xml.substring(cursor))
                break
            }
            val openEnd = xml.indexOf('>', start)
            if (openEnd == -1) {
                sb.append(xml.substring(cursor))
                break
            }
            val close = xml.indexOf("</AdaptationSet>", openEnd + 1)
            if (close == -1) {
                // Malformed - append rest and stop
                sb.append(xml.substring(cursor))
                break
            }

            // Determine if this is VIDEO AdaptationSet
            val openingTag = xml.substring(start, openEnd + 1)
            val isVideo = openingTag.contains(Regex("""mimeType\s*=\s*"\s*video/""", RegexOption.IGNORE_CASE)) ||
                          openingTag.contains(Regex("""contentType\s*=\s*"\s*video""", RegexOption.IGNORE_CASE))

            // Append up to and including the end of the opening tag
            sb.append(xml.substring(cursor, openEnd + 1))

            val block = xml.substring(openEnd + 1, close)

            if (isVideo) {
                val hasClearKey = block.contains(CLEARKEY_UUID_STR, ignoreCase = true)
                val hasPssh = block.contains("<cenc:pssh", ignoreCase = true)

                if (!hasClearKey) {
                    // Inject ClearKey CP at the start of the VIDEO block
                    if (!kidUuid.isNullOrBlank()) {
                        val pssh = buildPsshV1Base64ForKid(kidUuid)
                        val cp = """
<ContentProtection schemeIdUri="$CLEARKEY_URN" value="ClearKey1.0">
  <cenc:pssh>$pssh</cenc:pssh>
</ContentProtection>
                        """.trimIndent()
                        sb.append("\n      ").append(cp).append("\n")
                    } else {
                        sb.append("\n      ").append(clearKeySelfClosing).append("\n")
                    }
                } else if (!hasPssh && !kidUuid.isNullOrBlank()) {
                    // ClearKey exists but lacks pssh; add a ClearKey CP with proper pssh to satisfy Exo
                    val pssh = buildPsshV1Base64ForKid(kidUuid)
                    val cp = """
<ContentProtection schemeIdUri="$CLEARKEY_URN" value="ClearKey1.0">
  <cenc:pssh>$pssh</cenc:pssh>
</ContentProtection>
                    """.trimIndent()
                    sb.append("\n      ").append(cp).append("\n")
                }
            }

            // Append the rest of the block and the closing tag
            sb.append(block)
            sb.append("</AdaptationSet>")

            cursor = close + "</AdaptationSet>".length
        }

        return sb.toString()
    }

    /**
     * CRITICAL FIX: Ensure ClearKey ContentProtection exists on all video Representation elements.
     * This is required for quality switching to work properly with DRM content.
     * When ExoPlayer switches between video tracks, it needs to find the DRM scheme data
     * for each specific Representation, not just the AdaptationSet.
     */
    private fun ensureClearKeyOnVideoRepresentations(xml: String, kidUuid: String?): String {
        if (kidUuid == null) {
            println("🔍 ensureClearKeyOnVideoRepresentations: No KID UUID provided - skipping")
            return xml
        }
        
        println("🔍 ensureClearKeyOnVideoRepresentations: Starting with KID UUID: $kidUuid")
        
        fun buildPsshV1Base64ForKid(kidUuid: String): String {
            // PSSH v1 with one KID (ClearKey systemId)
            val systemId = UUID.fromString(CLEARKEY_UUID_STR)
            val kid = UUID.fromString(kidUuid)
            val version = 1
            val flags = 0
            val kidCount = 1
            val dataSize = 0
            val totalSize =
                4 + // size
                4 + // 'pssh'
                4 + // version+flags
                16 + // systemId
                4 + // KID_count
                16 * kidCount + // KIDs
                4 + // data_size
                dataSize // data
            val bb = ByteBuffer.allocate(totalSize).order(ByteOrder.BIG_ENDIAN)
            // size
            bb.putInt(totalSize)
            // 'pssh'
            bb.put('p'.code.toByte()); bb.put('s'.code.toByte()); bb.put('s'.code.toByte()); bb.put('h'.code.toByte())
            // version + flags
            bb.put(((version and 0xFF)).toByte())
            bb.put(((flags shr 16) and 0xFF).toByte())
            bb.put(((flags shr 8) and 0xFF).toByte())
            bb.put((flags and 0xFF).toByte())
            // systemId
            bb.putLong(systemId.mostSignificantBits)
            bb.putLong(systemId.leastSignificantBits)
            // KID_count
            bb.putInt(kidCount)
            // KID
            bb.putLong(kid.mostSignificantBits)
            bb.putLong(kid.leastSignificantBits)
            // data_size + data (empty)
            bb.putInt(dataSize)
            return Base64.encodeToString(bb.array(), Base64.NO_WRAP)
        }

        val defaultKidAttr = """ cenc:default_KID="$kidUuid""""
        val clearKeySelfClosing = """<ContentProtection schemeIdUri="$CLEARKEY_URN"$defaultKidAttr />"""

        val sb = StringBuilder(xml.length + 8192)
        var cursor = 0
        var videoAdaptationSetsProcessed = 0
        var representationsProcessed = 0
        
        while (true) {
            // Find video AdaptationSet
            val adaptationSetStart = xml.indexOf("<AdaptationSet", cursor)
            if (adaptationSetStart == -1) {
                sb.append(xml.substring(cursor))
                break
            }
            
            val adaptationSetOpenEnd = xml.indexOf('>', adaptationSetStart)
            if (adaptationSetOpenEnd == -1) {
                sb.append(xml.substring(cursor))
                break
            }
            
            val adaptationSetClose = xml.indexOf("</AdaptationSet>", adaptationSetOpenEnd + 1)
            if (adaptationSetClose == -1) {
                sb.append(xml.substring(cursor))
                break
            }

            // Check if this is a video AdaptationSet
            val adaptationSetOpeningTag = xml.substring(adaptationSetStart, adaptationSetOpenEnd + 1)
            val isVideoAdaptationSet = adaptationSetOpeningTag.contains(Regex("""mimeType\s*=\s*"\s*video/""", RegexOption.IGNORE_CASE)) ||
                                      adaptationSetOpeningTag.contains(Regex("""contentType\s*=\s*"\s*video""", RegexOption.IGNORE_CASE))

            if (!isVideoAdaptationSet) {
                // Not a video AdaptationSet, copy as-is and continue
                sb.append(xml.substring(cursor, adaptationSetClose + "</AdaptationSet>".length))
                cursor = adaptationSetClose + "</AdaptationSet>".length
                continue
            }

            videoAdaptationSetsProcessed++
            println("🔍 Processing VIDEO AdaptationSet #$videoAdaptationSetsProcessed")

            // This is a video AdaptationSet, process all Representations within it
            sb.append(xml.substring(cursor, adaptationSetOpenEnd + 1))
            
            val adaptationSetContent = xml.substring(adaptationSetOpenEnd + 1, adaptationSetClose)
            var adaptationSetCursor = 0
            val modifiedContent = StringBuilder(adaptationSetContent.length + 4096)
            
            while (true) {
                // Find Representation within this AdaptationSet
                val repStart = adaptationSetContent.indexOf("<Representation", adaptationSetCursor)
                if (repStart == -1) {
                    modifiedContent.append(adaptationSetContent.substring(adaptationSetCursor))
                    break
                }
                
                val repOpenEnd = adaptationSetContent.indexOf('>', repStart)
                if (repOpenEnd == -1) {
                    modifiedContent.append(adaptationSetContent.substring(adaptationSetCursor))
                    break
                }
                
                val repClose = adaptationSetContent.indexOf("</Representation>", repOpenEnd + 1)
                if (repClose == -1) {
                    // Self-closing Representation: expand to open/close and inject ClearKey CP
                    val repStart = repStart
                    val openTag = adaptationSetContent.substring(repStart, repOpenEnd + 1)
                    val normalizedOpen = openTag.replace(Regex("/>\\s*$"), ">")

                    // Copy content up to the start of this Representation
                    modifiedContent.append(adaptationSetContent.substring(adaptationSetCursor, repStart))

                    // Build CP with PSSH for this Representation
                    val pssh = buildPsshV1Base64ForKid(kidUuid)
                    val cp = """
<ContentProtection schemeIdUri="$CLEARKEY_URN" value="ClearKey1.0" cenc:default_KID="$kidUuid">
  <cenc:pssh>$pssh</cenc:pssh>
</ContentProtection>
                    """.trimIndent()

                    // Emit expanded Representation with injected CP
                    modifiedContent.append(normalizedOpen)
                    modifiedContent.append("\n        ").append(cp).append("\n</Representation>")

                    representationsProcessed++
                    // Advance cursor past the self-closing '>'
                    adaptationSetCursor = repOpenEnd + 1
                    continue
                }

                representationsProcessed++
                println("🔍 Processing Representation #$representationsProcessed")

                // Copy content up to representation opening tag
                modifiedContent.append(adaptationSetContent.substring(adaptationSetCursor, repOpenEnd + 1))
                
                val repContent = adaptationSetContent.substring(repOpenEnd + 1, repClose)
                
                // Check if this Representation already has ClearKey ContentProtection
                val hasClearKey = repContent.contains(CLEARKEY_UUID_STR, ignoreCase = true)
                
                if (!hasClearKey) {
                    // FORCE INJECT ClearKey ContentProtection at the start of this Representation
                    val pssh = buildPsshV1Base64ForKid(kidUuid)
                    val cp = """
<ContentProtection schemeIdUri="$CLEARKEY_URN" value="ClearKey1.0" cenc:default_KID="$kidUuid">
  <cenc:pssh>$pssh</cenc:pssh>
</ContentProtection>
                    """.trimIndent()
                    modifiedContent.append("\n        ").append(cp).append("\n")
                    println("🔍 ✅ FORCE INJECTED ClearKey CP with default_KID=$kidUuid into Representation #$representationsProcessed")
                } else {
                    println("🔍 ℹ️ Representation #$representationsProcessed already has ClearKey")
                }
                
                // Append the rest of the representation content and closing tag
                modifiedContent.append(repContent)
                modifiedContent.append("</Representation>")
                
                adaptationSetCursor = repClose + "</Representation>".length
            }
            
            sb.append(modifiedContent.toString())
            sb.append("</AdaptationSet>")
            cursor = adaptationSetClose + "</AdaptationSet>".length
        }
        
        println("🔍 ensureClearKeyOnVideoRepresentations: Processed $videoAdaptationSetsProcessed video AdaptationSets and $representationsProcessed Representations")
        return sb.toString()
    }

    private fun ensureDefaultKidOnClearKey(xml: String, kidUuid: String): String {
        // If ClearKey CP exists but lacks default_KID, inject it
        val re = Regex("(?is)<ContentProtection([^>]*?schemeIdUri\\s*=\\s*\"[^\"]*${CLEARKEY_UUID_STR}[^\"]*\"[^>]*)>")
        return re.replace(xml) { m ->
            val attrs = m.groupValues[1]
            if (attrs.contains("default_KID")) m.value
            else m.value.replace(attrs, "$attrs cenc:default_KID=\"$kidUuid\"")
        }
    }
}
