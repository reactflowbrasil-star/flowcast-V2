use crate::error::AppError;
use crate::models::ContentJoined;
use super::sql::CONTENT_JOIN_SELECT;


use super::ContentService;

impl ContentService {

    // Enhanced search content with additional filters (Req 1.3, 1.4)
    pub async fn enhanced_search_content(
        &self,
        query: &str,
        category: Option<&str>,
        year: Option<i64>,
        tmdb_id: Option<i64>,
    ) -> Result<Vec<ContentJoined>, AppError> {
        // Start with basic search
        let content = self.search_content(query, category).await?;

        // Apply additional filters in memory (not ideal for large datasets, but works for this implementation)
        let filtered_content: Vec<ContentJoined> = content
            .into_iter()
            .filter(|c| {
                if let Some(year) = year {
                    if c.year != Some(year) {
                        return false;
                    }
                }
                if let Some(tmdb_id) = tmdb_id {
                    if c.tmdb_id != Some(tmdb_id) {
                        return false;
                    }
                }
                true
            })
            .collect();

        Ok(filtered_content)
    }


    // Get content by genre (filter by genre field)
    pub async fn get_content_by_genre(
        &self,
        genre: &str,
        page: Option<i32>,
        limit: Option<i32>,
    ) -> Result<Vec<ContentJoined>, AppError> {
        let page = page.unwrap_or(1).max(1);
        let limit = limit.unwrap_or(20).clamp(1, 100);
        let offset = (page - 1) * limit;

        // Use LIKE to match genres since they're stored as comma-separated strings
        let genre_pattern = format!("%{}%", genre);

        let sql = format!("{} WHERE m.genre LIKE $1 AND mc.active = true ORDER BY mc.title LIMIT $2 OFFSET $3", CONTENT_JOIN_SELECT);
        let content = sqlx::query_as::<_, ContentJoined>(&sql)
        .bind(&genre_pattern)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.db)
        .await?;

        Ok(content)
    }


    // Count content by genre
    pub async fn count_content_by_genre(&self, genre: &str) -> Result<i64, AppError> {
        let genre_pattern = format!("%{}%", genre);

        let count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM content.movies m JOIN content.media_content mc ON m.media_content_id = mc.id WHERE m.genre LIKE $1 AND mc.active = true",
        )
        .bind(&genre_pattern)
        .fetch_one(&self.db)
        .await?;

        Ok(count)
    }


    // Get all unique genres from content
    pub async fn get_all_genres(&self) -> Result<Vec<String>, AppError> {
        let rows = sqlx::query_scalar::<_, String>(
            r#"
            SELECT DISTINCT m.genre
            FROM content.movies m JOIN content.media_content mc ON m.media_content_id = mc.id
            WHERE m.genre IS NOT NULL AND m.genre != '' AND mc.active = true
            ORDER BY m.genre
            "#,
        )
        .fetch_all(&self.db)
        .await?;

        // Split comma-separated genres and collect unique values
        let mut genres = std::collections::HashSet::new();
        for row in rows {
            for genre in row.split(',') {
                let trimmed = genre.trim();
                if !trimmed.is_empty() {
                    genres.insert(trimmed.to_string());
                }
            }
        }

        // Convert to sorted Vec
        let mut genre_list: Vec<String> = genres.into_iter().collect();
        genre_list.sort();
        Ok(genre_list)
    }

}
