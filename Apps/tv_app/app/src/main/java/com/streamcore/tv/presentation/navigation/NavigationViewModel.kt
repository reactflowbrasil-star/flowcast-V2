package com.streamcore.tv.presentation.navigation

import androidx.lifecycle.ViewModel
import com.streamcore.tv.domain.usecase.auth.IsAuthenticatedUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

/**
 * ViewModel for navigation logic
 * 
 * Provides authentication state for navigation decisions
 */
@HiltViewModel
class NavigationViewModel @Inject constructor(
    val isAuthenticatedUseCase: IsAuthenticatedUseCase
) : ViewModel()
