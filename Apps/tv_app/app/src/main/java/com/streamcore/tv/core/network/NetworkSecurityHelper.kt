package com.streamcore.tv.core.network

import android.content.Context
import timber.log.Timber
import java.net.URL
import javax.inject.Inject
import javax.inject.Singleton
import okhttp3.Dns
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import org.json.JSONObject
import java.net.InetAddress
import java.net.UnknownHostException
import java.security.SecureRandom
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

/**
 * Network Security Helper
 * 
 * Provides utilities for handling network security configurations
 * and managing cleartext traffic permissions for IPTV streaming.
 */
@Singleton
class NetworkSecurityHelper @Inject constructor(
    private val context: Context
) {
    
    companion object {
        private const val TAG = "NetworkSecurityHelper"
        // Global DoH endpoint (nullable - if null DoH is disabled)
        private var globalDoHEndpoint: String? = null

        /**
         * Applies lenient SSL configuration to an OkHttpClient.Builder.
         * Bypasses certificate validation errors (expired certs, time mismatches, etc.)
         * so that stream playback is not blocked by SSL issues.
         */
        fun applyLenientSsl(builder: OkHttpClient.Builder): OkHttpClient.Builder {
            try {
                val trustManager = object : X509TrustManager {
                    override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
                    override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
                    override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
                }
                val sslContext = SSLContext.getInstance("TLS")
                sslContext.init(null, arrayOf<TrustManager>(trustManager), SecureRandom())
                builder.sslSocketFactory(sslContext.socketFactory, trustManager)
                builder.hostnameVerifier { _, _ -> true }
            } catch (e: Exception) {
                Timber.e(e, "$TAG: Failed to apply lenient SSL config")
            }
            return builder
        }

        /**
         * Set a global DoH endpoint to enable DNS-over-HTTPS across OkHttp clients.
         * Example: "https://cloudflare-dns.com/dns-query" or "https://dns.google/resolve"
         */
        fun setGlobalDoHEndpoint(endpoint: String?) {
            globalDoHEndpoint = endpoint
            Timber.d("$TAG: Global DoH endpoint set to: $endpoint")
        }

        // Common IPTV server IP ranges that typically use HTTP
        private val COMMON_IPTV_IP_RANGES = listOf(
            "92.247.236.", // Current problematic IP range
            "185.59.222.", // Common IPTV range
            "37.187.7.",   // OVH servers
            "51.68.",      // OVH servers
            "149.202.",    // OVH servers
            "151.80.",     // OVH servers
            "178.32.",     // OVH servers
            "188.165.",    // Common streaming range
            "195.154.",    // Online.net servers
            "212.129.",    // Common European range
        )

        /**
         * Configure an OkHttpClient.Builder to use DoH if a DoH endpoint is set.
         * This is safe to call multiple times; if no global DoH endpoint is configured it is a no-op.
         */
        fun configureOkHttpClientBuilder(
            builder: OkHttpClient.Builder,
            dohEndpoint: String? = null
        ) {
            val doh = dohEndpoint?.takeUnless { it.isBlank() } ?: globalDoHEndpoint ?: return
            try {
                // Create a small client to perform DoH queries using system DNS (avoid recursion)
                val dohClient = OkHttpClient.Builder()
                    .dns(Dns.SYSTEM)
                    .build()
                builder.dns(DoHOkHttpDns(dohClient, doh))
                Timber.d("$TAG: Configured OkHttpClient.Builder to use DoH endpoint: $doh")
            } catch (e: Exception) {
                Timber.w(e, "$TAG: Failed to configure DoH on OkHttp builder: ${e.message}")
            }
        }

        /**
         * Simple OkHttp-backed DNS implementation that queries a DoH endpoint
         * using the application/dns-json (Google/Cloudflare) response format.
         *
         * This implementation does a GET to: {dohUrl}?name={host}&type=A
         * and parses the JSON "Answer" array extracting "data" fields (IP strings).
         */
        private class DoHOkHttpDns(private val client: OkHttpClient, private val dohUrl: String) : Dns {
            override fun lookup(hostname: String): List<InetAddress> {
                try {
                    val url = dohUrl.toHttpUrlOrNull()?.newBuilder()
                        ?.addQueryParameter("name", hostname)
                        ?.addQueryParameter("type", "A")
                        ?.build() ?: throw UnknownHostException("Invalid DoH URL: $dohUrl")

                    val request = Request.Builder()
                        .url(url)
                        .addHeader("Accept", "application/dns-json")
                        .get()
                        .build()

                    client.newCall(request).execute().use { resp ->
                        if (!resp.isSuccessful) {
                            Timber.w("DoH query failed for $hostname: HTTP ${resp.code}")
                            throw UnknownHostException("DoH query failed: ${resp.code}")
                        }
                        val body = resp.body?.string() ?: ""
                        if (body.isBlank()) {
                            throw UnknownHostException("Empty DoH response for $hostname")
                        }
                        try {
                            val json = JSONObject(body)
                            val answer = if (json.has("Answer")) json.getJSONArray("Answer") else null
                            val ips = mutableListOf<InetAddress>()
                            if (answer != null) {
                                for (i in 0 until answer.length()) {
                                    val obj = answer.getJSONObject(i)
                                    if (obj.has("data")) {
                                        val data = obj.getString("data")
                                        try {
                                            val addr = InetAddress.getByName(data)
                                            ips.add(addr)
                                        } catch (_: Exception) {
                                            // ignore invalid entries
                                        }
                                    }
                                }
                                if (ips.isNotEmpty()) return ips
                            }
                        } catch (e: Exception) {
                            Timber.w(e, "$TAG: Failed to parse DoH response JSON for $hostname")
                        }
                    }
                } catch (e: Exception) {
                    Timber.w(e, "$TAG: DoH lookup failed for $hostname: ${e.message}")
                }

                // Fallback to system DNS
                try {
                    val system = Dns.SYSTEM.lookup(hostname)
                    if (system.isNotEmpty()) return system
                } catch (e: Exception) {
                    Timber.w(e, "$TAG: System DNS fallback failed for $hostname: ${e.message}")
                }

                throw UnknownHostException("Failed to resolve host: $hostname")
            }
        }
    }
    
    /**
     * Check if a URL is likely to have cleartext traffic issues
     */
    fun isLikelyCleartextUrl(url: String): Boolean {
        try {
            val urlObj = URL(url)
            
            // Check if it's HTTP (not HTTPS)
            if (urlObj.protocol.equals("http", ignoreCase = true)) {
                val host = urlObj.host
                
                // Check if it's an IP address in common IPTV ranges
                if (isIpInCommonRange(host)) {
                    Timber.d("$TAG: URL $url is likely to have cleartext issues (IP: $host)")
                    return true
                }
                
                // Check if it's a non-standard domain
                if (isNonStandardDomain(host)) {
                    Timber.d("$TAG: URL $url might have cleartext issues (domain: $host)")
                    return true
                }
            }
            
            return false
        } catch (e: Exception) {
            Timber.w("$TAG: Error checking URL $url: ${e.message}")
            return false
        }
    }
    
    /**
     * Check if an IP is in common IPTV server ranges
     */
    private fun isIpInCommonRange(host: String): Boolean {
        // Check if it's an IP address (simple check)
        if (!host.matches(Regex("\\d+\\.\\d+\\.\\d+\\.\\d+"))) {
            return false
        }
        
        return COMMON_IPTV_IP_RANGES.any { range ->
            host.startsWith(range)
        }
    }
    
    /**
     * Check if a domain is non-standard (might be a custom IPTV server)
     */
    private fun isNonStandardDomain(host: String): Boolean {
        // Skip well-known domains
        val wellKnownDomains = listOf(
            "youtube.com", "google.com", "facebook.com", "twitter.com",
            "netflix.com", "amazon.com", "microsoft.com", "apple.com",
            "clarovideo.com", "hulu.com", "disney.com"
        )
        
        return wellKnownDomains.none { domain ->
            host.endsWith(domain)
        }
    }
    
    /**
     * Get recommended headers for IPTV streaming
     */
    fun getRecommendedHeaders(): Map<String, String> {
        return mapOf(
            "User-Agent" to "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36",
            "Accept" to "*/*",
            "Accept-Language" to "en,es;q=0.9",
            "Connection" to "keep-alive",
            "Cache-Control" to "no-cache"
        )
    }
    
    /**
     * Log network security information for debugging
     */
    fun logNetworkSecurityInfo(url: String) {
        try {
            val urlObj = URL(url)
            Timber.d("$TAG: Analyzing URL: $url")
            Timber.d("$TAG: Protocol: ${urlObj.protocol}")
            Timber.d("$TAG: Host: ${urlObj.host}")
            Timber.d("$TAG: Port: ${urlObj.port}")
            Timber.d("$TAG: Is likely cleartext issue: ${isLikelyCleartextUrl(url)}")
        } catch (e: Exception) {
            Timber.w("$TAG: Error analyzing URL $url: ${e.message}")
        }
    }
    
    /**
     * Extract IP from URL for logging purposes
     */
    fun extractIpFromUrl(url: String): String? {
        try {
            val urlObj = URL(url)
            val host = urlObj.host
            
            // Check if it's already an IP
            if (host.matches(Regex("\\d+\\.\\d+\\.\\d+\\.\\d+"))) {
                return host
            }
            
            return null
        } catch (e: Exception) {
            Timber.w("$TAG: Error extracting IP from URL $url: ${e.message}")
            return null
        }
    }
}
