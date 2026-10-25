use super::*;
use std::io::Cursor;
use std::path::Path;
use tokio::fs;
use tracing::warn;
use image::ImageFormat;

impl TmdbService {
    pub(crate) async fn download_and_store_image(
        &self,
        remote_path: &str,
        root: &Path,
        category: &str,
        filename: &str,
        preferred_format: &str,
    ) -> Result<Option<String>, AppError> {
        if remote_path.is_empty() {
            return Ok(None);
        }

        if remote_path.starts_with("/metadata/") || remote_path.starts_with("metadata/") {
            return Ok(Some(remote_path.to_string()));
        }

        let url = format!("https://image.tmdb.org/t/p/original{}", remote_path);
        let response = match self.client.get(&url).send().await {
            Ok(resp) => resp,
            Err(err) => {
                warn!("Failed to download TMDB image {}: {}", url, err);
                return Ok(None);
            }
        };

        if !response.status().is_success() {
            warn!(
                "TMDB image download returned status {} for {}",
                response.status(),
                url
            );
            return Ok(None);
        }

        let bytes = match response.bytes().await {
            Ok(data) => data,
            Err(err) => {
                warn!("Failed to read TMDB image {}: {}", url, err);
                return Ok(None);
            }
        };

        let remote_ext = Self::infer_extension(remote_path);
        let (data, ext) = Self::convert_image_bytes(bytes.as_ref(), preferred_format, &remote_ext)?;

        let image_dir = root.join("images").join(category);
        if !image_dir.exists() {
            fs::create_dir_all(&image_dir).await?;
        }

        let file_path = image_dir.join(format!("{}.{}", filename, ext));
        fs::write(&file_path, data).await?;

        let relative_path = format!("/metadata/images/{}/{}.{}", category, filename, ext);
        // Convert to absolute URL using PUBLIC_BASE_URL
        let absolute_url = self.build_image_url(&relative_path, "original");
        Ok(Some(absolute_url))
    }

    fn infer_extension(remote_path: &str) -> String {
        Path::new(remote_path)
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.trim_start_matches('.').to_lowercase())
            .filter(|ext| !ext.is_empty())
            .unwrap_or_else(|| "jpg".to_string())
    }

    fn convert_image_bytes(
        bytes: &[u8],
        preferred_format: &str,
        remote_ext: &str,
    ) -> Result<(Vec<u8>, String), AppError> {
        match preferred_format {
            "original" | "source" => Ok((bytes.to_vec(), remote_ext.to_string())),
            "webp" => Self::reencode_image(bytes, ImageFormat::WebP, "webp", remote_ext),
            "png" => Self::reencode_image(bytes, ImageFormat::Png, "png", remote_ext),
            "jpg" | "jpeg" => Self::reencode_image(bytes, ImageFormat::Jpeg, "jpg", remote_ext),
            _ => Ok((bytes.to_vec(), remote_ext.to_string())),
        }
    }

    fn reencode_image(
        bytes: &[u8],
        format: ImageFormat,
        ext: &str,
        fallback_ext: &str,
    ) -> Result<(Vec<u8>, String), AppError> {
        match image::load_from_memory(bytes) {
            Ok(image) => {
                let mut buffer = Vec::new();
                image.write_to(&mut Cursor::new(&mut buffer), format)?;
                Ok((buffer, ext.to_string()))
            }
            Err(err) => {
                warn!(
                    "Failed to re-encode image to {} format: {}. Using original bytes.",
                    ext, err
                );
                Ok((bytes.to_vec(), fallback_ext.to_string()))
            }
        }
    }

    // Build full image URL from TMDB path
    // If path references local metadata (served at /metadata), return an absolute URL
    // using the configured public_base_url so clients fetch from the backend host.
    pub fn build_image_url(&self, path: &str, size: &str) -> String {
        if path.is_empty() {
            return String::new();
        }

        if path.starts_with("http://") || path.starts_with("https://") {
            return path.to_string();
        }

        if path.starts_with("/metadata/") || path.starts_with("metadata/") {
            // Ensure leading slash
            let p = if path.starts_with('/') {
                path.to_string()
            } else {
                format!("/{}", path)
            };
            return format!("{}{}", self.public_base_url.trim_end_matches('/'), p);
        }

        format!("https://image.tmdb.org/t/p/{}{}", size, path)
    }
}
