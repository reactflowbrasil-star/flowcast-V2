use super::*;
use crate::db_structure::DEFAULT_TV_CHANNEL_CATEGORIES;
use crate::models::TvChannelCategory;

use super::sql::CONTENT_JOIN_SELECT;

impl ContentService {
    pub async fn get_tv_channels_by_channel_category(
        &self,
        channel_category: &str,
        page: Option<i32>,
        limit: Option<i32>,
    ) -> Result<Vec<crate::models::ContentJoined>, AppError> {
        let tv_category = self
            .get_category_by_type("TV")
            .await?
            .ok_or_else(|| AppError::BadRequest("TV category not found".to_string()))?;

        let page = page.unwrap_or(1).max(1);
        let limit = limit.unwrap_or(200).clamp(1, 500);
        let offset = (page - 1) * limit;

        let query = format!(
            r#"
            {}
            WHERE mc.category_id = $1 AND t.channel_category = $2
            ORDER BY mc.title
            LIMIT $3 OFFSET $4
            "#,
            CONTENT_JOIN_SELECT
        );

        let content = sqlx::query_as::<_, crate::models::ContentJoined>(&query)
        .bind(tv_category.id)
        .bind(channel_category)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.db)
        .await?;

        Ok(content)
    }

    pub async fn get_tv_channel_categories(&self) -> Result<Vec<String>, AppError> {
        let rows = sqlx::query_as::<_, TvChannelCategory>(
            r#"
            SELECT id, name, created_at
            FROM content.tv_channel_categories
            ORDER BY LOWER(name)
            "#,
        )
        .fetch_all(&self.db)
        .await?;

        if rows.is_empty() {
            return Ok(DEFAULT_TV_CHANNEL_CATEGORIES
                .iter()
                .map(|name| (*name).to_string())
                .collect());
        }

        Ok(rows.into_iter().map(|row| row.name).collect())
    }

    pub async fn get_admin_tv_channel_categories(
        &self,
    ) -> Result<Vec<TvChannelCategoryWithUsage>, AppError> {
        let rows = sqlx::query_as::<_, TvChannelCategory>(
            r#"
            SELECT id, name, created_at
            FROM content.tv_channel_categories
            ORDER BY LOWER(name)
            "#,
        )
        .fetch_all(&self.db)
        .await?;

        let tv_category_id = self.get_tv_category_id().await?;
        let mut categories = Vec::with_capacity(rows.len());
        for row in rows {
            let usage_count = self
                .count_tv_channel_usage_by_name(tv_category_id, &row.name)
                .await?;
            categories.push(TvChannelCategoryWithUsage {
                id: row.id,
                name: row.name,
                created_at: row.created_at,
                usage_count,
            });
        }

        Ok(categories)
    }

    pub async fn create_tv_channel_category(
        &self,
        name: &str,
    ) -> Result<TvChannelCategoryWithUsage, AppError> {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err(AppError::BadRequest(
                "Category name cannot be empty".to_string(),
            ));
        }
        if trimmed.len() > 100 {
            return Err(AppError::BadRequest(
                "Category name must be 100 characters or less".to_string(),
            ));
        }

        if self.category_name_exists(trimmed, None).await? {
            return Err(AppError::BadRequest(
                "A category with this name already exists".to_string(),
            ));
        }

        let row = sqlx::query(
            r#"
            INSERT INTO content.tv_channel_categories (name)
            VALUES ($1)
            RETURNING id
            "#,
        )
        .bind(trimmed)
        .fetch_one(&self.db)
        .await?;

        let id: i64 = row.get("id");
        let category = self
            .get_tv_channel_category_by_id(id)
            .await?
            .ok_or(AppError::InternalServerError)?;
        let tv_category_id = self.get_tv_category_id().await?;
        let usage_count = self
            .count_tv_channel_usage_by_name(tv_category_id, &category.name)
            .await?;

        Ok(TvChannelCategoryWithUsage {
            id: category.id,
            name: category.name,
            created_at: category.created_at,
            usage_count,
        })
    }

    pub async fn update_tv_channel_category(
        &self,
        id: i64,
        new_name: &str,
    ) -> Result<TvChannelCategoryWithUsage, AppError> {
        let trimmed = new_name.trim();
        if trimmed.is_empty() {
            return Err(AppError::BadRequest(
                "Category name cannot be empty".to_string(),
            ));
        }
        if trimmed.len() > 100 {
            return Err(AppError::BadRequest(
                "Category name must be 100 characters or less".to_string(),
            ));
        }

        let existing = self
            .get_tv_channel_category_by_id(id)
            .await?
            .ok_or(AppError::NotFound)?;

        if self.category_name_exists(trimmed, Some(id)).await? {
            return Err(AppError::BadRequest(
                "A category with this name already exists".to_string(),
            ));
        }

        sqlx::query(
            r#"
            UPDATE content.tv_channel_categories
            SET name = $1
            WHERE id = $2
            "#,
        )
        .bind(trimmed)
        .bind(id)
        .execute(&self.db)
        .await?;

        self.update_tv_channel_content_assignments(&existing.name, trimmed)
            .await?;

        let updated = self
            .get_tv_channel_category_by_id(id)
            .await?
            .ok_or(AppError::InternalServerError)?;
        let tv_category_id = self.get_tv_category_id().await?;
        let usage_count = self
            .count_tv_channel_usage_by_name(tv_category_id, &updated.name)
            .await?;

        Ok(TvChannelCategoryWithUsage {
            id: updated.id,
            name: updated.name,
            created_at: updated.created_at,
            usage_count,
        })
    }

    pub async fn delete_tv_channel_category(&self, id: i64) -> Result<(), AppError> {
        let existing = self
            .get_tv_channel_category_by_id(id)
            .await?
            .ok_or(AppError::NotFound)?;

        let tv_category_id = self.get_tv_category_id().await?;
        let usage_count = self
            .count_tv_channel_usage_by_name(tv_category_id, &existing.name)
            .await?;
        if usage_count > 0 {
            return Err(AppError::BadRequest(
                "Category is in use by one or more TV channels".to_string(),
            ));
        }

        sqlx::query(
            r#"
            DELETE FROM content.tv_channel_categories
            WHERE id = $1
            "#,
        )
        .bind(id)
        .execute(&self.db)
        .await?;

        Ok(())
    }

    async fn category_name_exists(
        &self,
        name: &str,
        excluding_id: Option<i64>,
    ) -> Result<bool, AppError> {
        let count = sqlx::query_scalar::<_, i64>(
            r#"
            SELECT COUNT(*)
            FROM content.tv_channel_categories
            WHERE LOWER(name) = LOWER($1)
              AND ($2 IS NULL OR id != $3)
            "#,
        )
        .bind(name)
        .bind(excluding_id)
        .bind(excluding_id)
        .fetch_one(&self.db)
        .await?;

        Ok(count > 0)
    }

    async fn get_tv_channel_category_by_id(
        &self,
        id: i64,
    ) -> Result<Option<TvChannelCategory>, AppError> {
        let row = sqlx::query_as::<_, TvChannelCategory>(
            r#"
            SELECT id, name, created_at
            FROM content.tv_channel_categories
            WHERE id = $1
            "#,
        )
        .bind(id)
        .fetch_optional(&self.db)
        .await?;

        Ok(row)
    }

    async fn get_tv_category_id(&self) -> Result<Option<i64>, AppError> {
        Ok(self.get_category_by_type("TV").await?.map(|cat| cat.id))
    }

    async fn count_tv_channel_usage_by_name(
        &self,
        tv_category_id: Option<i64>,
        category_name: &str,
    ) -> Result<i64, AppError> {
        if let Some(category_id) = tv_category_id {
            let count = sqlx::query_scalar::<_, i64>(
                r#"
                SELECT COUNT(*)
                FROM content.media_content
                WHERE category_id = $1
                  AND genre IS NOT NULL
                  AND LOWER(genre) = LOWER($2)
                "#,
            )
            .bind(category_id)
            .bind(category_name)
            .fetch_one(&self.db)
            .await?;
            Ok(count)
        } else {
            Ok(0)
        }
    }

    async fn update_tv_channel_content_assignments(
        &self,
        old_name: &str,
        new_name: &str,
    ) -> Result<(), AppError> {
        if old_name.eq_ignore_ascii_case(new_name) {
            return Ok(());
        }

        if let Some(category_id) = self.get_tv_category_id().await? {
            sqlx::query(
                r#"
                UPDATE content.media_content
                SET genre = $1
                WHERE category_id = $2
                  AND LOWER(genre) = LOWER($3)
                "#,
            )
            .bind(new_name)
            .bind(category_id)
            .bind(old_name)
            .execute(&self.db)
            .await?;
        }

        Ok(())
    }
}
