use moka::future::Cache;
use std::os::unix::io::AsRawFd;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::fs::File as TokioFile;
use tokio::sync::Mutex;

/// Minimum read-ahead size (128KB like nginx NGX_MIN_READ_AHEAD)
const MIN_READ_AHEAD: usize = 128 * 1024;

/// Direct I/O threshold - files larger than this get FADV_NOREUSE hint
const DIRECTIO_THRESHOLD: u64 = 100 * 1024 * 1024; // 100MB

/// Cache statistics
#[derive(Default)]
pub struct CacheStats {
    pub cache_hits: AtomicU64,
    pub cache_misses: AtomicU64,
    pub fd_reuses: AtomicU64,
    pub total_opens: AtomicU64,
}

impl CacheStats {
    pub fn log_stats(&self) {
        let hits = self.cache_hits.load(Ordering::Relaxed);
        let misses = self.cache_misses.load(Ordering::Relaxed);
        let reuses = self.fd_reuses.load(Ordering::Relaxed);
        let opens = self.total_opens.load(Ordering::Relaxed);
        let total = hits + misses;
        let hit_rate = if total > 0 {
            (hits as f64 / total as f64) * 100.0
        } else {
            0.0
        };

        tracing::info!(
            "📊 [FILE-CACHE] Stats: hits={} misses={} hit_rate={:.1}% fd_reuses={} total_opens={}",
            hits,
            misses,
            hit_rate,
            reuses,
            opens
        );
    }
}

/// Cached file with shared file descriptor (like nginx open_file_cache)
pub struct CachedFile {
    pub path: PathBuf,
    pub size: u64,
    /// Shared tokio file handle - multiple requests can use this simultaneously
    /// The Mutex ensures safe concurrent access for seeking and reading
    pub file_handle: Arc<Mutex<TokioFile>>,
    /// Reference count for tracking active users
    pub ref_count: AtomicU64,
}

/// File descriptor cache for efficient video streaming (nginx-style)
/// - Keeps file descriptors OPEN and reuses them (no dup/clone)
/// - Applies posix_fadvise for read-ahead and direct I/O hints
/// - Thread-safe with Arc<Mutex<File>> for concurrent access
pub struct FileCache {
    cache: Cache<PathBuf, Arc<CachedFile>>,
    stats: Arc<CacheStats>,
}

impl FileCache {
    /// Create a new file cache with specified capacity
    pub fn new(max_capacity: u64) -> Self {
        Self {
            cache: Cache::builder()
                .max_capacity(max_capacity)
                .time_to_live(Duration::from_secs(300)) // 5 minutes TTL
                .time_to_idle(Duration::from_secs(60)) // 1 minute idle
                .build(),
            stats: Arc::new(CacheStats::default()),
        }
    }

    /// Apply I/O hints using posix_fadvise for random-access friendly streaming
    fn apply_read_ahead(fd: i32, file_size: u64) {
        unsafe {
            // Hint RANDOM to avoid aggressive sequential read-ahead on FUSE mounts (rclone)
            let rc = libc::posix_fadvise(fd, 0, file_size as i64, libc::POSIX_FADV_RANDOM);
            if rc != 0 {
                tracing::warn!("⚠️  [FILE-CACHE] posix_fadvise RANDOM failed: rc={}", rc);
            }

            // Optionally warm a tiny prefix only; keep small to prevent big forward prefetch
            if file_size >= MIN_READ_AHEAD as u64 {
                let warm = MIN_READ_AHEAD as u64;
                let rc = libc::posix_fadvise(fd, 0, warm as i64, libc::POSIX_FADV_WILLNEED);
                if rc != 0 {
                    tracing::warn!("⚠️  [FILE-CACHE] posix_fadvise WILLNEED failed: rc={}", rc);
                }
            }
        }

        tracing::debug!(
            "📖 [FILE-CACHE] Applied RANDOM I/O hints: file_size={}MB",
            file_size / 1024 / 1024
        );
    }

    /// Apply direct I/O hints for large files (like nginx directio)
    fn apply_directio_hint(fd: i32, file_size: u64) {
        if file_size < DIRECTIO_THRESHOLD {
            return;
        }

        unsafe {
            // POSIX_FADV_NOREUSE: don't pollute page cache with large files
            let rc = libc::posix_fadvise(fd, 0, file_size as i64, libc::POSIX_FADV_NOREUSE);
            if rc != 0 {
                tracing::warn!("⚠️  [FILE-CACHE] posix_fadvise NOREUSE failed: rc={}", rc);
            }
        }

        tracing::debug!(
            "💾 [FILE-CACHE] Applied NOREUSE hint for large file: {}MB",
            file_size / 1024 / 1024
        );
    }

    /// Get or insert file handle into cache (nginx-style: keeps fd open)
    pub async fn get_or_insert(&self, path: &Path) -> Result<Arc<CachedFile>, std::io::Error> {
        let path_buf = path.to_path_buf();

        // Check cache first
        if let Some(cached) = self.cache.get(&path_buf).await {
            self.stats.cache_hits.fetch_add(1, Ordering::Relaxed);
            self.stats.fd_reuses.fetch_add(1, Ordering::Relaxed);
            cached.ref_count.fetch_add(1, Ordering::Relaxed);

            tracing::debug!(
                "✅ [FILE-CACHE] Cache HIT: {} (ref_count={})",
                path.display(),
                cached.ref_count.load(Ordering::Relaxed)
            );

            return Ok(cached);
        }

        // Cache miss - open file and apply hints
        self.stats.cache_misses.fetch_add(1, Ordering::Relaxed);
        self.stats.total_opens.fetch_add(1, Ordering::Relaxed);

        tracing::debug!("❌ [FILE-CACHE] Cache MISS: {}", path.display());

        let (size, tokio_file) = tokio::task::spawn_blocking({
            let p = path.to_path_buf();
            move || -> Result<(u64, TokioFile), std::io::Error> {
                let meta = std::fs::metadata(&p)?;
                let std_file = std::fs::File::open(&p)?;
                let fd = std_file.as_raw_fd();
                let size = meta.len();

                // Apply nginx-style hints
                Self::apply_read_ahead(fd, size);
                Self::apply_directio_hint(fd, size);

                // Convert to tokio file
                let tokio_file = TokioFile::from_std(std_file);
                Ok((size, tokio_file))
            }
        })
        .await
        .map_err(|e| std::io::Error::other(format!("JoinError: {e}")))??;

        let cached_file = Arc::new(CachedFile {
            path: path_buf.clone(),
            size,
            file_handle: Arc::new(Mutex::new(tokio_file)),
            ref_count: AtomicU64::new(1),
        });

        self.cache.insert(path_buf, cached_file.clone()).await;

        tracing::info!(
            "🆕 [FILE-CACHE] Opened and cached: {} ({}MB)",
            path.display(),
            size / 1024 / 1024
        );

        Ok(cached_file)
    }

    /// Get shared file handle (nginx-style: reuses same fd)
    pub async fn get_file_handle(
        &self,
        path: &Path,
    ) -> Result<(Arc<Mutex<TokioFile>>, u64), std::io::Error> {
        let cached = self.get_or_insert(path).await?;
        Ok((cached.file_handle.clone(), cached.size))
    }

    /// Invalidate a file from cache
    pub async fn invalidate(&self, path: &Path) {
        self.cache.invalidate(&path.to_path_buf()).await;
    }

    /// Get cache statistics
    pub fn stats(&self) -> Arc<CacheStats> {
        self.stats.clone()
    }
}

/// Global file cache instance
static FILE_CACHE: once_cell::sync::Lazy<FileCache> = once_cell::sync::Lazy::new(|| {
    // Cache up to 2000 entries (open file handles). Adjust as needed.
    FileCache::new(2000)
});

/// Get the global file cache instance
pub fn get_file_cache() -> &'static FileCache {
    &FILE_CACHE
}
