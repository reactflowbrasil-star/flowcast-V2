package com.streamcore.tv.presentation.screens.search

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.streamcore.tv.R
import com.streamcore.tv.core.utils.ShowToast
import com.streamcore.tv.domain.model.UiState
import com.streamcore.tv.domain.model.SearchResult
import com.streamcore.tv.presentation.components.*
import com.streamcore.tv.presentation.screens.search.components.SearchResultCard
import com.streamcore.tv.presentation.screens.search.components.SearchSuggestions
import com.streamcore.tv.presentation.screens.search.components.VoiceSearchButton
import com.streamcore.tv.presentation.screens.search.components.ShimmerSearchGrid
import com.streamcore.tv.presentation.theme.*

/**
 * Search screen for content discovery
 */
@Suppress("UNUSED_PARAMETER")
@Composable
fun SearchScreen(
    onNavigateBack: () -> Unit,
    onNavigateToDetail: (String) -> Unit,
    onNavigateToPlayer: (String) -> Unit,
    onNavigateToSeries: (String) -> Unit = {},
    onNavigateToLiveTV: () -> Unit = {},
    viewModel: SearchViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val focusRequester = remember { FocusRequester() }
    
    // Show error messages
    uiState.error?.let { error ->
        ShowToast(message = error)
        LaunchedEffect(error) {
            viewModel.clearError()
        }
    }
    
    // Request focus on search field when screen loads
    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }
    
    Column(
        modifier = Modifier.fillMaxSize()
    ) {
        // Search Header
        SearchHeader(
            query = uiState.query,
            onQueryChange = viewModel::updateQuery,
            onNavigateBack = onNavigateBack,
            onClearQuery = viewModel::clearQuery,
            focusRequester = focusRequester
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        // Search Content
        Box(
            modifier = Modifier
                .fillMaxSize()
                .weight(1f)
        ) {
            when {
                uiState.query.isBlank() -> {
                    // Show empty state when no query
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = stringResource(R.string.search_hint),
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                
                uiState.searchState is UiState.Loading -> {
                    // Shimmer grid placeholders
                    ShimmerSearchGrid()
                }
                
                uiState.searchState is UiState.Success -> {
                    val searchState = uiState.searchState as UiState.Success<SearchResult>
                    val results = searchState.data.results
                    if (results.isNotEmpty()) {
                        SearchResults(
                            results = results,
                            onItemClick = { content ->
                                onNavigateToDetail(content.id)
                            },
                            onPlayClick = { content ->
                                onNavigateToPlayer(content.id)
                            },
                            onSeriesClick = { content ->
                                onNavigateToSeries(content.id)
                            }
                        )
                    } else {
                        EmptySearchResults(
                            query = uiState.query,
                            modifier = Modifier.padding(horizontal = 16.dp)
                        )
                    }
                }
                
                uiState.searchState is UiState.Error -> {
                    val errorState = uiState.searchState as UiState.Error
                    ErrorScreen(
                        message = errorState.message,
                        onRetry = { viewModel.search() }
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SearchHeader(
    query: String,
    onQueryChange: (String) -> Unit,
    onNavigateBack: () -> Unit,
    onClearQuery: () -> Unit,
    focusRequester: FocusRequester
) {
    TopAppBar(
        title = {
            Text(
                text = stringResource(R.string.nav_search),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
        },
        navigationIcon = {
            IconButton(onClick = onNavigateBack) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = stringResource(R.string.cd_back)
                )
            }
        },
        actions = {
            // Voice search button
            VoiceSearchButton(
                onVoiceSearch = onQueryChange,
                modifier = Modifier.padding(end = 8.dp)
            )

            // Compact search field on the right
            Box(
                modifier = Modifier
                    .width(280.dp)
                    .padding(end = 16.dp)
            ) {
                IPTVTextField(
                    value = query,
                    onValueChange = onQueryChange,
                    focusRequester = focusRequester,
                    placeholder = stringResource(R.string.search_placeholder),
                    leadingIcon = Icons.Default.Search,
                    trailingIcon = if (query.isNotEmpty()) Icons.Default.Clear else null,
                    onTrailingIconClick = if (query.isNotEmpty()) onClearQuery else null,
                    modifier = Modifier
                        .fillMaxWidth()
                )
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    )
}

@Composable
private fun SearchResults(
    results: List<com.streamcore.tv.domain.model.ContentItem>,
    onItemClick: (com.streamcore.tv.domain.model.ContentItem) -> Unit,
    onPlayClick: (com.streamcore.tv.domain.model.ContentItem) -> Unit,
    onSeriesClick: (com.streamcore.tv.domain.model.ContentItem) -> Unit
) {
    LazyVerticalGrid(
        columns = GridCells.Adaptive(160.dp),
        contentPadding = PaddingValues(16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        items(results, key = { it.id }) { content ->
            SearchResultCard(
                content = content,
                onClick = { onItemClick(content) },
                onPlayClick = if (content.type == com.streamcore.tv.domain.model.ContentType.LIVE_TV) {
                    { onPlayClick(content) }
                } else null,
                onSeriesClick = if (content.type == com.streamcore.tv.domain.model.ContentType.SERIES) {
                    { onSeriesClick(content) }
                } else null
            )
        }
    }
}

@Composable
private fun EmptySearchResults(
    query: String,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = stringResource(R.string.search_no_results_title),
            style = MaterialTheme.typography.headlineSmall,
            color = TextPrimary,
            fontWeight = FontWeight.Bold
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Text(
            text = stringResource(R.string.search_no_results_message, query),
            style = MaterialTheme.typography.bodyLarge,
            color = TextSecondary
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Text(
            text = stringResource(R.string.search_no_results_suggestions),
            style = MaterialTheme.typography.bodyMedium,
            color = TextTertiary
        )
    }
}
