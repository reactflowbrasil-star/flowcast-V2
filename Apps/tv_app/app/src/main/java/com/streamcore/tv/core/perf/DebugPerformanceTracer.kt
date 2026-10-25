package com.streamcore.tv.core.perf

import android.os.SystemClock
import com.streamcore.tv.BuildConfig
import timber.log.Timber
import java.util.concurrent.ConcurrentHashMap

/**
 * Debug-only performance tracer used for practical latency checks in TV flows.
 *
 * In release builds this object is a no-op.
 */
object DebugPerformanceTracer {
    private const val TAG = "TVPerf"
    private val starts = ConcurrentHashMap<String, Long>()

    fun interface MetricSink {
        fun onMetric(metric: String, durationMs: Long, attributes: Map<String, String>)
    }

    @Volatile
    private var metricSink: MetricSink? = null

    fun setMetricSink(sink: MetricSink?) {
        if (!BuildConfig.DEBUG) return
        metricSink = sink
    }

    fun start(
        metric: String,
        token: String = "default",
        attributes: Map<String, String> = emptyMap()
    ) {
        if (!BuildConfig.DEBUG) return
        starts[key(metric, token)] = SystemClock.elapsedRealtime()
        Timber.tag(TAG).d("START metric=%s token=%s attrs=%s", metric, token, formatAttrs(attributes))
    }

    fun end(
        metric: String,
        token: String = "default",
        attributes: Map<String, String> = emptyMap()
    ): Long? {
        if (!BuildConfig.DEBUG) return null
        val start = starts.remove(key(metric, token)) ?: return null
        val duration = SystemClock.elapsedRealtime() - start
        Timber.tag(TAG).i(
            "METRIC metric=%s token=%s duration_ms=%d attrs=%s",
            metric,
            token,
            duration,
            formatAttrs(attributes)
        )
        metricSink?.onMetric(metric, duration, attributes + ("token" to token))
        return duration
    }

    fun cancel(metric: String, token: String = "default") {
        if (!BuildConfig.DEBUG) return
        starts.remove(key(metric, token))
    }

    fun mark(metric: String, attributes: Map<String, String> = emptyMap()) {
        if (!BuildConfig.DEBUG) return
        Timber.tag(TAG).d("MARK metric=%s attrs=%s", metric, formatAttrs(attributes))
    }

    private fun key(metric: String, token: String): String = "$metric::$token"

    private fun formatAttrs(attributes: Map<String, String>): String {
        if (attributes.isEmpty()) return "{}"
        return attributes.toSortedMap()
            .entries
            .joinToString(prefix = "{", postfix = "}") { (k, v) -> "$k=$v" }
    }
}
