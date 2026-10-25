package com.streamcore.tv.domain.usecase.series

import com.streamcore.tv.domain.model.Result
import com.streamcore.tv.domain.model.SeasonDetails
import com.streamcore.tv.domain.repository.ContentRepository
import timber.log.Timber
import javax.inject.Inject

/**
 * Use case for getting seasons of a series
 */
class GetSeriesSeasonsUseCase @Inject constructor(
    private val contentRepository: ContentRepository
) {

    /**
     * Get seasons for a series
     *
     * @param seriesId The series ID
     * @return Result containing list of SeasonDetails
     */
    suspend operator fun invoke(seriesId: String): Result<List<SeasonDetails>> {
        return try {
            Timber.d("GetSeriesSeasonsUseCase: Getting seasons for series $seriesId")

            val response = contentRepository.getSeriesSeasons(seriesId)

            if (response.isSuccessful && response.body() != null) {
                val seasons = response.body()!!
                Timber.d("GetSeriesSeasonsUseCase: Successfully got ${seasons.size} seasons")
                Result.Success(seasons)
            } else {
                val errorMessage = "Failed to get series seasons: ${response.message()}"
                Timber.e("GetSeriesSeasonsUseCase: $errorMessage")
                Result.Error(Exception(errorMessage))
            }

        } catch (e: Exception) {
            val errorMessage = "Error getting series seasons: ${e.localizedMessage}"
            Timber.e(e, "GetSeriesSeasonsUseCase: $errorMessage")
            Result.Error(e)
        }
    }
}
