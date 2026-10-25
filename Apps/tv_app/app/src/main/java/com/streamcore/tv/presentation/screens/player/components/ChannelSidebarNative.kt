package com.streamcore.tv.presentation.screens.player.components

import android.content.Context
import android.graphics.Color as AndroidColor
import android.view.KeyEvent
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.RecyclerView
import coil.load
import coil.transform.RoundedCornersTransformation
import com.streamcore.tv.R
import com.streamcore.tv.domain.model.ContentStream
import timber.log.Timber

@Composable
fun ChannelSidebarNative(
    isVisible: Boolean,
    channels: List<ContentStream>,
    currentChannelId: String?,
    onChannelSelected: (ContentStream) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier
) {
    @Suppress("UNUSED_VARIABLE")
    val context = LocalContext.current
    
    AnimatedVisibility(
        visible = isVisible,
        enter = slideInHorizontally(initialOffsetX = { -it }),
        exit = slideOutHorizontally(targetOffsetX = { -it }),
        modifier = modifier
    ) {
        Box(
            modifier = Modifier
                .fillMaxHeight()
                .width(180.dp)
                .background(
                    Color.Black.copy(alpha = 0.75f),
                    RoundedCornerShape(topEnd = 12.dp, bottomEnd = 12.dp)
                )
        ) {
            AndroidView(
                factory = { ctx ->
                    RecyclerView(ctx).apply {
                        layoutManager = LinearLayoutManager(ctx)

                        val channelAdapter = ChannelAdapter(
                            initialChannels = channels,
                            currentChannelId = currentChannelId,
                            onChannelSelected = onChannelSelected,
                            onDismiss = onDismiss
                        )
                        adapter = channelAdapter
                        setHasFixedSize(true)
                        channelAdapter.setHasStableIds(true)
                        
                        // Auto-focus current channel immediately
                        post {
                            val list = channelAdapter.currentList
                            val currentIndex = if (currentChannelId != null) {
                                list.indexOfFirst { it.id == currentChannelId }.takeIf { it >= 0 } ?: 0
                            } else 0

                            if (channels.isNotEmpty()) {
                                // Scroll to position first
                                scrollToPosition(currentIndex)

                                // Force focus with multiple attempts
                                postDelayed({
                                    val view = layoutManager?.findViewByPosition(currentIndex)
                                    view?.requestFocus()
                                    Timber.d("ChannelSidebarNative: Requesting focus for channel at index $currentIndex")
                                }, 80)
                            }
                        }
                    }
                },
                update = { recyclerView ->
                    (recyclerView.adapter as? ChannelAdapter)?.updateChannels(channels, currentChannelId)

                    // Force focus on current channel when updating
                    recyclerView.post {
                        val adapter = recyclerView.adapter as? ChannelAdapter
                        val list = adapter?.currentList ?: channels
                        val currentIndex = if (currentChannelId != null) {
                            list.indexOfFirst { it.id == currentChannelId }.takeIf { it >= 0 } ?: 0
                        } else 0

                        if (channels.isNotEmpty()) {
                            recyclerView.scrollToPosition(currentIndex)
                            recyclerView.postDelayed({
                                val view = recyclerView.layoutManager?.findViewByPosition(currentIndex)
                                view?.requestFocus()
                                Timber.d("ChannelSidebarNative: Update focus for channel at index $currentIndex")
                            }, 100)
                        }
                    }
                },
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp)
            )
        }
    }
}

class ChannelAdapter(
    initialChannels: List<ContentStream>,
    private var currentChannelId: String?,
    private val onChannelSelected: (ContentStream) -> Unit,
    private val onDismiss: () -> Unit
) : ListAdapter<ContentStream, ChannelAdapter.ChannelViewHolder>(DIFF) {

    init {
        submitList(initialChannels)
    }

    class ChannelViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val name: TextView = view.findViewById(R.id.channel_name)
        val number: TextView = view.findViewById(R.id.channel_number)
        val logo: ImageView = view.findViewById(R.id.channel_logo)
        val currentIndicator: View = view.findViewById(R.id.current_indicator)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ChannelViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_channel, parent, false)
        return ChannelViewHolder(view)
    }

    override fun onBindViewHolder(holder: ChannelViewHolder, position: Int) {
        val channel = getItem(position)

        holder.name.text = channel.title

        // Set channel number
        holder.number.text = channel.channelNumber?.toString() ?: "---"

        // Load channel logo with Coil
        holder.logo.load(channel.imageUrl) {
            placeholder(R.drawable.ic_tv)
            error(R.drawable.ic_tv)
            fallback(R.drawable.ic_tv)
            size(96, 54)
            transformations(RoundedCornersTransformation(8f))
            crossfade(true)
        }

        // Show/hide current channel indicator
        val isSelected = channel.id == currentChannelId
        holder.currentIndicator.visibility = if (isSelected) View.VISIBLE else View.GONE

        // Click listener
        holder.itemView.setOnClickListener {
            Timber.d("Channel clicked: ${channel.title}")
            onChannelSelected(channel)
        }

        // Key listener for D-pad navigation (EXACTLY like basic_drm_implementation)
        holder.itemView.setOnKeyListener { _, keyCode, event ->
            when {
                event.action == KeyEvent.ACTION_DOWN && keyCode == KeyEvent.KEYCODE_DPAD_CENTER -> {
                    Timber.d("Channel selected with D-pad: ${channel.title}")
                    onChannelSelected(channel)
                    true
                }
                event.action == KeyEvent.ACTION_DOWN && keyCode == KeyEvent.KEYCODE_DPAD_RIGHT -> {
                    onDismiss()
                    true
                }
                else -> false
            }
        }

        // Focus change listener for visual feedback
        holder.itemView.setOnFocusChangeListener { v, hasFocus ->
            val scale = if (hasFocus) 1.06f else 1.0f
            val elevation = if (hasFocus) 10f else 2f

            v.animate()
                .scaleX(scale)
                .scaleY(scale)
                .setDuration(150)
                .start()

            // Cambiar el color de fondo de la card
            val cardView = v as androidx.cardview.widget.CardView
            cardView.setCardBackgroundColor(
                if (hasFocus) AndroidColor.parseColor("#2196F3")
                else AndroidColor.parseColor("#1A1A1A")
            )
            cardView.cardElevation = elevation

            // Efecto en el texto
            holder.name.setTextColor(
                if (hasFocus) AndroidColor.WHITE else AndroidColor.parseColor("#FFFFFF")
            )
        }

        // Make focusable and ensure it can receive focus
        holder.itemView.isFocusable = true
        holder.itemView.isFocusableInTouchMode = false
        holder.itemView.isClickable = true

        // If this is the current channel, request focus immediately (only once)
        if (isSelected && !holder.itemView.hasFocus()) {
            holder.itemView.post {
                holder.itemView.requestFocus()
                Timber.d("ChannelAdapter: Requesting focus for current channel: ${channel.title}")
            }
        }
    }

    override fun getItemId(position: Int): Long {
        return getItem(position).id.hashCode().toLong()
    }

    fun updateChannels(newChannels: List<ContentStream>, newCurrentChannelId: String?) {
        currentChannelId = newCurrentChannelId
        submitList(newChannels)
    }

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<ContentStream>() {
            override fun areItemsTheSame(oldItem: ContentStream, newItem: ContentStream): Boolean =
                oldItem.id == newItem.id

            override fun areContentsTheSame(oldItem: ContentStream, newItem: ContentStream): Boolean =
                oldItem == newItem
        }
    }
}
