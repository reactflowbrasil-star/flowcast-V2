package com.streamcore.tv.presentation.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * Typography system for IPTV Android App - Google TV Style
 *
 * Optimized for TV viewing distances with larger sizes and better contrast
 * Following Google TV design guidelines for readability at 10-foot distance
 */

val IPTVTypography = Typography(
    // Display styles - for hero content and large headings (TV optimized)
    displayLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Bold,
        fontSize = 48.sp,        // Increased for TV viewing
        lineHeight = 56.sp,      // Better line spacing for TV
        letterSpacing = (-0.25).sp
    ),
    displayMedium = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Bold,
        fontSize = 40.sp,        // Increased for TV viewing
        lineHeight = 48.sp,      // Better line spacing for TV
        letterSpacing = 0.sp
    ),
    displaySmall = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Bold,
        fontSize = 32.sp,        // Increased for TV viewing
        lineHeight = 40.sp,      // Better line spacing for TV
        letterSpacing = 0.sp
    ),
    
    // Headline styles - for section headers (TV optimized)
    headlineLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Bold,
        fontSize = 28.sp,        // Increased for TV viewing
        lineHeight = 36.sp,      // Better line spacing for TV
        letterSpacing = 0.sp
    ),
    headlineMedium = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.SemiBold,
        fontSize = 24.sp,        // Increased for TV viewing
        lineHeight = 32.sp,      // Better line spacing for TV
        letterSpacing = 0.sp
    ),
    headlineSmall = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.SemiBold,
        fontSize = 20.sp,        // Increased for TV viewing
        lineHeight = 28.sp,      // Better line spacing for TV
        letterSpacing = 0.sp
    ),

    // Title styles - for card titles and important content (TV optimized)
    titleLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.SemiBold,
        fontSize = 18.sp,        // Increased for TV viewing
        lineHeight = 26.sp,      // Better line spacing for TV
        letterSpacing = 0.sp
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Medium,
        fontSize = 16.sp,        // Increased for TV viewing
        lineHeight = 24.sp,      // Better line spacing for TV
        letterSpacing = 0.1.sp
    ),
    titleSmall = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,        // Increased for TV viewing
        lineHeight = 20.sp,      // Better line spacing for TV
        letterSpacing = 0.1.sp
    ),
    
    // Body styles - for main content text (TV optimized)
    bodyLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 18.sp,        // Increased for TV viewing
        lineHeight = 28.sp,      // Better line spacing for TV
        letterSpacing = 0.5.sp
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,        // Increased for TV viewing
        lineHeight = 24.sp,      // Better line spacing for TV
        letterSpacing = 0.25.sp
    ),
    bodySmall = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,        // Increased for TV viewing
        lineHeight = 20.sp,      // Better line spacing for TV
        letterSpacing = 0.4.sp
    ),

    // Label styles - for buttons and form labels (TV optimized)
    labelLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Medium,
        fontSize = 16.sp,        // Increased for TV viewing
        lineHeight = 24.sp,      // Better line spacing for TV
        letterSpacing = 0.1.sp
    ),
    labelMedium = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,        // Increased for TV viewing
        lineHeight = 20.sp,      // Better line spacing for TV
        letterSpacing = 0.5.sp
    ),
    labelSmall = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,        // Increased for TV viewing
        lineHeight = 18.sp,      // Better line spacing for TV
        letterSpacing = 0.5.sp
    )
)
