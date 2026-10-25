package com.streamcore.tv.domain.usecase.series

import com.streamcore.tv.domain.model.SeriesDetails
import com.streamcore.tv.domain.model.SeriesContent
import com.streamcore.tv.domain.model.Season
import com.streamcore.tv.domain.model.ContentDetails
import com.streamcore.tv.domain.model.ContentType
import com.streamcore.tv.domain.repository.ContentRepository
import com.streamcore.tv.domain.usecase.content.GetContentDetailsUseCase
import com.streamcore.tv.core.utils.logd
import com.streamcore.tv.domain.model.Result
import javax.inject.Inject

/**
 * Use case for getting series details with seasons and episodes by content ID
 */
class GetSeriesDetailsByContentIdUseCase @Inject constructor(
    private val contentRepository: ContentRepository,
    private val getContentDetailsUseCase: GetContentDetailsUseCase
) {

    /**
     * Get series details by content ID
     * Automatically detects content type and uses appropriate endpoint
     *
     * @param contentId The content ID
     * @return Result containing SeriesDetails with nested seasons and episodes
     */
    suspend operator fun invoke(contentId: String): kotlin.Result<SeriesDetails> {
        return try {
            logd("GetSeriesDetailsByContentIdUseCase: Getting series details for content ID $contentId")

            // First, get basic content details to determine the type
            val contentResult = contentRepository.getContentDetails(contentId)

            when (contentResult) {
                is com.streamcore.tv.domain.model.Result.Success -> {
                    val content = contentResult.data
                    logd("GetSeriesDetailsByContentIdUseCase: Content type is ${content.type}")
                    logd("GetSeriesDetailsByContentIdUseCase: Content title: '${content.title}'")
                    logd("GetSeriesDetailsByContentIdUseCase: Content has ${content.episodes?.size ?: 0} episodes")
                    logd("GetSeriesDetailsByContentIdUseCase: Content has ${content.seasons?.size ?: 0} seasons")

                    when (content.type) {
                        ContentType.SERIES -> {
                            // Use regular series endpoint for all episodic content
                            logd("GetSeriesDetailsByContentIdUseCase: Using regular series endpoint")
                            getRegularSeriesDetails(contentId)
                        }
                        else -> {
                            logd("GetSeriesDetailsByContentIdUseCase: Content type ${content.type} is not SERIES")
                            kotlin.Result.failure(Exception("Content is not a series type. Found: ${content.type}"))
                        }
                    }
                }
                is com.streamcore.tv.domain.model.Result.Error -> {
                    kotlin.Result.failure(contentResult.exception)
                }
                else -> {
                    kotlin.Result.failure(Exception("Unexpected result type"))
                }
            }

        } catch (e: Exception) {
            val errorMessage = "Error getting series details: ${e.localizedMessage}"
            logd("GetSeriesDetailsByContentIdUseCase: $errorMessage")
            kotlin.Result.failure(e)
        }
    }

    private suspend fun getRegularSeriesDetails(contentId: String): kotlin.Result<SeriesDetails> {
        return try {
            val response = contentRepository.getSeriesByContentId(contentId)

            if (response.isSuccessful && response.body() != null) {
                val seriesDetails = response.body()!!
                logd("GetSeriesDetailsByContentIdUseCase: Successfully got series ${seriesDetails.content.title}")
                kotlin.Result.success(seriesDetails)
            } else {
                val errorMessage = "Failed to get series details: ${response.message()}"
                logd("GetSeriesDetailsByContentIdUseCase: $errorMessage")
                kotlin.Result.failure(Exception(errorMessage))
            }
        } catch (e: Exception) {
            kotlin.Result.failure(e)
        }
    }

    private fun convertContentDetailsToSeriesDetails(contentDetails: ContentDetails): SeriesDetails {
        return SeriesDetails(
            id = contentDetails.id.toIntOrNull() ?: 0,
            content = SeriesContent(
                id = contentDetails.id.toIntOrNull() ?: 0,
                categoryId = 0,
                title = contentDetails.title,
                description = contentDetails.description,
                imageUrl = contentDetails.imageUrl,
                tmdbId = null,
                year = contentDetails.year,
                createdAt = contentDetails.createdAt
            ),
            totalSeasons = 1,
            seasons = listOf(
                Season(
                    id = 1L,
                    seriesId = contentDetails.id.toLongOrNull() ?: 0L,
                    seasonNumber = 1,
                    totalEpisodes = contentDetails.episodes?.size ?: 0,
                    episodes = contentDetails.episodes ?: emptyList(),
                    createdAt = contentDetails.createdAt
                )
            ),
            backdropUrl = contentDetails.backdropUrl,
            createdAt = contentDetails.createdAt
        )
    }
}

/**
 * Use case for getting series details with seasons and episodes by series ID
 */
class GetSeriesDetailsUseCase @Inject constructor(
    private val contentRepository: ContentRepository
) {

    /**
     * Get series details by series ID
     *
     * @param seriesId The series ID
     * @return Result containing SeriesDetails with nested seasons and episodes
     */
    suspend operator fun invoke(seriesId: Int): kotlin.Result<SeriesDetails> {
        return try {
            logd("GetSeriesDetailsUseCase: Getting series details for ID $seriesId")

            val response = contentRepository.getSeriesDetails(seriesId)

            if (response.isSuccessful && response.body() != null) {
                val seriesDetails = response.body()!!
                logd("GetSeriesDetailsUseCase: Successfully got series ${seriesDetails.content.title}")
                kotlin.Result.success(seriesDetails)
            } else {
                val errorMessage = "Failed to get series details: ${response.message()}"
                logd("GetSeriesDetailsUseCase: $errorMessage")
                kotlin.Result.failure(Exception(errorMessage))
            }

        } catch (e: Exception) {
            val errorMessage = "Error getting series details: ${e.localizedMessage}"
            logd("GetSeriesDetailsUseCase: $errorMessage")
            kotlin.Result.failure(e)
        }
    }
}
