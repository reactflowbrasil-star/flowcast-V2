package com.streamcore.tv.domain.usecase.series

import com.streamcore.tv.domain.model.Result
import com.streamcore.tv.domain.model.EpisodeDetails
import com.streamcore.tv.domain.repository.ContentRepository
import timber.log.Timber
import javax.inject.Inject

/**
 * Use case for getting episodes of a season
 */
class GetSeasonEpisodesUseCase @Inject constructor(
    private val contentRepository: ContentRepository
) {

    /**
     * Get episodes for a season
     *
     * @param seasonId The season ID
     * @return Result containing list of EpisodeDetails
     */
    suspend operator fun invoke(seasonId: String): Result<List<EpisodeDetails>> {
        return try {
            Timber.d("GetSeasonEpisodesUseCase: Getting episodes for season $seasonId")

            val response = contentRepository.getSeasonEpisodes(seasonId)

            if (response.isSuccessful && response.body() != null) {
                val episodes = response.body()!!
                Timber.d("GetSeasonEpisodesUseCase: Successfully got ${episodes.size} episodes")
                Result.Success(episodes)
            } else {
                val errorMessage = "Failed to get season episodes: ${response.message()}"
                Timber.e("GetSeasonEpisodesUseCase: $errorMessage")
                Result.Error(Exception(errorMessage))
            }

        } catch (e: Exception) {
            val errorMessage = "Error getting season episodes: ${e.localizedMessage}"
            Timber.e(e, "GetSeasonEpisodesUseCase: $errorMessage")
            Result.Error(e)
        }
    }
}
