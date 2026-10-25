use bytes::Bytes;
use futures_util::Future;
use std::io::SeekFrom;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio::sync::Mutex;

/// Stream buffer size (4MB like nginx with directio)
const STREAM_BUFFER_SIZE: usize = 4 * 1024 * 1024;

/// Efficient file range stream that shares a file descriptor
/// - Uses Arc<Mutex<File>> to allow concurrent access
/// - Reads in 4MB chunks to minimize syscalls
/// - Releases lock between chunks to allow other requests
pub struct FileRangeStream {
    file_handle: Arc<Mutex<File>>,
    start_offset: u64,
    remaining_bytes: u64,
    first_read: bool,
}

impl FileRangeStream {
    /// Create a new file range stream
    pub fn new(file_handle: Arc<Mutex<File>>, start_offset: u64, length: u64) -> Self {
        Self {
            file_handle,
            start_offset,
            remaining_bytes: length,
            first_read: true,
        }
    }
}

impl futures_util::Stream for FileRangeStream {
    type Item = Result<Bytes, std::io::Error>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        if self.remaining_bytes == 0 {
            return Poll::Ready(None);
        }

        // Calculate how much to read this iteration
        let chunk_size = std::cmp::min(self.remaining_bytes, STREAM_BUFFER_SIZE as u64) as usize;

        // Clone Arc for the async block
        let file_handle = self.file_handle.clone();
        let start_offset = self.start_offset;
        let first_read = self.first_read;

        // Create a future that does the actual I/O
        let mut buffer = vec![0u8; chunk_size];
        let fut = async move {
            // Acquire lock, seek, read, release lock
            let mut file = file_handle.lock().await;

            // Only seek on first read or if we need to reposition
            if first_read {
                file.seek(SeekFrom::Start(start_offset)).await?;
            }

            // Read chunk
            let n = file.read(&mut buffer[..chunk_size]).await?;

            // Lock is automatically released here when `file` goes out of scope

            if n == 0 {
                return Ok(None);
            }

            buffer.truncate(n);
            Ok(Some(Bytes::from(buffer)))
        };

        // Pin and poll the future
        let mut fut = Box::pin(fut);
        match fut.as_mut().poll(cx) {
            Poll::Ready(Ok(Some(bytes))) => {
                self.first_read = false;
                self.start_offset += bytes.len() as u64;
                self.remaining_bytes -= bytes.len() as u64;
                Poll::Ready(Some(Ok(bytes)))
            }
            Poll::Ready(Ok(None)) => {
                self.remaining_bytes = 0;
                Poll::Ready(None)
            }
            Poll::Ready(Err(e)) => {
                self.remaining_bytes = 0;
                Poll::Ready(Some(Err(e)))
            }
            Poll::Pending => Poll::Pending,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::StreamExt;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[tokio::test]
    async fn test_file_range_stream() {
        // Create a temporary file with test data
        let mut temp_file = NamedTempFile::new().unwrap();
        let test_data = b"Hello, World! This is a test file for streaming.";
        temp_file.write_all(test_data).unwrap();
        temp_file.flush().unwrap();

        // Open file and create stream
        let file = tokio::fs::File::open(temp_file.path()).await.unwrap();
        let file_handle = Arc::new(Mutex::new(file));

        // Stream first 13 bytes ("Hello, World!")
        let mut stream = FileRangeStream::new(file_handle, 0, 13);

        let mut result = Vec::new();
        while let Some(chunk) = stream.next().await {
            let bytes = chunk.unwrap();
            result.extend_from_slice(&bytes);
        }

        assert_eq!(&result, b"Hello, World!");
    }

    #[tokio::test]
    async fn test_file_range_stream_offset() {
        // Create a temporary file with test data
        let mut temp_file = NamedTempFile::new().unwrap();
        let test_data = b"Hello, World! This is a test file for streaming.";
        temp_file.write_all(test_data).unwrap();
        temp_file.flush().unwrap();

        // Open file and create stream starting at offset 7
        let file = tokio::fs::File::open(temp_file.path()).await.unwrap();
        let file_handle = Arc::new(Mutex::new(file));

        // Stream 6 bytes starting from offset 7 ("World!")
        let mut stream = FileRangeStream::new(file_handle, 7, 6);

        let mut result = Vec::new();
        while let Some(chunk) = stream.next().await {
            let bytes = chunk.unwrap();
            result.extend_from_slice(&bytes);
        }

        assert_eq!(&result, b"World!");
    }
}
