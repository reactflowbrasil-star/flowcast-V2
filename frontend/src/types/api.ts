// API response and error types

export interface ApiError {
  error: string;
  details: string;
  timestamp: string;
}

/**
 * ApiResponse / ApiResult discriminated union
 * - success: true  -> data is present, error is not provided
 * - success: false -> error is present, data is not provided
 *
 * This lets TypeScript narrow `result` after `if (result.success)` checks
 * so callers don't need to repeatedly guard `result.data` or `result.error`.
 */
export type ApiResponse<T> =
  | { success: true; data: T; error?: undefined }
  | { success: false; data?: undefined; error: ApiError };

export type ApiResult<T> = ApiResponse<T>;

export interface ValidationError {
  field: string;
  message: string;
}

// HTTP status codes for error handling
export enum HttpStatusCode {
  OK = 200,
  CREATED = 201,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
  total_pages: number;
}
