package com.streamcore.tv.domain.usecase.content

import com.streamcore.tv.domain.model.Result
import com.streamcore.tv.domain.model.ContentItem
import com.streamcore.tv.domain.model.ContentType
import com.streamcore.tv.domain.repository.ContentRepository
import timber.log.Timber
import javax.inject.Inject

/**
 * Use case for getting Live TV channels
 */
class GetLiveTVChannelsUseCase @Inject constructor(
    private val contentRepository: ContentRepository
) {

    /**
     * Get Live TV channels
     *
     * @return Result containing list of ContentItem (channels)
     */
    suspend operator fun invoke(): Result<List<ContentItem>> {
        return try {
            Timber.d("GetLiveTVChannelsUseCase: ===== FETCHING LIVE TV CHANNELS FROM BACKEND =====")

            val response = contentRepository.getTvChannels()
            val allChannels = if (response.isSuccessful && response.body() != null) {
                val channels = response.body()!!
                Timber.d("GetLiveTVChannelsUseCase: Successfully fetched ${channels.size} channels from backend")

                channels
            } else {
                Timber.e("GetLiveTVChannelsUseCase: Failed to fetch channels from backend - Response: ${response.code()}, Message: ${response.message()}")
                emptyList()
            }
            Timber.d("GetLiveTVChannelsUseCase: ===== RETURNING ${allChannels.size} CHANNELS FROM BACKEND =====")

            Result.Success(allChannels)

        } catch (e: Exception) {
            @Suppress("UNUSED_VARIABLE")
            val errorMessage = "Error getting Live TV channels: ${e.localizedMessage}"
            Timber.e(e, "GetLiveTVChannelsUseCase: ===== EXCEPTION OCCURRED =====")
            Timber.e("GetLiveTVChannelsUseCase: Exception message: ${e.message}")
            Timber.e("GetLiveTVChannelsUseCase: Exception type: ${e.javaClass.simpleName}")
            Result.Error(e)
        }
    }
}
