package com.streamcore.tv.presentation

import android.app.DownloadManager
import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.streamcore.tv.BuildConfig
import com.streamcore.tv.data.local.datastore.UserPreferencesManager
import com.streamcore.tv.data.local.datastore.TokenManager
import com.streamcore.tv.data.remote.dto.VersionCheckResponseDto
import com.streamcore.tv.domain.repository.AuthRepository
import com.streamcore.tv.core.security.DynamicUserAgentManager
import com.streamcore.tv.core.utils.logd
import com.streamcore.tv.core.utils.loge
import com.streamcore.tv.presentation.update.UpdateManager
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * ViewModel for MainActivity to handle app initialization
 */
@HiltViewModel
class MainViewModel @Inject constructor(
    private val userPreferencesManager: UserPreferencesManager,
    private val tokenManager: TokenManager,
    private val dynamicUserAgentManager: DynamicUserAgentManager,
    private val authRepository: AuthRepository,
    private val checkForUpdateUseCase: com.streamcore.tv.domain.use_case.app.CheckForUpdateUseCase,
    private val updateManager: UpdateManager,
    @ApplicationContext private val context: Context
) : ViewModel() {

    data class MainUiState(
        val isFirstLaunch: Boolean = true,
        val isInitialized: Boolean = false,
        val updateInfo: VersionCheckResponseDto? = null,
        val isDownloading: Boolean = false,
        val downloadProgress: Int = 0
    )

    private val _uiState = MutableStateFlow(MainUiState())
    val uiState: StateFlow<MainUiState> = _uiState.asStateFlow()

    private var currentDownloadId: Long = -1
    private val progressHandler = Handler(Looper.getMainLooper())
    private var progressRunnable: Runnable? = null

    init {
        checkFirstLaunch()
        initializeUserAgent()
        checkForUpdates()
    }

    private fun checkForUpdates() {
        viewModelScope.launch {
            try {
                val currentVersion = BuildConfig.VERSION_CODE
                checkForUpdateUseCase(currentVersion).collect { result ->
                    if (result is com.streamcore.tv.common.Resource.Success) {
                        if (result.data?.hasUpdate == true) {
                            _uiState.update { it.copy(updateInfo = result.data) }
                        }
                    }
                }
            } catch (e: Exception) {
                loge("Error checking for updates", e)
            }
        }
    }

    fun dismissUpdateInfo() {
        stopProgressTracking()
        _uiState.update { it.copy(updateInfo = null, isDownloading = false, downloadProgress = 0) }
    }

    /**
     * Start the update download and track progress
     */
    fun startUpdateDownload(versionInfo: VersionCheckResponseDto) {
        viewModelScope.launch {
            _uiState.update { it.copy(isDownloading = true, downloadProgress = 0) }
            
            // Enqueue the download
            currentDownloadId = updateManager.enqueueDownloadAndInstall(versionInfo)
            logd("Download started with ID: $currentDownloadId")
            
            // Start tracking progress
            startProgressTracking()
        }
    }

    private fun startProgressTracking() {
        val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        
        progressRunnable = object : Runnable {
            override fun run() {
                if (currentDownloadId == -1L) {
                    stopProgressTracking()
                    return
                }
                
                val query = DownloadManager.Query().setFilterById(currentDownloadId)
                val cursor = downloadManager.query(query)
                
                if (cursor.moveToFirst()) {
                    val statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
                    val bytesDownloadedIndex = cursor.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)
                    val bytesTotalIndex = cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)
                    
                    val status = cursor.getInt(statusIndex)
                    val bytesDownloaded = cursor.getLong(bytesDownloadedIndex)
                    val bytesTotal = cursor.getLong(bytesTotalIndex)
                    
                    when (status) {
                        DownloadManager.STATUS_RUNNING -> {
                            val progress = if (bytesTotal > 0) {
                                ((bytesDownloaded * 100) / bytesTotal).toInt()
                            } else {
                                0
                            }
                            _uiState.update { it.copy(downloadProgress = progress) }
                            progressHandler.postDelayed(this, 500)
                        }
                        DownloadManager.STATUS_SUCCESSFUL -> {
                            _uiState.update { it.copy(downloadProgress = 100) }
                            stopProgressTracking()
                            // The BroadcastReceiver in UpdateManager will handle installation
                            // Keep dialog open for a moment to show completion
                            progressHandler.postDelayed({
                                dismissUpdateInfo()
                            }, 1500)
                        }
                        DownloadManager.STATUS_FAILED -> {
                            loge("Download failed")
                            _uiState.update { it.copy(isDownloading = false, downloadProgress = 0) }
                            stopProgressTracking()
                        }
                        DownloadManager.STATUS_PENDING -> {
                            progressHandler.postDelayed(this, 500)
                        }
                        DownloadManager.STATUS_PAUSED -> {
                            progressHandler.postDelayed(this, 1000)
                        }
                    }
                }
                cursor.close()
            }
        }
        
        progressHandler.post(progressRunnable!!)
    }

    private fun stopProgressTracking() {
        progressRunnable?.let { progressHandler.removeCallbacks(it) }
        progressRunnable = null
        currentDownloadId = -1
    }

    /**
     * Check if this is the first launch
     */
    private fun checkFirstLaunch() {
        viewModelScope.launch {
            try {
                userPreferencesManager.isFirstLaunch().collect { isFirstLaunch ->
                    logd("First launch check: $isFirstLaunch")

                    _uiState.update { currentState ->
                        currentState.copy(
                            isFirstLaunch = isFirstLaunch,
                            isInitialized = true
                        )
                    }
                }
            } catch (e: Exception) {
                loge("Error checking first launch", e)
                _uiState.update { it.copy(isInitialized = true) }
            }
        }
    }

    /**
     * Complete first launch setup
     */
    fun completeFirstLaunchSetup() {
        viewModelScope.launch {
            try {
                userPreferencesManager.setFirstLaunchCompleted()
                _uiState.update { 
                    it.copy(
                        isFirstLaunch = false
                    )
                }
                logd("First launch setup completed")
            } catch (e: Exception) {
                loge("Error completing first launch setup", e)
            }
        }
    }

    /**
     * Initialize User-Agent if user is authenticated
     */
    private fun initializeUserAgent() {
        viewModelScope.launch {
            try {
                // Check if user is authenticated
                tokenManager.isAuthenticated().collect { isAuthenticated ->
                    if (isAuthenticated) {
                        logd("🔐 User is authenticated, initializing User-Agent")

                        // Load existing User-Agent from storage
                        val loadedUserAgent = dynamicUserAgentManager.loadFromStorage()
                        if (loadedUserAgent != null) {
                            logd("🔐 User-Agent loaded from storage")
                        } else {
                            logd("🔐 No User-Agent in storage yet (will be set on login)")
                        }
                    } else {
                        logd("🔐 User not authenticated, skipping User-Agent initialization")
                    }
                }
            } catch (e: Exception) {
                loge("🚨 Error initializing User-Agent", e)
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        stopProgressTracking()
    }
}
