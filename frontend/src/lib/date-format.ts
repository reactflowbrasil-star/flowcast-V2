/**
 * Date formatting utilities with i18n support
 * 
 * Provides consistent date and time formatting across the application
 * based on the user's locale.
 */

import i18n from '@/lib/i18n';

/**
 * Get the current locale from i18n
 */
export function getCurrentLocale(): string {
  return i18n.language || 'en';
}

/**
 * Format a date according to the current locale
 * 
 * @param date - Date to format (Date object, timestamp, or ISO string)
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted date string
 */
export function formatDate(
  date: Date | number | string,
  options?: Intl.DateTimeFormatOptions
): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' 
    ? new Date(date) 
    : date;

  if (isNaN(dateObj.getTime())) {
    return 'Invalid Date';
  }

  const locale = getCurrentLocale();
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric'};

  return new Intl.DateTimeFormat(locale, options || defaultOptions).format(dateObj);
}

/**
 * Format a date with time according to the current locale
 * 
 * @param date - Date to format
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted date and time string
 */
export function formatDateTime(
  date: Date | number | string,
  options?: Intl.DateTimeFormatOptions
): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' 
    ? new Date(date) 
    : date;

  if (isNaN(dateObj.getTime())) {
    return 'Invalid Date';
  }

  const locale = getCurrentLocale();
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'};

  return new Intl.DateTimeFormat(locale, options || defaultOptions).format(dateObj);
}

/**
 * Format time only according to the current locale
 * 
 * @param date - Date to format
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted time string
 */
export function formatTime(
  date: Date | number | string,
  options?: Intl.DateTimeFormatOptions
): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' 
    ? new Date(date) 
    : date;

  if (isNaN(dateObj.getTime())) {
    return 'Invalid Time';
  }

  const locale = getCurrentLocale();
  const defaultOptions: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit'};

  return new Intl.DateTimeFormat(locale, options || defaultOptions).format(dateObj);
}

/**
 * Format a date as a short date (e.g., "12/31/2023" or "31/12/2023")
 * 
 * @param date - Date to format
 * @returns Short formatted date string
 */
export function formatShortDate(date: Date | number | string): string {
  return formatDate(date, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'});
}

/**
 * Format a date as a long date (e.g., "December 31, 2023")
 * 
 * @param date - Date to format
 * @returns Long formatted date string
 */
export function formatLongDate(date: Date | number | string): string {
  return formatDate(date, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'});
}

/**
 * Format a date as a relative time (e.g., "2 hours ago", "in 3 days")
 * 
 * @param date - Date to format
 * @returns Relative time string
 */
export function formatRelativeTime(date: Date | number | string): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' 
    ? new Date(date) 
    : date;

  if (isNaN(dateObj.getTime())) {
    return 'Invalid Date';
  }

  const locale = getCurrentLocale();
  const now = new Date();
  const diffMs = dateObj.getTime() - now.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);
  const diffWeek = Math.round(diffDay / 7);
  const diffMonth = Math.round(diffDay / 30);
  const diffYear = Math.round(diffDay / 365);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (Math.abs(diffSec) < 60) {
    return rtf.format(diffSec, 'second');
  } else if (Math.abs(diffMin) < 60) {
    return rtf.format(diffMin, 'minute');
  } else if (Math.abs(diffHour) < 24) {
    return rtf.format(diffHour, 'hour');
  } else if (Math.abs(diffDay) < 7) {
    return rtf.format(diffDay, 'day');
  } else if (Math.abs(diffWeek) < 4) {
    return rtf.format(diffWeek, 'week');
  } else if (Math.abs(diffMonth) < 12) {
    return rtf.format(diffMonth, 'month');
  } else {
    return rtf.format(diffYear, 'year');
  }
}

/**
 * Format a date range according to the current locale
 * 
 * @param startDate - Start date
 * @param endDate - End date
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted date range string
 */
export function formatDateRange(
  startDate: Date | number | string,
  endDate: Date | number | string,
  options?: Intl.DateTimeFormatOptions
): string {
  const startObj = typeof startDate === 'string' || typeof startDate === 'number' 
    ? new Date(startDate) 
    : startDate;
  const endObj = typeof endDate === 'string' || typeof endDate === 'number' 
    ? new Date(endDate) 
    : endDate;

  if (isNaN(startObj.getTime()) || isNaN(endObj.getTime())) {
    return 'Invalid Date Range';
  }

  const locale = getCurrentLocale();
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric'};

  const formatter = new Intl.DateTimeFormat(locale, options || defaultOptions);
  return formatter.formatRange(startObj, endObj);
}

/**
 * Format duration in seconds to human-readable format
 * 
 * @param seconds - Duration in seconds
 * @returns Formatted duration string (e.g., "1h 23m", "45m", "2h")
 */
export function formatDuration(seconds: number): string {
  if (seconds < 0 || isNaN(seconds)) {
    return '0m';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else {
    return `${minutes}m`;
  }
}

/**
 * Format file size to human-readable format
 * 
 * @param bytes - Size in bytes
 * @returns Formatted size string (e.g., "1.5 MB", "500 KB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 0 || isNaN(bytes)) return 'Invalid Size';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Check if a date is today
 * 
 * @param date - Date to check
 * @returns True if the date is today
 */
export function isToday(date: Date | number | string): boolean {
  const dateObj = typeof date === 'string' || typeof date === 'number' 
    ? new Date(date) 
    : date;

  if (isNaN(dateObj.getTime())) {
    return false;
  }

  const today = new Date();
  return dateObj.getDate() === today.getDate() &&
    dateObj.getMonth() === today.getMonth() &&
    dateObj.getFullYear() === today.getFullYear();
}

/**
 * Check if a date is in the past
 * 
 * @param date - Date to check
 * @returns True if the date is in the past
 */
export function isPast(date: Date | number | string): boolean {
  const dateObj = typeof date === 'string' || typeof date === 'number' 
    ? new Date(date) 
    : date;

  if (isNaN(dateObj.getTime())) {
    return false;
  }

  return dateObj.getTime() < Date.now();
}

/**
 * Check if a date is in the future
 * 
 * @param date - Date to check
 * @returns True if the date is in the future
 */
export function isFuture(date: Date | number | string): boolean {
  const dateObj = typeof date === 'string' || typeof date === 'number' 
    ? new Date(date) 
    : date;

  if (isNaN(dateObj.getTime())) {
    return false;
  }

  return dateObj.getTime() > Date.now();
}

