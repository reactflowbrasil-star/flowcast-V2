package com.streamcore.tv.domain.repository

import com.streamcore.tv.common.Resource
import com.streamcore.tv.data.remote.dto.VersionCheckResponseDto
import kotlinx.coroutines.flow.Flow
import java.io.File

interface AppRepository {
    fun checkForUpdate(currentVersionCode: Int): Flow<Resource<VersionCheckResponseDto>>
    
    suspend fun downloadApk(url: String, destinationFile: File): Flow<Resource<File>>
}
