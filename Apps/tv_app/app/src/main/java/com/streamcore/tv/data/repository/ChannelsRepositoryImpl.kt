package com.streamcore.tv.data.repository

import com.streamcore.tv.data.local.dao.ChannelDao
import com.streamcore.tv.data.local.datastore.UserPreferencesManager
import com.streamcore.tv.data.local.entity.ChannelEntity
import com.streamcore.tv.data.local.entity.EPGProgramEntity
import com.streamcore.tv.data.remote.api.IPTVApiService
import com.streamcore.tv.data.remote.dto.ContentItemDto
import com.streamcore.tv.domain.model.*
import com.streamcore.tv.domain.repository.ChannelsRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Implementation of ChannelsRepository
 * 
 * Handles:
 * - Live TV channels from API with local caching
 * - EPG data management
 * - User favorites
 * - Stream quality preferences
 * - LiveTV state management
 */
@Singleton
class ChannelsRepositoryImpl @Inject constructor(
    private val apiService: IPTVApiService,
    private val channelDao: ChannelDao,
    private val userPreferencesManager: UserPreferencesManager
) : ChannelsRepository {

    // Internal state for LiveTV
    private val _liveTVState = MutableStateFlow(LiveTVState(currentChannel = null, currentProgram = null))

    // ========================================
    // CHANNELS
    // ========================================

    override suspend fun getChannels(category: String?, page: Int, limit: Int): Result<List<Channel>> {
        return try {
            val response = apiService.getChannels(
                channelCategory = category,
                page = page,
                limit = limit
            )
            val responseBody = response.body()

            if (response.isSuccessful && responseBody != null) {
                // Backend returns flat List<ContentResponse> for /api/tv/channels
                val channels = responseBody.map { it.toChannel() }
                
                // Cache channels in local database
                val entities = channels.map { it.toEntity() }
                channelDao.insertAllChannels(entities)
                
                Timber.d("Fetched ${channels.size} channels from API (category: $category)")
                Result.Success(channels)
            } else {
                Timber.e("Error fetching channels: ${response.message()}")
                Result.Error(Exception("Error fetching channels: ${response.message()}"))
            }
        } catch (e: Exception) {
            Timber.e(e, "Exception fetching channels")
            Result.Error(e)
        }
    }

    override suspend fun getChannel(channelId: String): Result<Channel> {
        return try {
            // First check local cache
            val cachedChannel = channelDao.getChannelById(channelId)
            if (cachedChannel != null) {
                Timber.d("Channel $channelId found in cache")
                return Result.Success(cachedChannel.toDomain())
            }

            // If not in cache, fetch from API
            val response = apiService.getChannels(limit = 500)
            val responseBody = response.body()
            if (response.isSuccessful && responseBody != null) {
                val matchingItem = responseBody.find { it.id.toString() == channelId }
                
                if (matchingItem != null) {
                    val channel = matchingItem.toChannel()
                    // Cache the channel
                    channelDao.insertChannel(channel.toEntity())
                    Timber.d("Channel $channelId fetched from API and cached")
                    Result.Success(channel)
                } else {
                    Timber.w("Channel $channelId not found")
                    Result.Error(Exception("Channel not found"))
                }
            } else {
                Timber.e("Error fetching channel: ${response.message()}")
                Result.Error(Exception("Error fetching channel: ${response.message()}"))
            }
        } catch (e: Exception) {
            Timber.e(e, "Exception fetching channel $channelId")
            Result.Error(e)
        }
    }

    override suspend fun getChannelsByCategory(category: String): Result<List<Channel>> {
        return try {
            val response = apiService.getChannels(channelCategory = category, limit = 500)
            val responseBody = response.body()
            
            if (response.isSuccessful && responseBody != null) {
                val channels = responseBody.map { it.toChannel() }
                
                Timber.d("Fetched ${channels.size} channels for category: $category")
                Result.Success(channels)
            } else {
                Timber.e("Error fetching channels by category: ${response.message()}")
                Result.Error(Exception("Error fetching channels: ${response.message()}"))
            }
        } catch (e: Exception) {
            Timber.e(e, "Exception fetching channels by category $category")
            Result.Error(e)
        }
    }

    override suspend fun getChannelCategories(): Result<List<ChannelCategory>> {
        return try {
            val response = apiService.getTvChannelCategories()
            val responseBody = response.body()
            
            if (response.isSuccessful && responseBody != null) {
                val categoryNames = responseBody
                val categories = categoryNames.map { name ->
                    ChannelCategory(
                        id = name.lowercase().replace(" ", "_"),
                        name = name,
                        channels = emptyList()
                    )
                }
                
                Timber.d("Fetched ${categories.size} channel categories")
                Result.Success(categories)
            } else {
                Timber.e("Error fetching channel categories: ${response.message()}")
                Result.Error(Exception("Error fetching categories: ${response.message()}"))
            }
        } catch (e: Exception) {
            Timber.e(e, "Exception fetching channel categories")
            Result.Error(e)
        }
    }

    override suspend fun searchChannels(query: String): Result<List<Channel>> {
        return try {
            val cachedChannels = channelDao.searchChannels(query)
            val channels = cachedChannels.map { it.toDomain() }
            
            Timber.d("Found ${channels.size} channels matching '$query'")
            Result.Success(channels)
        } catch (e: Exception) {
            Timber.e(e, "Exception searching channels")
            Result.Error(e)
        }
    }

    // ========================================
    // FAVORITES
    // ========================================

    override suspend fun getFavoriteChannels(): Result<List<Channel>> {
        return try {
            val favoriteIds = userPreferencesManager.getFavorites().first()
            
            if (favoriteIds.isEmpty()) {
                return Result.Success(emptyList())
            }

            // Get channels from cache that match favorite IDs
            val favoriteChannels = mutableListOf<Channel>()
            for (id in favoriteIds) {
                val channelEntity = channelDao.getChannelById(id)
                if (channelEntity != null) {
                    favoriteChannels.add(channelEntity.toDomain())
                }
            }

            Timber.d("Retrieved ${favoriteChannels.size} favorite channels")
            Result.Success(favoriteChannels)
        } catch (e: Exception) {
            Timber.e(e, "Exception getting favorite channels")
            Result.Error(e)
        }
    }

    override suspend fun addChannelToFavorites(channelId: String): Result<Unit> {
        return try {
            userPreferencesManager.addFavorite(channelId)
            Timber.d("Added channel $channelId to favorites")
            Result.Success(Unit)
        } catch (e: Exception) {
            Timber.e(e, "Exception adding channel to favorites")
            Result.Error(e)
        }
    }

    override suspend fun removeChannelFromFavorites(channelId: String): Result<Unit> {
        return try {
            userPreferencesManager.removeFavorite(channelId)
            Timber.d("Removed channel $channelId from favorites")
            Result.Success(Unit)
        } catch (e: Exception) {
            Timber.e(e, "Exception removing channel from favorites")
            Result.Error(e)
        }
    }

    // ========================================
    // EPG
    // ========================================
    
    override suspend fun getEPG(channelId: String, date: String?, hours: Int): Result<EPGData> {
        return try {
            // Use the new backend EPG endpoint
            val now = java.time.Instant.now()
            val start = now.toString()
            val end = now.plusSeconds((hours * 3600).toLong()).toString()

            val response = apiService.getEPG(
                channelIds = channelId,
                start = start,
                end = end
            )
            val responseBody = response.body()

            if (response.isSuccessful && responseBody != null) {
                val epgResponse = responseBody

                // Convert backend format to app format
                val programs = epgResponse.programs
                    .filter { it.channelId == channelId }
                    .map { dto ->
                        EPGProgram(
                            id = "${dto.channelId}_${dto.start}",
                            title = dto.title,
                            description = dto.description,
                            startTime = dto.start,
                            endTime = dto.end,
                            category = dto.category,
                            isLive = isCurrentlyLive(dto.start, dto.end),
                            progress = calculateProgress(dto.start, dto.end)
                        )
                    }

                val epgData = EPGData(
                    channelId = channelId,
                    programs = programs,
                    date = date ?: java.time.LocalDate.now().toString()
                )

                Result.Success(epgData)
            } else {
                Result.Error(Exception("Unknown error: ${response.message()}"))
            }
        } catch (e: Exception) {
            Result.Error(e)
        }
    }

    override suspend fun getCurrentProgram(channelId: String): Result<EPGProgram?> {
        return try {
            val now = java.time.Instant.now()
            val start = now.minusSeconds(3600).toString() // 1 hour ago
            val end = now.plusSeconds(3600).toString()    // 1 hour from now

            val response = apiService.getEPG(
                channelIds = channelId,
                start = start,
                end = end
            )
            val responseBody = response.body()

            if (response.isSuccessful && responseBody != null) {
                val currentProgram = responseBody.programs
                    .filter { it.channelId == channelId }
                    .map { dto ->
                        EPGProgram(
                            id = "${dto.channelId}_${dto.start}",
                            title = dto.title,
                            description = dto.description,
                            startTime = dto.start,
                            endTime = dto.end,
                            category = dto.category,
                            isLive = isCurrentlyLive(dto.start, dto.end),
                            progress = calculateProgress(dto.start, dto.end)
                        )
                    }
                    .find { it.isLive }

                Result.Success(currentProgram)
            } else {
                Result.Success(null)
            }
        } catch (e: Exception) {
            Result.Error(e)
        }
    }

    override suspend fun getNextProgram(channelId: String): Result<EPGProgram?> {
        return try {
            val now = java.time.Instant.now()
            val start = now.toString()
            val end = now.plusSeconds(12 * 3600).toString() // 12 hours from now

            val response = apiService.getEPG(
                channelIds = channelId,
                start = start,
                end = end
            )
            val responseBody = response.body()

            if (response.isSuccessful && responseBody != null) {
                val nextProgram = responseBody.programs
                    .filter { it.channelId == channelId }
                    .map { dto ->
                        EPGProgram(
                            id = "${dto.channelId}_${dto.start}",
                            title = dto.title,
                            description = dto.description,
                            startTime = dto.start,
                            endTime = dto.end,
                            category = dto.category,
                            isLive = false,
                            progress = 0f
                        )
                    }
                    .filter { !isCurrentlyLive(it.startTime, it.endTime) }
                    .minByOrNull { java.time.Instant.parse(it.startTime) }

                Result.Success(nextProgram)
            } else {
                Result.Success(null)
            }
        } catch (e: Exception) {
            Result.Error(e)
        }
    }

    override suspend fun getMultiChannelEPG(channelIds: List<String>, date: String?): Result<Map<String, EPGData>> {
        return try {
            // Get start of today and end of tomorrow to cover full EPG range
            val now = java.time.Instant.now()
            val startOfToday = now.atZone(java.time.ZoneOffset.UTC)
                .toLocalDate()
                .atStartOfDay(java.time.ZoneOffset.UTC)
                .toInstant()
            val endOfTomorrow = startOfToday.plusSeconds(48 * 3600) // 48 hours to cover today + tomorrow

            val start = startOfToday.toString()
            val end = endOfTomorrow.toString()

            Timber.d("EPG Request: Requesting EPG from $start to $end for ${channelIds.size} channels")

            val response = apiService.getEPG(
                channelIds = channelIds.joinToString(","),
                start = start,
                end = end
            )
            val responseBody = response.body()

            if (response.isSuccessful && responseBody != null) {
                val epgResponse = responseBody

                // Log response information for debugging
                Timber.d("EPG Response received: ${epgResponse.programs.size} programs total")

                // Group programs by channel ID
                val programsByChannel = epgResponse.programs.groupBy { it.channelId }

                val epgDataMap = mutableMapOf<String, EPGData>()
                
                // Debug: log system time and incoming channel IDs
                val systemNow = java.time.Instant.now()
                Timber.d("EPG Debug: System time is $systemNow, requested channels: $channelIds")
                Timber.d("EPG Debug: Backend returned programs for channels: ${programsByChannel.keys}")

                channelIds.forEach { channelId ->
                    val channelPrograms = programsByChannel[channelId] ?: emptyList()
                    Timber.d("EPG: Channel $channelId has ${channelPrograms.size} programs")

                    val programs = channelPrograms.map { dto ->
                        EPGProgram(
                            id = "${dto.channelId}_${dto.start}",
                            title = dto.title,
                            description = dto.description,
                            startTime = dto.start,
                            endTime = dto.end,
                            category = dto.category,
                            isLive = isCurrentlyLive(dto.start, dto.end),
                            progress = calculateProgress(dto.start, dto.end)
                        )
                    }

                    epgDataMap[channelId] = EPGData(
                        channelId = channelId,
                        programs = programs,
                        date = date ?: java.time.LocalDate.now().toString()
                    )
                }

                Timber.d("EPG: Created EPG data map for ${epgDataMap.size} channels")
                Result.Success(epgDataMap)
            } else {
                val errorMsg = "EPG API Error: ${response.code()} - ${response.message()}"
                Timber.e(errorMsg)
                Result.Error(Exception(errorMsg))
            }
        } catch (e: Exception) {
            Result.Error(e)
        }
    }

    override suspend fun getProgramsByTimeRange(channelId: String, startTime: String, endTime: String): Result<List<EPGProgram>> {
        return try {
            val response = apiService.getEPG(
                channelIds = channelId,
                start = startTime,
                end = endTime
            )
            val responseBody = response.body()

            if (response.isSuccessful && responseBody != null) {
                val programs = responseBody.programs
                    .filter { it.channelId == channelId }
                    .map { dto ->
                        EPGProgram(
                            id = "${dto.channelId}_${dto.start}",
                            title = dto.title,
                            description = dto.description,
                            startTime = dto.start,
                            endTime = dto.end,
                            category = dto.category,
                            isLive = isCurrentlyLive(dto.start, dto.end),
                            progress = calculateProgress(dto.start, dto.end)
                        )
                    }

                Result.Success(programs)
            } else {
                Result.Error(Exception("Unknown error: ${response.message()}"))
            }
        } catch (e: Exception) {
            Result.Error(e)
        }
    }

    // ========================================
    // STREAMING
    // ========================================
    
    override suspend fun getStreamInfo(channelId: String): Result<StreamInfo> {
        return try {
            // Get channel from cache first
            val channelEntity = channelDao.getChannelById(channelId)
            
            if (channelEntity != null) {
                val streamInfo = StreamInfo(
                    url = channelEntity.streamUrl,
                    quality = VideoQuality.AUTO,
                    format = detectStreamFormat(channelEntity.streamUrl),
                    bitrate = null,
                    resolution = null
                )
                Timber.d("Stream info created for channel $channelId")
                Result.Success(streamInfo)
            } else {
                // Try fetching from API
                when (val channelResult = getChannel(channelId)) {
                    is Result.Success -> {
                        val streamInfo = StreamInfo(
                            url = channelResult.data.streamUrl,
                            quality = VideoQuality.AUTO,
                            format = detectStreamFormat(channelResult.data.streamUrl),
                            bitrate = null,
                            resolution = null
                        )
                        Result.Success(streamInfo)
                    }
                    is Result.Error -> Result.Error(channelResult.exception)
                    is Result.Loading -> Result.Loading
                }
            }
        } catch (e: Exception) {
            Timber.e(e, "Exception getting stream info for channel $channelId")
            Result.Error(e)
        }
    }

    override suspend fun getAvailableQualities(channelId: String): Result<List<VideoQuality>> {
        return try {
            // Return standard quality options - actual availability depends on stream
            val qualities = listOf(
                VideoQuality.AUTO,
                VideoQuality.HIGH,
                VideoQuality.MEDIUM,
                VideoQuality.LOW
            )
            Timber.d("Returning ${qualities.size} available qualities for channel $channelId")
            Result.Success(qualities)
        } catch (e: Exception) {
            Timber.e(e, "Exception getting available qualities")
            Result.Error(e)
        }
    }

    override suspend fun updateStreamQuality(channelId: String, quality: VideoQuality): Result<Unit> {
        return try {
            // Save quality preference using UserPreferencesManager
            userPreferencesManager.saveVideoQuality(quality.name)
            Timber.d("Updated stream quality to $quality for channel $channelId")
            Result.Success(Unit)
        } catch (e: Exception) {
            Timber.e(e, "Exception updating stream quality")
            Result.Error(e)
        }
    }

    // ========================================
    // CACHE
    // ========================================

    override suspend fun cacheChannels(channels: List<Channel>): Result<Unit> {
        return try {
            val entities = channels.map { it.toEntity() }
            channelDao.insertAllChannels(entities)
            Timber.d("Cached ${channels.size} channels")
            Result.Success(Unit)
        } catch (e: Exception) {
            Timber.e(e, "Exception caching channels")
            Result.Error(e)
        }
    }
    
    override fun getCachedChannels(): Flow<List<Channel>> {
        return channelDao.getAllChannels().map { entities ->
            entities.map { it.toDomain() }
        }
    }
    
    override suspend fun cacheEPGData(epgData: List<EPGData>): Result<Unit> {
        return try {
            val entities = epgData.flatMap { data ->
                data.programs.map { program ->
                    EPGProgramEntity(
                        id = program.id,
                        channelId = data.channelId,
                        title = program.title,
                        description = program.description,
                        startTime = program.startTime,
                        endTime = program.endTime,
                        category = program.category,
                        cachedAt = System.currentTimeMillis()
                    )
                }
            }
            channelDao.insertAllEPGPrograms(entities)
            Timber.d("Cached ${entities.size} EPG programs")
            Result.Success(Unit)
        } catch (e: Exception) {
            Timber.e(e, "Exception caching EPG data")
            Result.Error(e)
        }
    }

    override fun getCachedEPGData(channelId: String): Flow<EPGData?> {
        return channelDao.getEPGForChannel(channelId).map { programs ->
            if (programs.isEmpty()) {
                null
            } else {
                EPGData(
                    channelId = channelId,
                    programs = programs.map { entity ->
                        EPGProgram(
                            id = entity.id,
                            title = entity.title,
                            description = entity.description,
                            startTime = entity.startTime,
                            endTime = entity.endTime,
                            category = entity.category,
                            isLive = isCurrentlyLive(entity.startTime, entity.endTime),
                            progress = calculateProgress(entity.startTime, entity.endTime)
                        )
                    },
                    date = java.time.LocalDate.now().toString()
                )
            }
        }
    }

    override suspend fun clearChannelsCache(): Result<Unit> {
        return try {
            channelDao.clearAllChannels()
            Timber.d("Channels cache cleared")
            Result.Success(Unit)
        } catch (e: Exception) {
            Timber.e(e, "Exception clearing channels cache")
            Result.Error(e)
        }
    }

    override suspend fun clearEPGCache(): Result<Unit> {
        return try {
            channelDao.clearAllEPG()
            Timber.d("EPG cache cleared")
            Result.Success(Unit)
        } catch (e: Exception) {
            Timber.e(e, "Exception clearing EPG cache")
            Result.Error(e)
        }
    }

    // ========================================
    // LIVETV STATE
    // ========================================

    override fun getLiveTVState(): Flow<LiveTVState> {
        return _liveTVState.asStateFlow()
    }

    override suspend fun updateLiveTVState(state: LiveTVState): Result<Unit> {
        return try {
            _liveTVState.value = state
            Timber.d("LiveTV state updated: channel=${state.currentChannel?.name}, isPlaying=${state.isPlaying}")
            Result.Success(Unit)
        } catch (e: Exception) {
            Timber.e(e, "Exception updating LiveTV state")
            Result.Error(e)
        }
    }

    override suspend fun switchToChannel(channelId: String): Result<Unit> {
        return try {
            when (val channelResult = getChannel(channelId)) {
                is Result.Success -> {
                    val currentProgram = when (val programResult = getCurrentProgram(channelId)) {
                        is Result.Success -> programResult.data
                        is Result.Error -> null
                        is Result.Loading -> null
                    }
                    
                    _liveTVState.value = _liveTVState.value.copy(
                        currentChannel = channelResult.data,
                        currentProgram = currentProgram,
                        isPlaying = true
                    )
                    
                    // Save last viewed channel
                    userPreferencesManager.saveLastViewedChannel(channelId)
                    
                    Timber.d("Switched to channel: ${channelResult.data.name}")
                    Result.Success(Unit)
                }
                is Result.Error -> {
                    Timber.e("Failed to switch to channel $channelId: ${channelResult.exception.message}")
                    Result.Error(channelResult.exception)
                }
                is Result.Loading -> Result.Loading
            }
        } catch (e: Exception) {
            Timber.e(e, "Exception switching to channel $channelId")
            Result.Error(e)
        }
    }

    // ========================================
    // HELPER FUNCTIONS
    // ========================================

    /**
     * Helper function to check if a program is currently live
     */
    private fun isCurrentlyLive(start: String, end: String): Boolean {
        return try {
            val now = java.time.Instant.now()
            val startTime = java.time.Instant.parse(start)
            val endTime = java.time.Instant.parse(end)
            now.isAfter(startTime) && now.isBefore(endTime)
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Helper function to calculate program progress (0.0 to 1.0)
     */
    private fun calculateProgress(start: String, end: String): Float {
        return try {
            val now = java.time.Instant.now()
            val startTime = java.time.Instant.parse(start)
            val endTime = java.time.Instant.parse(end)

            if (now.isBefore(startTime)) return 0f
            if (now.isAfter(endTime)) return 1f

            val totalDuration = java.time.Duration.between(startTime, endTime).toMillis()
            val elapsed = java.time.Duration.between(startTime, now).toMillis()

            (elapsed.toFloat() / totalDuration.toFloat()).coerceIn(0f, 1f)
        } catch (e: Exception) {
            0f
        }
    }

    /**
     * Detect stream format from URL
     */
    private fun detectStreamFormat(url: String): StreamFormat {
        return when {
            url.contains(".m3u8", ignoreCase = true) -> StreamFormat.HLS
            url.contains(".mpd", ignoreCase = true) -> StreamFormat.DASH
            url.contains(".mp4", ignoreCase = true) -> StreamFormat.MP4
            url.contains("rtmp://", ignoreCase = true) -> StreamFormat.RTMP
            else -> StreamFormat.HLS // Default to HLS
        }
    }
}

// ========================================
// MAPPER EXTENSIONS
// ========================================

/**
 * Convert ContentItemDto (backend format for /api/tv/channels) to Domain Channel
 */
private fun ContentItemDto.toChannel(): Channel {
    return Channel(
        id = this.id.toString(),
        name = this.title,
        logoUrl = this.posterUrl ?: this.imageUrl,
        streamUrl = this.streamUrl ?: "",
        category = this.channelCategory ?: this.categoryId.toString(),
        isActive = this.active,
        epgData = null
    )
}

/**
 * Convert Domain Channel to ChannelEntity
 */
private fun Channel.toEntity(): ChannelEntity {
    return ChannelEntity(
        id = this.id,
        name = this.name,
        logoUrl = this.logoUrl,
        streamUrl = this.streamUrl,
        category = this.category,
        isActive = this.isActive,
        cachedAt = System.currentTimeMillis()
    )
}

/**
 * Convert ChannelEntity to Domain Channel
 */
private fun ChannelEntity.toDomain(): Channel {
    return Channel(
        id = this.id,
        name = this.name,
        logoUrl = this.logoUrl,
        streamUrl = this.streamUrl,
        category = this.category,
        isActive = this.isActive,
        epgData = null
    )
}
