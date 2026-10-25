package com.streamcore.tv.presentation.screens.settings.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.streamcore.tv.domain.model.UserProfile

@Composable
fun AccountDialog(
    userProfile: UserProfile?,
    onChangePassword: (String, String) -> Unit,
    onLogout: () -> Unit,
    onDismiss: () -> Unit,
    isLoading: Boolean = false
) {
    val configuration = LocalConfiguration.current
    val isTablet = configuration.screenWidthDp > 600
    
    var currentPassword by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var showCurrent by remember { mutableStateOf(false) }
    var showNew by remember { mutableStateOf(false) }
    var showConfirm by remember { mutableStateOf(false) }

    val minLen = 6
    val passwordsMatch = newPassword == confirmPassword
    val hasMinLen = newPassword.length >= minLen
    val canChange = currentPassword.isNotBlank() && hasMinLen && passwordsMatch && !isLoading

    // Focus requesters for DPAD navigation
    val closeFocusRequester = remember { FocusRequester() }
    val logoutFocusRequester = remember { FocusRequester() }
    val currentPasswordFocusRequester = remember { FocusRequester() }
    val newPasswordFocusRequester = remember { FocusRequester() }
    val confirmPasswordFocusRequester = remember { FocusRequester() }
    val changePasswordFocusRequester = remember { FocusRequester() }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth(if (isTablet) 0.8f else 0.95f)
                .fillMaxHeight(0.85f),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface
            ),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(
                modifier = Modifier.fillMaxSize()
            ) {
                // Header
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.1f)
                        )
                        .padding(20.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.AccountCircle,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(32.dp)
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(
                        text = stringResource(R.string.account_title),
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                    Spacer(modifier = Modifier.weight(1f))
                    
                    // Close button
                    IconButton(
                        onClick = onDismiss,
                        modifier = Modifier.focusRequester(closeFocusRequester)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = stringResource(R.string.account_close),
                            tint = Color.White.copy(alpha = 0.8f)
                        )
                    }
                }

                // Content - Two sections layout
                Row(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(20.dp),
                    horizontalArrangement = Arrangement.spacedBy(24.dp)
                ) {
                    // Left section - User Data
                    Card(
                        modifier = Modifier.weight(1f),
                        colors = CardDefaults.cardColors(
                            containerColor = Color.White.copy(alpha = 0.05f)
                        ),
                        shape = RoundedCornerShape(12.dp),
                        border = androidx.compose.foundation.BorderStroke(
                            1.dp,
                            MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)
                        )
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            Text(
                                text = stringResource(R.string.account_data_title),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )

                            // User info items
                            UserInfoItem(
                                icon = Icons.Default.Person,
                                label = stringResource(R.string.user_label),
                                value = userProfile?.username ?: "-"
                            )

                            UserInfoItem(
                                icon = Icons.Default.Email,
                                label = stringResource(R.string.account_email),
                                value = userProfile?.email ?: "-"
                            )

                            // Status card
                            val isActive = userProfile?.subscription?.isActive ?: userProfile?.active ?: false
                            val expires = userProfile?.subscription?.expiresAt ?: userProfile?.expiresAt
                            
                            Card(
                                colors = CardDefaults.cardColors(
                                    containerColor = if (isActive) 
                                        Color(0xFF34A853).copy(alpha = 0.1f)
                                    else 
                                        Color(0xFFEA4335).copy(alpha = 0.1f)
                                ),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Column(
                                    modifier = Modifier.padding(12.dp),
                                    verticalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Schedule,
                                            contentDescription = null,
                                            tint = if (isActive) Color(0xFF34A853) else Color(0xFFEA4335),
                                            modifier = Modifier.size(16.dp)
                                        )
                                        Text(
                                            text = if (isActive) stringResource(R.string.account_active) else stringResource(R.string.account_inactive),
                                            style = MaterialTheme.typography.bodyMedium,
                                            fontWeight = FontWeight.Medium,
                                            color = if (isActive) Color(0xFF34A853) else Color(0xFFEA4335)
                                        )
                                    }
                                    expires?.let {
                                        Text(
                                            text = stringResource(R.string.settings_expires, it.split('T').first()),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = Color.White.copy(alpha = 0.7f)
                                        )
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.weight(1f))

                            // Logout button
                            FlatButton(
                                onClick = onLogout,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .focusRequester(logoutFocusRequester),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = Color.Red.copy(alpha = 0.1f)
                                ),
                                icon = Icons.AutoMirrored.Filled.Logout,
                                text = stringResource(R.string.account_logout),
                                textColor = Color.Red
                            )
                        }
                    }

                    // Right section - Password Change
                    Card(
                        modifier = Modifier.weight(1f),
                        colors = CardDefaults.cardColors(
                            containerColor = Color.White.copy(alpha = 0.05f)
                        ),
                        shape = RoundedCornerShape(12.dp),
                        border = androidx.compose.foundation.BorderStroke(
                            1.dp,
                            MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)
                        )
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            Text(
                                text = stringResource(R.string.account_change_password),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )

                            // Password fields
                            FlatPasswordField(
                                value = currentPassword,
                                onValueChange = { currentPassword = it },
                                label = stringResource(R.string.account_current_password),
                                showPassword = showCurrent,
                                onToggleVisibility = { showCurrent = !showCurrent },
                                modifier = Modifier.focusRequester(currentPasswordFocusRequester)
                            )

                            FlatPasswordField(
                                value = newPassword,
                                onValueChange = { newPassword = it },
                                label = stringResource(R.string.account_new_password) + " (" + stringResource(R.string.account_min_length, minLen) + ")",
                                showPassword = showNew,
                                onToggleVisibility = { showNew = !showNew },
                                isError = newPassword.isNotEmpty() && !hasMinLen,
                                errorText = if (newPassword.isNotEmpty() && !hasMinLen) 
                                    "Minimum $minLen characters" else null,
                                modifier = Modifier.focusRequester(newPasswordFocusRequester)
                            )

                            FlatPasswordField(
                                value = confirmPassword,
                                onValueChange = { confirmPassword = it },
                                label = stringResource(R.string.account_confirm_password),
                                showPassword = showConfirm,
                                onToggleVisibility = { showConfirm = !showConfirm },
                                isError = confirmPassword.isNotEmpty() && !passwordsMatch,
                                errorText = if (confirmPassword.isNotEmpty() && !passwordsMatch)
                                    stringResource(R.string.account_passwords_no_match) else null,
                                modifier = Modifier.focusRequester(confirmPasswordFocusRequester)
                            )

                            Spacer(modifier = Modifier.weight(1f))

                            // Change password button
                            FlatButton(
                                onClick = { onChangePassword(currentPassword, newPassword) },
                                enabled = canChange,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .focusRequester(changePasswordFocusRequester),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.1f),
                                    disabledContainerColor = Color.Gray.copy(alpha = 0.1f)
                                ),
                                icon = if (isLoading) null else Icons.Default.Edit,
                                text = if (isLoading) stringResource(R.string.account_changing) else stringResource(R.string.account_change_password),
                                textColor = MaterialTheme.colorScheme.primary,
                                isLoading = isLoading
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun UserInfoItem(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(20.dp)
        )
        Column {
            Text(
                text = label,
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.7f)
            )
            Text(
                text = value,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium,
                color = Color.White
            )
        }
    }
}

@Composable
private fun FlatPasswordField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    showPassword: Boolean,
    onToggleVisibility: () -> Unit,
    modifier: Modifier = Modifier,
    isError: Boolean = false,
    errorText: String? = null
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()
    
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Box(
            modifier = modifier
                .fillMaxWidth()
                .height(56.dp)
                .background(
                    color = if (isFocused) 
                        MaterialTheme.colorScheme.primary.copy(alpha = 0.1f)
                    else 
                        Color.White.copy(alpha = 0.05f),
                    shape = RoundedCornerShape(8.dp)
                )
                .border(
                    width = if (isFocused) 2.dp else 1.dp,
                    color = if (isError) 
                        MaterialTheme.colorScheme.error
                    else if (isFocused) 
                        MaterialTheme.colorScheme.primary
                    else 
                        Color.White.copy(alpha = 0.2f),
                    shape = RoundedCornerShape(8.dp)
                )
        ) {
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = value,
                    onValueChange = onValueChange,
                    label = { Text(label, color = Color.White.copy(alpha = 0.7f)) },
                    singleLine = true,
                    visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        focusedBorderColor = Color.Transparent,
                        unfocusedBorderColor = Color.Transparent,
                        cursorColor = MaterialTheme.colorScheme.primary
                    ),
                    modifier = Modifier
                        .weight(1f)
                        .focusable(interactionSource = interactionSource),
                    interactionSource = interactionSource
                )
                
                IconButton(onClick = onToggleVisibility) {
                    Icon(
                        imageVector = if (showPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                        contentDescription = null,
                        tint = Color.White.copy(alpha = 0.7f)
                    )
                }
            }
        }
        
        errorText?.let {
            Text(
                text = it,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}

@Composable
private fun FlatButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    colors: ButtonColors = ButtonDefaults.buttonColors(),
    icon: androidx.compose.ui.graphics.vector.ImageVector? = null,
    text: String,
    textColor: Color = Color.White,
    isLoading: Boolean = false
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()
    
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier
            .height(48.dp)
            .focusable(interactionSource = interactionSource),
        colors = colors,
        shape = RoundedCornerShape(8.dp),
        interactionSource = interactionSource,
        border = if (isFocused) androidx.compose.foundation.BorderStroke(
            2.dp, 
            MaterialTheme.colorScheme.primary
        ) else null
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            if (isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(16.dp),
                    strokeWidth = 2.dp,
                    color = textColor
                )
            } else {
                icon?.let {
                    Icon(
                        imageVector = it,
                        contentDescription = null,
                        tint = textColor,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
            Text(
                text = text,
                color = textColor,
                fontWeight = FontWeight.Medium
            )
        }
    }
}
