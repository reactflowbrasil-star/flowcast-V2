use crate::error::AppError;
use crate::models::security::*;
use chrono::{Duration, Utc};
use sqlx::PgPool;
use tracing::{info, warn};

#[derive(Clone)]
pub struct SecurityService {
    db: PgPool,
}

impl SecurityService {
    pub fn new(db: PgPool) -> Self {
        Self { db }
    }

    /// Registrar un incidente de seguridad
    pub async fn log_security_incident(
        &self,
        request: CreateSecurityIncidentRequest,
    ) -> Result<SecurityIncident, AppError> {
        let details_json = match request.details {
            Some(details) => Some(serde_json::to_string(&details)?),
            None => None,
        };

        let incident = sqlx::query_as::<_, SecurityIncident>(
            r#"
            INSERT INTO auth.security_incidents (
                user_id, username, incident_type, ip_address, 
                user_agent, device_id, details, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
            "#,
        )
        .bind(request.user_id)
        .bind(&request.username)
        .bind(&request.incident_type)
        .bind(request.ip_address)
        .bind(request.user_agent)
        .bind(request.device_id)
        .bind(details_json)
        .bind(Utc::now())
        .fetch_one(&self.db)
        .await?;

        info!(
            username = request.username,
            incident_type = request.incident_type,
            "Security incident logged"
        );

        // Verificar si necesitamos aplicar un ban automático
        self.check_and_apply_automatic_ban(&request.username, &request.incident_type)
            .await?;

        Ok(incident)
    }

    /// Eliminar un incidente de seguridad
    pub async fn delete_security_incident(&self, incident_id: i64) -> Result<(), AppError> {
        let affected_rows = sqlx::query("DELETE FROM auth.security_incidents WHERE id = $1")
            .bind(incident_id)
            .execute(&self.db)
            .await?
            .rows_affected();

        if affected_rows == 0 {
            return Err(AppError::BadRequest(
                "Security incident not found".to_string(),
            ));
        }

        info!(incident_id = incident_id, "Security incident deleted");

        Ok(())
    }

    /// Verificar y aplicar ban automático basado en incidentes previos
    async fn check_and_apply_automatic_ban(
        &self,
        username: &str,
        incident_type: &str,
    ) -> Result<(), AppError> {
        // Solo aplicar bans automáticos para ciertos tipos de incidentes
        if incident_type != INCIDENT_BRUTE_FORCE {
            return Ok(());
        }

        // Contar incidentes del mismo tipo en las últimas 24 horas
        let incident_count = sqlx::query_scalar::<_, i64>(
            r#"
            SELECT COUNT(*) FROM auth.security_incidents 
            WHERE username = $1 AND incident_type = $2 
            AND created_at > NOW() - INTERVAL '24 hours'
            "#,
        )
        .bind(username)
        .bind(incident_type)
        .fetch_one(&self.db)
        .await?;

        // Verificar si ya tiene un ban activo
        let has_active_ban = sqlx::query_scalar::<_, i64>(
            r#"
            SELECT COUNT(*) FROM auth.security_bans 
            WHERE username = $1 AND is_active = true 
            AND (expires_at IS NULL OR expires_at > NOW())
            "#,
        )
        .bind(username)
        .fetch_one(&self.db)
        .await?;

        if has_active_ban > 0 {
            return Ok(()); // Ya tiene un ban activo
        }

        // Determinar el nivel de ban basado en incidentes previos
        let previous_bans = sqlx::query_scalar::<_, i64>(
            r#"
            SELECT COUNT(*) FROM auth.security_bans 
            WHERE username = $1 AND ban_reason LIKE '%Invalid app secret%'
            "#,
        )
        .bind(username)
        .fetch_one(&self.db)
        .await?;

        let ban_level = match previous_bans {
            0 => {
                if incident_count >= 1 {
                    BAN_LEVEL_FIRST // Primera vez: 20 minutos después de 1 intento
                } else {
                    return Ok(()); // No suficientes intentos para ban
                }
            }
            1 => {
                if incident_count >= 1 {
                    BAN_LEVEL_SECOND // Segunda vez: 72 horas después de 1 intento
                } else {
                    return Ok(());
                }
            }
            _ => BAN_LEVEL_PERMANENT, // Tercera vez: ban permanente después de 1 intento
        };

        self.apply_automatic_ban(username, ban_level, incident_count)
            .await?;
        Ok(())
    }

    /// Aplicar ban automático
    async fn apply_automatic_ban(
        &self,
        username: &str,
        ban_level: i32,
        incident_count: i64,
    ) -> Result<(), AppError> {
        let (ban_type, expires_at, duration_text) = match ban_level {
            BAN_LEVEL_FIRST => (
                BAN_TYPE_TEMPORARY,
                Some(Utc::now() + Duration::minutes(20)),
                "20 minutes",
            ),
            BAN_LEVEL_SECOND => (
                BAN_TYPE_TEMPORARY,
                Some(Utc::now() + Duration::hours(72)),
                "72 hours",
            ),
            BAN_LEVEL_PERMANENT => (BAN_TYPE_PERMANENT, None, "permanent"),
            _ => return Err(AppError::BadRequest("Invalid ban level".to_string())),
        };

        let ban_reason = format!(
            "Automatic ban - Invalid app secret attempts (Level {}, {} incidents)",
            ban_level, incident_count
        );

        let ban_request = CreateSecurityBanRequest {
            user_id: None, // Se llenará con la consulta del usuario
            username: username.to_string(),
            ban_type: ban_type.to_string(),
            ban_reason,
            ban_level,
            expires_at,
            created_by: None, // Ban automático
        };

        self.create_security_ban(ban_request).await?;

        warn!(
            username = username,
            ban_level = ban_level,
            duration = duration_text,
            "Automatic security ban applied"
        );

        Ok(())
    }

    /// Crear un ban de seguridad
    pub async fn create_security_ban(
        &self,
        mut request: CreateSecurityBanRequest,
    ) -> Result<SecurityBan, AppError> {
        // Obtener user_id si no se proporcionó
        if request.user_id.is_none() {
            request.user_id =
                sqlx::query_scalar::<_, Option<i64>>("SELECT id FROM auth.users WHERE username = $1")
                    .bind(&request.username)
                    .fetch_optional(&self.db)
                    .await?
                    .flatten();
        }

        let ban = sqlx::query_as::<_, SecurityBan>(
            r#"
            INSERT INTO auth.security_bans (
                user_id, username, ban_type, ban_reason, ban_level,
                banned_at, expires_at, is_active, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8)
            RETURNING *
            "#,
        )
        .bind(request.user_id)
        .bind(&request.username)
        .bind(&request.ban_type)
        .bind(&request.ban_reason)
        .bind(request.ban_level)
        .bind(Utc::now())
        .bind(request.expires_at)
        .bind(request.created_by)
        .fetch_one(&self.db)
        .await?;

        info!(
            username = request.username,
            ban_type = request.ban_type,
            ban_level = request.ban_level,
            "Security ban created"
        );

        Ok(ban)
    }

    /// Verificar si un usuario está baneado
    pub async fn is_user_banned(&self, username: &str) -> Result<Option<SecurityBan>, AppError> {
        let ban = sqlx::query_as::<_, SecurityBan>(
            r#"
            SELECT * FROM auth.security_bans 
            WHERE username = $1 AND is_active = true 
            AND (expires_at IS NULL OR expires_at > NOW())
            ORDER BY banned_at DESC
            LIMIT 1
            "#,
        )
        .bind(username)
        .fetch_optional(&self.db)
        .await?;

        Ok(ban)
    }

    /// Obtener incidentes de seguridad con filtros
    pub async fn get_security_incidents(
        &self,
        filters: SecurityFilters,
    ) -> Result<SecurityIncidentsResponse, AppError> {
        let page = filters.page.unwrap_or(1);
        let limit = filters.limit.unwrap_or(50);
        let offset = (page - 1) * limit;

        // Use parameterized queries to prevent SQL injection
        let incidents = sqlx::query_as::<_, SecurityIncident>(
            r#"
            SELECT * FROM auth.security_incidents
            WHERE ($1::TEXT IS NULL OR incident_type = $1)
              AND ($2::TEXT IS NULL OR username ILIKE '%' || $2 || '%')
              AND ($3::TIMESTAMPTZ IS NULL OR created_at >= $3)
              AND ($4::TIMESTAMPTZ IS NULL OR created_at <= $4)
            ORDER BY created_at DESC
            LIMIT $5 OFFSET $6
            "#,
        )
        .bind(filters.incident_type.as_deref())
        .bind(filters.username.as_deref())
        .bind(filters.start_date)
        .bind(filters.end_date)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.db)
        .await?;

        let total: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*) FROM auth.security_incidents
            WHERE ($1::TEXT IS NULL OR incident_type = $1)
              AND ($2::TEXT IS NULL OR username ILIKE '%' || $2 || '%')
              AND ($3::TIMESTAMPTZ IS NULL OR created_at >= $3)
              AND ($4::TIMESTAMPTZ IS NULL OR created_at <= $4)
            "#,
        )
        .bind(filters.incident_type.as_deref())
        .bind(filters.username.as_deref())
        .bind(filters.start_date)
        .bind(filters.end_date)
        .fetch_one(&self.db)
        .await?;

        let total_pages = (total + limit - 1) / limit;

        Ok(SecurityIncidentsResponse {
            incidents,
            total,
            page,
            limit,
            total_pages,
        })
    }

    /// Obtener bans de seguridad
    pub async fn get_security_bans(
        &self,
        filters: SecurityFilters,
    ) -> Result<SecurityBansResponse, AppError> {
        let page = filters.page.unwrap_or(1);
        let limit = filters.limit.unwrap_or(50);
        let offset = (page - 1) * limit;

        // Use parameterized queries to prevent SQL injection
        let bans = sqlx::query_as::<_, SecurityBan>(
            r#"
            SELECT * FROM auth.security_bans
            WHERE is_active = true
              AND ($1::TEXT IS NULL OR username ILIKE '%' || $1 || '%')
            ORDER BY banned_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(filters.username.as_deref())
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.db)
        .await?;

        let total: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*) FROM auth.security_bans
            WHERE is_active = true
              AND ($1::TEXT IS NULL OR username ILIKE '%' || $1 || '%')
            "#,
        )
        .bind(filters.username.as_deref())
        .fetch_one(&self.db)
        .await?;

        let total_pages = (total + limit - 1) / limit;

        Ok(SecurityBansResponse {
            bans,
            total,
            page,
            limit,
            total_pages,
        })
    }

    /// Obtener estadísticas de seguridad
    pub async fn get_security_stats(&self) -> Result<SecurityStatsResponse, AppError> {
        let total_incidents =
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM auth.security_incidents")
                .fetch_one(&self.db)
                .await?;

        let incidents_today = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM auth.security_incidents WHERE DATE(created_at) = CURRENT_DATE",
        )
        .fetch_one(&self.db)
        .await?;

        let active_bans = sqlx::query_scalar::<_, i64>(
            r#"
            SELECT COUNT(*) FROM auth.security_bans
            WHERE is_active = true AND (expires_at IS NULL OR expires_at > NOW())
            "#,
        )
        .fetch_one(&self.db)
        .await?;

        let permanent_bans = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM auth.security_bans WHERE ban_type = 'PERMANENT' AND is_active = true",
        )
        .fetch_one(&self.db)
        .await?;

        let incidents_by_type = sqlx::query_as::<_, IncidentTypeCount>(
            r#"
            SELECT incident_type, COUNT(*) as count
            FROM auth.security_incidents
            GROUP BY incident_type
            ORDER BY count DESC
            "#,
        )
        .fetch_all(&self.db)
        .await?;

        let recent_incidents = sqlx::query_as::<_, SecurityIncident>(
            r#"
            SELECT * FROM auth.security_incidents
            ORDER BY created_at DESC
            LIMIT 10
            "#,
        )
        .fetch_all(&self.db)
        .await?;

        Ok(SecurityStatsResponse {
            total_incidents,
            incidents_today,
            active_bans,
            permanent_bans,
            incidents_by_type,
            recent_incidents,
        })
    }

    /// Desbanear un usuario
    pub async fn unban_user(
        &self,
        username: &str,
        admin_id: i64,
        reason: &str,
    ) -> Result<(), AppError> {
        sqlx::query(
            r#"
            UPDATE auth.security_bans
            SET is_active = false
            WHERE username = $1 AND is_active = true
            "#,
        )
        .bind(username)
        .execute(&self.db)
        .await?;

        // Registrar el evento de desbaneo
        let incident_request = CreateSecurityIncidentRequest {
            user_id: None,
            username: username.to_string(),
            incident_type: "USER_UNBANNED".to_string(),
            ip_address: None,
            user_agent: None,
            device_id: None,
            details: Some(serde_json::json!({
                "reason": reason,
                "admin_id": admin_id
            })),
        };

        self.log_security_incident(incident_request).await?;

        info!(
            username = username,
            admin_id = admin_id,
            reason = reason,
            "User unbanned by admin"
        );

        Ok(())
    }

    /// Limpiar bans expirados
    pub async fn cleanup_expired_bans(&self) -> Result<i64, AppError> {
        let affected_rows = sqlx::query(
            r#"
            UPDATE auth.security_bans
            SET is_active = false
            WHERE is_active = true AND expires_at IS NOT NULL AND expires_at <= NOW()
            "#,
        )
        .execute(&self.db)
        .await?
        .rows_affected();

        if affected_rows > 0 {
            info!(
                expired_bans = affected_rows,
                "Cleaned up expired security bans"
            );
        }

        Ok(affected_rows as i64)
    }
}
