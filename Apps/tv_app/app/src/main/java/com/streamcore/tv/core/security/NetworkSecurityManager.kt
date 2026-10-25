package com.streamcore.tv.core.security

import android.content.Context
import android.content.pm.PackageManager
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Network Security Manager
 * 
 * Detects dangerous apps that can intercept network traffic or debug the application
 */
@Singleton
class NetworkSecurityManager @Inject constructor(
    private val context: Context
) {
    
    /**
     * Check if device has dangerous debugging/network intercepting apps installed
     */
    fun hasNetworkDebuggingApps(): Boolean {
        val dangerousApps = getDangerousAppsList()
        val packageManager = context.packageManager
        
        val detectedApps = mutableListOf<String>()
        
        dangerousApps.forEach { packageName ->
            try {
                packageManager.getPackageInfo(packageName, 0)
                detectedApps.add(packageName)
                Timber.w("🚨 Dangerous app detected: $packageName")
            } catch (e: PackageManager.NameNotFoundException) {
                // App not installed - this is good
            }
        }
        
        if (detectedApps.isNotEmpty()) {
            Timber.w("🚨 Total dangerous apps detected: ${detectedApps.size}")
            Timber.w("🚨 Detected apps: ${detectedApps.joinToString(", ")}")
            return true
        }
        
        return false
    }
    
    /**
     * Get list of detected dangerous apps (for showing to user)
     */
    fun getDetectedDangerousApps(): List<String> {
        val dangerousApps = getDangerousAppsList()
        val packageManager = context.packageManager
        val detectedApps = mutableListOf<String>()
        
        dangerousApps.forEach { packageName ->
            try {
                val packageInfo = packageManager.getPackageInfo(packageName, 0)
                val appInfo = packageInfo.applicationInfo
                val appName = if (appInfo != null) {
                    packageManager.getApplicationLabel(appInfo).toString()
                } else {
                    packageName
                }
                detectedApps.add(appName)
            } catch (e: PackageManager.NameNotFoundException) {
                // App not installed
            }
        }
        
        return detectedApps
    }
    
    /**
     * Comprehensive list of dangerous apps that can intercept network traffic
     */
    private fun getDangerousAppsList(): Array<String> {
        val apps = arrayOf(
            "Y29tLmd1b3NoaS5odHRwY2FuYXJ5",
            "Y29tLmd1b3NoaS5odHRwY2FuYXJ5LnByZW1pdW0=",
            "Y29tLmd1b3NoaS5odHRwY2FuYXJ5LnBybw==",
            "Y29tLmVnb3JvdmFuZHJleXJtLnBjYXByZW1vdGU=",
            "YXBwLmdyZXlzaGlydHMuc3NsY2FwdHVyZQ==",
            "Y29tLnBhY2thZ2VzbmlmZmVyLmZydHBhcmxhaw==",
            "Y29tLm1pbmh1aS5uZXR3b3JrY2FwdHVyZQ==",
            "Y29tLm1pbmh1aS53aWZpYW5hbHl6ZXI=",
            "Y29tLmNoYXJsZXNwcm94eS5jaGFybGVz",
            "Y29tLnhrNzIuY2hhcmxlcw==",
            "YnVycC5zdWl0ZS5tb2JpbGU=",
            "Y29tLnBvcnRzd2lnZ2VyLmJ1cnA=",
            "Y29tLnRlbGVyaWsuZmlkZGxlcg==",
            "Y29tLnByb2dyZXNzLmZpZGRsZXI=",
            "YXBwLmdyZXlzaGlydHMuc3NsY2FwdHVyZQ==",
            "Y29tLmVtYW51ZWxlZi5yZW1vdGVfY2FwdHVyZQ==",
            "Y29tLnBhY2thZ2VzbmlmZmVyLmZydHBhcmxhaw==",
            "Y29tLmZhcnByb2Mud2lmaS5hbmFseXplcg==",
            "Y29tLnZyZW0ud2lmaWFuYWx5emVy",
            "Y29tLndpZmkuYW5hbHl6ZXI=",
            "Y29tLmFuZHJvaWQuZGV2ZWxvcG1lbnQ=",
            "Y29tLmFuZHJvaWQuZGV2ZWxvcG1lbnRfc2V0dGluZ3M=",
            "amFja3BhbC5hbmRyb2lkdGVybQ==",
            "Y29tLmFpZGUudWk=",
            "Y29tLnRlcm11eA==",
            "Y29tLnRlcm11eC5hcGk=",
            "Y29tLnRlcm11eC5ib290",
            "Y29tLnRlcm11eC5zdHlsaW5n",
            "Y29tLnRlcm11eC50YXNrZXI=",
            "Y29tLnRlcm11eC53aWRnZXQ=",
            "cmUuZnJpZGEuc2VydmVy",
            "Y29tLmFuZHJvaWQuZnJpZGE=",
            "Y29tLmZyaWRhLnNlcnZlcg==",
            "ZGUucm9idi5hbmRyb2lkLnhwb3NlZC5pbnN0YWxsZXI=",
            "b3JnLm1lb3djYXQuZWR4cG9zZWQubWFuYWdlcg==",
            "dG9wLmNhbnlpZS5kcmVhbWxhbmQubWFuYWdlcg==",
            "Y29tLnNvbG9oc3UuYW5kcm9pZC5lZHhwLm1hbmFnZXI=",
            "Y29tLmRpbW9udmlkZW8ubHVja3lwYXRjaGVy",
            "Y29tLmNoZWxwdXMubGFja3lwYXRjaA==",
            "Y29tLmZvcnBkYS5scA==",
            "Y29tLmFuZHJvaWQudmVuZGluZy5iaWxsaW5nLkluQXBwQmlsbGluZ1NlcnZpY2UuTFVDSw==",
            "cnUuVWJMQkJSTGYuakdWTk5BVg==",
            "b3JnLmdhbWVndWFyZGlhbg==",
            "Y29tLmNpaC5nYW1lX2NpaA==",
            "Y24ubWFvY2FpLmNoZWF0ZHJvaWQ=",
            "Y29tLnNidG9vbHMuZ2FtZWhhY2sudWk=",
            "Y29tLmFwcGxpc3RvLmFwcGNsb25lcg==",
            "Y29tLm5vc2h1Zm91LmFuZHJvaWQuc3U=",
            "Y29tLm5vc2h1Zm91LmFuZHJvaWQuc3UuZWxpdGU=",
            "ZXUuY2hhaW5maXJlLnN1cGVyc3U=",
            "Y29tLmtvdXNoaWtkdXR0YS5zdXBlcnVzZXI=",
            "Y29tLnRoaXJkcGFydHkuc3VwZXJ1c2Vy",
            "Y29tLnllbGxvd2VzLnN1",
            "Y29tLnRvcGpvaG53dS5tYWdpc2s=",
            "Y29tLmtpbmdyb290Lmtpbmd1c2Vy",
            "Y29tLmtpbmdvdXNlci5jb20=",
            "Y29tLmVnb3JvdmFuZHJleXJtLnBjYXByZW1vdGU=",
            "Y29tLmd1b3NoaS5odHRwY2FuYXJ5LnByZW1pdW0=",
            "Y29tLmFuZHJvaWQucmV2ZXJzZS5lbmdpbmVlcmluZw==",
            "Y29tLmFuZHJvaWQuZGRtcw==",
            "Y29tLmFuZHJvaWQuaGllcmFyY2h5dmlld2Vy",
            "Y29tLmFuZHJvaWQudHJhY2V2aWV3",
            "Y29tLmFuZHJvaWQudWlhdXRvbWF0b3I=",
            "Y29tLmdtYWlsLmhlYWdvby5hcGtlZGl0b3I=",
            "Y29tLmdtYWlsLmhlYWdvby5hcGtlZGl0b3IucHJv",
            "Y29tLnNwZWVkc29mdHdhcmUucm9vdGV4cGxvcmVy",
            "Y29tLmpydW1teS5yb290LmJyb3dzZXJmcmVl",
            "Y29tLmpydW1teS5yb290LmJyb3dzZXI=",
            "Y29tLmFudGl2aXJ1cw==",
            "Y29tLm5ldG1vbml0b3I=",
            "Y29tLm5ldHdvcmttb25pdG9y",
            "Y29tLnRyYWZmaWNtb25pdG9y"
        )
        return apps.map { String(android.util.Base64.decode(it, android.util.Base64.DEFAULT)) }.toTypedArray()
    }
}
