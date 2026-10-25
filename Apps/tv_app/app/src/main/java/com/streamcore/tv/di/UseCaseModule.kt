package com.streamcore.tv.di

import com.streamcore.tv.domain.repository.AuthRepository
import com.streamcore.tv.domain.repository.ChannelsRepository
import com.streamcore.tv.domain.repository.ContentRepository
import com.streamcore.tv.domain.repository.UserRepository
import com.streamcore.tv.domain.repository.AppRepository
import com.streamcore.tv.domain.usecase.auth.*
import com.streamcore.tv.domain.usecase.content.*
import com.streamcore.tv.domain.usecase.user.GetUserProfileUseCase
import com.streamcore.tv.domain.usecase.user.UpdateUserProfileUseCase
import com.streamcore.tv.domain.usecase.user.GetUserPreferencesUseCase
import com.streamcore.tv.domain.usecase.user.UpdateUserPreferencesUseCase
import com.streamcore.tv.domain.usecase.user.GetFavoritesUseCase
import com.streamcore.tv.domain.usecase.user.AddToFavoritesUseCase
import com.streamcore.tv.domain.usecase.user.RemoveFromFavoritesUseCase
import com.streamcore.tv.domain.usecase.user.IsFavoriteUseCase
import com.streamcore.tv.domain.usecase.user.GetFavoritesFlowUseCase
import com.streamcore.tv.domain.usecase.user.GetWatchHistoryUseCase
import com.streamcore.tv.domain.usecase.user.UpdateWatchProgressUseCase
import com.streamcore.tv.domain.usecase.user.GetWatchProgressUseCase
import com.streamcore.tv.domain.usecase.user.GetContinueWatchingUseCase
import com.streamcore.tv.domain.usecase.user.ClearWatchHistoryUseCase
import com.streamcore.tv.domain.usecase.user.GetUserDevicesUseCase
import com.streamcore.tv.domain.usecase.user.RemoveDeviceUseCase
import com.streamcore.tv.domain.usecase.user.UpdateDeviceNameUseCase
import com.streamcore.tv.domain.usecase.player.GetPlaybackProgressUseCase
import com.streamcore.tv.domain.usecase.player.SavePlaybackProgressUseCase
import com.streamcore.tv.domain.use_case.app.CheckForUpdateUseCase // Keep existing import style if mixed
import com.streamcore.tv.domain.repository.PlaybackRepository
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Hilt module for Use Case dependencies
 * 
 * Provides all use cases with their repository dependencies
 */
@Module
@InstallIn(SingletonComponent::class)
object UseCaseModule {
    
    // ========================================
    // AUTH USE CASES
    // ========================================

    @Provides
    @Singleton
    fun provideLoginUserUseCase(
        authRepository: AuthRepository
    ): LoginUserUseCase {
        return LoginUserUseCase(authRepository)
    }

    @Provides
    @Singleton
    fun provideRegisterDeviceUseCase(
        authRepository: AuthRepository
    ): RegisterDeviceUseCase {
        return RegisterDeviceUseCase(authRepository)
    }
    
    @Provides
    @Singleton
    fun provideActivateDeviceUseCase(
        authRepository: AuthRepository
    ): ActivateDeviceUseCase {
        return ActivateDeviceUseCase(authRepository)
    }
    
    @Provides
    @Singleton
    fun provideRefreshTokenUseCase(
        authRepository: AuthRepository
    ): RefreshTokenUseCase {
        return RefreshTokenUseCase(authRepository)
    }
    
    @Provides
    @Singleton
    fun provideLogoutUseCase(
        authRepository: AuthRepository
    ): LogoutUseCase {
        return LogoutUseCase(authRepository)
    }
    
    @Provides
    @Singleton
    fun provideIsAuthenticatedUseCase(
        authRepository: AuthRepository
    ): IsAuthenticatedUseCase {
        return IsAuthenticatedUseCase(authRepository)
    }
    
    @Provides
    @Singleton
    fun provideGetAccessTokenUseCase(
        authRepository: AuthRepository
    ): GetAccessTokenUseCase {
        return GetAccessTokenUseCase(authRepository)
    }

    @Provides
    @Singleton
    fun provideGetDeviceStatusUseCase(
        authRepository: AuthRepository
    ): GetDeviceStatusUseCase {
        return GetDeviceStatusUseCase(authRepository)
    }


    
    // ========================================
    // CONTENT USE CASES
    // ========================================
    
    @Provides
    @Singleton
    fun provideGetCategoriesUseCase(
        contentRepository: ContentRepository
    ): GetCategoriesUseCase {
        return GetCategoriesUseCase(contentRepository)
    }
    
    @Provides
    @Singleton
    fun provideGetContentByCategoryUseCase(
        contentRepository: ContentRepository
    ): GetContentByCategoryUseCase {
        return GetContentByCategoryUseCase(contentRepository)
    }
    
    @Provides
    @Singleton
    fun provideGetContentDetailsUseCase(
        contentRepository: ContentRepository
    ): GetContentDetailsUseCase {
        return GetContentDetailsUseCase(contentRepository)
    }
    
    @Provides
    @Singleton
    fun provideGetFeaturedContentUseCase(
        contentRepository: ContentRepository
    ): GetFeaturedContentUseCase {
        return GetFeaturedContentUseCase(contentRepository)
    }
    
    @Provides
    @Singleton
    fun provideSearchContentUseCase(
        contentRepository: ContentRepository
    ): SearchContentUseCase {
        return SearchContentUseCase(contentRepository)
    }
    
    @Provides
    @Singleton
    fun provideGetRecommendationsUseCase(
        contentRepository: ContentRepository
    ): GetRecommendationsUseCase {
        return GetRecommendationsUseCase(contentRepository)
    }
    
    @Provides
    @Singleton
    fun provideGetRecentlyAddedUseCase(
        contentRepository: ContentRepository
    ): GetRecentlyAddedUseCase {
        return GetRecentlyAddedUseCase(contentRepository)
    }
    
    @Provides
    @Singleton
    fun provideGetPopularContentUseCase(
        contentRepository: ContentRepository
    ): GetPopularContentUseCase {
        return GetPopularContentUseCase(contentRepository)
    }
    
    @Provides
    @Singleton
    fun provideGetContentSectionsUseCase(
        contentRepository: ContentRepository
    ): GetContentSectionsUseCase {
        return GetContentSectionsUseCase(contentRepository)
    }

    @Provides
    @Singleton
    fun provideGetTvChannelCategoriesUseCase(
        contentRepository: ContentRepository
    ): GetTvChannelCategoriesUseCase {
        return GetTvChannelCategoriesUseCase(contentRepository)
    }

    @Provides
    @Singleton
    fun provideGetLiveTVChannelsByCategoryUseCase(
        contentRepository: ContentRepository
    ): GetLiveTVChannelsByCategoryUseCase {
        return GetLiveTVChannelsByCategoryUseCase(contentRepository)
    }
    
    @Provides
    @Singleton
    fun provideGetContentByGenreUseCase(
        contentRepository: ContentRepository
    ): GetContentByGenreUseCase {
        return GetContentByGenreUseCase(contentRepository)
    }
    
    // ========================================
    // USER USE CASES
    // ========================================
    
    @Provides
    @Singleton
    fun provideGetUserProfileUseCase(
        userRepository: UserRepository
    ): GetUserProfileUseCase {
        return GetUserProfileUseCase(userRepository)
    }

    @Provides
    @Singleton
    fun provideUpdateUserProfileUseCase(
        userRepository: UserRepository
    ): UpdateUserProfileUseCase {
        return UpdateUserProfileUseCase(userRepository)
    }
    
    @Provides
    @Singleton
    fun provideGetUserPreferencesUseCase(
        userRepository: UserRepository
    ): GetUserPreferencesUseCase {
        return GetUserPreferencesUseCase(userRepository)
    }
    
    @Provides
    @Singleton
    fun provideUpdateUserPreferencesUseCase(
        userRepository: UserRepository
    ): UpdateUserPreferencesUseCase {
        return UpdateUserPreferencesUseCase(userRepository)
    }
    
    @Provides
    @Singleton
    fun provideGetFavoritesUseCase(
        userRepository: UserRepository
    ): GetFavoritesUseCase {
        return GetFavoritesUseCase(userRepository)
    }
    
    @Provides
    @Singleton
    fun provideAddToFavoritesUseCase(
        userRepository: UserRepository
    ): AddToFavoritesUseCase {
        return AddToFavoritesUseCase(userRepository)
    }
    
    @Provides
    @Singleton
    fun provideRemoveFromFavoritesUseCase(
        userRepository: UserRepository
    ): RemoveFromFavoritesUseCase {
        return RemoveFromFavoritesUseCase(userRepository)
    }
    
    @Provides
    @Singleton
    fun provideIsFavoriteUseCase(
        userRepository: UserRepository
    ): IsFavoriteUseCase {
        return IsFavoriteUseCase(userRepository)
    }
    
    @Provides
    @Singleton
    fun provideGetFavoritesFlowUseCase(
        userRepository: UserRepository
    ): GetFavoritesFlowUseCase {
        return GetFavoritesFlowUseCase(userRepository)
    }
    
    @Provides
    @Singleton
    fun provideGetWatchHistoryUseCase(
        userRepository: UserRepository
    ): GetWatchHistoryUseCase {
        return GetWatchHistoryUseCase(userRepository)
    }
    
    @Provides
    @Singleton
    fun provideUpdateWatchProgressUseCase(
        userRepository: UserRepository
    ): UpdateWatchProgressUseCase {
        return UpdateWatchProgressUseCase(userRepository)
    }
    
    @Provides
    @Singleton
    fun provideGetWatchProgressUseCase(
        userRepository: UserRepository
    ): GetWatchProgressUseCase {
        return GetWatchProgressUseCase(userRepository)
    }
    
    @Provides
    @Singleton
    fun provideGetContinueWatchingUseCase(
        userRepository: UserRepository
    ): GetContinueWatchingUseCase {
        return GetContinueWatchingUseCase(userRepository)
    }
    
    @Provides
    @Singleton
    fun provideClearWatchHistoryUseCase(
        userRepository: UserRepository
    ): ClearWatchHistoryUseCase {
        return ClearWatchHistoryUseCase(userRepository)
    }
    
    @Provides
    @Singleton
    fun provideGetUserDevicesUseCase(
        userRepository: UserRepository
    ): GetUserDevicesUseCase {
        return GetUserDevicesUseCase(userRepository)
    }
    
    @Provides
    @Singleton
    fun provideRemoveDeviceUseCase(
        userRepository: UserRepository
    ): RemoveDeviceUseCase {
        return RemoveDeviceUseCase(userRepository)
    }
    
    @Provides
    @Singleton
    fun provideUpdateDeviceNameUseCase(
        userRepository: UserRepository
    ): UpdateDeviceNameUseCase {
        return UpdateDeviceNameUseCase(userRepository)
    }

    // ========================================
    // APP USE CASES
    // ========================================

    @Provides
    @Singleton
    fun provideCheckForUpdateUseCase(
        appRepository: AppRepository
    ): CheckForUpdateUseCase {
        return CheckForUpdateUseCase(appRepository)
    }

    // ========================================
    // PLAYER USE CASES
    // ========================================

    @Provides
    @Singleton
    fun provideSavePlaybackProgressUseCase(
        playbackRepository: PlaybackRepository
    ): SavePlaybackProgressUseCase {
        return SavePlaybackProgressUseCase(playbackRepository)
    }

    @Provides
    @Singleton
    fun provideGetPlaybackProgressUseCase(
        playbackRepository: PlaybackRepository
    ): GetPlaybackProgressUseCase {
        return GetPlaybackProgressUseCase(playbackRepository)
    }
}
