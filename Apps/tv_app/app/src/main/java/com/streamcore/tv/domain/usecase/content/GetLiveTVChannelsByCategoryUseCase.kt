package com.streamcore.tv.domain.usecase.content

import com.streamcore.tv.domain.model.ContentItem
import com.streamcore.tv.domain.model.Result
import com.streamcore.tv.domain.repository.ContentRepository
import timber.log.Timber
import javax.inject.Inject

class GetLiveTVChannelsByCategoryUseCase @Inject constructor(
    private val contentRepository: ContentRepository
) {
    suspend operator fun invoke(channelCategory: String?): Result<List<ContentItem>> {
        return try {
            val response = if (channelCategory.isNullOrBlank()) {
                contentRepository.getTvChannels()
            } else {
                contentRepository.getTvChannelsByCategory(channelCategory)
            }

            if (response.isSuccessful && response.body() != null) {
                val channels = response.body()!!
                Timber.d("Fetched ${channels.size} channels (category=${channelCategory ?: "ALL"})")
                Result.Success(channels)
            } else {
                Result.Error(Exception("Failed to fetch channels: ${response.message()}"))
            }
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}

