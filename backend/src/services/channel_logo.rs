use crate::error::AppError;
use std::path::PathBuf;
use tokio::fs;
use tracing::{info, warn};

/// Convert a relative /metadata/ path to an absolute URL using PUBLIC_BASE_URL
fn absolutize_metadata_path(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return path.to_string();
    }
    if trimmed.starts_with("/metadata/") || trimmed.starts_with("metadata/") {
        let base = crate::config::Config::from_env()
            .ok()
            .map(|c| c.public_base_url)
            .unwrap_or_else(|| "http://localhost:3000".to_string());
        let base_trimmed = base.trim_end_matches('/');
        let p = if trimmed.starts_with('/') {
            trimmed.to_string()
        } else {
            format!("/{}", trimmed)
        };
        return format!("{}{}", base_trimmed, p);
    }
    path.to_string()
}

/// Service for managing TV channel logos
/// Downloads and caches logos locally similar to TMDB metadata
pub struct ChannelLogoService {
    metadata_root: PathBuf,
    client: reqwest::Client,
}

impl ChannelLogoService {
    pub fn new(metadata_root: PathBuf) -> Self {
        Self {
            metadata_root,
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .unwrap_or_default(),
        }
    }

    /// Ensure logos directory exists
    async fn ensure_logos_dir(&self) -> Result<PathBuf, AppError> {
        let logos_dir = self.metadata_root.join("images").join("channel_logos");
        if !logos_dir.exists() {
            fs::create_dir_all(&logos_dir).await?;
        }
        Ok(logos_dir)
    }

    /// Download and store a channel logo
    /// Returns the local path if successful
    pub async fn download_and_store_logo(
        &self,
        channel_id: i64,
        logo_url: &str,
    ) -> Result<Option<String>, AppError> {
        if logo_url.is_empty() {
            return Ok(None);
        }

        // If already a local path, convert to absolute URL and return
        if logo_url.starts_with("/metadata/") || logo_url.starts_with("metadata/") {
            return Ok(Some(absolutize_metadata_path(logo_url)));
        }

        // Download the logo
        let response = match self.client.get(logo_url).send().await {
            Ok(resp) => resp,
            Err(err) => {
                warn!("Failed to download channel logo {}: {}", logo_url, err);
                return Ok(None);
            }
        };

        if !response.status().is_success() {
            warn!(
                "Channel logo download returned status {} for {}",
                response.status(),
                logo_url
            );
            return Ok(None);
        }

        let bytes = match response.bytes().await {
            Ok(data) => data,
            Err(err) => {
                warn!("Failed to read channel logo {}: {}", logo_url, err);
                return Ok(None);
            }
        };

        // Infer extension from URL or content type
        let ext = Self::infer_extension(logo_url);

        let logos_dir = self.ensure_logos_dir().await?;
        let file_path = logos_dir.join(format!("channel_{}.{}", channel_id, ext));

        fs::write(&file_path, bytes).await?;

        let relative_path = format!(
            "/metadata/images/channel_logos/channel_{}.{}",
            channel_id, ext
        );
        info!(
            "Downloaded and cached logo for channel {} at {}",
            channel_id, relative_path
        );

        Ok(Some(absolutize_metadata_path(&relative_path)))
    }

    /// Get local logo path for a channel if it exists
    pub async fn get_local_logo_path(&self, channel_id: i64) -> Result<Option<String>, AppError> {
        let logos_dir = self.ensure_logos_dir().await?;

        // Check for common image extensions
        for ext in &["png", "jpg", "jpeg", "webp", "gif"] {
            let file_path = logos_dir.join(format!("channel_{}.{}", channel_id, ext));
            if file_path.exists() {
                let relative_path = format!(
                    "/metadata/images/channel_logos/channel_{}.{}",
                    channel_id, ext
                );
                return Ok(Some(absolutize_metadata_path(&relative_path)));
            }
        }

        Ok(None)
    }

    /// Infer file extension from URL
    fn infer_extension(url: &str) -> String {
        if url.ends_with(".png") || url.contains(".png?") {
            "png".to_string()
        } else if url.ends_with(".jpg") || url.contains(".jpg?") {
            "jpg".to_string()
        } else if url.ends_with(".jpeg") || url.contains(".jpeg?") {
            "jpeg".to_string()
        } else if url.ends_with(".webp") || url.contains(".webp?") {
            "webp".to_string()
        } else if url.ends_with(".gif") || url.contains(".gif?") {
            "gif".to_string()
        } else {
            // Default to png
            "png".to_string()
        }
    }

    /// Delete logo for a channel
    pub async fn delete_logo(&self, channel_id: i64) -> Result<(), AppError> {
        let logos_dir = self.ensure_logos_dir().await?;

        // Try to delete all possible extensions
        for ext in &["png", "jpg", "jpeg", "webp", "gif"] {
            let file_path = logos_dir.join(format!("channel_{}.{}", channel_id, ext));
            if file_path.exists() {
                fs::remove_file(&file_path).await?;
                info!("Deleted logo for channel {}", channel_id);
            }
        }

        Ok(())
    }

    /// Sync logo for a channel - download if remote URL, keep if local
    pub async fn sync_channel_logo(
        &self,
        channel_id: i64,
        logo_url: Option<String>,
    ) -> Result<Option<String>, AppError> {
        match logo_url {
            Some(url) if !url.is_empty() => {
                // Check if already local
                if url.starts_with("/metadata/") || url.starts_with("metadata/") {
                    Ok(Some(url))
                } else {
                    // Download and cache
                    self.download_and_store_logo(channel_id, &url).await
                }
            }
            _ => {
                // No logo URL, check if we have a cached one
                self.get_local_logo_path(channel_id).await
            }
        }
    }
}
