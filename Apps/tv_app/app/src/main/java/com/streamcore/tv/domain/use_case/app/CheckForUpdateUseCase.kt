package com.streamcore.tv.domain.use_case.app

import com.streamcore.tv.common.Resource
import com.streamcore.tv.data.remote.dto.VersionCheckResponseDto
import com.streamcore.tv.domain.repository.AppRepository
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

class CheckForUpdateUseCase @Inject constructor(
    private val repository: AppRepository
) {
    operator fun invoke(currentVersionCode: Int): Flow<Resource<VersionCheckResponseDto>> {
        return repository.checkForUpdate(currentVersionCode)
    }
}
