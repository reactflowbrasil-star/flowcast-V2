package com.streamcore.tv.domain.usecase.series

import com.streamcore.tv.domain.model.Result
import com.streamcore.tv.domain.model.EpisodeStream
import com.streamcore.tv.domain.repository.ContentRepository
import timber.log.Timber
import javax.inject.Inject

/**
 * Use case for getting episode streaming URL
 */
class GetEpisodeStreamUseCase @Inject constructor(
    private val contentRepository: ContentRepository
) {

    /**
     * Get streaming URL for episode
     *
     * @param episodeId The episode ID
     * @return Result containing EpisodeStream
     */
    suspend operator fun invoke(episodeId: String): Result<EpisodeStream> {
        return try {
            Timber.d("GetEpisodeStreamUseCase: Getting stream for episode $episodeId")

            val response = contentRepository.getEpisodeStream(episodeId)

            if (response.isSuccessful && response.body() != null) {
                val episodeStream = response.body()!!
                Timber.d("GetEpisodeStreamUseCase: Successfully got stream for ${episodeStream.title}")
                Result.Success(episodeStream)
            } else {
                val errorMessage = "Failed to get episode stream: ${response.message()}"
                Timber.e("GetEpisodeStreamUseCase: $errorMessage")
                Result.Error(Exception(errorMessage))
            }
        } catch (e: Exception) {
            val errorMessage = "Error getting episode stream: ${e.localizedMessage}"
            Timber.e(e, "GetEpisodeStreamUseCase: $errorMessage")
            Result.Error(e)
        }
    }
}
