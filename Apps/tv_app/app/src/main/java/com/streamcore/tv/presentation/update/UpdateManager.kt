package com.streamcore.tv.presentation.update

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Environment
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import com.streamcore.tv.core.constants.ApiConstants
import com.streamcore.tv.core.utils.loge
import com.streamcore.tv.data.remote.dto.VersionCheckResponseDto
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import java.io.File
import java.io.FileInputStream
import java.net.URI
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class UpdateManager @Inject constructor(
    @ApplicationContext private val context: Context
) {

    companion object {
        private const val MAX_RETRIES = 3
        private const val RETRY_DELAY_MS = 2000L

        fun enqueueDownloadAndInstall(
            context: Context,
            versionInfo: VersionCheckResponseDto,
            fileName: String = "update.apk",
        ): Long {
            val url = if (versionInfo.downloadUrl.startsWith("http")) {
                versionInfo.downloadUrl
            } else {
                buildAbsoluteUrl(versionInfo.downloadUrl)
            }
            return enqueueDownloadAndInstall(context, url, fileName, versionInfo.fileHash)
        }

        private fun buildAbsoluteUrl(relativeOrAbsolute: String): String {
            val normalizedInput = relativeOrAbsolute.trim()
            if (normalizedInput.isBlank()) {
                return ApiConstants.BASE_URL
            }

            if (normalizedInput.startsWith("http", ignoreCase = true)) {
                return normalizedInput
            }

            val parsedCandidate = runCatching { URI(normalizedInput) }.getOrNull()
            val safeRelativePath = when {
                parsedCandidate?.isAbsolute == true -> {
                    parsedCandidate.rawPath?.trimStart('/').orEmpty()
                }
                parsedCandidate?.rawAuthority != null || normalizedInput.startsWith("//") -> {
                    normalizedInput.removePrefix("//").trimStart('/')
                }
                else -> normalizedInput
            }

            return try {
                URI(ApiConstants.BASE_URL.trimEnd('/') + "/")
                    .resolve(safeRelativePath)
                    .toString()
            } catch (_: Exception) {
                "${ApiConstants.BASE_URL.trimEnd('/')}/${safeRelativePath.trimStart('/')}"
            }
        }

        fun enqueueDownloadAndInstall(
            context: Context,
            url: String,
            fileName: String,
            expectedHash: String? = null,
        ): Long {
            val appContext = context.applicationContext
            val downloadManager = appContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

            val request = DownloadManager.Request(Uri.parse(url))
                .setTitle("Downloading Update")
                .setDescription("Downloading $fileName")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalFilesDir(appContext, Environment.DIRECTORY_DOWNLOADS, fileName)
                .setAllowedOverMetered(true)
                .setAllowedOverRoaming(true)

            val downloadId = downloadManager.enqueue(request)
            
            var retryCount = 0

            val onComplete = object : BroadcastReceiver() {
                override fun onReceive(ctxt: Context?, intent: Intent?) {
                    val id = intent?.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1)
                    if (id != downloadId) return

                    try {
                        val query = DownloadManager.Query().setFilterById(downloadId)
                        downloadManager.query(query).use { cursor ->
                            if (cursor.moveToFirst()) {
                                val statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
                                val status = cursor.getInt(statusIndex)
                                
                                when (status) {
                                    DownloadManager.STATUS_SUCCESSFUL -> {
                                        if (expectedHash != null) {
                                            val localUriIndex = cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_LOCAL_URI)
                                            val filePath = cursor.getString(localUriIndex)
                                            val actualHash = calculateFileHash(filePath)
                                            
                                            if (actualHash?.equals(expectedHash, ignoreCase = true) == true) {
                                                installApk(appContext, downloadId)
                                            } else {
                                                if (retryCount < MAX_RETRIES) {
                                                    retryCount++
                                                    File(filePath).delete()
                                                    Handler(Looper.getMainLooper()).postDelayed({
                                                        enqueueDownloadAndInstall(appContext, url, fileName, expectedHash)
                                                    }, RETRY_DELAY_MS)
                                                } else {
                                                    loge("Hash verification failed after $MAX_RETRIES attempts")
                                                }
                                            }
                                        } else {
                                            installApk(appContext, downloadId)
                                        }
                                    }
                                    DownloadManager.STATUS_FAILED -> {
                                        if (retryCount < MAX_RETRIES) {
                                            retryCount++
                                            Handler(Looper.getMainLooper()).postDelayed({
                                                enqueueDownloadAndInstall(appContext, url, fileName, expectedHash)
                                            }, RETRY_DELAY_MS)
                                        } else {
                                            loge("Download failed after $MAX_RETRIES attempts")
                                        }
                                    }
                                }
                            }
                        }
                    } finally {
                        runCatching { appContext.unregisterReceiver(this) }
                    }
                }
            }

            ContextCompat.registerReceiver(
                appContext,
                onComplete,
                IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
                ContextCompat.RECEIVER_NOT_EXPORTED,
            )

            return downloadId
        }
        
        private fun calculateFileHash(filePath: String?): String? {
            if (filePath == null) return null
            
            return try {
                val file = File(Uri.parse(filePath).path ?: return null)
                val digest = MessageDigest.getInstance("SHA-256")
                FileInputStream(file).use { fis ->
                    val buffer = ByteArray(8192)
                    var read: Int
                    while (fis.read(buffer).also { read = it } > 0) {
                        digest.update(buffer, 0, read)
                    }
                }
                digest.digest().joinToString("") { "%02x".format(it) }
            } catch (e: Exception) {
                null
            }
        }

        private fun installApk(context: Context, downloadId: Long) {
            val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val uri = downloadManager.getUriForDownloadedFile(downloadId)

            if (uri != null) {
                val intent = Intent(Intent.ACTION_VIEW)
                intent.setDataAndType(uri, "application/vnd.android.package-archive")
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
            } else {
                loge("Download uri is null")
            }
        }
    }

    fun enqueueDownloadAndInstall(
        versionInfo: VersionCheckResponseDto,
        fileName: String = "update.apk",
    ): Long = enqueueDownloadAndInstall(context, versionInfo, fileName)

    fun downloadAndInstall(url: String, fileName: String, expectedHash: String? = null): Flow<DownloadStatus> = callbackFlow {
        var retryCount = 0
        var downloadId: Long = -1
        
        fun startDownload() {
            try {
                val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                val request = DownloadManager.Request(Uri.parse(url))
                    .setTitle("Downloading Update")
                    .setDescription("Downloading $fileName")
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, fileName)
                    .setAllowedOverMetered(true)
                    .setAllowedOverRoaming(true)

                downloadId = downloadManager.enqueue(request)
                trySend(DownloadStatus.Downloading(0))
            } catch (e: Exception) {
                trySend(DownloadStatus.Error("Failed to start download: ${e.message}"))
            }
        }
        
        startDownload()

        val onComplete = object : BroadcastReceiver() {
            override fun onReceive(ctxt: Context?, intent: Intent?) {
                val id = intent?.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1)
                if (id != downloadId) return
                
                val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                val query = DownloadManager.Query().setFilterById(downloadId)
                downloadManager.query(query).use { cursor ->
                    if (cursor.moveToFirst()) {
                        val statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
                        val status = cursor.getInt(statusIndex)
                        
                        when (status) {
                            DownloadManager.STATUS_SUCCESSFUL -> {
                                val fileUri = downloadManager.getUriForDownloadedFile(downloadId)
                                if (fileUri != null) {
                                    if (expectedHash != null) {
                                        trySend(DownloadStatus.Verifying)
                                        val localUriIndex = cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_LOCAL_URI)
                                        val filePath = cursor.getString(localUriIndex)
                                        val actualHash = calculateFileHash(filePath)
                                        
                                        if (actualHash?.equals(expectedHash, ignoreCase = true) == true) {
                                            installApk(context, downloadId)
                                            trySend(DownloadStatus.Completed)
                                        } else {
                                            if (retryCount < MAX_RETRIES) {
                                                retryCount++
                                                trySend(DownloadStatus.Retrying(retryCount, MAX_RETRIES))
                                                File(filePath).delete()
                                                Handler(Looper.getMainLooper()).postDelayed({
                                                    startDownload()
                                                }, RETRY_DELAY_MS)
                                            } else {
                                                trySend(DownloadStatus.Error("Hash verification failed after $MAX_RETRIES attempts"))
                                            }
                                        }
                                    } else {
                                        installApk(context, downloadId)
                                        trySend(DownloadStatus.Completed)
                                    }
                                } else {
                                    trySend(DownloadStatus.Error("Downloaded file not found"))
                                }
                            }
                            DownloadManager.STATUS_FAILED -> {
                                if (retryCount < MAX_RETRIES) {
                                    retryCount++
                                    trySend(DownloadStatus.Retrying(retryCount, MAX_RETRIES))
                                    Handler(Looper.getMainLooper()).postDelayed({
                                        startDownload()
                                    }, RETRY_DELAY_MS)
                                } else {
                                    trySend(DownloadStatus.Error("Download failed after $MAX_RETRIES attempts"))
                                }
                            }
                        }
                    }
                }
            }
        }

        ContextCompat.registerReceiver(
            context,
            onComplete,
            IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )

        awaitClose {
            context.unregisterReceiver(onComplete)
        }
    }

    sealed class DownloadStatus {
        data class Downloading(val progress: Int) : DownloadStatus()
        object Verifying : DownloadStatus()
        data class Retrying(val attempt: Int, val maxAttempts: Int) : DownloadStatus()
        object Completed : DownloadStatus()
        data class Error(val message: String) : DownloadStatus()
    }
}
