package com.streamcore.tv.presentation.screens.search.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.streamcore.tv.domain.model.ContentType
import com.streamcore.tv.presentation.theme.*
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R

/**
 * Search filters component
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchFilters(
    selectedType: ContentType?,
    selectedCategory: String?,
    selectedYear: Int?,
    selectedGenre: String?,
    selectedCountry: String?,
    onTypeSelected: (ContentType?) -> Unit,
    onCategorySelected: (String?) -> Unit,
    onYearSelected: (Int?) -> Unit,
    onGenreSelected: (String?) -> Unit,
    onCountrySelected: (String?) -> Unit,
    onClearFilters: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Clear Filters Button
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = stringResource(R.string.search_filters_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )

            TextButton(onClick = onClearFilters) {
                Text(stringResource(R.string.search_clear_filters))
            }
        }
        // Content Type Filters
        Text(
            text = stringResource(R.string.search_content_type),
            style = MaterialTheme.typography.labelLarge,
            color = TextSecondary,
            fontWeight = FontWeight.Medium
        )
        
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            item {
                FilterChip(
                    selected = selectedType == null,
                    onClick = { onTypeSelected(null) },
                    label = { Text(stringResource(R.string.search_all)) }
                )
            }
            
            items(ContentType.values()) { type ->
                FilterChip(
                    selected = selectedType == type,
                    onClick = { onTypeSelected(type) },
                    label = { Text(getContentTypeDisplayName(type)) }
                )
            }
        }
        
        // Category Filters
        Text(
            text = stringResource(R.string.search_categories),
            style = MaterialTheme.typography.labelLarge,
            color = TextSecondary,
            fontWeight = FontWeight.Medium
        )
        
        val actionText = stringResource(R.string.genre_action)
        val comedyText = stringResource(R.string.genre_comedy)
        val dramaText = stringResource(R.string.genre_drama)
        val horrorText = stringResource(R.string.genre_horror)
        val sciFiText = stringResource(R.string.genre_sci_fi)
        val documentaryText = stringResource(R.string.genre_documentary)
        val sportsText = stringResource(R.string.genre_sports)
        val newsText = stringResource(R.string.genre_news)

        val categories = remember(actionText, comedyText, dramaText, horrorText, sciFiText, documentaryText, sportsText, newsText) {
            listOf(actionText, comedyText, dramaText, horrorText, sciFiText, documentaryText, sportsText, newsText)
        }

        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            item {
                FilterChip(
                    selected = selectedCategory == null,
                    onClick = { onCategorySelected(null) },
                    label = { Text(stringResource(R.string.search_all_female)) }
                )
            }

            items(categories) { category ->
                FilterChip(
                    selected = selectedCategory == category,
                    onClick = { onCategorySelected(category) },
                    label = { Text(category) }
                )
            }
        }

        // Genre Filters
        Text(
            text = stringResource(R.string.search_genres),
            style = MaterialTheme.typography.labelLarge,
            color = TextSecondary,
            fontWeight = FontWeight.Medium
        )

        val adventureText = stringResource(R.string.genre_adventure)
        val animationText = stringResource(R.string.genre_animation)
        val biographyText = stringResource(R.string.genre_biography)
        val crimeText = stringResource(R.string.genre_crime)
        val familyText = stringResource(R.string.genre_family)
        val fantasyText = stringResource(R.string.genre_fantasy)
        val historyText = stringResource(R.string.genre_history)
        val musicText = stringResource(R.string.genre_music)
        val mysteryText = stringResource(R.string.genre_mystery)
        val romanceText = stringResource(R.string.genre_romance)
        val thrillerText = stringResource(R.string.genre_thriller)
        val warText = stringResource(R.string.genre_war)
        val westernText = stringResource(R.string.genre_western)

        val genres = remember(actionText, adventureText, animationText, biographyText, comedyText, crimeText, documentaryText, dramaText, familyText, fantasyText, historyText, horrorText, musicText, mysteryText, romanceText, sciFiText, sportsText, thrillerText, warText, westernText) {
            listOf(actionText, adventureText, animationText, biographyText, comedyText, crimeText, documentaryText, dramaText, familyText, fantasyText, historyText, horrorText, musicText, mysteryText, romanceText, sciFiText, sportsText, thrillerText, warText, westernText)
        }

        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            item {
                FilterChip(
                    selected = selectedGenre == null,
                    onClick = { onGenreSelected(null) },
                    label = { Text(stringResource(R.string.search_all)) }
                )
            }

            items(genres) { genre ->
                FilterChip(
                    selected = selectedGenre == genre,
                    onClick = { onGenreSelected(genre) },
                    label = { Text(genre) }
                )
            }
        }

        // Year Filters
        Text(
            text = stringResource(R.string.search_year),
            style = MaterialTheme.typography.labelLarge,
            color = TextSecondary,
            fontWeight = FontWeight.Medium
        )

        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            item {
                FilterChip(
                    selected = selectedYear == null,
                    onClick = { onYearSelected(null) },
                    label = { Text(stringResource(R.string.search_all)) }
                )
            }

            items(getYears()) { year ->
                FilterChip(
                    selected = selectedYear == year,
                    onClick = { onYearSelected(year) },
                    label = { Text(year.toString()) }
                )
            }
        }

        // Country Filters
        Text(
            text = stringResource(R.string.search_country),
            style = MaterialTheme.typography.labelLarge,
            color = TextSecondary,
            fontWeight = FontWeight.Medium
        )

        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            item {
                FilterChip(
                    selected = selectedCountry == null,
                    onClick = { onCountrySelected(null) },
                    label = { Text(stringResource(R.string.search_all)) }
                )
            }

            items(getCountries()) { country ->
                FilterChip(
                    selected = selectedCountry == country,
                    onClick = { onCountrySelected(country) },
                    label = { Text(country) }
                )
            }
        }
    }
}

@Composable
private fun getContentTypeDisplayName(type: ContentType): String {
    return when (type) {
        ContentType.MOVIE -> stringResource(R.string.category_movies)
        ContentType.SERIES -> stringResource(R.string.category_series)
        ContentType.LIVE_TV -> stringResource(R.string.nav_live_tv)
        ContentType.EPISODE -> stringResource(R.string.content_episodes)
    }
}

private fun getYears(): List<Int> {
    val currentYear = 2024
    return (currentYear downTo 1990).toList()
}

private fun getCountries(): List<String> {
    return listOf(
        "United States",
        "Spain",
        "Mexico",
        "Argentina",
        "Colombia",
        "United Kingdom",
        "France",
        "Germany",
        "Italia",
        "Brazil",
        "Canada",
        "Australia",
        "Japan",
        "South Korea",
        "India",
        "China"
    )
}
