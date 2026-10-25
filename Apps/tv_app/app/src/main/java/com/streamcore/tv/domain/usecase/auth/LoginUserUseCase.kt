package com.streamcore.tv.domain.usecase.auth

import com.streamcore.tv.domain.model.Result
import com.streamcore.tv.domain.model.User
import com.streamcore.tv.domain.repository.AuthRepository
import timber.log.Timber
import javax.inject.Inject

/**
 * Use case for user login
 */
class LoginUserUseCase @Inject constructor(
    private val authRepository: AuthRepository
) {
    
    /**
     * Execute user login
     * 
     * @param username User's username
     * @param password User's password
     * @return Result containing User data or error
     */
    suspend operator fun invoke(
        username: String,
        password: String
    ): Result<User> {
        return try {
            Timber.d("LoginUserUseCase: Attempting login for user: $username")
            
            // Validate input
            if (username.isBlank()) {
                return Result.Error(IllegalArgumentException("Username cannot be empty"))
            }

            if (password.isBlank()) {
                return Result.Error(IllegalArgumentException("Password cannot be empty"))
            }
            
            // Perform login
            val result = authRepository.login(username, password)
            
            when (result) {
                is Result.Success -> {
                    Timber.d("LoginUserUseCase: Login successful for user: $username")
                    result
                }
                is Result.Error -> {
                    Timber.e("LoginUserUseCase: Login failed for user: $username - ${result.exception.message}")
                    result
                }
                is Result.Loading -> {
                    // This shouldn't happen in a suspend function, but handle it
                    Timber.w("LoginUserUseCase: Unexpected loading state")
                    result
                }
            }
        } catch (e: Exception) {
            Timber.e(e, "LoginUserUseCase: Unexpected error during login")
            Result.Error(e)
        }
    }
}
