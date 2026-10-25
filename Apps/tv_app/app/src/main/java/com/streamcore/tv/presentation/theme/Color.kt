package com.streamcore.tv.presentation.theme

import androidx.compose.ui.graphics.Color

/**
 * Color palette for IPTV Android App - Streamflix Cinematic Style
 *
 * Inspired by Streamflix design with dark cinematic colors optimized for streaming experience
 */

// ===== STREAMFLIX CINEMATIC COLOR SYSTEM =====

// Primary Colors - Streamflix Style
val Primary = Color(0xFF4285F4)        // Keep Google Blue for accents
val PrimaryDark = Color(0xFF1976D2)    // Darker blue for variants
val PrimaryLight = Color(0xFF64B5F6)   // Lighter blue for highlights
val OnPrimary = Color(0xFFFFFFFF)      // White on primary

// Secondary Colors - Streamflix Accent
val Secondary = Color(0xFFFF6B35)      // Orange accent for streaming
val SecondaryDark = Color(0xFFE55722)  // Darker orange
val SecondaryLight = Color(0xFFFF8A65) // Lighter orange
val OnSecondary = Color(0xFFFFFFFF)    // White on secondary

// Background Colors - Streamflix Dark Theme
val Background = Color(0xFF181818)     // Streamflix main background
val BackgroundVariant = Color(0xFF1E2129) // Streamflix secondary background
val OnBackground = Color(0xFFFFFFFF)   // Pure white text

// Surface Colors - Streamflix Elevation System
val Surface = Color(0xFF181818)        // Base surface (same as background)
val Surface1 = Color(0xFF1E2129)       // Surface level +1 (Streamflix secondary)
val Surface2 = Color(0xFF242831)       // Surface level +2 (slightly lighter)
val Surface3 = Color(0xFF2A2E39)       // Surface level +3 (more elevation)
val Surface4 = Color(0xFF303441)       // Surface level +4 (higher elevation)
val Surface5 = Color(0xFF363A49)       // Surface level +5 (highest elevation)
val SurfaceVariant = Color(0xFF1A1D23) // Surface variant (darker)
val OnSurface = Color(0xFFFFFFFF)      // Pure white on surface
val OnSurfaceVariant = Color(0xFFB0BEC5) // Light gray on surface variant

// Text Colors - High contrast for TV
val TextPrimary = Color(0xFFFFFFFF)    // Pure white for primary text
val TextSecondary = Color(0xFFE8EAF6)  // Soft white for secondary text
val TextTertiary = Color(0xFFB0BEC5)   // Light gray for tertiary text
val TextDisabled = Color(0xFF757575)   // Medium gray for disabled text

// Status Colors - Google TV optimized
val Success = Color(0xFF34A853)        // Google Green for success
val Warning = Color(0xFFFBBC04)        // Google Yellow for warnings
val Error = Color(0xFFEA4335)          // Google Red for errors
val Info = Color(0xFF4285F4)           // Google Blue for info

// Accent Colors - Google TV style
val Accent = Color(0xFFFF6B35)         // Orange accent for highlights
val AccentLight = Color(0xFFFF8A65)    // Light orange for variants
val AccentBlue = Color(0xFF4285F4)     // Blue accent for streaming UI

// ===== FOCUS SYSTEM COLORS =====

// Focus Colors - Optimized for TV remote navigation with enhanced contrast
val FocusBorder = Color.White    // Bright white for maximum visibility
val FocusGlow = Color(0x334285F4)      // Blue glow with alpha
val FocusBackground = Color(0x404285F4) // More visible blue background for focus
val FocusPressed = Color(0xFF1976D2)   // Darker blue for pressed state

// Enhanced Button Focus Colors - More visible contrast
val ButtonFocusedPrimary = Color(0xFF1565C0)    // Much darker blue for primary button focus
val ButtonFocusedSecondary = Color(0xFF424242)  // Darker gray for secondary button focus
val ButtonFocusedOutline = Color(0x404285F4)    // More visible blue for outline button focus

// ===== STREAMFLIX UTILITY COLORS =====

// Transparency and Overlays - Streamflix Style
val Transparent = Color(0x00000000)    // Fully transparent
val SemiTransparent = Color(0x80000000) // 50% black overlay
val OverlayDark = Color(0xCC000000)    // 80% black overlay for banners
val OverlayLight = Color(0x33FFFFFF)   // 20% white overlay
val OverlayGradientStart = Color(0x00000000) // Transparent for gradients
val OverlayGradientMid = Color(0x4D181818)   // 30% dark for mid gradient
val OverlayGradientEnd = Color(0xCC181818)   // 80% dark for end gradient

// Gradient Colors - Streamflix Cinematic Style
val GradientStart = Color(0xFF181818)  // Streamflix dark
val GradientMid = Color(0x88181818)    // Semi-transparent dark
val GradientEnd = Color(0x00181818)    // Transparent dark
val GradientAccent = Color(0xFFFF6B35) // Orange accent

// ===== CONTENT SPECIFIC COLORS =====

// Content Rating Colors - TV optimized
val RatingGold = Color(0xFFFBBC04)     // Google Yellow for high ratings
val RatingGreen = Color(0xFF34A853)    // Google Green for good ratings
val RatingOrange = Color(0xFFFF6B35)   // Orange for medium ratings
val RatingRed = Color(0xFFEA4335)      // Google Red for low ratings

// Streaming Specific Colors
val LiveIndicator = Color(0xFFEA4335)  // Google Red for live content
val PremiumGold = Color(0xFFFBBC04)    // Google Yellow for premium
val NewContent = Color(0xFF34A853)     // Google Green for new content
val HDQuality = Color(0xFF4285F4)      // Google Blue for HD quality
val UHDQuality = Color(0xFF9C27B0)     // Purple for 4K/UHD content

// ===== STREAMFLIX COMPONENT COLORS =====

// Card Colors - Streamflix Style
val CardBackground = Surface1          // Streamflix surface level +1
val CardBackgroundHover = Surface2     // Surface level +2 for hover
val CardBackgroundFocus = Surface3     // Surface level +3 for focus
val CardBackgroundSelected = Color(0xFF2A2E39) // Highlighted card background

// Button Colors - Streamflix Style
val ButtonPrimary = Color(0xFFFFFFFF)  // White primary button (Streamflix style)
val ButtonPrimaryText = Color(0xFF000000) // Black text on white button
val ButtonSecondary = Transparent      // Transparent secondary button
val ButtonSecondaryBorder = Color(0x80FFFFFF) // Semi-transparent white border
val ButtonOutline = Transparent        // Transparent background
val ButtonDisabled = Color(0xFF424242) // Dark gray for disabled

// Navigation Colors - Streamflix Style
val NavigationBackground = Surface     // Streamflix base surface
val NavigationSelected = Primary       // Blue for selected
val NavigationUnselected = OnSurfaceVariant // Light gray for unselected
val NavigationHover = Surface2         // Hover state for navigation

// ===== STREAMFLIX HERO BANNER COLORS =====

// Hero Banner Specific Colors
val HeroBannerOverlay = Color(0x99000000)     // 60% black overlay
val HeroBannerGradientStart = Color(0x00000000) // Transparent start
val HeroBannerGradientMid = Color(0x4D000000)   // 30% black middle
val HeroBannerGradientEnd = Color(0xCC000000)   // 80% black end
val HeroBannerTextPrimary = Color(0xFFFFFFFF)   // Pure white text
val HeroBannerTextSecondary = Color(0xCCFFFFFF) // 80% white text

// Dot Indicator Colors (for hero slider)
val DotIndicatorActive = Color(0xFFFFFFFF)    // White for active dot
val DotIndicatorInactive = Color(0x4DFFFFFF)  // 30% white for inactive dots

// Additional aliases for compatibility
val BackgroundPrimary = Background              // Alias for main background
val SurfaceSecondary = Surface2                 // Alias for secondary surface
