import { apiService } from './api';
import { ApiResult } from '@/types';
import { ContentType } from '@/types';

export interface TMDBSearchResult {
  id: number;
  title: string;
  overview?: string;
  release_date?: string;
  poster_url?: string;
  backdrop_url?: string;
  vote_average?: number;
  media_type?: string;
  year?: number;
}

export interface TMDBMovieDetails {
  id: number;
  title: string;
  overview: string;
  release_date: string;
  poster_path?: string;
  backdrop_path?: string;
  vote_average: number;
  runtime?: number;
  genres: Array<{ id: number; name: string }>;
  production_companies: Array<{ id: number; name: string }>;
  imdb_id?: string;
}

export interface TMDBTVDetails {
  id: number;
  name: string;
  overview?: string;
  poster_url?: string;
  backdrop_url?: string;
  first_air_date?: string;
  last_air_date?: string;
  year?: number;
  number_of_seasons: number;
  number_of_episodes: number;
  vote_average: number;
  vote_count: number;
  seasons: Array<{
    id: number;
    season_number: number;
    episode_count: number;
    name: string;
    overview?: string;
    poster_path?: string;
    air_date?: string;
  }>;
}

export interface TMDBSeasonDetails {
  id: number;
  season_number: number;
  name: string;
  overview: string;
  poster_path?: string;
  air_date?: string;
  episodes: Array<{
    id: number;
    episode_number: number;
    name: string;
    overview: string;
    still_path?: string;
    air_date?: string;
    runtime?: number;
    vote_average: number;
  }>;
}

class TMDBService {
  /**
   * Search for content on TMDB
   */
  async searchContent(query: string, contentType: ContentType): Promise<ApiResult<TMDBSearchResult[]>> {
    try {
      // For series and anime, search TV shows; for movies, search movies
      const searchType = (contentType === ContentType.SERIES || contentType === ContentType.ANIME) ? 'tv' : 'movie';

      const result = await apiService.get<{ results: TMDBSearchResult[]; tmdb_available: boolean }>('/api/tmdb/search', {
        params: {
          q: query,
          search_type: searchType
        }
      });

      if (result.success) {
        return {
          success: true,
          data: result.data.results
        };
      }

      return result as ApiResult<TMDBSearchResult[]>;
    } catch {
      return {
        success: false,
        error: {
          error: 'TMDB Search Failed',
          details: 'Failed to search TMDB content',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Search by TMDB ID
   */
  async searchById(tmdbId: number, contentType: ContentType): Promise<ApiResult<TMDBSearchResult>> {
    try {
      const endpoint = contentType === ContentType.VOD ? 'movie' : 'tv';
      const result = await apiService.get<TMDBSearchResult>(`/api/tmdb/${endpoint}/${tmdbId}`);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'TMDB ID Search Failed',
          details: 'Failed to fetch content by TMDB ID',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Get detailed movie information
   */
  async getMovieDetails(tmdbId: number): Promise<ApiResult<TMDBMovieDetails>> {
    try {
      const result = await apiService.get<TMDBMovieDetails>(`/api/tmdb/movie/${tmdbId}`);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Movie Details Failed',
          details: 'Failed to fetch movie details from TMDB',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Get detailed TV series information
   */
  async getTVDetails(tmdbId: number): Promise<ApiResult<TMDBTVDetails>> {
    try {
      const result = await apiService.get<TMDBTVDetails>(`/api/tmdb/tv/${tmdbId}`);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'TV Details Failed',
          details: 'Failed to fetch TV series details from TMDB',
          timestamp: new Date().toISOString()}
      };
    }
  }



  /**
   * Get season details with episodes
   */
  async getSeasonDetails(tmdbId: number, seasonNumber: number): Promise<ApiResult<TMDBSeasonDetails>> {
    try {
      const result = await apiService.get<TMDBSeasonDetails>(`/api/tmdb/tv/${tmdbId}/season/${seasonNumber}`);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Season Details Failed',
          details: 'Failed to fetch season details from TMDB',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Test TMDB API key
   */
  async testApiKey(apiKey: string): Promise<ApiResult<{ valid: boolean; message: string }>> {
    try {
      const result = await apiService.post<{ valid: boolean; message: string }>('/api/admin/config/tmdb/test', {
        tmdb_api_key: apiKey
      });

      if (result.success) {
        return {
          success: true,
          data: {
            valid: result.data.valid,
            message: result.data.message
          }
        };
      }

      return result as ApiResult<{ valid: boolean; message: string }>;
    } catch {
      return {
        success: false,
        error: {
          error: 'API Key Test Failed',
          details: 'Failed to test TMDB API key',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Get trending content
   */
  async getTrending(mediaType: 'movie' | 'tv' | 'all' = 'all', timeWindow: 'day' | 'week' = 'week'): Promise<ApiResult<TMDBSearchResult[]>> {
    return {
      success: false,
      error: {
        error: 'Trending Content Unavailable',
        details: 'Backend does not expose a trending TMDB endpoint.',
        timestamp: new Date().toISOString()}
    };
  }

  /**
   * Get popular content
   */
  async getPopular(mediaType: 'movie' | 'tv'): Promise<ApiResult<TMDBSearchResult[]>> {
    return {
      success: false,
      error: {
        error: 'Popular Content Unavailable',
        details: 'Backend does not expose a popular TMDB endpoint.',
        timestamp: new Date().toISOString()}
    };
  }

  /**
   * Get content by genre
   */
  async getByGenre(mediaType: 'movie' | 'tv', genreId: number): Promise<ApiResult<TMDBSearchResult[]>> {
    return {
      success: false,
      error: {
        error: 'Genre Content Unavailable',
        details: 'Backend does not expose a genre TMDB endpoint.',
        timestamp: new Date().toISOString()}
    };
  }

  /**
   * Get available genres
   */
  async getGenres(mediaType: 'movie' | 'tv'): Promise<ApiResult<Array<{ id: number; name: string }>>> {
    return {
      success: false,
      error: {
        error: 'Genres Unavailable',
        details: 'Backend does not expose a TMDB genres endpoint.',
        timestamp: new Date().toISOString()}
    };
  }

  /**
   * Check TMDB API status
   */
  async getStatus(): Promise<ApiResult<{ available: boolean; message: string }>> {
    try {
      const result = await apiService.get<{ available: boolean; message: string }>('/api/tmdb/status');
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'TMDB Status Check Failed',
          details: 'Failed to check TMDB API status',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Get image configuration
   */
  async getImageConfig(): Promise<ApiResult<{
    base_url: string;
    secure_base_url: string;
    poster_sizes: string[];
    backdrop_sizes: string[];
  }>> {
    return {
      success: false,
      error: {
        error: 'Image Config Unavailable',
        details: 'Backend does not expose a TMDB configuration endpoint.',
        timestamp: new Date().toISOString()}
    };
  }

  /**
   * Helper method to get the correct search endpoint based on content type
   */
  private getSearchEndpoint(contentType: ContentType): string {
    switch (contentType) {
      case ContentType.VOD:
        return 'movie';
      case ContentType.SERIES:
      case ContentType.ANIME:
        return 'tv';
      case ContentType.KIDS:
        return 'multi'; // Search both movies and TV
      default:
        return 'multi';
    }
  }

  /**
   * Helper method to build full image URL
   */
  buildImageUrl(path: string, size: 'w92' | 'w154' | 'w185' | 'w342' | 'w500' | 'w780' | 'original' = 'w500'): string {
    if (!path) return '';
    return `https://image.tmdb.org/t/p/${size}${path}`;
  }

  /**
   * Helper method to build full backdrop URL
   */
  buildBackdropUrl(path: string, size: 'w300' | 'w780' | 'w1280' | 'original' = 'w1280'): string {
    if (!path) return '';
    return `https://image.tmdb.org/t/p/${size}${path}`;
  }
}

export const tmdbService = new TMDBService();
