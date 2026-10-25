package com.streamcore.tv.data.repository

import com.streamcore.tv.common.Resource
import com.streamcore.tv.data.remote.api.IPTVApiService
import com.streamcore.tv.data.remote.dto.VersionCheckResponseDto
import com.streamcore.tv.domain.repository.AppRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import javax.inject.Inject

class AppRepositoryImpl @Inject constructor(
    private val api: IPTVApiService,
    private val okHttpClient: OkHttpClient // If needed for direct download, or use standard download manager in UI layer
) : AppRepository {

    override fun checkForUpdate(currentVersionCode: Int): Flow<Resource<VersionCheckResponseDto>> = flow {
        emit(Resource.Loading())
        try {
            // "tv" is hardcoded here as this is the TV app repository
            val response = api.checkVersion("tv", currentVersionCode)
            val responseBody = response.body()
            if (response.isSuccessful && responseBody != null) {
                emit(Resource.Success(responseBody))
            } else {
                emit(Resource.Error(response.message() ?: "An error occurred"))
            }
        } catch (e: Exception) {
            emit(Resource.Error(e.localizedMessage ?: "Check connection"))
        }
    }.flowOn(Dispatchers.IO)

    // Optional: Manual download implementation if DownloadManager is not used
    override suspend fun downloadApk(url: String, destinationFile: File): Flow<Resource<File>> = flow {
        emit(Resource.Loading())
        try {
            val request = Request.Builder().url(url).build()
            val response = okHttpClient.newCall(request).execute()
            
            if (!response.isSuccessful) {
                emit(Resource.Error("Download failed: ${response.code}"))
                return@flow
            }
            
            val body = response.body ?: throw Exception("Empty body")
            val totalSize = body.contentLength()
            var bytesCopied: Long = 0
            val buffer = ByteArray(8 * 1024)
            var bytes = 0
            
            body.byteStream().use { input ->
                FileOutputStream(destinationFile).use { output ->
                    while (input.read(buffer).also { bytes = it } >= 0) {
                        output.write(buffer, 0, bytes)
                        bytesCopied += bytes
                        // Optional: emit progress?
                    }
                }
            }
            emit(Resource.Success(destinationFile))
        } catch (e: Exception) {
            emit(Resource.Error(e.localizedMessage ?: "Download failed"))
        }
    }.flowOn(Dispatchers.IO)
}
