use crate::error::AppError;
use crate::models::Category;
use super::types::*;


use super::ContentService;

impl ContentService {

    // Category management methods
    pub async fn get_all_categories(&self) -> Result<Vec<Category>, AppError> {
        let categories = sqlx::query_as::<_, Category>(
            "SELECT id, name, category_type, created_at FROM content.categories ORDER BY name",
        )
        .fetch_all(&self.db)
        .await?;

        Ok(categories)
    }


    pub async fn get_user_categories(
        &self,
        user_id: i64,
    ) -> Result<Vec<crate::handlers::admin::CategoryResponse>, AppError> {
        let categories = sqlx::query_as::<_, crate::handlers::admin::CategoryResponse>(
            r#"
            SELECT c.id, c.name, c.category_type
            FROM content.categories c
            INNER JOIN billing.user_subscriptions us ON c.id = us.category_id
            WHERE us.user_id = $1
            ORDER BY c.name
            "#,
        )
        .bind(user_id)
        .fetch_all(&self.db)
        .await?;

        let response = categories
            .into_iter()
            .map(|row| crate::handlers::admin::CategoryResponse {
                id: row.id,
                name: row.name,
                category_type: row.category_type,
            })
            .collect();

        Ok(response)
    }


    /// Get categories for MULTIPLE users in a single query (eliminates N+1 problem)
    /// Returns a HashMap where key is user_id and value is their list of categories
    pub async fn get_users_categories_batch(
        &self,
        user_ids: &[i64],
    ) -> Result<
        std::collections::HashMap<i64, Vec<crate::handlers::admin::CategoryResponse>>,
        AppError,
    > {
        use std::collections::HashMap;

        if user_ids.is_empty() {
            return Ok(HashMap::new());
        }

        // Build dynamic placeholders for IN clause
        let placeholders = user_ids
            .iter()
            .enumerate()
            .map(|(i, _)| format!("${}", i + 1))
            .collect::<Vec<_>>()
            .join(", ");

        // 1. Fetch subscriptions from billing schema
        let sql = format!(
            r#"
            SELECT 
                user_id,
                category_id
            FROM billing.user_subscriptions
            WHERE user_id IN ({})
            "#,
            placeholders
        );

        let mut query = sqlx::query(&sql);
        for id in user_ids {
            query = query.bind(id);
        }

        let sub_rows = query.fetch_all(&self.db).await?;

        let mut user_category_map: HashMap<i64, Vec<i64>> = HashMap::new();
        let mut all_category_ids: Vec<i64> = Vec::new();

        for row in sub_rows {
            use sqlx::Row;
            let user_id: i64 = row.get("user_id");
            let category_id: i64 = row.get("category_id");
            
            user_category_map.entry(user_id).or_default().push(category_id);
            if !all_category_ids.contains(&category_id) {
                all_category_ids.push(category_id);
            }
        }

        let mut result: HashMap<i64, Vec<crate::handlers::admin::CategoryResponse>> = HashMap::new();
        
        if all_category_ids.is_empty() {
             return Ok(result);
        }

        // 2. Fetch categories from content schema
        let cat_placeholders = all_category_ids
            .iter()
            .enumerate()
            .map(|(i, _)| format!("${}", i + 1))
            .collect::<Vec<_>>()
            .join(", ");
            
        let cat_sql = format!(
            r#"
            SELECT 
                id,
                name,
                category_type
            FROM content.categories
            WHERE id IN ({})
            "#,
            cat_placeholders
        );

        let mut cat_query = sqlx::query(&cat_sql);
        for id in &all_category_ids {
            cat_query = cat_query.bind(id);
        }

        let cat_rows = cat_query.fetch_all(&self.db).await?;
        
        let mut categories_data = HashMap::new();
        for row in cat_rows {
            use sqlx::Row;
            let id: i64 = row.get("id");
            let name: String = row.get("name");
            let cat_type: String = row.get("category_type");
            categories_data.insert(id, (name, cat_type));
        }

        // 3. Assemble
        for (user_id, cat_ids) in user_category_map {
            let mut user_cats = Vec::new();
            for cid in cat_ids {
                if let Some((name, cat_type)) = categories_data.get(&cid) {
                    user_cats.push(crate::handlers::admin::CategoryResponse {
                        id: cid,
                        name: name.clone(),
                        category_type: cat_type.clone(),
                    });
                }
            }
            // Sorting to match previous `ORDER BY c.name` behavior
            user_cats.sort_by(|a, b| a.name.cmp(&b.name));
            result.insert(user_id, user_cats);
        }

        Ok(result)
    }


    pub async fn get_category_by_id(&self, id: i64) -> Result<Option<Category>, AppError> {
        let category = sqlx::query_as::<_, Category>(
            "SELECT id, name, category_type, created_at FROM content.categories WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&self.db)
        .await?;

        Ok(category)
    }


    pub async fn get_category_by_type(
        &self,
        category_type: &str,
    ) -> Result<Option<Category>, AppError> {
        let category = sqlx::query_as::<_, Category>(
            "SELECT id, name, category_type, created_at FROM content.categories WHERE category_type = $1 ORDER BY created_at DESC LIMIT 1"
        )
        .bind(category_type)
        .fetch_optional(&self.db)
        .await?;

        Ok(category)
    }


    pub async fn get_categories_by_type(
        &self,
        category_type: &str,
        limit: Option<i64>,
    ) -> Result<Vec<Category>, AppError> {
        let mut sql = String::from(
            "SELECT id, name, category_type, created_at FROM content.categories WHERE category_type = $1 ORDER BY created_at DESC",
        );

        if limit.is_some() {
            sql.push_str(" LIMIT $2");
        }

        let mut query = sqlx::query_as::<_, Category>(&sql).bind(category_type);
        if let Some(limit) = limit {
            query = query.bind(limit);
        }

        let categories = query.fetch_all(&self.db).await?;
        Ok(categories)
    }


    // Category creation and management methods (admin only)
    pub async fn create_category(
        &self,
        request: CreateCategoryRequest,
    ) -> Result<Category, AppError> {
        // Validate category type
        if !Self::is_valid_category_type(&request.category_type) {
            return Err(AppError::BadRequest(
                "Invalid category type. Must be one of: VOD, TV, Eventos, Kids, Anime, Series"
                    .to_string(),
            ));
        }

        // Check if category with this name already exists
        let existing =
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM content.categories WHERE name = $1")
                .bind(&request.name)
                .fetch_one(&self.db)
                .await?;

        if existing > 0 {
            return Err(AppError::BadRequest(
                "Category with this name already exists".to_string(),
            ));
        }

        // Create the category
        let category = sqlx::query_as::<_, Category>(
            r#"
            INSERT INTO content.categories (name, category_type)
            VALUES ($1, $2)
            RETURNING id, name, category_type, created_at
            "#,
        )
        .bind(&request.name)
        .bind(&request.category_type)
        .fetch_one(&self.db)
        .await?;

        Ok(category)
    }


    pub async fn update_category(
        &self,
        id: i64,
        request: UpdateCategoryRequest,
    ) -> Result<Category, AppError> {
        // Check if category exists
        let existing = match self.get_category_by_id(id).await? {
            Some(cat) => cat,
            None => return Err(AppError::NotFound),
        };

        // Prepare update values
        let name = request.name.unwrap_or(existing.name);
        let category_type = request.category_type.unwrap_or(existing.category_type);

        // Validate category type if it's being changed
        if !Self::is_valid_category_type(&category_type) {
            return Err(AppError::BadRequest(
                "Invalid category type. Must be one of: VOD, TV, Eventos, Kids, Anime, Series"
                    .to_string(),
            ));
        }

        // Check for conflicts with other categories (excluding current one)
        let conflicts = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM content.categories WHERE name = $1 AND id != $2",
        )
        .bind(&name)
        .bind(id)
        .fetch_one(&self.db)
        .await?;

        if conflicts > 0 {
            return Err(AppError::BadRequest(
                "Category with this name already exists".to_string(),
            ));
        }

        // Update the category
        let category = sqlx::query_as::<_, Category>(
            r#"
            UPDATE content.categories
            SET name = $1, category_type = $2
            WHERE id = $3
            RETURNING id, name, category_type, created_at
            "#,
        )
        .bind(&name)
        .bind(&category_type)
        .bind(id)
        .fetch_one(&self.db)
        .await?;

        Ok(category)
    }


    pub async fn delete_category(&self, id: i64) -> Result<(), AppError> {
        // Check if category has any content assigned
        let content_count =
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM content.media_content WHERE category_id = $1")
                .bind(id)
                .fetch_one(&self.db)
                .await?;

        if content_count > 0 {
            return Err(AppError::BadRequest(
                "Cannot delete category that has content assigned to it".to_string(),
            ));
        }

        // Delete the category
        let result = sqlx::query("DELETE FROM content.categories WHERE id = $1")
            .bind(id)
            .execute(&self.db)
            .await?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound);
        }

        Ok(())
    }

}
