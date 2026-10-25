package com.streamcore.tv.presentation.player

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.widget.Toast
import androidx.media3.common.C
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.HttpDataSource
import androidx.media3.datasource.TransferListener
import org.w3c.dom.Document
import org.w3c.dom.Element
import org.xml.sax.InputSource
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.StringReader
import java.io.StringWriter
import java.nio.charset.StandardCharsets
import java.util.*
import javax.xml.parsers.DocumentBuilderFactory
import javax.xml.transform.OutputKeys
import javax.xml.transform.TransformerFactory
import javax.xml.transform.dom.DOMSource
import javax.xml.transform.stream.StreamResult
import kotlin.math.min
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import timber.log.Timber

/**
 * DataSource wrapper that intercepts DASH manifest (.mpd) downloads and injects
 * the defaultKID into ContentProtection elements with cenc:default_KID.
 */
@OptIn(UnstableApi::class)
class KidInjectingDataSource {

    companion object {
        fun createFactory(
            baseFactory: DataSource.Factory,
            defaultKID: String?,
            context: Context,
            defaultHeaders: Map<String, String> = emptyMap()
        ): DataSource.Factory {
            return Factory(baseFactory, defaultKID, context, HashMap(defaultHeaders))
        }
    }

    private class Factory(
        private val baseFactory: DataSource.Factory,
        private val defaultKID: String?,
        private val context: Context,
        private val defaultHeaders: MutableMap<String, String>
    ) : DataSource.Factory {

        override fun createDataSource(): DataSource {
            return Impl(baseFactory.createDataSource(), defaultKID, context, defaultHeaders)
        }
    }

    private class Impl(
        private val base: DataSource,
        private val defaultKID: String?,
        private val context: Context,
        private val defaultHeaders: Map<String, String>
    ) : DataSource {

        private var modifiedManifestBytes: ByteArray? = null
        private var currentUri: Uri? = null
        private var bytesReadPos = 0
        private var isManifestRequest = false
        private var open = false
        private var dataDelivered = false
        private var baseOpened = false
        private var hasReadData = false

        override fun open(dataSpec: DataSpec): Long {
            val uriStr = dataSpec.uri.toString()

            // Merge headers: priority to DataSpec headers
            val mergedHeaders = HashMap(defaultHeaders)
            dataSpec.httpRequestHeaders?.let { mergedHeaders.putAll(it) }
            val effectiveSpec = if (mergedHeaders.isNotEmpty()) {
                dataSpec.buildUpon().setHttpRequestHeaders(mergedHeaders).build()
            } else {
                dataSpec
            }

            if (uriStr.lowercase().contains(".mpd") && !defaultKID.isNullOrBlank()) {
                Timber.tag("KidInject")
                    .d("Intercepting MPD for KID injection. uri=%s, defaultKID=%s", uriStr, defaultKID)
                isManifestRequest = true

                try {
                    val original = readAllFromBase(effectiveSpec)
                    val manifest = String(original, StandardCharsets.UTF_8)

                    if (manifest.isBlank()) {
                        showToast("Error: Empty manifest")
                        @Suppress("DEPRECATION")
                        throw HttpDataSource.HttpDataSourceException(
                            "Empty manifest",
                            effectiveSpec,
                            HttpDataSource.HttpDataSourceException.TYPE_READ
                        )
                    }

                    val modified = injectKidIntoManifest(manifest, defaultKID)
                    modifiedManifestBytes = modified.toByteArray(StandardCharsets.UTF_8)
                    bytesReadPos = 0
                    open = true
                    dataDelivered = false
                    baseOpened = false
                    currentUri = effectiveSpec.uri
                    hasReadData = false

                    try {
                        base.close()
                    } catch (ignored: Exception) {}

                    return modifiedManifestBytes!!.size.toLong()

                } catch (ire: HttpDataSource.InvalidResponseCodeException) {
                    // Handle redirects
                    if (ire.responseCode == 302 || ire.responseCode == 301) {
                        val redirect = extractRedirectLocation(ire.headerFields)
                        if (redirect != null) {
                            try {
                                val redirectSpec = DataSpec.Builder()
                                    .setUri(Uri.parse(redirect))
                                    .setHttpRequestHeaders(mergedHeaders)
                                    .build()

                                val redirected = readAllFromBase(redirectSpec)
                                val manifest = String(redirected, StandardCharsets.UTF_8)

                                if (manifest.isBlank()) {
                                    showToast("Error: Empty redirected manifest")
                                    @Suppress("DEPRECATION")
                                    throw HttpDataSource.HttpDataSourceException(
                                        "Empty redirected manifest",
                                        redirectSpec,
                                        HttpDataSource.HttpDataSourceException.TYPE_READ
                                    )
                                }

                                val modified = injectKidIntoManifest(manifest, defaultKID)
                                modifiedManifestBytes = modified.toByteArray(StandardCharsets.UTF_8)
                                bytesReadPos = 0
                                open = true
                                dataDelivered = false
                                currentUri = redirectSpec.uri
                                hasReadData = false

                                return modifiedManifestBytes!!.size.toLong()

                            } catch (e: Exception) {
                                showToast("Error processing redirected manifest: ${e.message}")
                                if (e is HttpDataSource.HttpDataSourceException) throw e
                                @Suppress("DEPRECATION")
                                throw HttpDataSource.HttpDataSourceException(
                                    e.message ?: "Error processing redirected manifest",
                                    effectiveSpec,
                                    HttpDataSource.HttpDataSourceException.TYPE_READ
                                )
                            }
                        }
                    }
                    showToast("HTTP error: ${ire.responseCode}")
                    throw ire
                } catch (e: HttpDataSource.HttpDataSourceException) {
                    showToast("Error processing manifest: ${e.message}")
                    throw e
                } catch (e: Exception) {
                    showToast("Error processing manifest: ${e.message}")
                    @Suppress("DEPRECATION")
                    throw HttpDataSource.HttpDataSourceException(
                        e.message ?: "Error processing manifest",
                        effectiveSpec,
                        HttpDataSource.HttpDataSourceException.TYPE_READ
                    )
                }
            }

            isManifestRequest = false
            dataDelivered = false
            open = true

            try {
                val len = base.open(effectiveSpec)
                baseOpened = true
                currentUri = base.uri ?: effectiveSpec.uri
                return len
            } catch (e: IOException) {
                baseOpened = false
                open = false
                currentUri = null
                throw e
            }
        }

        override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
            if (!open) {
                showToast("Error: DataSource cerrado")
                return C.RESULT_END_OF_INPUT
            }

            if (isManifestRequest && modifiedManifestBytes != null) {
                val remaining = modifiedManifestBytes!!.size - bytesReadPos
                if (remaining <= 0) {
                    dataDelivered = true
                    modifiedManifestBytes = null
                    return C.RESULT_END_OF_INPUT
                }

                val toRead = min(length, remaining)
                System.arraycopy(modifiedManifestBytes!!, bytesReadPos, buffer, offset, toRead)
                bytesReadPos += toRead
                hasReadData = true
                return toRead
            }

            try {
                return base.read(buffer, offset, length)
            } catch (e: HttpDataSource.HttpDataSourceException) {
                // Surface transport errors to ExoPlayer so retry/error policies can react correctly.
                throw e
            }
        }

        override fun getUri(): Uri? {
            return currentUri ?: base.uri
        }

        override fun getResponseHeaders(): MutableMap<String, List<String>> {
            return base.responseHeaders
        }

        override fun close() {
            if (isManifestRequest && !dataDelivered && !hasReadData) {
                showToast("Advertencia: cierre prematuro del manifest")
            }
            
            modifiedManifestBytes = null
            bytesReadPos = 0
            isManifestRequest = false
            open = false
            dataDelivered = false
            hasReadData = false

            if (baseOpened) {
                try {
                    base.close()
                } catch (ignored: Exception) {}
                baseOpened = false
            }
        }

        override fun addTransferListener(transferListener: TransferListener) {
            base.addTransferListener(transferListener)
        }

        private fun readAllFromBase(spec: DataSpec): ByteArray {
            val out = ByteArrayOutputStream(64 * 1024)
            val temp = ByteArray(16 * 1024)

            val ignored = base.open(spec)
            baseOpened = true

            try {
                while (true) {
                    val r = base.read(temp, 0, temp.size)
                    if (r == C.RESULT_END_OF_INPUT) break
                    if (r > 0) out.write(temp, 0, r)
                }
            } finally {
                try {
                    base.close()
                } catch (ignored: Exception) {}
                baseOpened = false
            }

            return out.toByteArray()
        }

        private fun injectKidIntoManifest(manifestContent: String, defaultKID: String): String {
            try {
                val factory = DocumentBuilderFactory.newInstance()
                val builder = factory.newDocumentBuilder()
                val doc: Document

                try {
                    val inputSource = InputSource(StringReader(manifestContent))
                    doc = builder.parse(inputSource)
                } catch (e: org.xml.sax.SAXParseException) {
                    val formattedKid = formatKid(defaultKID)
                    return createMinimalManifest(formattedKid ?: defaultKID)
                }

                doc.documentElement.normalize()
                doc.documentElement.setAttribute("xmlns:cenc", "urn:mpeg:cenc:2013")

                val formattedKid = formatKid(defaultKID) ?: defaultKID

                val adaptationSets = doc.getElementsByTagName("AdaptationSet")
                var kidInjected = false

                for (i in 0 until adaptationSets.length) {
                    val ad = adaptationSets.item(i) as Element
                    val cps = ad.getElementsByTagName("ContentProtection")
                    var cencFound = false

                    for (j in 0 until cps.length) {
                        val cp = cps.item(j) as Element
                        if ("urn:mpeg:dash:mp4protection:2011" == cp.getAttribute("schemeIdUri")) {
                            cp.setAttribute("cenc:default_KID", formattedKid)
                            cencFound = true
                            kidInjected = true
                            break
                        }
                    }

                    if (!cencFound) {
                        val np = doc.createElement("ContentProtection")
                        np.setAttribute("schemeIdUri", "urn:mpeg:dash:mp4protection:2011")
                        np.setAttribute("value", "cenc")
                        np.setAttribute("cenc:default_KID", formattedKid)
                        ad.insertBefore(np, ad.firstChild)
                        kidInjected = true
                    }
                }

                if (!kidInjected) {
                    val periods = doc.getElementsByTagName("Period")
                    if (periods.length == 0) {
                        return createMinimalManifest(formattedKid ?: defaultKID)
                    }

                    val period = periods.item(0) as Element
                    val np = doc.createElement("ContentProtection")
                    np.setAttribute("schemeIdUri", "urn:mpeg:dash:mp4protection:2011")
                    np.setAttribute("value", "cenc")
                    np.setAttribute("cenc:default_KID", formattedKid)
                    period.insertBefore(np, period.firstChild)
                }

                val tf = TransformerFactory.newInstance()
                val t = tf.newTransformer()
                t.setOutputProperty(OutputKeys.OMIT_XML_DECLARATION, "no")
                t.setOutputProperty(OutputKeys.METHOD, "xml")
                t.setOutputProperty(OutputKeys.ENCODING, "UTF-8")

                val sw = StringWriter()
                t.transform(DOMSource(doc), StreamResult(sw))
                return sw.toString()

            } catch (e: Exception) {
                showToast("Error inyectando KID: ${e.message}")
                throw e
            }
        }

        private fun createMinimalManifest(formattedKid: String): String {
            return """<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" xmlns:cenc="urn:mpeg:cenc:2013" profiles="urn:mpeg:dash:profile:isoff-live:2011" minBufferTime="PT2S" type="dynamic">
<Period id="1" start="PT0S">
<AdaptationSet id="1" contentType="video" mimeType="video/mp4" segmentAlignment="true">
<ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc" cenc:default_KID="$formattedKid"/>
<SegmentTemplate timescale="1000" media="segment-${"$"}Number$.m4s" startNumber="1" duration="2000"/>
<Representation id="1" codecs="avc1.64001f" bandwidth="1000000" width="1280" height="720"/>
</AdaptationSet>
<AdaptationSet id="2" contentType="audio" mimeType="audio/mp4" segmentAlignment="true">
<ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc" cenc:default_KID="$formattedKid"/>
<SegmentTemplate timescale="1000" media="audio-${"$"}Number$.m4s" startNumber="1" duration="2000"/>
<Representation id="2" codecs="mp4a.40.2" bandwidth="128000"/>
</AdaptationSet>
</Period>
</MPD>"""
        }

        private fun extractRedirectLocation(headers: Map<String, List<String>>?): String? {
            if (headers == null) return null

            for ((key, values) in headers) {
                if ("Location".equals(key, ignoreCase = true)) {
                    return values.firstOrNull()
                }
            }
            return null
        }

        private fun formatKid(kid: String?): String? {
            try {
                if (kid == null) return null
                val s = kid.trim()
                
                // 1) Already a UUID with hyphens
                if (s.length == 36 && s.indexOf('-') > 0) return s

                // 2) If already a 32-nibble HEX value, keep lowercase format
                val hex = s.replace("-", "").replace("0x", "").trim()
                if (hex.matches(Regex("(?i)[0-9a-f]{32}"))) {
                    return hexToUuidString(hex.lowercase())
                }

                // 3) If 16-byte base64/base64url, convert to HEX for injection
                var b64 = s.replace('-', '+').replace('_', '/')
                while (b64.length % 4 != 0) b64 += "="
                val bytes = Base64.decode(b64, Base64.DEFAULT)
                @Suppress("KotlinConstantConditions")
                if (bytes != null && bytes.size == 16) {
                    return hexToUuidString(bytesToHex(bytes))
                }
            } catch (ignored: Exception) {}
            
            // 4) Fallback: devolver tal cual
            return kid
        }

        private fun bytesToHex(bytes: ByteArray): String {
            val hexArray = "0123456789abcdef".toCharArray()
            val hexChars = CharArray(bytes.size * 2)
            for (j in bytes.indices) {
                val v = bytes[j].toInt() and 0xFF
                hexChars[j * 2] = hexArray[v ushr 4]
                hexChars[j * 2 + 1] = hexArray[v and 0x0F]
            }
            return String(hexChars)
        }

        private fun hexToUuidString(hex: String?): String? {
            if (hex == null) return null
            val clean = hex.replace("-", "")
            if (clean.length != 32) return hex
            return "${clean.substring(0, 8)}-${clean.substring(8, 12)}-${clean.substring(12, 16)}-${clean.substring(16, 20)}-${clean.substring(20)}"
        }

        private fun bytesToUuid(bytes: ByteArray): UUID {
            var msb = 0L
            var lsb = 0L
            for (i in 0 until 8) msb = (msb shl 8) or (bytes[i].toLong() and 0xff)
            for (i in 8 until 16) lsb = (lsb shl 8) or (bytes[i].toLong() and 0xff)
            return UUID(msb, lsb)
        }

        private fun showToast(msg: String) {
            Handler(Looper.getMainLooper()).post {
                Toast.makeText(context, msg, Toast.LENGTH_LONG).show()
            }
        }
    }
}
