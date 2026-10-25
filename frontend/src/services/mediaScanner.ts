import { apiClient } from './api';
import { ApiResponse } from '@/types/api';

export interface FolderItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  lastModified?: string;
}

export interface ScanRequest {
  root_path: string;
  media: 'movies' | 'series' | 'kids' | 'anime' | 'mixed';
  duplicate_policy: 'omit' | 'replace' | 'allow';
  add_subs: boolean;
}

export interface ScanProgress {
  id: string;
  status: 'idle' | 'scanning' | 'completed' | 'cancelled' | 'failed';
  scanned: number;
  imported: number;
  errors: number;
  currentFile?: string;
  timeElapsed: number;
  estimatedRemaining?: number;
  totalFiles?: number;
  errorMessages?: string[];
}

export interface ScanResult {
  id: string;
  status: 'completed' | 'cancelled' | 'failed';
  scanned: number;
  imported: number;
  errors: number;
  timeElapsed: number;
  errorMessages?: string[];
}

export interface ScanStartResponse {
  scan_id: string;
  message: string;
  status: string;
}

export interface ScanTask {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  category: string;
  path: string;
  start_time: number;
  end_time?: number;
  movies_created: number;
  series_created: number;
  episodes_created: number;
  subtitles_added: number;
  skipped: number;
  replaced: number;
  current_file?: string;
  error_message?: string;
}

class MediaScannerService {
  private mapTaskToProgress(task: ScanTask): ScanProgress {
    const imported = task.movies_created + task.series_created + task.episodes_created;
    const scanned = imported + task.skipped;
    const errors = task.error_message ? 1 : 0;
    const now = Math.floor(Date.now() / 1000);
    const end = task.end_time ?? now;
    const timeElapsed = Math.max(0, end - task.start_time);

    return {
      id: task.id,
      status: task.status === 'running' ? 'scanning' : task.status,
      scanned,
      imported,
      errors,
      currentFile: task.current_file,
      timeElapsed,
      errorMessages: task.error_message ? [task.error_message] : undefined};
  }

  /**
   * List folders in a given path
   */
  async listFolders(path: string = '/'): Promise<ApiResponse<FolderItem[]>> {
    try {
      const response = await apiClient.get(`/api/admin/folders`, {
        params: { path }
      });
      const items = Array.isArray(response.data) ? response.data : [];
      const mapped = items.map((item: any) => ({
        name: item.name,
        path: item.path,
        isDirectory: item.isDirectory ?? item.is_directory ?? false,
        size: item.size ?? undefined,
        lastModified: item.lastModified ?? item.last_modified ?? undefined})) as FolderItem[];
      return {
        success: true,
        data: mapped
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          error: error.response?.data?.message || 'Failed to list folders',
          details: error.message || 'Unknown error',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Start a media scan
   */
  async startScan(request: ScanRequest): Promise<ApiResponse<ScanStartResponse>> {
    try {
      const response = await apiClient.post('/api/admin/ingest/scan-folder', request);
      return {
        success: true,
        data: response.data as ScanStartResponse
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          error: error.response?.data?.message || 'Failed to start scan',
          details: error.message || 'Unknown error',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Get scan progress
   */
  async getScanProgress(scanId?: string): Promise<ApiResponse<ScanProgress>> {
    try {
      const tasksResult = await this.getScanTasks();
      if (!tasksResult.success) {
        return tasksResult as unknown as ApiResponse<ScanProgress>;
      }

      const tasks = tasksResult.data || [];
      const task = scanId
        ? tasks.find(t => t.id === scanId)
        : tasks.find(t => t.status === 'running') || tasks[0];

      if (!task) {
        return {
          success: false,
          error: {
            error: 'Scan not found',
            details: 'No scan task available for the requested ID',
            timestamp: new Date().toISOString()
          }
        };
      }

      return {
        success: true,
        data: this.mapTaskToProgress(task)
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          error: error.response?.data?.message || 'Failed to get scan progress',
          details: error.message || 'Unknown error',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Cancel a running scan
   */
  async cancelScan(scanId: string): Promise<ApiResponse<void>> {
    try {
      await apiClient.delete(`/api/admin/ingest/scan-tasks/${scanId}`);
      return {
        success: true,
        data: undefined
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          error: error.response?.data?.message || 'Failed to cancel scan',
          details: error.message || 'Unknown error',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Get current scan status (if any scan is running)
   */
  async getCurrentScanStatus(): Promise<ApiResponse<ScanProgress | null>> {
    try {
      const tasksResult = await this.getScanTasks();
      if (!tasksResult.success) {
        return tasksResult as unknown as ApiResponse<ScanProgress | null>;
      }

      const tasks = tasksResult.data || [];
      const running = tasks.find(t => t.status === 'running');
      if (!running) {
        return { success: true, data: null };
      }

      return {
        success: true,
        data: this.mapTaskToProgress(running)
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          error: error.response?.data?.message || 'Failed to get current scan status',
          details: error.message || 'Unknown error',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Get all scan tasks
   */
  async getScanTasks(): Promise<ApiResponse<ScanTask[]>> {
    try {
      const response = await apiClient.get('/api/admin/ingest/scan-tasks');
      return {
        success: true,
        data: response.data as ScanTask[]
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          error: error.response?.data?.message || 'Failed to get scan tasks',
          details: error.message || 'Unknown error',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Cancel a scan task
   */
  async cancelScanTask(taskId: string): Promise<ApiResponse<{ success: boolean; message: string }>> {
    try {
      const response = await apiClient.delete(`/api/admin/ingest/scan-tasks/${taskId}`);
      return {
        success: true,
        data: response.data as { success: boolean; message: string }
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          error: error.response?.data?.message || 'Failed to cancel scan task',
          details: error.message || 'Unknown error',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Delete a completed/cancelled scan task
   */
  async deleteTask(taskId: string): Promise<ApiResponse<{ success: boolean; message: string }>> {
    try {
      const response = await apiClient.delete(`/api/admin/ingest/scan-tasks/${taskId}?force=true`);
      return {
        success: true,
        data: response.data as { success: boolean; message: string }
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          error: error.response?.data?.error || 'Failed to delete task',
          details: error.message || 'Unknown error',
          timestamp: new Date().toISOString()
        }
      };
    }
  }
}

export const mediaScannerService = new MediaScannerService();
