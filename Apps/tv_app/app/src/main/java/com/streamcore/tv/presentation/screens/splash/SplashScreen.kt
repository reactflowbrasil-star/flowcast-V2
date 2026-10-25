package com.streamcore.tv.presentation.screens.splash

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.*
import androidx.compose.ui.res.colorResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.streamcore.tv.presentation.theme.*
import kotlinx.coroutines.delay
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R
import com.streamcore.tv.BuildConfig

/**
 * Splash screen that checks authentication status
 * and navigates to appropriate screen
 */
@Composable
fun SplashScreen(
    onNavigateToAuth: () -> Unit,
    onNavigateToHome: () -> Unit,
    onNavigateToDeviceRegistration: () -> Unit,
    viewModel: SplashViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    // Handle navigation based on authentication status
    LaunchedEffect(uiState.isCheckComplete) {
        if (uiState.isCheckComplete) {
            delay(1000) // Show splash for at least 1 second
            when {
                !uiState.isAuthenticated || uiState.needsUserAgentRenewal -> {
                    // No access token or User-Agent needs renewal, go to login
                    onNavigateToAuth()
                }
                !uiState.isDeviceRegistered -> {
                    // Has access token but no device token, go to device registration
                    onNavigateToDeviceRegistration()
                }
                else -> {
                    // All tokens are valid, go to home
                    onNavigateToHome()
                }
            }
        }
    }

    // Safety timeout - navigate to auth after 5 seconds if still loading
    LaunchedEffect(Unit) {
        delay(5000) // 5 second timeout
        if (!uiState.isCheckComplete) {
            onNavigateToAuth()
        }
    }
    
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                brush = Brush.radialGradient(
                    colors = listOf(
                        Color(0xFF0D1117), // GitHub dark
                        Color(0xFF161B22), // Darker gray
                        Color(0xFF21262D), // Medium dark
                        Color(0xFF000000)  // Pure black
                    ),
                    radius = 1500f,
                    center = androidx.compose.ui.geometry.Offset(0.3f, 0.2f)
                )
            ),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            // Modern StreamCore Logo
            ModernStreamCoreLogo(
                modifier = Modifier.padding(bottom = 32.dp)
            )
            
            Spacer(modifier = Modifier.height(32.dp))
            
            // Modern loading indicator
            CircularProgressIndicator(
                modifier = Modifier.size(40.dp),
                color = Color(0xFF58A6FF), // GitHub blue
                strokeWidth = 4.dp
            )

            Spacer(modifier = Modifier.height(24.dp))

            Text(
                text = when {
                    uiState.isCheckComplete && uiState.isAuthenticated -> stringResource(R.string.splash_welcome_back)
                    uiState.isCheckComplete && !uiState.isAuthenticated -> stringResource(R.string.splash_redirecting_login)
                    else -> stringResource(R.string.splash_verifying_auth)
                },
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
                color = Color(0xFFF0F6FC), // Almost white
                textAlign = androidx.compose.ui.text.style.TextAlign.Center
            )
        }
    }
}

@Composable
private fun ModernStreamCoreLogo(
    modifier: Modifier = Modifier
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = modifier
    ) {
        // Show the splash_logo which contains the full branding image
        Image(
            painter = painterResource(id = R.drawable.splash_logo),
            contentDescription = stringResource(R.string.cd_logo),
            modifier = Modifier
                .fillMaxWidth(0.6f)
                .heightIn(max = 180.dp),
            contentScale = androidx.compose.ui.layout.ContentScale.Fit
        )

        Spacer(modifier = Modifier.height(16.dp))

        // Subtitle
        Text(
            text = stringResource(id = R.string.splash_premium_content_platform),
            fontSize = 16.sp,
            color = Color(0xFF94A3B8),
            fontWeight = FontWeight.Medium,
            letterSpacing = 1.2.sp,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center
        )
    }
}
