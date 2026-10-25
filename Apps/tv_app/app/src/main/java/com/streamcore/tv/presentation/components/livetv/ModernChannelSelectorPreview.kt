package com.streamcore.tv.presentation.components.livetv

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import com.streamcore.tv.domain.model.ContentStream
import com.streamcore.tv.presentation.theme.IPTVTheme

/**
 * Preview for Mobile Channel Selector with sample data
 * Demonstrates the simplified mobile UI
 */
@Preview(showBackground = true, device = "spec:width=1080dp,height=1920dp")
@Composable
fun MobileChannelSelectorPreview() {
    IPTVTheme {
        var isVisible by remember { mutableStateOf(true) }

        ModernChannelSelector(
            isVisible = isVisible,
            channels = generateSampleChannels().take(50), // Fewer for preview
            currentChannelId = "3",
            onChannelSelected = { /* Preview */ },
            onDismiss = { isVisible = false },
            modifier = Modifier.fillMaxSize()
        )
    }
}

/**
 * Generates sample channels for preview (190 channels)
 */
private fun generateSampleChannels(): List<ContentStream> {
    val categories = listOf(
        "News", "Sports", "Entertainment", "Movies", "Series",
        "Documentaries", "Kids", "Music", "Culture", "International",
        "Local", "Premium"
    )
    
    val newsChannels = listOf(
        "A24", "TN", "C5N", "LN+", "Cronica TV", "Channel 26", "IP News",
        "CNN Spanish", "BBC World", "France 24", "RT Spanish", "DW"
    )
    
    val sportsChannels = listOf(
        "ESPN", "ESPN 2", "ESPN 3", "Fox Sports", "Fox Sports 2", "Fox Sports 3",
        "TyC Sports", "ESPN Premium", "TNT Sports", "DeporTV", "Public Sports TV"
    )
    
    val entertainmentChannels = listOf(
        "Telefe", "Channel 13", "America TV", "Channel 9", "Public TV", "Net TV",
        "Telefe Rosario", "Channel 12 Cordoba", "Channel 7 Mendoza", "Channel 10 Tucuman"
    )
    
    val movieChannels = listOf(
        "Cinemax", "HBO", "HBO 2", "HBO Plus", "HBO Family", "HBO Signature",
        "Space", "TNT", "Warner Channel", "Universal TV", "Sony Channel",
        "FX", "AXN", "Studio Universal", "Paramount Channel", "Golden"
    )
    
    val seriesChannels = listOf(
        "Netflix", "Amazon Prime", "Disney+", "Paramount+", "Apple TV+",
        "HBO Max", "Star+", "Pluto TV", "Tubi", "Crackle"
    )
    
    val documentaryChannels = listOf(
        "Discovery Channel", "National Geographic", "History Channel", "Animal Planet",
        "Discovery Science", "Discovery Turbo", "Investigation Discovery",
        "Nat Geo Wild", "History 2", "Discovery Home & Health"
    )
    
    val kidsChannels = listOf(
        "Disney Channel", "Disney Junior", "Cartoon Network", "Nickelodeon",
        "Nick Jr", "Boomerang", "Discovery Kids", "Tooncast", "Disney XD"
    )
    
    val musicChannels = listOf(
        "MTV", "MTV Hits", "VH1", "VH1 Classic", "Much Music", "Music One",
        "HTV", "CM", "Vorterix"
    )
    
    val cultureChannels = listOf(
        "Encounter", "Pakapaka", "INCAA TV", "Build TV", "Tecnopolis TV",
        "City Channel", "Aqua Senior", "Aqua Federal"
    )
    
    val internationalChannels = listOf(
        "TVE", "RAI", "TV5 Monde", "Deutsche Welle", "NHK World", "CGTN",
        "Al Jazeera", "Euronews", "Galicia TV", "South Channel"
    )
    
    val localChannels = listOf(
        "Channel 2 Jujuy", "Channel 4 Jujuy", "Channel 7 Salta", "Channel 10 Salta",
        "Channel 12 Misiones", "Channel 13 San Juan", "Channel 8 Cordoba",
        "Channel 3 Rosario", "Channel 5 Rosario", "Channel 8 Mar del Plata"
    )
    
    val premiumChannels = listOf(
        "HBO Signature", "Cinemax", "Starz", "Showtime", "Epix", "MGM HD",
        "Universal Cinema", "Sony Movies", "Warner Bros", "Paramount Network"
    )
    
    val extraChannels = listOf(
        "Venus", "Playboy TV", "Private TV", "Hustler TV", "Penthouse",
        "Brazzers TV", "Reality Kings", "Digital Playground"
    )
    
    val allChannelGroups = listOf(
        newsChannels to "News",
        sportsChannels to "Sports",
        entertainmentChannels to "Entertainment",
        movieChannels to "Movies",
        seriesChannels to "Series",
        documentaryChannels to "Documentaries",
        kidsChannels to "Kids",
        musicChannels to "Music",
        cultureChannels to "Culture",
        internationalChannels to "International",
        localChannels to "Local",
        premiumChannels to "Premium",
        extraChannels to "Extra"
    )
    
    val channels = mutableListOf<ContentStream>()
    var channelNumber = 1
    
    allChannelGroups.forEach { (channelList, category) ->
        channelList.forEach { channelName ->
            channels.add(
                ContentStream(
                    id = channelNumber.toString(),
                    categoryId = category,
                    title = channelName,
                    description = category,
                    imageUrl = "https://via.placeholder.com/100x60/0D1117/58A6FF?text=${channelName.take(3)}",
                    streamUrl = "https://example.com/stream$channelNumber",
                    tmdbId = null,
                    year = null,
                    channelNumber = channelNumber,
                    createdAt = "2024-01-01T00:00:00Z",
                    drmKeys = null,
                    drmKeysExo = null
                )
            )
            channelNumber++
        }
    }
    
    // Add more channels to reach 190
    while (channels.size < 190) {
        val category = categories.random()
        channels.add(
            ContentStream(
                id = channelNumber.toString(),
                categoryId = category,
                title = channelNumber.toString(),
                description = category,
                imageUrl = "https://via.placeholder.com/100x60/0D1117/58A6FF?text=C$channelNumber",
                streamUrl = "https://example.com/stream$channelNumber",
                tmdbId = null,
                year = null,
                channelNumber = channelNumber,
                createdAt = "2024-01-01T00:00:00Z",
                drmKeys = null,
                drmKeysExo = null
            )
        )
        channelNumber++
    }
    
    return channels.sortedBy { it.id.toIntOrNull() ?: 0 }
}

@Preview(showBackground = true, device = "spec:width=1080dp,height=1920dp")
@Composable
fun MobileChannelSelectorCategoryPreview() {
    IPTVTheme {
        var isVisible by remember { mutableStateOf(true) }

        // Simulate category filter
        val sportsChannels = generateSampleChannels().filter {
            it.categoryId == "Sports"
        }

        ModernChannelSelector(
            isVisible = isVisible,
            channels = sportsChannels,
            currentChannelId = "15",
            onChannelSelected = { /* Preview */ },
            onDismiss = { isVisible = false },
            modifier = Modifier.fillMaxSize()
        )
    }
}
