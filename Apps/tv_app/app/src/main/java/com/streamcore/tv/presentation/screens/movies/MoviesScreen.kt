package com.streamcore.tv.presentation.screens.movies

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import com.streamcore.tv.domain.model.UiState
import com.streamcore.tv.presentation.components.LoadingIndicator
import com.streamcore.tv.presentation.components.ErrorScreen
import com.streamcore.tv.presentation.components.transitions.SmoothCrossfade
import com.streamcore.tv.presentation.components.transitions.PageTransition
import com.streamcore.tv.presentation.components.transitions.StaggeredFadeIn
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R

/**
 * Movies screen with smooth fade transitions
 * Example of how to apply transitions to content screens
 */
@Suppress("UNUSED_PARAMETER")
@Composable
fun MoviesScreen(
    onNavigateToDetail: (String) -> Unit,
    onNavigateBack: () -> Unit,
    viewModel: MoviesViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    
    // Main content with smooth transitions
    SmoothCrossfade(
        targetState = uiState.contentState,
        modifier = Modifier.fillMaxSize()
    ) { contentState ->
        when (contentState) {
            is UiState.Loading -> {
                PageTransition(
                    visible = true,
                    modifier = Modifier.fillMaxSize()
                ) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        LoadingIndicator()
                    }
                }
            }
            
            is UiState.Success -> {
                PageTransition(
                    visible = true,
                    modifier = Modifier.fillMaxSize()
                ) {
                    MoviesContent(
                        movies = contentState.data,
                        onMovieClick = onNavigateToDetail
                    )
                }
            }
            
            is UiState.Error -> {
                PageTransition(
                    visible = true,
                    modifier = Modifier.fillMaxSize()
                ) {
                    ErrorScreen(
                        message = contentState.message,
                        onRetry = viewModel::loadMovies
                    )
                }
            }
        }
    }
}

/**
 * Movies content with staggered animations
 */
@Composable
private fun MoviesContent(
    movies: List<Movie>,
    onMovieClick: (String) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        // Header with fade in
        PageTransition(
            visible = true,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                text = stringResource(R.string.category_movies),
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.padding(bottom = 16.dp)
            )
        }
        
        // Movies grid with staggered animation
        LazyVerticalGrid(
            columns = GridCells.Adaptive(minSize = 160.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxSize()
        ) {
            items(movies, key = { it.id }) { movie ->
                StaggeredFadeIn(
                    visible = true,
                    itemCount = 1,
                    staggerDelay = 50
                ) { _ ->
                    MovieCard(
                        movie = movie,
                        onClick = { onMovieClick(movie.id) }
                    )
                }
            }
        }
    }
}

/**
 * Movie card with hover animations
 */
@Composable
private fun MovieCard(
    movie: Movie,
    onClick: () -> Unit
) {
    var isPressed by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(
        targetValue = if (isPressed) 0.95f else 1f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessHigh
        )
    )
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(0.7f)
            .graphicsLayer(scaleX = scale, scaleY = scale)
            .clickable {
                isPressed = true
                onClick()
                // Reset pressed state after a short delay
                // In real implementation, use rememberCoroutineScope()
            },
        elevation = CardDefaults.cardElevation(
            defaultElevation = 4.dp,
            pressedElevation = 8.dp
        )
    ) {
        // Movie poster and info
        Column {
            // Poster placeholder
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .background(MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = movie.title,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            
            // Movie info
            Column(
                modifier = Modifier.padding(12.dp)
            ) {
                Text(
                    text = movie.title,
                    style = MaterialTheme.typography.titleSmall,
                    maxLines = 2
                )
                Text(
                    text = movie.year.toString(),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

// Data classes for example
data class Movie(
    val id: String,
    val title: String,
    val year: Int,
    val posterUrl: String? = null
)

// ViewModel stub for example
class MoviesViewModel : ViewModel() {
    private val _uiState = MutableStateFlow(MoviesUiState())
    val uiState: StateFlow<MoviesUiState> = _uiState.asStateFlow()
    
    fun loadMovies() {
        // Implementation
    }
}

data class MoviesUiState(
    val contentState: UiState<List<Movie>> = UiState.Loading,
    val selectedGenre: String? = null
)
