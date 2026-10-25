export interface WatchHistoryItem {
  id: number;
  content_id?: number;
  content_title: string;
  content_type: string;
  episode_title?: string;
  season_number?: number;
  episode_number?: number;
  start_timestamp: string;
  series_title?: string;
}

export interface WatchHistoryResponse {
  success: boolean;
  history: WatchHistoryItem[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}
