import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { extractErrorMessage } from './error-message';

/**
 * Classname helper (tailwind merge + clsx)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normalize API error payloads into a user-friendly string.
 * Accepts many shapes returned by apiService (string, { details }, { error }, Error, etc.)
 */
export function apiErrorMessage(err: unknown, fallback = 'An error occurred'): string {
  return extractErrorMessage(err, fallback);
}
