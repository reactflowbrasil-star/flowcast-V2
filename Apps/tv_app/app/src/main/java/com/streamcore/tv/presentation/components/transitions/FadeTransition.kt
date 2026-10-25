package com.streamcore.tv.presentation.components.transitions

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import kotlinx.coroutines.delay

/**
 * Modern fade transition system for smooth view changes
 * Provides elegant fade out -> fade in transitions between different screens
 */

/**
 * Fade transition container that handles smooth transitions between content
 */
@Composable
fun FadeTransitionContainer(
    targetState: Any,
    modifier: Modifier = Modifier,
    animationDuration: Int = 300,
    content: @Composable (Any) -> Unit
) {
    var currentState by remember { mutableStateOf(targetState) }
    var isTransitioning by remember { mutableStateOf(false) }
    
    val alpha by animateFloatAsState(
        targetValue = if (isTransitioning) 0f else 1f,
        animationSpec = tween(
            durationMillis = animationDuration,
            easing = FastOutSlowInEasing
        ),
        finishedListener = { finalValue ->
            if (finalValue == 0f) {
                // Fade out completed, update content and fade in
                currentState = targetState
                isTransitioning = false
            }
        }
    )
    
    LaunchedEffect(targetState) {
        if (targetState != currentState && !isTransitioning) {
            isTransitioning = true
        }
    }
    
    Box(
        modifier = modifier
            .fillMaxSize()
            .graphicsLayer(alpha = alpha)
    ) {
        content(currentState)
    }
}

/**
 * Crossfade transition with custom timing
 */
@Composable
fun <T> SmoothCrossfade(
    targetState: T,
    modifier: Modifier = Modifier,
    animationSpec: FiniteAnimationSpec<Float> = tween(
        durationMillis = 400,
        easing = FastOutSlowInEasing
    ),
    content: @Composable (T) -> Unit
) {
    Crossfade(
        targetState = targetState,
        modifier = modifier,
        animationSpec = animationSpec,
        content = content
    )
}

/**
 * Page transition with fade and slight scale effect
 */
@Composable
fun PageTransition(
    visible: Boolean,
    modifier: Modifier = Modifier,
    enter: EnterTransition = fadeIn(
        animationSpec = tween(300, easing = FastOutSlowInEasing)
    ) + scaleIn(
        initialScale = 0.95f,
        animationSpec = tween(300, easing = FastOutSlowInEasing)
    ),
    exit: ExitTransition = fadeOut(
        animationSpec = tween(200, easing = FastOutLinearInEasing)
    ) + scaleOut(
        targetScale = 1.05f,
        animationSpec = tween(200, easing = FastOutLinearInEasing)
    ),
    content: @Composable () -> Unit
) {
    AnimatedVisibility(
        visible = visible,
        modifier = modifier,
        enter = enter,
        exit = exit,
        content = { content() }
    )
}

/**
 * Slide and fade transition for navigation
 */
@Composable
fun SlideAndFadeTransition(
    visible: Boolean,
    modifier: Modifier = Modifier,
    slideDirection: SlideDirection = SlideDirection.Left,
    content: @Composable () -> Unit
) {
    val slideDistance = 100
    
    val enter = when (slideDirection) {
        SlideDirection.Left -> slideInHorizontally(
            initialOffsetX = { -slideDistance },
            animationSpec = tween(300, easing = FastOutSlowInEasing)
        ) + fadeIn(animationSpec = tween(300))
        
        SlideDirection.Right -> slideInHorizontally(
            initialOffsetX = { slideDistance },
            animationSpec = tween(300, easing = FastOutSlowInEasing)
        ) + fadeIn(animationSpec = tween(300))
        
        SlideDirection.Up -> slideInVertically(
            initialOffsetY = { -slideDistance },
            animationSpec = tween(300, easing = FastOutSlowInEasing)
        ) + fadeIn(animationSpec = tween(300))
        
        SlideDirection.Down -> slideInVertically(
            initialOffsetY = { slideDistance },
            animationSpec = tween(300, easing = FastOutSlowInEasing)
        ) + fadeIn(animationSpec = tween(300))
    }
    
    val exit = when (slideDirection) {
        SlideDirection.Left -> slideOutHorizontally(
            targetOffsetX = { slideDistance },
            animationSpec = tween(200, easing = FastOutLinearInEasing)
        ) + fadeOut(animationSpec = tween(200))
        
        SlideDirection.Right -> slideOutHorizontally(
            targetOffsetX = { -slideDistance },
            animationSpec = tween(200, easing = FastOutLinearInEasing)
        ) + fadeOut(animationSpec = tween(200))
        
        SlideDirection.Up -> slideOutVertically(
            targetOffsetY = { slideDistance },
            animationSpec = tween(200, easing = FastOutLinearInEasing)
        ) + fadeOut(animationSpec = tween(200))
        
        SlideDirection.Down -> slideOutVertically(
            targetOffsetY = { -slideDistance },
            animationSpec = tween(200, easing = FastOutLinearInEasing)
        ) + fadeOut(animationSpec = tween(200))
    }
    
    AnimatedVisibility(
        visible = visible,
        modifier = modifier,
        enter = enter,
        exit = exit,
        content = { content() }
    )
}

/**
 * Direction for slide transitions
 */
enum class SlideDirection {
    Left, Right, Up, Down
}

/**
 * Staggered fade in for lists and grids
 */
@Composable
fun StaggeredFadeIn(
    visible: Boolean,
    itemCount: Int,
    modifier: Modifier = Modifier,
    staggerDelay: Int = 50,
    content: @Composable (Int) -> Unit
) {
    repeat(itemCount) { index ->
        val delay = index * staggerDelay
        
        AnimatedVisibility(
            visible = visible,
            modifier = modifier,
            enter = fadeIn(
                animationSpec = tween(
                    durationMillis = 300,
                    delayMillis = delay,
                    easing = FastOutSlowInEasing
                )
            ) + scaleIn(
                initialScale = 0.8f,
                animationSpec = tween(
                    durationMillis = 300,
                    delayMillis = delay,
                    easing = FastOutSlowInEasing
                )
            ),
            exit = fadeOut(
                animationSpec = tween(200)
            )
        ) {
            content(index)
        }
    }
}

/**
 * Shared element transition helper
 */
@Composable
fun SharedElementTransition(
    visible: Boolean,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    AnimatedVisibility(
        visible = visible,
        modifier = modifier,
        enter = fadeIn(
            animationSpec = tween(400, easing = FastOutSlowInEasing)
        ) + expandIn(
            animationSpec = tween(400, easing = FastOutSlowInEasing),
            expandFrom = androidx.compose.ui.Alignment.Center
        ),
        exit = fadeOut(
            animationSpec = tween(300, easing = FastOutLinearInEasing)
        ) + shrinkOut(
            animationSpec = tween(300, easing = FastOutLinearInEasing),
            shrinkTowards = androidx.compose.ui.Alignment.Center
        ),
        content = { content() }
    )
}
