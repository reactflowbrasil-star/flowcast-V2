package com.streamcore.tv.presentation.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

/**
 * Color schemes for IPTV Android App - Streamflix Cinematic Style
 *
 * Optimized for streaming experience with Streamflix-inspired dark palette
 * Dark theme is primary for cinematic viewing, light theme for accessibility
 */

private val StreamflixDarkColorScheme = darkColorScheme(
    // Primary colors - Blue accent
    primary = Primary,
    onPrimary = OnPrimary,
    primaryContainer = PrimaryDark,
    onPrimaryContainer = OnPrimary,

    // Secondary colors - Orange accent (Streamflix style)
    secondary = Secondary,
    onSecondary = OnSecondary,
    secondaryContainer = SecondaryDark,
    onSecondaryContainer = OnSecondary,

    // Background colors - Streamflix dark (#181818)
    background = Background,
    onBackground = OnBackground,

    // Surface colors - Streamflix elevation system
    surface = Surface,
    onSurface = OnSurface,
    surfaceVariant = SurfaceVariant,
    onSurfaceVariant = OnSurfaceVariant,
    surfaceTint = Primary,

    // Error colors - Red
    error = Error,
    onError = OnPrimary,
    errorContainer = Error,
    onErrorContainer = OnPrimary,

    // Outline colors
    outline = OnSurfaceVariant,
    outlineVariant = SurfaceVariant
)

private val StreamflixLightColorScheme = lightColorScheme(
    // Primary colors - Blue accent (adjusted for light theme)
    primary = Primary,
    onPrimary = OnPrimary,
    primaryContainer = PrimaryLight,
    onPrimaryContainer = Background,

    // Secondary colors - Orange accent (adjusted for light theme)
    secondary = Secondary,
    onSecondary = OnSecondary,
    secondaryContainer = SecondaryLight,
    onSecondaryContainer = Background,

    // Background colors - Light theme (for accessibility)
    background = OnBackground,
    onBackground = Background,

    // Surface colors - Light variants
    surface = OnSurface,
    onSurface = Surface,
    surfaceVariant = OnSurfaceVariant,
    onSurfaceVariant = SurfaceVariant,
    surfaceTint = Primary,

    // Error colors - Red
    error = Error,
    onError = OnPrimary,
    errorContainer = Error,
    onErrorContainer = OnPrimary,

    // Outline colors
    outline = SurfaceVariant,
    outlineVariant = OnSurfaceVariant
)

/**
 * Main theme composable for IPTV app - Streamflix Cinematic Style
 *
 * @param darkTheme Whether to use dark theme (default: true for cinematic experience)
 * @param content The content to be themed
 */
@Composable
fun IPTVTheme(
    darkTheme: Boolean = true, // Always use dark theme by default for cinematic experience
    content: @Composable () -> Unit
) {
    val colorScheme = when {
        darkTheme -> StreamflixDarkColorScheme
        else -> StreamflixLightColorScheme
    }

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as android.app.Activity).window
            // Use deep background color for immersive TV experience
            @Suppress("DEPRECATION")
            window.statusBarColor = colorScheme.background.toArgb()
            @Suppress("DEPRECATION")
            window.navigationBarColor = colorScheme.background.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
            WindowCompat.getInsetsController(window, view).isAppearanceLightNavigationBars = false
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = IPTVTypography,
        content = content
    )
}

/**
 * Streamflix specific theme variant
 * Ensures consistent Streamflix cinematic styling across the app
 */
@Composable
fun GoogleTVTheme(
    content: @Composable () -> Unit
) {
    IPTVTheme(
        darkTheme = true, // Streamflix always uses dark theme for cinematic experience
        content = content
    )
}

/**
 * Streamflix theme alias for clarity
 */
@Composable
fun StreamflixTheme(
    content: @Composable () -> Unit
) {
    IPTVTheme(
        darkTheme = true,
        content = content
    )
}
