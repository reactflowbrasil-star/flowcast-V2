package com.streamcore.tv.presentation.navigation

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.runtime.Composable
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.NavGraphBuilder

/**
 * Navigation system with smooth fade transitions
 * Provides consistent transitions between all screens
 */

/**
 * Simple navigation transitions for smooth app experience
 */

object NavigationTransitions {

    /**
     * Fade transitions (default)
     */
    val fadeIn = fadeIn(
        animationSpec = tween(300, easing = FastOutSlowInEasing)
    ) + scaleIn(
        initialScale = 0.95f,
        animationSpec = tween(300, easing = FastOutSlowInEasing)
    )

    val fadeOut = fadeOut(
        animationSpec = tween(200, easing = FastOutLinearInEasing)
    ) + scaleOut(
        targetScale = 1.05f,
        animationSpec = tween(200, easing = FastOutLinearInEasing)
    )
}

/**
 * Helper function for smooth navigation
 */
fun NavHostController.navigateWithTransition(
    route: String,
    popUpTo: String? = null,
    inclusive: Boolean = false
) {
    navigate(route) {
        popUpTo?.let {
            popUpTo(it) {
                this.inclusive = inclusive
            }
        }
        launchSingleTop = true
        restoreState = true
    }
}
