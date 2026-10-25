package com.streamcore.tv.domain.usecase.content

import com.streamcore.tv.domain.model.Result
import com.streamcore.tv.domain.repository.ContentRepository
import timber.log.Timber
import javax.inject.Inject

class GetTvChannelCategoriesUseCase @Inject constructor(
    private val contentRepository: ContentRepository
) {
    suspend operator fun invoke(): Result<List<String>> {
        return try {
            val response = contentRepository.getTvChannelCategories()
            if (response.isSuccessful && response.body() != null) {
                val categories = response.body()!!
                Timber.d("Fetched ${categories.size} TV channel categories")
                Result.Success(categories)
            } else {
                Result.Error(Exception("Failed to fetch categories: ${response.message()}"))
            }
        } catch (e: Exception) {
            Result.Error(e)
        }
    }
}

