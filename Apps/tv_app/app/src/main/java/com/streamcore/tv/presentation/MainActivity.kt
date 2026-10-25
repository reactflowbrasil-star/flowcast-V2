package com.streamcore.tv.presentation

import android.content.Context
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.rememberNavController
import com.streamcore.tv.R
import com.streamcore.tv.core.perf.DebugPerformanceTracer
import com.streamcore.tv.core.security.NetworkSecurityManager
import com.streamcore.tv.core.utils.LanguageManager
import com.streamcore.tv.core.utils.getLanguageManager
import com.streamcore.tv.data.local.datastore.TokenManager
import com.streamcore.tv.presentation.navigation.IPTVNavigation
import com.streamcore.tv.presentation.navigation.IPTVDestinations
import com.streamcore.tv.presentation.navigation.GoogleTVFocusProvider
import com.streamcore.tv.presentation.screens.security.SecurityWarningScreen
import com.streamcore.tv.presentation.theme.GoogleTVTheme
import com.streamcore.tv.presentation.update.UpdateDialog
import dagger.hilt.android.AndroidEntryPoint
import timber.log.Timber
import javax.inject.Inject

/**
 * Main Activity for IPTV Android App
 * 
 * Handles:
 * - Splash screen setup
 * - Theme application
 * - Navigation initialization
 * - Edge-to-edge display
 * - App updates with progress tracking
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var networkSecurityManager: NetworkSecurityManager

    @Inject
    lateinit var tokenManager: TokenManager
    
    private lateinit var languageManager: LanguageManager

    override fun onCreate(savedInstanceState: Bundle?) {
        DebugPerformanceTracer.start(
            metric = "startup.main_activity_on_create_ms",
            token = "activity"
        )

        // Install splash screen
        installSplashScreen()
        
        super.onCreate(savedInstanceState)
        
        // Initialize language manager and apply saved language
        languageManager = getLanguageManager()
        
        // Enable edge-to-edge display
        enableEdgeToEdge()
        
        Timber.d("MainActivity created")

        // Check for dangerous debugging apps
        if (networkSecurityManager.hasNetworkDebuggingApps()) {
            val detectedApps = networkSecurityManager.getDetectedDangerousApps()
            Timber.w("🚨 Dangerous debugging apps detected, blocking app access")

            setContent {
                GoogleTVTheme {
                    SecurityWarningScreen(
                        detectedApps = detectedApps,
                        onExit = {
                            finishAffinity()
                        }
                    )
                }
            }
            return
        }

        setContent {
            val mainViewModel: MainViewModel = hiltViewModel()
            val uiState by mainViewModel.uiState.collectAsStateWithLifecycle()
            val context = LocalContext.current

            // Update Dialog with download progress support
            uiState.updateInfo?.let { updateInfo ->
                UpdateDialog(
                    versionInfo = updateInfo,
                    onUpdate = {
                        if (!uiState.isDownloading) {
                            Toast.makeText(
                                context, 
                                context.getString(R.string.update_preparing), 
                                Toast.LENGTH_SHORT
                            ).show()
                            mainViewModel.startUpdateDownload(updateInfo)
                        }
                    },
                    onLater = {
                        if (!uiState.isDownloading || !updateInfo.forceUpdate) {
                            mainViewModel.dismissUpdateInfo()
                        }
                    },
                    isDownloading = uiState.isDownloading,
                    downloadProgress = uiState.downloadProgress
                )
            }

            IPTVApp(tokenManager = tokenManager)
        }
    }
    
    override fun attachBaseContext(newBase: Context) {
        // Apply language configuration before attaching base context
        val languageManager = newBase.getLanguageManager()
        val localizedContext = languageManager.createLocalizedContext(newBase)
        super.attachBaseContext(localizedContext)
    }
}

/**
 * Main composable for the IPTV app
 */
@Composable
fun IPTVApp(tokenManager: TokenManager) {
    GoogleTVTheme {
        GoogleTVFocusProvider {
            LaunchedEffect(Unit) {
                DebugPerformanceTracer.end(
                    metric = "startup.app_on_create_to_first_compose_ms",
                    token = "process",
                    attributes = mapOf("stage" to "iptv_app_composed")
                )
                DebugPerformanceTracer.end(
                    metric = "startup.main_activity_on_create_ms",
                    token = "activity",
                    attributes = mapOf("stage" to "iptv_app_composed")
                )
            }

            Surface(
                modifier = Modifier.fillMaxSize(),
                color = MaterialTheme.colorScheme.background
            ) {
                val navController = rememberNavController()

                // Observe force logout events and navigate to login
                LaunchedEffect(Unit) {
                    tokenManager.forceLogoutEvent.collect { reason ->
                        Timber.w("Force logout triggered: $reason")
                        navController.navigate(IPTVDestinations.USER_LOGIN) {
                            popUpTo(0) { inclusive = true }
                        }
                    }
                }

                IPTVNavigation(navController = navController)
            }
        }
    }
}
