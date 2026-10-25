/**
 * Number formatting utilities with i18n support
 * 
 * Provides consistent number formatting across the application
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
 * Format a number according to the current locale
 * 
 * @param value - Number to format
 * @param options - Intl.NumberFormat options
 * @returns Formatted number string
 */
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions
): string {
  if (isNaN(value)) {
    return 'NaN';
  }

  const locale = getCurrentLocale();
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Format a number as currency according to the current locale
 * 
 * @param value - Number to format
 * @param currency - Currency code (e.g., 'USD', 'EUR', 'GBP')
 * @param options - Additional Intl.NumberFormat options
 * @returns Formatted currency string
 */
export function formatCurrency(
  value: number,
  currency: string = 'USD',
  options?: Intl.NumberFormatOptions
): string {
  if (isNaN(value)) {
    return 'NaN';
  }

  const locale = getCurrentLocale();
  const defaultOptions: Intl.NumberFormatOptions = {
    style: 'currency',
    currency,
    ...options};

  return new Intl.NumberFormat(locale, defaultOptions).format(value);
}

/**
 * Format a number as a percentage according to the current locale
 * 
 * @param value - Number to format (0.5 = 50%)
 * @param options - Additional Intl.NumberFormat options
 * @returns Formatted percentage string
 */
export function formatPercent(
  value: number,
  options?: Intl.NumberFormatOptions
): string {
  if (isNaN(value)) {
    return 'NaN';
  }

  const locale = getCurrentLocale();
  const defaultOptions: Intl.NumberFormatOptions = {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    ...options};

  return new Intl.NumberFormat(locale, defaultOptions).format(value);
}

/**
 * Format a number with a specific number of decimal places
 * 
 * @param value - Number to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted number string
 */
export function formatDecimal(value: number, decimals: number = 2): string {
  if (isNaN(value)) {
    return 'NaN';
  }

  const locale = getCurrentLocale();
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals}).format(value);
}

/**
 * Format a number with thousand separators
 * 
 * @param value - Number to format
 * @returns Formatted number string with thousand separators
 */
export function formatWithSeparators(value: number): string {
  if (isNaN(value)) {
    return 'NaN';
  }

  const locale = getCurrentLocale();
  return new Intl.NumberFormat(locale, {
    useGrouping: true}).format(value);
}

/**
 * Format a number in compact notation (e.g., 1.2K, 3.4M)
 * 
 * @param value - Number to format
 * @param options - Additional Intl.NumberFormat options
 * @returns Formatted compact number string
 */
export function formatCompact(
  value: number,
  options?: Intl.NumberFormatOptions
): string {
  if (isNaN(value)) {
    return 'NaN';
  }

  const locale = getCurrentLocale();
  const defaultOptions: Intl.NumberFormatOptions = {
    notation: 'compact',
    compactDisplay: 'short',
    ...options};

  return new Intl.NumberFormat(locale, defaultOptions).format(value);
}

/**
 * Format a number in scientific notation
 * 
 * @param value - Number to format
 * @param options - Additional Intl.NumberFormat options
 * @returns Formatted scientific notation string
 */
export function formatScientific(
  value: number,
  options?: Intl.NumberFormatOptions
): string {
  if (isNaN(value)) {
    return 'NaN';
  }

  const locale = getCurrentLocale();
  const defaultOptions: Intl.NumberFormatOptions = {
    notation: 'scientific',
    ...options};

  return new Intl.NumberFormat(locale, defaultOptions).format(value);
}

/**
 * Format bytes to human-readable size (e.g., 1.5 MB, 500 KB)
 * 
 * @param bytes - Size in bytes
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted size string
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 B';
  if (bytes < 0 || isNaN(bytes)) return 'Invalid Size';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${formatDecimal(bytes / Math.pow(k, i), decimals)} ${sizes[i]}`;
}

/**
 * Format a number as an ordinal (e.g., 1st, 2nd, 3rd)
 * 
 * @param value - Number to format
 * @returns Formatted ordinal string
 */
export function formatOrdinal(value: number): string {
  if (isNaN(value)) {
    return 'NaN';
  }

  const locale = getCurrentLocale();
  
  // Use Intl.PluralRules for proper ordinal formatting
  const pr = new Intl.PluralRules(locale, { type: 'ordinal' });
  const rule = pr.select(value);

  const suffixes: Record<string, Record<string, string>> = {
    en: {
      one: 'st',
      two: 'nd',
      few: 'rd',
      other: 'th'},
    es: {
      one: 'º',
      two: 'º',
      few: 'º',
      other: 'º'},
    zh: {
      one: '第',
      two: '第',
      few: '第',
      other: '第'}};

  const localeSuffixes = suffixes[locale] || suffixes.en;
  const suffix = localeSuffixes[rule] || localeSuffixes.other;

  // For Chinese, the ordinal comes before the number
  if (locale === 'zh') {
    return `${suffix}${value}`;
  }

  return `${value}${suffix}`;
}

/**
 * Format a rating (e.g., 4.5/5, 8.7/10)
 * 
 * @param value - Rating value
 * @param max - Maximum rating (default: 10)
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted rating string
 */
export function formatRating(
  value: number,
  max: number = 10,
  decimals: number = 1
): string {
  if (isNaN(value)) {
    return 'N/A';
  }

  return `${formatDecimal(value, decimals)}/${max}`;
}

/**
 * Format a duration in seconds to human-readable format
 * 
 * @param seconds - Duration in seconds
 * @param short - Use short format (e.g., "1h 23m" vs "1 hour 23 minutes")
 * @returns Formatted duration string
 */
export function formatDuration(seconds: number, short: boolean = true): string {
  if (seconds < 0 || isNaN(seconds)) {
    return '0m';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (short) {
    if (hours > 0 && minutes > 0) {
      return `${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${secs}s`;
    }
  } else {
    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
    if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
    if (secs > 0 && hours === 0) parts.push(`${secs} second${secs !== 1 ? 's' : ''}`);
    return parts.join(' ') || '0 seconds';
  }
}

/**
 * Format a number range (e.g., "10-20", "100-200")
 * 
 * @param start - Start of range
 * @param end - End of range
 * @param options - Intl.NumberFormat options
 * @returns Formatted range string
 */
export function formatRange(
  start: number,
  end: number,
  options?: Intl.NumberFormatOptions
): string {
  if (isNaN(start) || isNaN(end)) {
    return 'Invalid Range';
  }

  const locale = getCurrentLocale();
  const formatter = new Intl.NumberFormat(locale, options);
  // Capture format method before 'in' check to avoid TypeScript narrowing issue
  const format = formatter.format.bind(formatter);

  // Use formatRange if available (newer browsers)
  if ('formatRange' in formatter) {
    return (formatter as any).formatRange(start, end);
  }

  // Fallback for older browsers
  return `${format(start)}-${format(end)}`;
}

/**
 * Parse a localized number string to a number
 * 
 * @param value - Localized number string
 * @returns Parsed number
 */
export function parseLocalizedNumber(value: string): number {
  const locale = getCurrentLocale();
  
  // Get the decimal and thousand separators for the current locale
  const parts = new Intl.NumberFormat(locale).formatToParts(1234.5);
  const decimalSeparator = parts.find(p => p.type === 'decimal')?.value || '.';
  const thousandSeparator = parts.find(p => p.type === 'group')?.value || ',';

  // Remove thousand separators and replace decimal separator with '.'
  const normalized = value
    .replace(new RegExp(`\\${thousandSeparator}`, 'g'), '')
    .replace(decimalSeparator, '.');

  return parseFloat(normalized);
}

