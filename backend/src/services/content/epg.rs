use super::*;

impl ContentService {
    pub async fn get_epg_mappings_for_channels(
        &self,
        content_ids: &Vec<i64>,
    ) -> Result<Vec<(i64, String, i64)>, AppError> {
        if content_ids.is_empty() {
            return Ok(Vec::new());
        }

        let placeholders = (1..=content_ids.len())
            .map(|i| format!("${}", i))
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "SELECT epg_source_id, epg_channel_id, epg_offset_minutes FROM content.tv_channels WHERE media_content_id IN ({}) AND epg_source_id IS NOT NULL AND epg_channel_id IS NOT NULL",
            placeholders
        );

        let mut query = sqlx::query(&sql);
        for id in content_ids {
            query = query.bind(id);
        }

        let rows = query.fetch_all(&self.db).await?;
        let mut out = Vec::new();
        for row in rows {
            let src: Option<i64> = row.get("epg_source_id");
            let chan: Option<String> = row.get("epg_channel_id");
            let off: Option<i64> = row.get("epg_offset_minutes");
            if let (Some(s), Some(c)) = (src, chan) {
                out.push((s, c, off.unwrap_or(0i64)));
            }
        }
        Ok(out)
    }

    pub async fn get_epg_mappings_map_by_epg_id(
        &self,
        content_ids: &Vec<i64>,
    ) -> Result<std::collections::HashMap<String, i64>, AppError> {
        let mut out = std::collections::HashMap::new();
        if content_ids.is_empty() {
            return Ok(out);
        }

        let placeholders = (1..=content_ids.len())
            .map(|i| format!("${}", i))
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "SELECT media_content_id as id, epg_channel_id FROM content.tv_channels WHERE media_content_id IN ({}) AND epg_source_id IS NOT NULL AND epg_channel_id IS NOT NULL",
            placeholders
        );

        let mut query = sqlx::query(&sql);
        for id in content_ids {
            query = query.bind(id);
        }

        let rows = query.fetch_all(&self.db).await?;
        for row in rows {
            let id: i64 = row.get("id");
            let epg_channel_id: Option<String> = row.get("epg_channel_id");
            if let Some(epg_id) = epg_channel_id {
                out.insert(epg_id, id);
            }
        }
        Ok(out)
    }

    pub async fn update_tv_channel_epg(
        &self,
        id: i64,
        epg_source_id: Option<i64>,
        epg_channel_id: Option<String>,
        epg_offset_minutes: Option<i64>,
    ) -> Result<(), AppError> {
        sqlx::query("UPDATE content.tv_channels SET epg_source_id = COALESCE($1, epg_source_id), epg_channel_id = COALESCE($2, epg_channel_id), epg_offset_minutes = COALESCE($3, epg_offset_minutes) WHERE media_content_id = $4")
            .bind(epg_source_id)
            .bind(epg_channel_id)
            .bind(epg_offset_minutes)
            .bind(id)
            .execute(&self.db)
            .await?;
        Ok(())
    }

    pub async fn get_tv_channel_epg(
        &self,
        id: i64,
    ) -> Result<(Option<i64>, Option<String>, i64), AppError> {
        let row = sqlx::query("SELECT epg_source_id, epg_channel_id, COALESCE(epg_offset_minutes, 0) as epg_offset_minutes FROM content.tv_channels WHERE media_content_id = $1")
            .bind(id)
            .fetch_optional(&self.db)
            .await?;

        if let Some(row) = row {
            let source_id: Option<i64> = row.get("epg_source_id");
            let channel_id: Option<String> = row.get("epg_channel_id");
            let offset: i64 = row.get("epg_offset_minutes");
            Ok((source_id, channel_id, offset))
        } else {
            Err(AppError::NotFound)
        }
    }
}
