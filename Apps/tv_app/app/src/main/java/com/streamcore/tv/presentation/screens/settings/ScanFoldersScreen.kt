package com.streamcore.tv.presentation.screens.settings

import androidx.compose.foundation.layout.Arrangement

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.streamcore.tv.presentation.components.IPTVButton
import com.streamcore.tv.presentation.components.ButtonVariant
import androidx.compose.ui.res.stringResource
import com.streamcore.tv.R

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScanFoldersScreen(
    onNavigateBack: () -> Unit,
    viewModel: ScanFoldersViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.scan_folders_title)) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.cd_back))
                    }
                }
            )
        },
        content = { padding ->
            Column(modifier = Modifier
                .padding(padding)
                .padding(16.dp)
                .fillMaxSize()
            ) {
                OutlinedTextField(
                    value = uiState.rootPath,
                    onValueChange = viewModel::updateRootPath,
                    label = { Text(stringResource(R.string.scan_root_path)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions.Default.copy(imeAction = ImeAction.Done)
                )

                Spacer(modifier = Modifier.height(8.dp))

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = uiState.media ?: "mixed",
                        onValueChange = { viewModel.updateMedia(it) },
                        label = { Text(stringResource(R.string.scan_media_type)) },
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = uiState.duplicatePolicy ?: "omit",
                        onValueChange = { viewModel.updateDuplicatePolicy(it) },
                        label = { Text(stringResource(R.string.scan_duplicate_policy)) },
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = uiState.addSubs, onCheckedChange = viewModel::updateAddSubs)
                    Text(stringResource(R.string.scan_add_subs), modifier = Modifier.padding(start = 8.dp))
                }

                Spacer(modifier = Modifier.height(12.dp))

                IPTVButton(
                    text = if (uiState.isScanning) stringResource(R.string.scan_scanning_button) else stringResource(R.string.scan_start_button),
                    onClick = { viewModel.scan() },
                    variant = ButtonVariant.Primary,
                    enabled = !uiState.isScanning
                )

                Spacer(modifier = Modifier.height(12.dp))

                uiState.message?.let { msg ->
                    Text(text = msg, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onBackground)
                }

                uiState.lastResult?.let { result ->
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(stringResource(R.string.scan_results), style = MaterialTheme.typography.titleMedium)
                    Text(stringResource(R.string.scan_movies_created, result.moviesCreated))
                    Text(stringResource(R.string.scan_series_created, result.seriesCreated))
                    Text(stringResource(R.string.scan_episodes_created, result.episodesCreated))
                    Text(stringResource(R.string.scan_subtitles_added, result.subtitlesAdded))
                    Text(stringResource(R.string.scan_skipped, result.skipped))
                    Text(stringResource(R.string.scan_replaced, result.replaced))
                }

                Spacer(modifier = Modifier.height(12.dp))

                Text(stringResource(R.string.scan_logs), style = MaterialTheme.typography.titleMedium)
                LazyColumn {
                    items(uiState.logs) { line ->
                        Text(line, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(vertical = 2.dp))
                    }
                }
            }
        }
    )
}
