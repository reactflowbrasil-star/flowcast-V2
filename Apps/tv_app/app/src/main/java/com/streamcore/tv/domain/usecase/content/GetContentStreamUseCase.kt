package com.streamcore.tv.domain.usecase.content

import com.streamcore.tv.domain.model.Result
import com.streamcore.tv.domain.model.ContentStream
import com.streamcore.tv.domain.repository.ContentRepository
import timber.log.Timber
import javax.inject.Inject

/**
 * Use case for getting content streaming URL with DRM support
 */
class GetContentStreamUseCase @Inject constructor(
    private val contentRepository: ContentRepository
) {

    /**
     * Get streaming URL for content
     *
     * @param contentId The content ID
     * @return Result containing ContentStream
     */
    suspend operator fun invoke(contentId: String): Result<ContentStream> {
        return try {
            Timber.d("GetContentStreamUseCase: Getting stream for content $contentId")

            val response = contentRepository.getContentStream(contentId)

            if (response.isSuccessful && response.body() != null) {
                val contentStream = response.body()!!
                Timber.d("GetContentStreamUseCase: Successfully got stream for ${contentStream.title}")
                Result.Success(contentStream)
            } else {
                val errorMessage = "Failed to get content stream: ${response.message()}"
                Timber.e("GetContentStreamUseCase: $errorMessage")
                Result.Error(Exception(errorMessage))
            }

        } catch (e: Exception) {
            val errorMessage = "Error getting content stream: ${e.localizedMessage}"
            Timber.e(e, "GetContentStreamUseCase: $errorMessage")
            Result.Error(e)
        }
    }
}
