package com.streamcore.tv.data.mapper

import com.google.gson.Gson
import com.streamcore.tv.data.remote.dto.ApiResponseDto
import com.streamcore.tv.data.remote.dto.ContentItemDto
import com.streamcore.tv.data.remote.dto.FavoritesDataDto
import com.streamcore.tv.data.remote.dto.TokenRefreshResponseDto
import com.streamcore.tv.domain.model.ContentType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BackendContractMappingTest {

    private val gson = Gson()

    @Test
    fun `token refresh dto accepts token aliases`() {
        val snake = gson.fromJson(
            """{"access_token":"abc"}""",
            TokenRefreshResponseDto::class.java
        )
        val camel = gson.fromJson(
            """{"accessToken":"xyz"}""",
            TokenRefreshResponseDto::class.java
        )
        val canonical = gson.fromJson(
            """{"token":"mno"}""",
            TokenRefreshResponseDto::class.java
        )

        assertEquals("abc", snake.token)
        assertEquals("xyz", camel.token)
        assertEquals("mno", canonical.token)
        assertTrue(canonical.success)
    }

    @Test
    fun `favorites typed ids preserve backend content type`() {
        val dto = FavoritesDataDto(
            movies = listOf("1"),
            series = listOf("2"),
            channels = listOf("3"),
            musicTracks = listOf("4")
        )

        val typed = dto.typedIds()

        assertEquals(4, typed.size)
        assertEquals("movie", typed[0].contentType)
        assertEquals("series", typed[1].contentType)
        assertEquals("channel", typed[2].contentType)
        assertEquals("music_track", typed[3].contentType)
    }

    @Test
    fun `content mapper supports backend tv and vod content_type values`() {
        val tvItem = contentItem(contentType = "tv", channelNumber = 10)
        val vodItem = contentItem(contentType = "vod")
        val animeItem = contentItem(contentType = "anime")

        assertEquals(ContentType.LIVE_TV, tvItem.toDomainModel().type)
        assertEquals(ContentType.MOVIE, vodItem.toDomainModel().type)
        assertEquals(ContentType.SERIES, animeItem.toDomainModel().type)
    }

    @Test
    fun `api response dto messageOrError prefers message then error`() {
        val withMessage = ApiResponseDto(success = false, message = "msg", error = "err")
        val withErrorOnly = ApiResponseDto(success = false, message = null, error = "err")
        val empty = ApiResponseDto(success = false, message = null, error = null)

        assertEquals("msg", withMessage.messageOrError())
        assertEquals("err", withErrorOnly.messageOrError())
        assertEquals("Unknown API error", empty.messageOrError())
    }

    private fun contentItem(
        contentType: String,
        channelNumber: Int? = null
    ): ContentItemDto {
        return ContentItemDto(
            id = 1L,
            categoryId = 1L,
            title = "Title",
            description = null,
            posterUrl = null,
            imageUrl = null,
            backdropUrl = null,
            streamUrl = null,
            tmdbId = null,
            year = null,
            active = true,
            createdAt = "2026-01-01T00:00:00Z",
            provider = null,
            country = null,
            format = null,
            channelNumber = channelNumber,
            channelCategory = null,
            isLive = null,
            drmKeys = null,
            contentType = contentType,
            origin = null,
            userAgent = null,
            referer = null,
            customHeaders = null,
            proxyUrl = null,
            dohUrl = null
        )
    }
}
