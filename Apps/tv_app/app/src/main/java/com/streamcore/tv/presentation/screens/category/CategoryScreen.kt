package com.streamcore.tv.presentation.screens.category

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import timber.log.Timber
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import androidx.compose.runtime.*
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.streamcore.tv.R
import com.streamcore.tv.core.utils.ShowToast
import com.streamcore.tv.domain.model.UiState
import com.streamcore.tv.presentation.components.*
import com.streamcore.tv.presentation.screens.category.components.CategoryContentCard
import com.streamcore.tv.presentation.theme.*
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * Category screen showing content filtered by category
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CategoryScreen(
    categoryId: String,
    onNavigateBack: () -> Unit,
    onNavigateToDetail: (String) -> Unit,
    onNavigateToPlayer: (String) -> Unit,
    onNavigateToSeries: (String) -> Unit = {},
    viewModel: CategoryViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    // Load category content when screen opens
    LaunchedEffect(categoryId) {
        viewModel.loadCategory(categoryId)
    }
    
    // Show error messages
    uiState.error?.let { error ->
        ShowToast(message = error)
        LaunchedEffect(error) {
            viewModel.clearError()
        }
    }
    
    var searchQuery by remember { mutableStateOf("") }
    var showSortMenu by remember { mutableStateOf(false) }

    Box(modifier = Modifier.fillMaxSize()) {
        // Background backdrop
        uiState.selectedBackdrop?.let { backdropUrl ->
            AsyncImage(
                model = backdropUrl,
                contentDescription = null,
                modifier = Modifier
                    .fillMaxSize()
                    .blur(radius = 25.dp),
                contentScale = ContentScale.Crop,
                alpha = 0.3f
            )

            // Dark overlay for readability
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                Color.Black.copy(alpha = 0.7f),
                                Color.Black.copy(alpha = 0.8f),
                                Color.Black.copy(alpha = 0.9f)
                            )
                        )
                    )
            )
        }

        Column(modifier = Modifier.fillMaxSize()) {
        // Top App Bar with reorganized layout
        TopAppBar(
            title = {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // Title - change VOD to Movies if it's VOD category
                    Text(
                        text = if (uiState.categoryName.equals("VOD", ignoreCase = true)) stringResource(R.string.category_movies) else uiState.categoryName,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold
                    )

                    // Sort Dropdown - moved next to title
                    Box {
                        IconButton(
                            onClick = { showSortMenu = true }
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.Sort,
                                contentDescription = stringResource(R.string.category_sort_description)
                            )
                        }

                        DropdownMenu(
                            expanded = showSortMenu,
                            onDismissRequest = { showSortMenu = false }
                        ) {
                            listOf(
                                Triple("title", stringResource(R.string.sort_title), Icons.Default.SortByAlpha),
                                Triple("year", stringResource(R.string.sort_year), Icons.Default.DateRange),
                                Triple("rating", stringResource(R.string.sort_rating), Icons.Default.Star),
                                Triple("date_added", stringResource(R.string.sort_date_added), Icons.Default.Schedule)
                            ).forEach { (value, label, icon) ->
                                DropdownMenuItem(
                                    text = {
                                        Row(
                                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Icon(
                                                imageVector = icon,
                                                contentDescription = null,
                                                modifier = Modifier.size(16.dp)
                                            )
                                            Text(label)
                                        }
                                    },
                                    onClick = {
                                        viewModel.updateSort(value)
                                        showSortMenu = false
                                    },
                                    leadingIcon = if (uiState.selectedSort == value) {
                                        {
                                            Icon(
                                                imageVector = Icons.Default.Check,
                                                contentDescription = null,
                                                tint = Primary
                                            )
                                        }
                                    } else null
                                )
                            }
                        }
                    }

                    // Sort direction toggle
                    IconButton(
                        onClick = { viewModel.toggleSortOrder() }
                    ) {
                        Icon(
                            imageVector = if (uiState.sortAscending) Icons.Default.ArrowUpward else Icons.Default.ArrowDownward,
                            contentDescription = if (uiState.sortAscending) {
                                stringResource(R.string.category_sort_ascending)
                            } else {
                                stringResource(R.string.category_sort_descending)
                            }
                        )
                    }

                    // Grid Size Button - moved next to title
                    IconButton(
                        onClick = { viewModel.toggleGridSize() }
                    ) {
                        Icon(
                            imageVector = if (uiState.isLargeGrid) {
                                Icons.Default.ViewModule
                            } else {
                                Icons.Default.ViewComfy
                            },
                            contentDescription = stringResource(R.string.category_grid_size_description)
                        )
                    }
                }
            },
            actions = {
                // Voice search button
                com.streamcore.tv.presentation.screens.search.components.VoiceSearchButton(
                    onVoiceSearch = { query ->
                        searchQuery = query
                        viewModel.updateSearchQuery(query)
                    },
                    modifier = Modifier.padding(end = 8.dp)
                )

                // Search field on the right
                Box(
                    modifier = Modifier
                        .width(300.dp)
                        .padding(end = 16.dp)
                ) {
                    OutlinedTextField(
                        value = searchQuery,
                        onValueChange = {
                            searchQuery = it
                            viewModel.updateSearchQuery(it)
                        },
                        placeholder = {
                            Text(
                                text = stringResource(R.string.search_placeholder),
                                style = MaterialTheme.typography.bodyMedium
                            )
                        },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.Search,
                                contentDescription = stringResource(R.string.search_title),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        },
                        trailingIcon = if (searchQuery.isNotEmpty()) {
                            {
                                IconButton(
                                    onClick = {
                                        searchQuery = ""
                                        viewModel.updateSearchQuery("")
                                    }
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Clear,
                                        contentDescription = stringResource(R.string.category_clear_search_description),
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        } else null,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(24.dp),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = Primary,
                            unfocusedBorderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f),
                            focusedContainerColor = MaterialTheme.colorScheme.surface,
                            unfocusedContainerColor = MaterialTheme.colorScheme.surface
                        )
                    )
                }
            },
            navigationIcon = {
                IconButton(onClick = onNavigateBack) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = stringResource(R.string.cd_back)
                    )
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = Surface
            )
        )
        

        
        // Content Grid
        Box(
            modifier = Modifier
                .fillMaxSize()
                .weight(1f)
        ) {
            when (val contentState = uiState.contentState) {
                is UiState.Loading -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        LoadingIndicator()
                    }
                }
                
                is UiState.Success -> {
                    val content = contentState.data.content
                    if (content.isNotEmpty()) {
                        val gridState = rememberLazyGridState()
                        val hasMore = contentState.data.pagination.hasNext

                        LaunchedEffect(gridState, hasMore) {
                            if (!hasMore) return@LaunchedEffect

                            snapshotFlow {
                                val layoutInfo = gridState.layoutInfo
                                val totalItems = layoutInfo.totalItemsCount
                                val lastVisibleIndex = layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: -1
                                Triple(totalItems, lastVisibleIndex, uiState.isLoadingMore)
                            }
                                .distinctUntilChanged()
                                .collect { (totalItems, lastVisibleIndex, isLoadingMore) ->
                                    if (!hasMore || isLoadingMore) return@collect
                                    if (totalItems == 0) return@collect

                                    val preloadBuffer = 6
                                    if (lastVisibleIndex >= totalItems - preloadBuffer) {
                                        viewModel.loadMore()
                                    }
                                }
                        }

                        LazyVerticalGrid(
                            state = gridState,
                            columns = GridCells.Adaptive(
                                if (uiState.isLargeGrid) 140.dp else 120.dp
                            ),
                            contentPadding = PaddingValues(20.dp),
                            horizontalArrangement = Arrangement.spacedBy(16.dp),
                            verticalArrangement = Arrangement.spacedBy(20.dp)
                        ) {
                            items(content, key = { it.id }) { contentItem ->
                                CategoryContentCard(
                                    content = contentItem,
                                    isLarge = uiState.isLargeGrid,
                                    onClick = {
                                        Timber.d("CategoryScreen: Item clicked - ID: ${contentItem.id}, Title: ${contentItem.title}")
                                        
                                        when (contentItem.type) {
                                            com.streamcore.tv.domain.model.ContentType.LIVE_TV -> {
                                                Timber.d("CategoryScreen: Navigating to LIVE_TV player: ${contentItem.id}")
                                                onNavigateToPlayer(contentItem.id)
                                            }
                                            com.streamcore.tv.domain.model.ContentType.SERIES -> {
                                                Timber.d("CategoryScreen: Navigating to SERIES: ${contentItem.id}")
                                                onNavigateToSeries(contentItem.id)
                                            }
                                            else -> {
                                                Timber.d("CategoryScreen: Navigating to detail: ${contentItem.id}")
                                                onNavigateToDetail(contentItem.id)
                                            }
                                        }
                                    },
                                    onHover = { backdropUrl ->
                                        viewModel.updateSelectedBackdrop(backdropUrl)
                                    }
                                )
                            }

                            if (uiState.isLoadingMore) {
                                item {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(vertical = 24.dp),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        LoadingIndicator()
                                    }
                                }
                            }
                        }
                    } else {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(16.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center
                        ) {
                            Text(
                                text = "📂",
                                style = MaterialTheme.typography.displayLarge
                            )

                            Spacer(modifier = Modifier.height(16.dp))

                            Text(
                                text = stringResource(R.string.category_empty_title),
                                style = MaterialTheme.typography.headlineSmall,
                                color = TextPrimary,
                                fontWeight = FontWeight.Bold
                            )

                            Spacer(modifier = Modifier.height(8.dp))

                            Text(
                                text = stringResource(R.string.category_empty_message, uiState.categoryName),
                                style = MaterialTheme.typography.bodyLarge,
                                color = TextSecondary
                            )
                        }
                    }
                }
                
                is UiState.Error -> {
                    ErrorScreen(
                        message = contentState.message,
                        onRetry = { viewModel.loadCategory(categoryId) }
                    )
                }
            }
        }
    }
}

}
