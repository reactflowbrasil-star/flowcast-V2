import { apiService } from './api';
import { ApiResult } from '@/types';
import { API_ENDPOINTS } from '@/constants/api';

export interface SystemConfig {
  // Credit system configuration
  default_devices: number;
  credit_per_user_3_devices: number;
  credit_per_user_5_devices: number;
  credit_per_extra_device: number;

  // TMDB configuration
  tmdb_api_key?: string;
  tmdb_enabled: boolean;
  tmdb_language?: string;
  tmdb_languages?: string;
  tmdb_mode?: 'online' | 'offline';
  tmdb_metadata_path?: string;
  tmdb_preferred_format?: 'original' | 'webp' | 'png' | 'jpg';

  // Content display options
  hide_empty_episodes?: boolean;

  // System information
  version: string;
  last_updated: string;
}

export interface CreditConfig {
  default_devices: number;
  credit_per_user_3_devices: number;
  credit_per_user_5_devices: number;
  credit_per_extra_device: number;
}

export interface TMDBConfig {
  tmdb_api_key?: string;
  tmdb_enabled: boolean;
  tmdb_language?: string;
  tmdb_languages?: string;
  tmdb_mode: 'online' | 'offline';
  tmdb_metadata_path?: string;
  tmdb_preferred_format?: 'original' | 'webp' | 'png' | 'jpg';
}

export interface TMDBTestResult {
  valid: boolean;
  message: string;
  account_info?: {
    id: number;
    username: string;
    name: string;
  };
}

export interface SqliteImportSummary {
  tables: Array<{
    table: string;
    rows_seen: number;
    rows_inserted: number;
  }>;
  total_rows_seen: number;
  total_rows_inserted: number;
  errors?: Array<{
    table: string;
    error: string;
  }>;
}

export interface PostgresExportResult {
  file_name: string;
  download_url: string;
  size_bytes: number;
}

export interface PostgresImportResult {
  status: string;
}

export interface ImportTaskStartResponse {
  task_id: string;
  status: string;
  message: string;
}

export interface ImportTask {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  kind: 'sqlite' | 'postgres';
  mode?: string | null;
  source: string;
  start_time: number;
  end_time?: number | null;
  stage?: string | null;
  current_table?: string | null;
  current_table_index: number;
  total_tables: number;
  rows_seen: number;
  rows_inserted: number;
  error_message?: string | null;
  summary?: SqliteImportSummary | null;
}

// Stripe credits pricing config
export interface PricingTier {
  min_qty: number;   // inclusive threshold
  percent: number;   // discount percent (0..=100)
}

export interface CreditsPricingConfig {
  base_price_usd: number;
  tiers: PricingTier[];
}

class ConfigService {
  // Get system configuration
  async getSystemConfig(): Promise<ApiResult<SystemConfig>> {
    try {
      const result = await apiService.get<SystemConfig>(API_ENDPOINTS.ADMIN.CONFIG);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Config Fetch Failed',
          details: 'Failed to fetch system configuration',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  // Update credit configuration
  async updateCreditConfig(config: CreditConfig): Promise<ApiResult<SystemConfig>> {
    try {
      const result = await apiService.put<SystemConfig>('/api/admin/config/credits', config);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Credit Config Update Failed',
          details: 'Failed to update credit configuration',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  // Update TMDB configuration
  // NOTE: Backend expects tmdb_mode values 'tmdb' | 'local'. Frontend uses 'online' | 'offline'.
  // Map frontend values to backend before sending.
  async updateTMDBConfig(config: TMDBConfig): Promise<ApiResult<SystemConfig>> {
    try {
      const payload: any = { ...config };
      if (payload.tmdb_mode === 'online') {
        payload.tmdb_mode = 'tmdb';
      } else if (payload.tmdb_mode === 'offline') {
        payload.tmdb_mode = 'local';
      }
      const result = await apiService.put<SystemConfig>('/api/admin/config/tmdb', payload);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'TMDB Config Update Failed',
          details: 'Failed to update TMDB configuration',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  // Test TMDB API key
  async testTMDBKey(apiKey: string): Promise<ApiResult<TMDBTestResult>> {
    try {
      const result = await apiService.post<TMDBTestResult>('/api/admin/config/tmdb/test', { tmdb_api_key: apiKey });
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'TMDB Test Failed',
          details: 'Failed to test TMDB API key',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  // Get system statistics
  async getSystemStats(): Promise<ApiResult<{
    total_users: number;
    total_resellers: number;
    total_content: number;
    total_active_devices: number;
    total_credits_used: number;
    system_uptime: string;
  }>> {
    try {
      const result = await apiService.get<{
        total_users: number;
        total_resellers: number;
        total_content: number;
        total_active_devices: number;
        total_credits_used: number;
        system_uptime: string;
      }>(API_ENDPOINTS.ADMIN.STATS);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Stats Fetch Failed',
          details: 'Failed to fetch system statistics',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  // Get real-time system performance metrics
  async getSystemMetrics(): Promise<ApiResult<{
    cpu_usage: number;
    ram_used: number;
    ram_total: number;
    net_rx: number;
    net_tx: number;
    disk_read: number;
    disk_write: number;
    active_connections: number;
  }>> {
    try {
      // Use direct URL if it's not in API_ENDPOINTS
      const result = await apiService.get<any>('/api/admin/system/metrics');
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Metrics Fetch Failed',
          details: 'Failed to fetch system metrics',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  // Admin: get credits purchase pricing config
  async getCreditsPricing(): Promise<ApiResult<CreditsPricingConfig>> {
    try {
      const result = await apiService.get<CreditsPricingConfig>(API_ENDPOINTS.ADMIN.CREDITS_PRICING_CONFIG);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Pricing Config Fetch Failed',
          details: 'Failed to fetch credits pricing configuration',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  // Admin: update credits purchase pricing config
  async updateCreditsPricing(config: CreditsPricingConfig): Promise<ApiResult<CreditsPricingConfig>> {
    try {
      const result = await apiService.put<CreditsPricingConfig>(API_ENDPOINTS.ADMIN.CREDITS_PRICING_CONFIG, config);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Pricing Config Update Failed',
          details: 'Failed to update credits pricing configuration',
          timestamp: new Date().toISOString()
        }
      };
    }
  }
  async updateConfig(key: string, value: string): Promise<ApiResult<{ message: string; key: string; value: string }>> {
    try {
      const result = await apiService.put<{ message: string; key: string; value: string }>(API_ENDPOINTS.ADMIN.CONFIG, {
        key,
        value
      });
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Config Update Failed',
          details: `Failed to update config ${key}`,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  async importLegacySqlite(file: File): Promise<ApiResult<{ summary: SqliteImportSummary }>> {
    try {
      const form = new FormData();
      form.append('db', file);
      const result = await apiService.post<{ summary: SqliteImportSummary }>(
        API_ENDPOINTS.ADMIN.SQLITE_IMPORT_UPLOAD,
        form
      );
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'SQLite Import Failed',
          details: 'Failed to import legacy SQLite database',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  async startLegacySqliteImport(file: File): Promise<ApiResult<ImportTaskStartResponse>> {
    try {
      const form = new FormData();
      form.append('db', file);
      const result = await apiService.post<ImportTaskStartResponse>(
        `${API_ENDPOINTS.ADMIN.SQLITE_IMPORT_UPLOAD}?async=true`,
        form
      );
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'SQLite Import Failed',
          details: 'Failed to start legacy SQLite import',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  async exportPostgresBackup(): Promise<ApiResult<PostgresExportResult>> {
    try {
      // Pass empty body to ensure Content-Type: application/json is sent
      const result = await apiService.post<PostgresExportResult>(API_ENDPOINTS.ADMIN.DB.EXPORT, {});
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Export Failed',
          details: 'Failed to create PostgreSQL backup',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  async importPostgresBackup(file: File, mode: 'append' | 'replace'): Promise<ApiResult<PostgresImportResult>> {
    try {
      const form = new FormData();
      form.append('sql', file);
      const result = await apiService.post<PostgresImportResult>(
        `${API_ENDPOINTS.ADMIN.DB.IMPORT}?mode=${encodeURIComponent(mode)}`,
        form,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      );
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Import Failed',
          details: 'Failed to import PostgreSQL backup',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  async startPostgresImport(file: File, mode: 'append' | 'replace'): Promise<ApiResult<ImportTaskStartResponse>> {
    try {
      const form = new FormData();
      form.append('sql', file);
      const result = await apiService.post<ImportTaskStartResponse>(
        `${API_ENDPOINTS.ADMIN.DB.IMPORT}?mode=${encodeURIComponent(mode)}&async=true`,
        form,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      );
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Import Failed',
          details: 'Failed to start PostgreSQL import',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  async getImportTasks(): Promise<ApiResult<ImportTask[]>> {
    try {
      const result = await apiService.get<ImportTask[]>(API_ENDPOINTS.ADMIN.IMPORT_TASKS);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Import Tasks Failed',
          details: 'Failed to fetch import tasks',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  async getImportTask(taskId: string): Promise<ApiResult<ImportTask>> {
    try {
      const result = await apiService.get<ImportTask>(API_ENDPOINTS.ADMIN.IMPORT_TASK(taskId));
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Import Task Failed',
          details: 'Failed to fetch import task',
          timestamp: new Date().toISOString()
        }
      };
    }
  }
}

export const configService = new ConfigService();
