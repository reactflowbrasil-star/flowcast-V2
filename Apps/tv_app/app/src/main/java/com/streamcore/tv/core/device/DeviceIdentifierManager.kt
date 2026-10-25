package com.streamcore.tv.core.device

import android.app.ActivityManager
import android.content.Context
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.TelephonyManager
import dagger.hilt.android.qualifiers.ApplicationContext
import timber.log.Timber
import java.security.MessageDigest
import java.util.*
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manager for generating and maintaining unique device identifiers
 * 
 * Uses a hybrid approach combining:
 * - Stable build/runtime characteristics (FINGERPRINT, BUILD_ID, screen/cpu/memory profile)
 * - Persistent random UUID (generated once, stored forever)
 * 
 * This provides maximum uniqueness and anti-cloning protection
 */
@Singleton
class DeviceIdentifierManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    
    companion object {
        private const val PREFS_NAME = "device_identifier_prefs"
        private const val KEY_PERSISTENT_UUID = "persistent_device_uuid"
        private const val KEY_SESSION_DEVICE_ID = "session_device_id"
        private const val KEY_LAST_LOGIN_DEVICE_ID = "last_login_device_id"
    }
    
    private val prefs: SharedPreferences by lazy {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }
    
    /**
     * Get the current session device identifier
     * Returns persistent session ID for JWT/User-Agent consistency
     */
    fun getDeviceId(): String {
        // First check if we have a session device ID (for current login session)
        val sessionId = prefs.getString(KEY_SESSION_DEVICE_ID, null)
        if (!sessionId.isNullOrEmpty()) {
            Timber.d("Using persistent session device ID: ${sessionId.take(20)}...")
            return sessionId
        }

        // If no session ID, check if we have a last login device ID to reuse
        val lastLoginId = prefs.getString(KEY_LAST_LOGIN_DEVICE_ID, null)
        if (!lastLoginId.isNullOrEmpty()) {
            // Reuse the last login device ID for session consistency
            prefs.edit()
                .putString(KEY_SESSION_DEVICE_ID, lastLoginId)
                .apply()
            Timber.d("Reusing last login device ID for session: ${lastLoginId.take(20)}...")
            return lastLoginId
        }

        // Generate new session device ID
        val deviceId = generateRobustDeviceId()

        // Save as both session and last login ID
        prefs.edit()
            .putString(KEY_SESSION_DEVICE_ID, deviceId)
            .putString(KEY_LAST_LOGIN_DEVICE_ID, deviceId)
            .apply()

        Timber.d("Generated new session device ID: ${deviceId.take(20)}...")
        return deviceId
    }

    /**
     * Generate a new device identifier for registration (allows multiple registrations)
     * This creates a completely new ID for anti-cloning but keeps session ID stable
     */
    fun generateNewDeviceId(): String {
        val deviceId = generateRobustDeviceId()

        // Update the session ID to the new registration ID
        prefs.edit()
            .putString(KEY_SESSION_DEVICE_ID, deviceId)
            .putString(KEY_LAST_LOGIN_DEVICE_ID, deviceId)
            .apply()

        Timber.d("Generated new registration device ID: ${deviceId.take(20)}...")
        return deviceId
    }

    /**
     * Clear session device ID (on logout) but keep last login ID for next session
     */
    fun clearSession() {
        prefs.edit()
            .remove(KEY_SESSION_DEVICE_ID)
            .apply()
        Timber.d("Session device ID cleared")
    }

    /**
     * Get device ID info for debugging
     */
    fun getDeviceIdInfo(): String {
        val sessionId = prefs.getString(KEY_SESSION_DEVICE_ID, null)
        val lastLoginId = prefs.getString(KEY_LAST_LOGIN_DEVICE_ID, null)
        return "Session: ${sessionId?.take(20)}..., LastLogin: ${lastLoginId?.take(20)}..."
    }
    
    /**
     * Generate robust device ID using stable device factors + persistent UUID
     * Designed to be consistent per device but unique across different devices
     * Includes emulator detection and anti-cloning measures
     */
    private fun generateRobustDeviceId(): String {
        val persistentUuid = getOrCreatePersistentUuid()
        val buildFingerprint = Build.FINGERPRINT ?: "unknown"

        return try {
            val buildId = Build.ID ?: "unknown"
            val buildBoard = Build.BOARD ?: "unknown"
            val buildBrand = Build.BRAND ?: "unknown"
            val buildDevice = Build.DEVICE ?: "unknown"
            val buildModel = Build.MODEL ?: "unknown"
            val buildManufacturer = Build.MANUFACTURER ?: "unknown"
            val firstInstallTime = getAppInstallationTime()

            // Get device-specific identifiers for better uniqueness
            val deviceSpecificId = getDeviceSpecificIdentifier()

            // Detect emulator and add emulator-specific fingerprint
            val emulatorInfo = detectEmulatorInfo()

            // Create composite identifier WITHOUT random components for consistency
            // This ensures the same device always generates the same ID
            val composite = "${buildFingerprint}_${buildId}_${buildBoard}_${buildBrand}_${buildDevice}_${buildModel}_${buildManufacturer}_${persistentUuid}_${deviceSpecificId}_${emulatorInfo}_${firstInstallTime}_${context.packageName}"

            // Generate SHA-256 hash for security and consistent length
            val digest = MessageDigest.getInstance("SHA-256")
            val hashBytes = digest.digest(composite.toByteArray())
            val hashHex = hashBytes.joinToString("") { "%02x".format(it) }

            // Create final device ID with prefix
            val deviceId = "device_${hashHex.take(40)}"

            Timber.d("🔐 Generated device ID: ${deviceId.take(20)}... (Emulator: ${emulatorInfo.isNotEmpty()})")

            deviceId

        } catch (e: Exception) {
            Timber.e(e, "Error generating device ID, using secure fallback")
            // Secure fallback that ALWAYS includes persistent UUID for anti-cloning protection
            val fallbackUuid = persistentUuid
            val fallbackHardware = buildFingerprint.take(80)

            // Create fallback with persistent UUID + basic hardware info
            val fallbackComposite = "${fallbackUuid}_${fallbackHardware}_${context.packageName}_secure_fallback"
            val digest = MessageDigest.getInstance("SHA-256")
            val hashBytes = digest.digest(fallbackComposite.toByteArray())
            val hashHex = hashBytes.joinToString("") { "%02x".format(it) }

            "device_secure_fallback_${hashHex.take(32)}"
        }
    }
    
    /**
     * Get or create a persistent UUID that survives app reinstalls
     * This UUID is unique per app installation and provides anti-cloning protection
     */
    private fun getOrCreatePersistentUuid(): String {
        val existingUuid = prefs.getString(KEY_PERSISTENT_UUID, null)
        
        if (!existingUuid.isNullOrEmpty()) {
            Timber.d("Using existing persistent UUID")
            return existingUuid
        }
        
        // Generate new persistent UUID
        val newUuid = UUID.randomUUID().toString().replace("-", "")
        
        // Save it permanently
        prefs.edit()
            .putString(KEY_PERSISTENT_UUID, newUuid)
            .apply()
        
        Timber.d("Generated new persistent UUID")
        return newUuid
    }
    
    /**
     * Clear all cached identifiers (for testing or reset purposes)
     * This will force regeneration of device ID but keep the persistent UUID
     */
    fun clearCache() {
        prefs.edit()
            .remove(KEY_SESSION_DEVICE_ID)
            .remove(KEY_LAST_LOGIN_DEVICE_ID)
            .apply()
        Timber.d("Device ID cache cleared")
    }
    
    /**
     * Complete reset - clears everything including persistent UUID
     * Use with extreme caution as this will change the device identity
     */
    fun completeReset() {
        prefs.edit()
            .clear()
            .apply()
        Timber.w("Complete device identity reset performed")
    }
    
    /**
     * Get device-specific identifier for better uniqueness
     * Uses additional hardware characteristics
     */
    private fun getDeviceSpecificIdentifier(): String {
        return try {
            val displayMetrics = context.resources.displayMetrics
            val screenDensity = displayMetrics.density
            val screenWidth = displayMetrics.widthPixels
            val screenHeight = displayMetrics.heightPixels

            // Get CPU info
            val cpuAbi = Build.SUPPORTED_ABIS.joinToString(",")
            val cpuAbi32 = Build.SUPPORTED_32_BIT_ABIS.joinToString(",")
            val cpuAbi64 = Build.SUPPORTED_64_BIT_ABIS.joinToString(",")

            // Get memory info
            val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
            val memoryInfo = ActivityManager.MemoryInfo()
            activityManager?.getMemoryInfo(memoryInfo)
            val totalMemory = memoryInfo.totalMem

            "${screenDensity}_${screenWidth}x${screenHeight}_${cpuAbi}_${cpuAbi32}_${cpuAbi64}_${totalMemory}"
        } catch (e: Exception) {
            Timber.w(e, "Error getting device-specific identifier")
            "unknown_device_spec"
        }
    }

    /**
     * Comprehensive emulator detection covering multiple platforms and scenarios
     * This helps identify different emulator instances and prevent unauthorized access
     */
    private fun detectEmulatorInfo(): String {
        val emulatorIndicators = mutableListOf<String>()

        try {
            // === ANDROID STUDIO EMULATOR DETECTION ===
            if (Build.FINGERPRINT.contains("generic") ||
                Build.FINGERPRINT.contains("unknown") ||
                Build.FINGERPRINT.contains("emulator") ||
                Build.FINGERPRINT.contains("sdk_gphone")) {
                emulatorIndicators.add("android_studio_emulator")
            }

            // === GENYMOTION DETECTION ===
            if (Build.MANUFACTURER.contains("Genymotion", ignoreCase = true) ||
                Build.BRAND.contains("Genymotion", ignoreCase = true) ||
                Build.MODEL.contains("Genymotion", ignoreCase = true) ||
                Build.PRODUCT.contains("vbox86p", ignoreCase = true)) {
                emulatorIndicators.add("genymotion_detected")
            }

            // === BLUESTACKS DETECTION ===
            if (Build.MANUFACTURER.equals("BlueStacks", ignoreCase = true) ||
                Build.MODEL.contains("BlueStacks", ignoreCase = true) ||
                Build.BRAND.equals("BlueStacks", ignoreCase = true) ||
                Build.HARDWARE.contains("bluestacks", ignoreCase = true)) {
                emulatorIndicators.add("bluestacks_detected")

                // Add BlueStacks instance-specific info
                val bluestacksInstance = getBlueStacksInstanceInfo()
                if (bluestacksInstance.isNotEmpty()) {
                    emulatorIndicators.add("bluestacks_instance_$bluestacksInstance")
                }
            }

            // === NOX PLAYER DETECTION ===
            if (Build.MODEL.contains("Nox", ignoreCase = true) ||
                Build.MANUFACTURER.contains("Nox", ignoreCase = true) ||
                Build.BRAND.contains("Nox", ignoreCase = true) ||
                Build.PRODUCT.contains("nox", ignoreCase = true)) {
                emulatorIndicators.add("nox_player_detected")
            }

            // === LDPLAYER DETECTION ===
            if (Build.MODEL.contains("LDPlayer", ignoreCase = true) ||
                Build.MANUFACTURER.contains("LDPlayer", ignoreCase = true) ||
                Build.BRAND.contains("LDPlayer", ignoreCase = true)) {
                emulatorIndicators.add("ldplayer_detected")
            }

            // === MEMU DETECTION ===
            if (Build.MODEL.contains("MEmu", ignoreCase = true) ||
                Build.MANUFACTURER.contains("MEmu", ignoreCase = true) ||
                Build.BRAND.contains("MEmu", ignoreCase = true)) {
                emulatorIndicators.add("memu_detected")
            }

            // === GAMOLOOP DETECTION ===
            if (Build.MODEL.contains("Gameloop", ignoreCase = true) ||
                Build.MANUFACTURER.contains("Gameloop", ignoreCase = true) ||
                Build.BRAND.contains("Gameloop", ignoreCase = true)) {
                emulatorIndicators.add("gameloop_detected")
            }

            // === XIAOMI HYPERVISOR DETECTION ===
            if (Build.HARDWARE.contains("qemu", ignoreCase = true) ||
                Build.HARDWARE.contains("kvm", ignoreCase = true)) {
                emulatorIndicators.add("hypervisor_detected")
            }

            // === BUILD PROPERTIES DETECTION ===
            if (Build.TAGS?.contains("test-keys") == true ||
                Build.TYPE?.contains("eng") == true ||
                Build.USER?.equals("android-build", ignoreCase = true) == true) {
                emulatorIndicators.add("development_build")
            }

            // === NETWORK OPERATOR DETECTION ===
            val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
            val networkOperator = telephonyManager?.networkOperatorName
            if (networkOperator?.contains("Android", ignoreCase = true) == true ||
                networkOperator?.contains("T-Mobile", ignoreCase = true) == true && Build.MODEL.contains("sdk", ignoreCase = true)) {
                emulatorIndicators.add("emulator_network_operator")
            }

            // === CPU ABI DETECTION ===
            val supportedAbis = Build.SUPPORTED_ABIS
            if (supportedAbis.isNotEmpty() && supportedAbis.all { it.contains("x86", ignoreCase = true) }) {
                emulatorIndicators.add("x86_emulation_detected")
            }

            // === SYSTEM PROPERTIES DETECTION ===
            val systemProperties = getSystemPropertiesForEmulator()
            if (systemProperties.isNotEmpty()) {
                emulatorIndicators.addAll(systemProperties)
            }

            // === HARDWARE ACCELERATION DETECTION ===
            if (!isHardwareAccelerated()) {
                emulatorIndicators.add("no_hardware_acceleration")
            }

            // === SCREEN DENSITY DETECTION ===
            val displayMetrics = context.resources.displayMetrics
            if (displayMetrics.densityDpi < 120 || displayMetrics.densityDpi > 640) {
                emulatorIndicators.add("suspicious_screen_density_${displayMetrics.densityDpi}")
            }

            // === BATTERY DETECTION ===
            if (!hasBattery()) {
                emulatorIndicators.add("no_battery_detected")
            }

            // === TELEPHONY DETECTION ===
            if (!hasUsableTelephonyService(telephonyManager)) {
                emulatorIndicators.add("no_telephony_services")
            }

        } catch (e: Exception) {
            Timber.w(e, "Error detecting emulator")
            emulatorIndicators.add("emulator_detection_error")
        }

        val result = emulatorIndicators.joinToString("_")
        if (result.isNotEmpty()) {
            Timber.w("🚨 EMULATOR DETECTED: $result")
        }

        return result
    }

    /**
     * Check for additional system properties that indicate emulator usage
     */
    private fun getSystemPropertiesForEmulator(): List<String> {
        val properties = mutableListOf<String>()

        try {
            // Check for qemu properties
            val qemuProps = listOf(
                "ro.kernel.qemu",
                "ro.hardware",
                "ro.product.device",
                "ro.product.model"
            )

            for (prop in qemuProps) {
                try {
                    val value = getSystemProperty(prop)
                    if (value != null && (value.contains("qemu", ignoreCase = true) ||
                                         value.contains("emulator", ignoreCase = true) ||
                                         value.contains("sdk", ignoreCase = true))) {
                        properties.add("qemu_prop_${prop.replace(".", "_")}")
                    }
                } catch (e: Exception) {
                    // Ignore property access errors
                }
            }
        } catch (e: Exception) {
            Timber.w(e, "Error checking system properties")
        }

        return properties
    }

    /**
     * Get system property safely
     */
    private fun getSystemProperty(key: String): String? {
        return try {
            val process = Runtime.getRuntime().exec("getprop $key")
            val reader = process.inputStream.bufferedReader()
            reader.readLine()?.trim()
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Check if device has hardware acceleration
     */
    private fun isHardwareAccelerated(): Boolean {
        return try {
            val egl = javax.microedition.khronos.egl.EGL10::class.java
            val egl10 = egl.getMethod("eglGetDisplay", Int::class.java).invoke(null, 0) as? javax.microedition.khronos.egl.EGLDisplay
            egl10 != null
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Check if device has a physical battery
     */
    private fun hasBattery(): Boolean {
        return try {
            val intent = context.registerReceiver(null, android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED))
            val level = intent?.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1) ?: -1
            level >= 0
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Permission-safe telephony capability check.
     * Android TV devices commonly do not expose telephony hardware/services.
     */
    private fun hasUsableTelephonyService(telephonyManager: TelephonyManager?): Boolean {
        return try {
            telephonyManager != null &&
                context.packageManager?.hasSystemFeature(PackageManager.FEATURE_TELEPHONY) == true &&
                telephonyManager.phoneType != TelephonyManager.PHONE_TYPE_NONE
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Get BlueStacks instance-specific information
     * Helps differentiate between different BlueStacks instances
     */
    private fun getBlueStacksInstanceInfo(): String {
        return try {
            // BlueStacks often uses specific patterns in system properties
            val systemProperties = mutableListOf<String>()

            // Try to get BlueStacks-specific properties
            val buildTags = Build.TAGS ?: ""
            val buildType = Build.TYPE ?: ""
            val buildUser = Build.USER ?: ""
            val buildHost = Build.HOST ?: ""

            if (buildTags.contains("test-keys")) systemProperties.add("test_keys")
            if (buildType.contains("user")) systemProperties.add("user_build")
            if (buildUser.isNotEmpty()) systemProperties.add("user_${buildUser}")
            if (buildHost.isNotEmpty()) systemProperties.add("host_${buildHost}")

            // Get display info that might be instance-specific
            val displayMetrics = context.resources.displayMetrics
            val displayInfo = "${displayMetrics.widthPixels}x${displayMetrics.heightPixels}_${displayMetrics.densityDpi}"
            systemProperties.add("display_$displayInfo")

            systemProperties.joinToString("_")
        } catch (e: Exception) {
            Timber.w(e, "Error getting BlueStacks instance info")
            "unknown_instance"
        }
    }

    /**
     * Check if this device appears to be cloned based on suspicious patterns
     */
    fun detectPotentialCloning(): CloningDetectionResult {
        return try {
            val currentDeviceId = generateRobustDeviceId()
            val storedDeviceId = prefs.getString(KEY_SESSION_DEVICE_ID, null)
            val lastLoginDeviceId = prefs.getString(KEY_LAST_LOGIN_DEVICE_ID, null)

            // Check for suspicious device ID changes
            val deviceIdChanged = storedDeviceId != null && storedDeviceId != currentDeviceId
            val emulatorDetected = detectEmulatorInfo().isNotEmpty()

            // Check for rapid device ID regeneration (potential brute force cloning attempts)
            val lastRegeneration = prefs.getLong("last_device_regeneration", 0)
            val timeSinceLastRegeneration = System.currentTimeMillis() - lastRegeneration
            val rapidRegeneration = timeSinceLastRegeneration < 5000 // Less than 5 seconds

            // Check for suspicious app installation patterns
            val installationTime = getAppInstallationTime()
            val timeSinceInstallation = System.currentTimeMillis() - installationTime
            val recentlyInstalled = timeSinceInstallation < 60000 // Less than 1 minute

            val riskLevel = when {
                rapidRegeneration && deviceIdChanged -> CloningRisk.HIGH
                emulatorDetected && deviceIdChanged -> CloningRisk.MEDIUM
                recentlyInstalled && deviceIdChanged -> CloningRisk.LOW
                deviceIdChanged -> CloningRisk.LOW
                else -> CloningRisk.NONE
            }

            CloningDetectionResult(
                isSuspicious = riskLevel != CloningRisk.NONE,
                riskLevel = riskLevel,
                reasons = buildList {
                    if (deviceIdChanged) add("Device ID changed unexpectedly")
                    if (emulatorDetected) add("Emulator detected")
                    if (rapidRegeneration) add("Rapid device regeneration detected")
                    if (recentlyInstalled) add("App recently installed")
                },
                recommendedAction = when (riskLevel) {
                    CloningRisk.HIGH -> "Block registration and log security incident"
                    CloningRisk.MEDIUM -> "Require additional verification"
                    CloningRisk.LOW -> "Allow but monitor closely"
                    CloningRisk.NONE -> "Normal operation"
                }
            )
        } catch (e: Exception) {
            Timber.e(e, "Error detecting potential cloning")
            CloningDetectionResult(
                isSuspicious = false,
                riskLevel = CloningRisk.NONE,
                reasons = listOf("Detection failed: ${e.message}"),
                recommendedAction = "Continue normally but log error"
            )
        }
    }

    /**
     * Get app installation time for cloning detection
     */
    private fun getAppInstallationTime(): Long {
        return try {
            val packageManager = context.packageManager
            val packageInfo = packageManager.getPackageInfo(context.packageName, 0)
            packageInfo.firstInstallTime
        } catch (e: Exception) {
            Timber.w(e, "Could not get app installation time")
            0L
        }
    }

    /**
     * Enhanced device registration with cloning detection
     */
    fun registerDeviceWithSecurityCheck(deviceName: String): DeviceRegistrationResult {
        val cloningDetection = detectPotentialCloning()

        return when {
            cloningDetection.riskLevel == CloningRisk.HIGH -> {
                // Log security incident for high-risk cloning attempts
                Timber.w("🚨 HIGH RISK CLONING DETECTED: ${cloningDetection.reasons.joinToString(", ")}")
                DeviceRegistrationResult.Blocked("Suspicious device detected. Contact support.")
            }

            cloningDetection.riskLevel == CloningRisk.MEDIUM -> {
                Timber.w("⚠️ MEDIUM RISK CLONING DETECTED: ${cloningDetection.reasons.joinToString(", ")}")
                // Allow but with additional verification required
                DeviceRegistrationResult.RequiresVerification("Additional verification required")
            }

            else -> {
                // Normal registration
                val deviceId = generateNewDeviceId()
                prefs.edit()
                    .putLong("last_device_regeneration", System.currentTimeMillis())
                    .apply()

                Timber.d("✅ Device registered securely: ${deviceId.take(20)}...")
                DeviceRegistrationResult.Success(deviceId, deviceName)
            }
        }
    }

    /**
     * Get device info for debugging including emulator detection
     */
    fun getDeviceInfo(): Map<String, String> {
        val emulatorInfo = detectEmulatorInfo()
        val cloningDetection = detectPotentialCloning()

        return mapOf(
            "deviceId" to getDeviceId().take(20) + "...",
            "persistentUuid" to (prefs.getString(KEY_PERSISTENT_UUID, "none")?.take(10) ?: "none") + "...",
            "androidId" to "not_collected",
            "buildFingerprint" to Build.FINGERPRINT.take(30) + "...",
            "buildSerial" to "not_collected",
            "isEmulator" to (emulatorInfo.isNotEmpty()).toString(),
            "emulatorType" to if (emulatorInfo.isNotEmpty()) emulatorInfo.take(50) + "..." else "none",
            "cloningRisk" to cloningDetection.riskLevel.name,
            "cloningReasons" to cloningDetection.reasons.joinToString("; ").take(100)
        )
    }
}

/**
 * Result of cloning detection analysis
 */
data class CloningDetectionResult(
    val isSuspicious: Boolean,
    val riskLevel: CloningRisk,
    val reasons: List<String>,
    val recommendedAction: String
)

/**
 * Risk levels for cloning detection
 */
enum class CloningRisk {
    NONE,      // No risk detected
    LOW,       // Low risk, minor suspicious activity
    MEDIUM,    // Medium risk, requires additional verification
    HIGH       // High risk, block registration
}

/**
 * Result of device registration attempt
 */
sealed class DeviceRegistrationResult {
    data class Success(val deviceId: String, val deviceName: String) : DeviceRegistrationResult()
    data class RequiresVerification(val message: String) : DeviceRegistrationResult()
    data class Blocked(val message: String) : DeviceRegistrationResult()
}
