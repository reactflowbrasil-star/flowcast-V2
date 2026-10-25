package com.streamcore.tv.presentation.components.common

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.ImageLoader
import coil.compose.AsyncImage
import coil.request.ImageRequest
import dagger.hilt.android.EntryPointAccessors
import com.streamcore.tv.core.di.ImageLoaderEntryPoint

/**
 * Channel Logo component with SVG support
 * Handles both PNG and SVG channel logos with fallback to initials
 */
@Composable
fun ChannelLogo(
    imageUrl: String?,
    channelName: String,
    modifier: Modifier = Modifier,
    size: Dp = 48.dp,
    fontSize: TextUnit = 14.sp,
    backgroundColor: Color = Color(0xFF1976D2),
    cornerRadius: Dp = 2.dp
) {
    val context = LocalContext.current
    
    // Get ImageLoader from Hilt
    val imageLoader = remember {
        val hiltEntryPoint = EntryPointAccessors.fromApplication(
            context,
            ImageLoaderEntryPoint::class.java
        )
        hiltEntryPoint.imageLoader()
    }
    
    Box(
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape(cornerRadius))
            .background(backgroundColor),
        contentAlignment = Alignment.Center
    ) {
        if (!imageUrl.isNullOrEmpty()) {
            AsyncImage(
                model = ImageRequest.Builder(context)
                    .data(imageUrl)
                    .crossfade(true)
                    .build(),
                imageLoader = imageLoader,
                contentDescription = channelName,
                modifier = Modifier
                    .fillMaxSize()
                    .clip(RoundedCornerShape(cornerRadius)),
                contentScale = ContentScale.Fit,
                onError = { error ->
                    println("Error loading image: ${error.result.throwable}")
                }
            )
        } else {
            // Fallback to channel initials
            Text(
                text = channelName.take(3).uppercase(),
                color = Color.White,
                fontSize = fontSize,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

/**
 * Compact channel logo for lists
 */
@Composable
fun CompactChannelLogo(
    imageUrl: String?,
    channelName: String,
    modifier: Modifier = Modifier
) {
    ChannelLogo(
        imageUrl = imageUrl,
        channelName = channelName,
        modifier = modifier,
        size = 32.dp,
        fontSize = 10.sp,
        cornerRadius = 2.dp
    )
}

/**
 * Large channel logo for details
 */
@Composable
fun LargeChannelLogo(
    imageUrl: String?,
    channelName: String,
    modifier: Modifier = Modifier
) {
    ChannelLogo(
        imageUrl = imageUrl,
        channelName = channelName,
        modifier = modifier,
        size = 64.dp,
        fontSize = 18.sp,
        cornerRadius = 4.dp
    )
}
