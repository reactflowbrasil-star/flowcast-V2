package com.streamcore.tv.data.repository

import com.streamcore.tv.data.local.dao.ContentDao
import com.streamcore.tv.data.local.dao.UserDao
import com.streamcore.tv.data.local.datastore.UserPreferencesManager
import com.streamcore.tv.data.local.entity.WatchHistoryEntity
import com.streamcore.tv.data.mapper.*
import com.streamcore.tv.data.remote.api.IPTVApiService
import com.streamcore.tv.domain.model.*
import com.streamcore.tv.domain.repository.UserRepository
import com.streamcore.tv.core.device.DeviceIdentifierManager
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Implementation of UserRepository
 * 
 * Handles user operations with both remote API and local storage
 */
@Singleton
class UserRepositoryImpl @Inject constructor(
    private val apiService: IPTVApiService,
    private val userDao: UserDao,
    private val contentDao: ContentDao,
    private val userPreferencesManager: UserPreferencesManager,
    private val deviceIdentifierManager: DeviceIdentifierManager
) : UserRepository {

    private val watchHistoryFetchMutex = Mutex()
    @Volatile private var lastWatchHistoryFetchMs: Long = 0L
    @Volatile private var lastWatchHistoryResult: List<WatchHistoryItem>? = null
    
    // ========================================
    // USER PROFILE
    // ========================================
    
    override suspend fun getUserProfile(): Result<UserProfile> {
        return try {
            Timber.d("Fetching user profile")
            
            val response = apiService.getUserProfile()
            
            if (response.isSuccessful) {
                val body = response.body()
                if (body != null) {
                    val userProfile = body.toDomainModel()
                    
                    // Cache user profile locally
                    userDao.insertUser(userProfile.toEntity())
                    
                    Timber.d("User profile fetched successfully")
                    Result.Success(userProfile)
                } else {
                    val errorMessage = "User profile not found"
                    Timber.w(errorMessage)
                    Result.Error(Exception(errorMessage))
                }
            } else {
                val errorMessage = "HTTP ${response.code()}: ${response.message()}"
                Timber.e("User profile API error: $errorMessage")
                
                // Try to return cached data as fallback
                val cachedUser = userDao.getUserProfile().first()
                if (cachedUser != null) {
                    Timber.d("Returning cached user profile as fallback")
                    Result.Success(cachedUser.toDomainModel())
                } else {
                    Result.Error(Exception(errorMessage))
                }
            }
        } catch (e: Exception) {
            Timber.e(e, "User profile fetch exception")
            Result.Error(e)
        }
    }
    
    override suspend fun updateUserProfile(profile: UserProfile): Result<UserProfile> {
        return try {
            Timber.d("Updating user profile")
            
            val response = apiService.updateUserProfile(profile.toDto())
            
            if (response.isSuccessful) {
                val body = response.body()
                if (body != null) {
                    val updatedProfile = body.toDomainModel()
                    
                    // Update local cache
                    userDao.insertUser(updatedProfile.toEntity())
                    
                    Timber.d("User profile updated successfully")
                    Result.Success(updatedProfile)
                } else {
                    val errorMessage = "Failed to update user profile"
                    Timber.w(errorMessage)
                    Result.Error(Exception(errorMessage))
                }
            } else {
                val errorMessage = "HTTP ${response.code()}: ${response.message()}"
                Timber.e("Update user profile API error: $errorMessage")
                Result.Error(Exception(errorMessage))
            }
        } catch (e: Exception) {
            Timber.e(e, "Update user profile exception")
            Result.Error(e)
        }
    }
    
    override fun getUserPreferences(): Flow<UserPreferences> {
        return userPreferencesManager.getAllPreferences().map { prefs ->
            val safeQuality = runCatching {
                VideoQuality.valueOf(prefs.videoQuality.uppercase())
            }.getOrDefault(VideoQuality.AUTO)

            UserPreferences(
                language = prefs.language,
                autoplay = prefs.autoplay,
                quality = safeQuality,
                subtitles = prefs.subtitles
            )
        }
    }
    
    override suspend fun updateUserPreferences(preferences: UserPreferences): Result<Unit> {
        return try {
            Timber.d("Updating user preferences")
            
            // Update local preferences
            userPreferencesManager.saveLanguage(preferences.language)
            userPreferencesManager.saveAutoplay(preferences.autoplay)
            userPreferencesManager.saveVideoQuality(preferences.quality.name)
            userPreferencesManager.saveSubtitles(preferences.subtitles)
            
            // Note: Preferences are stored locally only - no API sync endpoint available
            // Backend preferences are managed via user profile (updateUserProfile)
            
            Timber.d("User preferences updated successfully")
            Result.Success(Unit)
        } catch (e: Exception) {
            Timber.e(e, "Update user preferences exception")
            Result.Error(e)
        }
    }
    
    // ========================================
    // FAVORITES
    // ========================================
    
    override suspend fun getFavorites(): Result<List<FavoriteItem>> {
        return try {
            Timber.d("Fetching favorites")
            
            val response = apiService.getFavorites()
            
            if (response.isSuccessful) {
                val body = response.body()
                if (body?.success == true) {
                    val favorites = body.data
                        ?.typedIds()
                        .orEmpty()
                        .distinctBy { it.contentId }
                        .map { favorite ->
                            val cached = contentDao.getContentById(favorite.contentId)?.toDomainModel()
                            FavoriteItem(
                                contentId = favorite.contentId,
                                content = cached ?: buildFallbackFavoriteContent(
                                    contentId = favorite.contentId,
                                    contentType = favorite.contentType
                                ),
                                addedAt = System.currentTimeMillis().toString()
                            )
                        }
                    
                    Timber.d("Fetched ${favorites.size} favorites")
                    Result.Success(favorites)
                } else {
                    val errorMessage = "Failed to fetch favorites"
                    Timber.w(errorMessage)
                    Result.Error(Exception(errorMessage))
                }
            } else {
                val errorMessage = "HTTP ${response.code()}: ${response.message()}"
                Timber.e("Favorites API error: $errorMessage")
                Result.Error(Exception(errorMessage))
            }
        } catch (e: Exception) {
            Timber.e(e, "Favorites fetch exception")
            Result.Error(e)
        }
    }
    
    override suspend fun addToFavorites(contentId: String): Result<Unit> {
        return try {
            Timber.d("Adding to favorites: $contentId")

            val contentType = resolveFavoriteContentType(contentId)
            val candidateTypes = favoriteTypeCandidates(contentType)
            val response = addFavoriteTryingTypes(contentId, candidateTypes)
            
            if (response.isSuccessful) {
                val body = response.body()
                if (body?.success == true) {
                    // Add to local cache
                    contentDao.insertFavorite(
                        com.streamcore.tv.data.local.entity.FavoriteEntity(
                            contentId = contentId,
                            addedAt = System.currentTimeMillis().toString()
                        )
                    )
                    
                    Timber.d("Added to favorites successfully")
                    Result.Success(Unit)
                } else {
                    val errorMessage = body?.messageOrError("Failed to add to favorites")
                    Timber.w(errorMessage)
                    Result.Error(Exception(errorMessage))
                }
            } else {
                val errorMessage = "HTTP ${response.code()}: ${response.message()}"
                Timber.e("Add to favorites API error: $errorMessage")
                Result.Error(Exception(errorMessage))
            }
        } catch (e: Exception) {
            Timber.e(e, "Add to favorites exception")
            Result.Error(e)
        }
    }
    
    override suspend fun removeFromFavorites(contentId: String): Result<Unit> {
        return try {
            Timber.d("Removing from favorites: $contentId")

            val contentType = resolveFavoriteContentType(contentId)
            val candidateTypes = favoriteTypeCandidates(contentType)
            val response = removeFavoriteTryingTypes(contentId, candidateTypes)
            
            if (response.isSuccessful) {
                val body = response.body()
                val removedFlag = when {
                    body?.data == null -> true
                    body.data.isJsonPrimitive && body.data.asJsonPrimitive.isBoolean -> body.data.asBoolean
                    else -> true
                }
                if (body?.success == true && removedFlag) {
                    // Remove from local cache
                    contentDao.deleteFavoriteByContentId(contentId)
                    
                    Timber.d("Removed from favorites successfully")
                    Result.Success(Unit)
                } else {
                    val errorMessage = if (body?.success == true && !removedFlag) {
                        "Favorite was not removed"
                    } else {
                        body?.messageOrError("Failed to remove from favorites")
                    }
                    Timber.w(errorMessage)
                    Result.Error(Exception(errorMessage))
                }
            } else {
                val errorMessage = "HTTP ${response.code()}: ${response.message()}"
                Timber.e("Remove from favorites API error: $errorMessage")
                Result.Error(Exception(errorMessage))
            }
        } catch (e: Exception) {
            Timber.e(e, "Remove from favorites exception")
            Result.Error(e)
        }
    }

    private suspend fun resolveFavoriteContentType(contentId: String): String {
        val type = contentDao.getContentById(contentId)?.type?.lowercase()
        return when (type) {
            "live_tv", "tv", "channel" -> "channel"
            "series", "anime" -> "series"
            else -> "movie"
        }
    }

    private suspend fun addFavoriteTryingTypes(
        contentId: String,
        candidateTypes: List<String>
    ): retrofit2.Response<com.streamcore.tv.data.remote.dto.ApiResponseDto> {
        var lastResponse: retrofit2.Response<com.streamcore.tv.data.remote.dto.ApiResponseDto>? = null

        for ((index, typeCandidate) in candidateTypes.withIndex()) {
            val response = apiService.addToFavorites(
                com.streamcore.tv.data.remote.dto.AddFavoriteRequestDto(
                    contentType = typeCandidate,
                    contentId = contentId
                )
            )
            lastResponse = response

            val isSuccessful = response.isSuccessful && response.body()?.success == true
            if (isSuccessful) {
                if (index > 0) {
                    Timber.i("Add favorite succeeded after content_type fallback: $typeCandidate")
                }
                return response
            }

            // Try next type only for likely type mismatch responses.
            if (response.code() !in listOf(400, 404, 422)) {
                return response
            }
        }

        return lastResponse ?: retrofit2.Response.error(
            500,
            @Suppress("DEPRECATION") okhttp3.ResponseBody.create(null, "Failed to add to favorites")
        )
    }

    private suspend fun removeFavoriteTryingTypes(
        contentId: String,
        candidateTypes: List<String>
    ): retrofit2.Response<com.streamcore.tv.data.remote.dto.ApiResponseDto> {
        var lastResponse: retrofit2.Response<com.streamcore.tv.data.remote.dto.ApiResponseDto>? = null

        for ((index, typeCandidate) in candidateTypes.withIndex()) {
            val response = apiService.removeFromFavorites(typeCandidate, contentId)
            lastResponse = response

            val body = response.body()
            val removedFlag = when {
                body?.data == null -> true
                body.data.isJsonPrimitive && body.data.asJsonPrimitive.isBoolean -> body.data.asBoolean
                else -> true
            }
            val isSuccessful = response.isSuccessful && body?.success == true && removedFlag
            if (isSuccessful) {
                if (index > 0) {
                    Timber.i("Remove favorite succeeded after content_type fallback: $typeCandidate")
                }
                return response
            }

            if (response.isSuccessful && body?.success == true && !removedFlag) {
                continue
            }

            // Try next type only for likely type mismatch responses.
            if (response.code() !in listOf(400, 404, 422)) {
                return response
            }
        }

        return lastResponse ?: retrofit2.Response.error(
            500,
            @Suppress("DEPRECATION") okhttp3.ResponseBody.create(null, "Failed to remove from favorites")
        )
    }

    private fun favoriteTypeCandidates(primaryType: String): List<String> {
        val canonicalPrimary = when (primaryType.lowercase()) {
            "tv", "live_tv" -> "channel"
            else -> primaryType.lowercase()
        }
        val all = listOf("movie", "series", "channel")
        return listOf(canonicalPrimary) + all.filterNot { it == canonicalPrimary }
    }

    private fun buildFallbackFavoriteContent(
        contentId: String,
        contentType: String
    ): ContentItem {
        val domainType = when (contentType.lowercase()) {
            "channel", "tv", "live_tv" -> ContentType.LIVE_TV
            "series", "anime" -> ContentType.SERIES
            "episode" -> ContentType.EPISODE
            else -> ContentType.MOVIE
        }

        return ContentItem(
            id = contentId,
            title = contentId,
            description = null,
            imageUrl = null,
            backdropUrl = null,
            duration = null,
            year = null,
            rating = null,
            genres = emptyList(),
            type = domainType,
            originalType = contentType,
            streamUrl = null
        )
    }
    
    override suspend fun isFavorite(contentId: String): Result<Boolean> {
        return try {
            val favorite = contentDao.getFavorite(contentId)
            Result.Success(favorite != null)
        } catch (e: Exception) {
            Timber.e(e, "Check favorite exception")
            Result.Error(e)
        }
    }
    
    override fun getFavoritesFlow(): Flow<List<FavoriteItem>> {
        return contentDao.getFavoriteContent().map { entities ->
            entities.map { entity ->
                FavoriteItem(
                    contentId = entity.id,
                    content = entity.toDomainModel(),
                    addedAt = System.currentTimeMillis().toString()
                )
            }
        }
    }
    
    // ========================================
    // WATCH HISTORY
    // ========================================
    
    override suspend fun getWatchHistory(): Result<List<WatchHistoryItem>> {
        return watchHistoryFetchMutex.withLock {
            val now = System.currentTimeMillis()
            lastWatchHistoryResult?.let { cached ->
                // Coalesce rapid repeated calls (e.g., multiple collectors on startup).
                if (now - lastWatchHistoryFetchMs < 5_000) {
                    Timber.d("Watch history: returning cached result (${cached.size} items)")
                    return@withLock Result.Success(cached)
                }
            }

            try {
                Timber.d("Fetching watch history")

                val response = apiService.getWatchHistory()

                if (response.isSuccessful) {
                    val body = response.body()
                    if (body?.success == true) {
                        val history = body.history.toWatchHistoryItems()

                        // Cache to local DB (best effort; history payload is minimal).
                        val contentItems = history.map { it.content }
                        contentDao.insertAllContent(contentItems.toContentEntities())

                        history.forEach { item ->
                            contentDao.insertWatchHistory(item.toEntity())
                        }

                        lastWatchHistoryFetchMs = now
                        lastWatchHistoryResult = history

                        Timber.d("Fetched and cached ${history.size} watch history items")
                        Result.Success(history)
                    } else {
                        val errorMessage = "Failed to fetch watch history"
                        Timber.w(errorMessage)
                        Result.Error(Exception(errorMessage))
                    }
                } else {
                    val errorMessage = "HTTP ${response.code()}: ${response.message()}"
                    Timber.e("Watch history API error: $errorMessage")
                    Result.Error(Exception(errorMessage))
                }
            } catch (e: Exception) {
                Timber.e(e, "Watch history fetch exception")
                Result.Error(e)
            }
        }
    }
    
    override suspend fun updateWatchProgress(
        contentId: String,
        progress: Float,
        duration: Long
    ): Result<Unit> {
        val normalizedProgress = if (progress > 1f) {
            (progress / 100f).coerceIn(0f, 1f)
        } else {
            progress.coerceIn(0f, 1f)
        }
        val safeDuration = duration.coerceAtLeast(0L)

        return try {
            Timber.d("Saving watch progress: $contentId, progress: $progress, duration: ${duration}ms")
            // Convert normalized progress and duration to seconds
            val positionSeconds = ((normalizedProgress * safeDuration.toFloat()) / 1000f).toLong()
            val durationSeconds = safeDuration / 1000L
            
            val request = com.streamcore.tv.data.remote.dto.SaveWatchProgressRequestDto(
                contentId = contentId.toLongOrNull() ?: 0L,
                contentType = null, // Will be determined by backend
                episodeId = null,
                positionSeconds = positionSeconds,
                durationSeconds = durationSeconds
            )
            
            val response = apiService.saveWatchProgress(request)
            
            if (response.isSuccessful) {
                // Update local cache
                contentDao.insertWatchHistory(
                    com.streamcore.tv.data.local.entity.WatchHistoryEntity(
                            contentId = contentId,
                            watchedAt = System.currentTimeMillis().toString(),
                            progress = normalizedProgress,
                            duration = safeDuration
                        )
                    )
                
                Timber.d("Watch progress saved successfully: ${positionSeconds}s / ${durationSeconds}s")
                Result.Success(Unit)
            } else {
                val errorMessage = "HTTP ${response.code()}: ${response.message()}"
                Timber.e("Save watch progress API error: $errorMessage")
                Result.Error(Exception(errorMessage))
            }
        } catch (e: Exception) {
            // Handle cancellation gracefully (when user exits player)
            if (e is kotlinx.coroutines.CancellationException ||
                (e is java.io.IOException && e.message?.contains("Canceled") == true)) {
                Timber.d("Save watch progress cancelled (user exit)")
                // Still save to local cache even if network request was cancelled
                try {
                    contentDao.insertWatchHistory(
                        com.streamcore.tv.data.local.entity.WatchHistoryEntity(
                            contentId = contentId,
                            watchedAt = System.currentTimeMillis().toString(),
                            progress = normalizedProgress,
                            duration = safeDuration
                        )
                    )
                    Timber.d("Watch progress saved locally despite cancellation")
                } catch (localE: Exception) {
                    Timber.w(localE, "Failed to save progress locally")
                }
                Result.Error(e)
            } else {
                Timber.e(e, "Save watch progress exception")
                Result.Error(e)
            }
        }
    }
    
    override suspend fun getWatchProgress(contentId: String): Result<WatchProgress?> {
        return try {
            val contentIdLong = contentId.toLongOrNull() ?: return Result.Success(null)
            
            // Try to get from server first
            val response = apiService.getWatchProgress(contentIdLong)
            
            if (response.isSuccessful && response.body()?.success == true) {
                val progressDto = response.body()?.progress
                if (progressDto != null && !progressDto.completed) {
                    // Convert backend progress to normalized 0..1 range
                    val progressPercent = when {
                        progressDto.durationSeconds > 0 -> {
                            (progressDto.positionSeconds.toFloat() / progressDto.durationSeconds.toFloat())
                                .coerceIn(0f, 1f)
                        }
                        progressDto.progressPercent > 1.0 -> {
                            (progressDto.progressPercent.toFloat() / 100f).coerceIn(0f, 1f)
                        }
                        else -> progressDto.progressPercent.toFloat().coerceIn(0f, 1f)
                    }
                    
                    val progress = WatchProgress(
                        contentId = progressDto.contentId.toString(),
                        progress = progressPercent,
                        duration = progressDto.durationSeconds * 1000, // Convert to ms
                        lastWatched = progressDto.updatedAt
                    )
                    Timber.d("Got watch progress from server: ${progressDto.positionSeconds}s (${(progressPercent * 100).toInt()}%)")
                    return Result.Success(progress)
                }
            }
            
            // Fallback to local cache
            val watchHistory = contentDao.getWatchHistory(contentId)
            val progress = watchHistory?.let {
                WatchProgress(
                    contentId = it.contentId,
                    progress = it.progress,
                    duration = it.duration,
                    lastWatched = it.watchedAt
                )
            }
            Result.Success(progress)
        } catch (e: Exception) {
            Timber.e(e, "Get watch progress exception")
            // Fallback to local cache on error
            try {
                val watchHistory = contentDao.getWatchHistory(contentId)
                val progress = watchHistory?.let {
                    WatchProgress(
                        contentId = it.contentId,
                        progress = it.progress,
                        duration = it.duration,
                        lastWatched = it.watchedAt
                    )
                }
                Result.Success(progress)
            } catch (localE: Exception) {
                Result.Error(e)
            }
        }
    }
    
    override suspend fun getContinueWatching(): Result<List<WatchHistoryItem>> {
        return try {
            Timber.d("Fetching continue watching from server (/api/user/continue-watching)")
            val response = apiService.getContinueWatching()

            if (!response.isSuccessful) {
                val errorMessage = "HTTP ${response.code()}: ${response.message()}"
                Timber.w("Continue watching API error: $errorMessage")
                return Result.Error(Exception(errorMessage))
            }

            val body = response.body()
            if (body?.success != true) {
                Timber.w("Continue watching API returned success=false")
                return Result.Error(Exception("Continue watching API returned success=false"))
            }

            // Filter items with meaningful progress (skip 0% entries from premature saves)
            val validItems = body.items.filter { item ->
                val hasProgress = item.progressPercent > 0.0 || item.positionSeconds > 0
                val hasDuration = item.durationSeconds > 0
                hasProgress || hasDuration
            }

            val watchHistoryItems = validItems.map { item ->
                val mappedType = when (item.contentType.lowercase()) {
                    "movie", "vod" -> ContentType.MOVIE
                    "series", "anime" -> ContentType.SERIES
                    "live_tv", "tv" -> ContentType.LIVE_TV
                    "episode" -> ContentType.EPISODE
                    else -> ContentType.MOVIE
                }

                val durationSec = item.durationSeconds
                val posSec = item.positionSeconds
                val progress = if (durationSec > 0) {
                    (posSec.toFloat() / durationSec.toFloat()).coerceIn(0f, 1f)
                } else {
                    val p = item.progressPercent.toFloat()
                    if (p > 1f) (p / 100f).coerceIn(0f, 1f) else p.coerceIn(0f, 1f)
                }

                val contentItem = ContentItem(
                    id = item.contentId.toString(),
                    title = item.title ?: "Unknown",
                    description = null,
                    imageUrl = item.posterUrl,
                    backdropUrl = item.backdropUrl,
                    duration = durationSec,
                    year = null,
                    rating = null,
                    genres = emptyList(),
                    type = mappedType,
                    originalType = item.contentType,
                    streamUrl = null
                )

                WatchHistoryItem(
                    contentId = item.contentId.toString(),
                    content = contentItem,
                    watchedAt = item.updatedAt ?: "",
                    progress = progress,
                    duration = durationSec * 1000L
                )
            }

            Timber.d("Continue watching fetched: ${validItems.size} valid items (${body.items.size} total from API)")
            Result.Success(watchHistoryItems)
        } catch (e: Exception) {
            Timber.e(e, "Continue watching fetch exception")
            Result.Error(e)
        }
    }
    
    override suspend fun clearWatchHistory(): Result<Unit> {
        return try {
            contentDao.clearAllWatchHistory()
            Timber.d("Watch history cleared")
            Result.Success(Unit)
        } catch (e: Exception) {
            Timber.e(e, "Clear watch history exception")
            Result.Error(e)
        }
    }
    
    // ========================================
    // DEVICE MANAGEMENT
    // ========================================
    
    override suspend fun getUserDevices(): Result<List<DeviceInfo>> {
        return try {
            Timber.d("Fetching user devices from /api/devices endpoint")

            // Use the same endpoint as getDeviceStatus for consistency
            val response = apiService.getUserDevicesWithLimit()

            if (response.isSuccessful) {
                val body = response.body()
                if (body != null) {
                    // Convert BackendDeviceDto to DeviceInfo
                    val currentDeviceId = deviceIdentifierManager.getDeviceId()
                    Timber.d("🔍 Current device ID: ${currentDeviceId.take(20)}...")
                    Timber.d("📱 Backend returned ${body.devices.size} devices:")
                    body.devices.forEach { device ->
                        val loggedName = device.deviceName ?: "Unknown device"
                        val loggedDeviceId = device.deviceId ?: "unknown"
                        Timber.d("  - Device: ${loggedName} (${loggedDeviceId.take(20)}...)")
                    }

                    val devices = body.devices.map { backendDevice ->
                        val resolvedDeviceId = backendDevice.deviceId ?: backendDevice.id?.toString() ?: "unknown"
                        val resolvedName = backendDevice.deviceName ?: "Unknown device"
                        val isCurrentDevice = resolvedDeviceId == currentDeviceId
                        Timber.d("🔄 Mapping device ${resolvedName}: isCurrentDevice = $isCurrentDevice")
                        if (isCurrentDevice) {
                            Timber.i("✅ Found current device: ${resolvedName}")
                        }
                        DeviceInfo(
                            id = resolvedDeviceId,
                            name = resolvedName,
                            type = inferDeviceType(resolvedName),
                            lastActive = backendDevice.lastActive ?: backendDevice.createdAt ?: "",
                            isCurrentDevice = isCurrentDevice
                        )
                    }

                    Timber.d("Converted to ${devices.size} DeviceInfo objects")
                    devices.forEach { device ->
                        Timber.d("  - DeviceInfo: ${device.name} (${device.id.take(20)}...) - isCurrentDevice: ${device.isCurrentDevice}")
                    }
                    Result.Success(devices)
                } else {
                    val errorMessage = "No devices data in response"
                    Timber.w(errorMessage)
                    Result.Error(Exception(errorMessage))
                }
            } else {
                val errorMessage = "HTTP ${response.code()}: ${response.message()}"
                Timber.e("User devices API error: $errorMessage")
                Result.Error(Exception(errorMessage))
            }
        } catch (e: Exception) {
            Timber.e(e, "User devices fetch exception")
            Result.Error(e)
        }
    }
    
    override suspend fun removeDevice(deviceId: String): Result<Unit> {
        return try {
            Timber.d("🗑️ Removing device: ${deviceId.take(20)}...")

            // Log current device count before removal
            val currentDevices = getUserDevices()
            if (currentDevices is Result.Success) {
                Timber.d("📊 Current device count before removal: ${currentDevices.data.size}")
                currentDevices.data.forEach { device ->
                    Timber.d("  - ${device.name} (${device.id.take(20)}...) - Current: ${device.isCurrentDevice}")
                }
            }

            val response = apiService.removeDevice(deviceId)

            if (response.isSuccessful) {
                val body = response.body()
                if (body?.success == true) {
                    Timber.i("✅ Device removed successfully: ${body.message}")

                    // Log device count after removal for verification
                    val devicesAfter = getUserDevices()
                    if (devicesAfter is Result.Success) {
                        Timber.d("📊 Device count after removal: ${devicesAfter.data.size}")
                    }

                    Result.Success(Unit)
                } else {
                    val errorMessage = body?.message ?: "Failed to remove device"
                    Timber.w("⚠️ Device removal failed: $errorMessage")
                    Result.Error(Exception(errorMessage))
                }
            } else {
                val errorMessage = "HTTP ${response.code()}: ${response.message()}"
                Timber.e("❌ Remove device API error: $errorMessage")
                Result.Error(Exception(errorMessage))
            }
        } catch (e: Exception) {
            Timber.e(e, "💥 Remove device exception")
            Result.Error(e)
        }
    }

    private fun inferDeviceType(deviceName: String): String {
        val normalized = deviceName.lowercase()
        return when {
            normalized.contains("android tv") || normalized.contains("fire tv") || normalized.contains("shield") -> "android_tv"
            normalized.contains("android") || normalized.contains("pixel") || normalized.contains("samsung") || normalized.contains("xiaomi") -> "android"
            normalized.contains("iphone") || normalized.contains("ipad") -> "ios"
            normalized.contains("chrome") || normalized.contains("firefox") || normalized.contains("safari") -> "web"
            else -> "android"
        }
    }
    
    override suspend fun updateDeviceName(deviceId: String, name: String): Result<Unit> {
        return try {
            // Note: Backend does not currently support updating device name via API
            // Device names are set at registration time only
            // For now, log the request and return success to prevent UI errors
            Timber.w("Update device name not supported by backend API. Device: $deviceId, requested name: $name")
            Result.Success(Unit)
        } catch (e: Exception) {
            Timber.e(e, "Update device name exception")
            Result.Error(e)
        }
    }
    
    // ========================================
    // LOCAL CACHE
    // ========================================

    override suspend fun cacheUserData(profile: UserProfile): Result<Unit> {
        return try {
            userDao.insertUser(profile.toEntity())
            Timber.d("User data cached")
            Result.Success(Unit)
        } catch (e: Exception) {
            Timber.e(e, "Cache user data exception")
            Result.Error(e)
        }
    }
    
    override fun getCachedUserData(): Flow<UserProfile?> {
        return userDao.getUserProfile().map { entity ->
            entity?.toDomainModel()
        }
    }
    
    override suspend fun clearUserCache(): Result<Unit> {
        return try {
            userDao.clearUserProfile()
            Timber.d("User cache cleared")
            Result.Success(Unit)
        } catch (e: Exception) {
            Timber.e(e, "Clear user cache exception")
            Result.Error(e)
        }
    }
}
