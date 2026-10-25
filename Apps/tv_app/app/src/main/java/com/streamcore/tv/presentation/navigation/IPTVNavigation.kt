package com.streamcore.tv.presentation.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.navigation
import androidx.navigation.navArgument
import com.streamcore.tv.presentation.screens.auth.ActivationScreen
import com.streamcore.tv.presentation.screens.auth.DeviceRegistrationRouter
import com.streamcore.tv.presentation.screens.auth.UserLoginScreen
import com.streamcore.tv.presentation.screens.category.CategoryScreen
import com.streamcore.tv.presentation.screens.detail.DetailScreen
import com.streamcore.tv.presentation.screens.home.HomeScreen
import com.streamcore.tv.presentation.screens.livetv.LiveTVScreen
import com.streamcore.tv.presentation.screens.livetv.LiveTVDirectScreen
import com.streamcore.tv.presentation.screens.events.EventsScreen
import com.streamcore.tv.presentation.screens.player.PlayerScreen
import com.streamcore.tv.presentation.screens.player.EpisodicPlayerScreen
import com.streamcore.tv.presentation.screens.profile.ProfileScreen
import com.streamcore.tv.presentation.screens.search.SearchScreen
import com.streamcore.tv.presentation.screens.season.SeasonDetailScreen
import com.streamcore.tv.presentation.screens.series.SeriesDetailScreen
import com.streamcore.tv.presentation.screens.settings.SettingsScreen
import com.streamcore.tv.presentation.screens.settings.GoogleTVSettingsScreen
import com.streamcore.tv.presentation.screens.settings.DeviceManagementScreen
import com.streamcore.tv.presentation.screens.splash.SplashScreen
import timber.log.Timber


/**
 * Main navigation component for IPTV Android App
 * 
 * Handles navigation between:
 * - Authentication flow (login, activation)
 * - Main app flow (home, search, player, settings)
 * 
 * @param navController Navigation controller for managing navigation
 */
@Composable
fun IPTVNavigation(
    navController: NavHostController
) {
    Timber.d("Setting up IPTV Navigation")
    
    NavHost(
        navController = navController,
        startDestination = IPTVDestinations.SPLASH
    ) {
        // Splash Screen
        composable(IPTVDestinations.SPLASH) {
            SplashScreen(
                onNavigateToAuth = {
                    navController.navigate(IPTVDestinations.AUTH_ROUTE) {
                        popUpTo(IPTVDestinations.SPLASH) { inclusive = true }
                    }
                },
                onNavigateToHome = {
                    navController.navigate(IPTVDestinations.MAIN_ROUTE) {
                        popUpTo(IPTVDestinations.SPLASH) { inclusive = true }
                    }
                },
                onNavigateToDeviceRegistration = {
                    navController.navigate(IPTVDestinations.DEVICE_REGISTRATION) {
                        popUpTo(IPTVDestinations.SPLASH) { inclusive = true }
                    }
                }
            )
        }
        // Authentication Flow
        navigation(
            startDestination = IPTVDestinations.USER_LOGIN,
            route = IPTVDestinations.AUTH_ROUTE
        ) {
            composable(IPTVDestinations.USER_LOGIN) {
                UserLoginScreen(
                    onNavigateToDeviceRegistration = {
                        navController.navigate(IPTVDestinations.DEVICE_REGISTRATION)
                    }
                )
            }

            composable(IPTVDestinations.DEVICE_REGISTRATION) {
                DeviceRegistrationRouter(
                    onNavigateToHome = {
                        navController.navigate(IPTVDestinations.MAIN_ROUTE) {
                            popUpTo(IPTVDestinations.AUTH_ROUTE) {
                                inclusive = true
                            }
                        }
                    }
                )
            }
            
            composable(
                route = "${IPTVDestinations.ACTIVATION}/{token}",
                arguments = listOf(
                    navArgument("token") { 
                        type = NavType.StringType 
                    }
                )
            ) { backStackEntry ->
                val token = backStackEntry.arguments?.getString("token") ?: ""
                ActivationScreen(
                    deviceToken = token,
                    onNavigateToHome = {
                        navController.navigate(IPTVDestinations.MAIN_ROUTE) {
                            popUpTo(IPTVDestinations.AUTH_ROUTE) { 
                                inclusive = true 
                            }
                        }
                    }
                )
            }
        }
        
        // Main App Flow
        navigation(
            startDestination = IPTVDestinations.HOME,
            route = IPTVDestinations.MAIN_ROUTE
        ) {
            composable(IPTVDestinations.HOME) {
                HomeScreen(
                    onNavigateToDetail = { contentId ->
                        navController.navigate("${IPTVDestinations.DETAIL}/$contentId")
                    },
                    onNavigateToPlayer = { contentId ->
                        navController.navigate("${IPTVDestinations.PLAYER}/$contentId")
                    },
                    onNavigateToCategory = { categoryId ->
                        navController.navigate("${IPTVDestinations.CATEGORY}/$categoryId")
                    },
                    onNavigateToSearch = {
                        navController.navigate(IPTVDestinations.SEARCH)
                    },
                    onNavigateToSettings = {
                        navController.navigate(IPTVDestinations.SETTINGS)
                    },
                    onNavigateToLiveTV = {
                        navController.navigate(IPTVDestinations.LIVE_TV)
                    },
                    onNavigateToEvents = {
                        navController.navigate(IPTVDestinations.EVENTS)
                    },
                    onNavigateToSeries = { contentId ->
                        navController.navigate("${IPTVDestinations.SERIES_DETAIL}/$contentId")
                    }
                )
            }
            
            composable(IPTVDestinations.SEARCH) {
                SearchScreen(
                    onNavigateBack = {
                        navController.popBackStack()
                    },
                    onNavigateToDetail = { contentId ->
                        navController.navigate("${IPTVDestinations.DETAIL}/$contentId")
                    },
                    onNavigateToPlayer = { contentId ->
                        navController.navigate("${IPTVDestinations.PLAYER}/$contentId")
                    },
                    onNavigateToSeries = { contentId ->
                        navController.navigate("${IPTVDestinations.SERIES_DETAIL}/$contentId")
                    },
                    onNavigateToLiveTV = {
                        navController.navigate(IPTVDestinations.LIVE_TV)
                    }
                )
            }
            
            composable(
                route = "${IPTVDestinations.DETAIL}/{contentId}",
                arguments = listOf(
                    navArgument("contentId") { 
                        type = NavType.StringType 
                    }
                )
            ) { backStackEntry ->
                val contentId = backStackEntry.arguments?.getString("contentId") ?: ""
                DetailScreen(
                    contentId = contentId,
                    onNavigateBack = { navController.popBackStack() },
                    onNavigateToPlayer = { id, streamLinkId ->
                        val route = if (streamLinkId != null) {
                            "${IPTVDestinations.PLAYER}/$id?type=content&streamLinkId=$streamLinkId"
                        } else {
                            "${IPTVDestinations.PLAYER}/$id"
                        }
                        navController.navigate(route)
                    },
                    onNavigateToEpisodePlayer = { id ->
                        navController.navigate("${IPTVDestinations.EPISODIC_PLAYER}/$id")
                    }
                )
            }
            
            composable(
                route = "${IPTVDestinations.PLAYER}/{contentId}?type={type}&streamLinkId={streamLinkId}",
                arguments = listOf(
                    navArgument("contentId") {
                        type = NavType.StringType
                    },
                    navArgument("type") {
                        type = NavType.StringType
                        defaultValue = "content"
                    },
                    navArgument("streamLinkId") {
                        type = NavType.StringType
                        defaultValue = ""
                        nullable = true
                    }
                )
            ) { backStackEntry ->
                val contentId = backStackEntry.arguments?.getString("contentId") ?: ""
                val contentType = backStackEntry.arguments?.getString("type") ?: "content"
                val streamLinkIdStr = backStackEntry.arguments?.getString("streamLinkId")
                val streamLinkId = streamLinkIdStr?.toLongOrNull()
                PlayerScreen(
                    contentId = contentId,
                    contentType = contentType,
                    streamLinkId = streamLinkId,
                    onNavigateBack = {
                        navController.popBackStack()
                    }
                )
            }

            // Episodic Player for Series and Anime
            composable(
                route = "${IPTVDestinations.EPISODIC_PLAYER}/{contentId}",
                arguments = listOf(
                    navArgument("contentId") {
                        type = NavType.StringType
                    }
                )
            ) { backStackEntry ->
                val contentId = backStackEntry.arguments?.getString("contentId") ?: ""
                EpisodicPlayerScreen(
                    contentId = contentId,
                    onNavigateBack = { navController.popBackStack() }
                )
            }

            // Episodic Player with specific episode
            composable(
                route = "${IPTVDestinations.EPISODIC_PLAYER}/{contentId}/{episodeId}",
                arguments = listOf(
                    navArgument("contentId") {
                        type = NavType.StringType
                    },
                    navArgument("episodeId") {
                        type = NavType.StringType
                    }
                )
            ) { backStackEntry ->
                val contentId = backStackEntry.arguments?.getString("contentId") ?: ""
                val episodeId = backStackEntry.arguments?.getString("episodeId")
                EpisodicPlayerScreen(
                    contentId = contentId,
                    episodeId = episodeId,
                    onNavigateBack = { navController.popBackStack() }
                )
            }

            composable(
                route = "${IPTVDestinations.CATEGORY}/{categoryId}",
                arguments = listOf(
                    navArgument("categoryId") { 
                        type = NavType.StringType 
                    }
                )
            ) { backStackEntry ->
                val categoryId = backStackEntry.arguments?.getString("categoryId") ?: ""
                CategoryScreen(
                    categoryId = categoryId,
                    onNavigateBack = { navController.popBackStack() },
                    onNavigateToDetail = { contentId ->
                        navController.navigate("${IPTVDestinations.DETAIL}/$contentId")
                    },
                    onNavigateToPlayer = { contentId ->
                        navController.navigate("${IPTVDestinations.PLAYER}/$contentId")
                    },
                    onNavigateToSeries = { contentId ->
                        navController.navigate("${IPTVDestinations.SERIES_DETAIL}/$contentId")
                    }
                )
            }
            
            composable(IPTVDestinations.SETTINGS) {
                GoogleTVSettingsScreen(
                    onNavigateBack = {
                        navController.popBackStack()
                    },
                    onNavigateToLogin = {
                        navController.navigate(IPTVDestinations.USER_LOGIN) {
                            popUpTo(0) { inclusive = true }
                        }
                    },
                    onNavigateToDeviceManagement = {
                        navController.navigate(IPTVDestinations.DEVICE_MANAGEMENT)
                    }
                )
            }


            composable(IPTVDestinations.DEVICE_MANAGEMENT) {
                DeviceManagementScreen(
                    onNavigateBack = {
                        navController.popBackStack()
                    }
                )
            }

            // Live TV Screen
            composable(IPTVDestinations.LIVE_TV) {
                LiveTVScreen(
                    onChannelClick = { channelId ->
                        navController.navigate("${IPTVDestinations.PLAYER}/$channelId")
                    },
                    onNavigateBack = {
                        navController.popBackStack()
                    }
                )
            }

            // Events Screen (no EPG)
            composable(IPTVDestinations.EVENTS) {
                EventsScreen(
                    onEventClick = { contentId ->
                        navController.navigate("${IPTVDestinations.PLAYER}/$contentId")
                    },
                    onNavigateBack = {
                        navController.popBackStack()
                    }
                )
            }

            // Live TV Direct - Navigate directly to first channel
            composable(IPTVDestinations.LIVE_TV_DIRECT) {
                LiveTVDirectScreen(
                    onNavigateToPlayer = { channelId ->
                        navController.navigate("${IPTVDestinations.PLAYER}/$channelId") {
                            popUpTo(IPTVDestinations.HOME) { inclusive = false }
                        }
                    },
                    onNavigateBack = {
                        navController.popBackStack()
                    }
                )
            }

            // Series Detail Screen
            composable(
                route = "${IPTVDestinations.SERIES_DETAIL}/{contentId}",
                arguments = listOf(
                    navArgument("contentId") {
                        type = NavType.StringType
                    }
                )
            ) { backStackEntry ->
                val contentId = backStackEntry.arguments?.getString("contentId") ?: ""
                SeriesDetailScreen(
                    contentId = contentId,
                    onNavigateBack = {
                        navController.popBackStack()
                    },
                    onPlayEpisode = { episode ->
                        // Navigate to episodic player with episode
                        navController.navigate("${IPTVDestinations.EPISODIC_PLAYER}/$contentId/${episode.id}")
                    }
                )
            }

            // Season Detail Screen
            composable(
                route = "${IPTVDestinations.SEASON_DETAIL}/{seasonId}",
                arguments = listOf(
                    navArgument("seasonId") {
                        type = NavType.StringType
                    }
                )
            ) { backStackEntry ->
                val seasonId = backStackEntry.arguments?.getString("seasonId") ?: ""
                SeasonDetailScreen(
                    seasonId = seasonId,
                    onEpisodeClick = { episodeId ->
                        navController.navigate("${IPTVDestinations.PLAYER}/$episodeId?type=episode")
                    },
                    onNavigateBack = {
                        navController.popBackStack()
                    }
                )
            }

            }

        // Profile Screen
        composable(IPTVDestinations.PROFILE) {
            ProfileScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateToSettings = {
                    navController.navigate(IPTVDestinations.SETTINGS)
                },
                onNavigateToLogin = {
                    navController.navigate(IPTVDestinations.USER_LOGIN) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }
    }
}

/**
 * Navigation destinations for IPTV app
 */
object IPTVDestinations {
    // Routes
    const val SPLASH = "splash"
    const val AUTH_ROUTE = "auth"
    const val MAIN_ROUTE = "main"

    // Auth destinations
    const val USER_LOGIN = "user_login"
    const val DEVICE_REGISTRATION = "device_registration"
    const val ACTIVATION = "activation"

    // Main destinations
    const val HOME = "home"
    const val SEARCH = "search"
    const val DETAIL = "detail"
    const val PLAYER = "player"
    const val EPISODIC_PLAYER = "episodic_player"
    const val CATEGORY = "category"
    const val SETTINGS = "settings"
    const val DEVICE_MANAGEMENT = "device_management"
    const val PROFILE = "profile"

    // New destinations - Phase 2
    const val LIVE_TV = "live_tv"
    const val LIVE_TV_DIRECT = "live_tv_direct"
    const val EVENTS = "events"
    const val SERIES_DETAIL = "series_detail"
    const val SEASON_DETAIL = "season_detail"
    const val EPISODE_DETAIL = "episode_detail"
}
