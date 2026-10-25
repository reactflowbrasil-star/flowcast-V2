export interface SecurityIncident {
  id: number;
  user_id?: number;
  username: string;
  incident_type: string;
  ip_address?: string;
  user_agent?: string;
  device_id?: string;
  details?: string;
  created_at: string;
}

export interface SecurityBan {
  id: number;
  user_id?: number;
  username: string;
  ban_type: string;
  ban_reason: string;
  ban_level: number;
  banned_at: string;
  expires_at?: string;
  is_active: boolean;
  created_by?: number;
}

export interface CreateSecurityBanRequest {
  user_id?: number;
  username: string;
  ban_type: string;
  ban_reason: string;
  ban_level: number;
  expires_at?: string;
  created_by?: number;
}

export interface SecurityFilters {
  incident_type?: string;
  username?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  limit?: number;
}

export interface SecurityIncidentsResponse {
  incidents: SecurityIncident[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface SecurityBansResponse {
  bans: SecurityBan[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface SecurityStatsResponse {
  total_incidents: number;
  incidents_today: number;
  active_bans: number;
  permanent_bans: number;
  incidents_by_type: IncidentTypeCount[];
  recent_incidents: SecurityIncident[];
}

export interface IncidentTypeCount {
  incident_type: string;
  count: number;
}

export interface UnbanUserRequest {
  reason: string;
}

export interface UserBanStatus {
  is_banned: boolean;
  ban?: SecurityBan;
}

// Constantes para tipos de incidentes
export const INCIDENT_TYPES = {
  BRUTE_FORCE: 'BRUTE_FORCE',
  SUSPICIOUS_ACTIVITY: 'SUSPICIOUS_ACTIVITY',
  MULTIPLE_DEVICES: 'MULTIPLE_DEVICES',
  TOKEN_MANIPULATION: 'TOKEN_MANIPULATION'} as const;

// Constantes para tipos de ban
export const BAN_TYPES = {
  TEMPORARY: 'TEMPORARY',
  PERMANENT: 'PERMANENT'} as const;

// Constantes para niveles de ban
export const BAN_LEVELS = {
  FIRST: 1,    // 20 minutos
  SECOND: 2,   // 72 horas
  PERMANENT: 3, // Permanente
} as const;

// Mapeo de tipos de incidentes a descripciones legibles
export const INCIDENT_TYPE_LABELS: Record<string, string> = {
  [INCIDENT_TYPES.BRUTE_FORCE]: 'Brute Force Attack',
  [INCIDENT_TYPES.SUSPICIOUS_ACTIVITY]: 'Suspicious Activity',
  [INCIDENT_TYPES.MULTIPLE_DEVICES]: 'Multiple Devices',
  [INCIDENT_TYPES.TOKEN_MANIPULATION]: 'Token Manipulation'};

// Mapeo de niveles de ban a descripciones
export const BAN_LEVEL_LABELS: Record<number, string> = {
  [BAN_LEVELS.FIRST]: 'Level 1 (20 minutes)',
  [BAN_LEVELS.SECOND]: 'Level 2 (72 hours)',
  [BAN_LEVELS.PERMANENT]: 'Level 3 (Permanent)'};

// Colores para diferentes tipos de incidentes
export const INCIDENT_TYPE_COLORS: Record<string, string> = {
  [INCIDENT_TYPES.BRUTE_FORCE]: 'text-orange-600',
  [INCIDENT_TYPES.SUSPICIOUS_ACTIVITY]: 'text-yellow-600',
  [INCIDENT_TYPES.MULTIPLE_DEVICES]: 'text-blue-600',
  [INCIDENT_TYPES.TOKEN_MANIPULATION]: 'text-purple-600'};

// Colores para niveles de ban
export const BAN_LEVEL_COLORS: Record<number, string> = {
  [BAN_LEVELS.FIRST]: 'text-yellow-600',
  [BAN_LEVELS.SECOND]: 'text-orange-600',
  [BAN_LEVELS.PERMANENT]: 'text-red-600'};
