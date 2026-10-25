/**
 * Category Color Constants
 * Defines consistent color schemes for each content category
 */

export const CATEGORY_COLORS = {
  // Kids - Pink theme
  kids: {
    primary: 'pink-600',
    secondary: 'pink-500',
    light: 'pink-400',
    dark: 'pink-700',
    bg: 'bg-pink-600',
    bgSecondary: 'bg-pink-500',
    bgLight: 'bg-pink-400',
    bgDark: 'bg-pink-700',
    text: 'text-pink-600',
    textSecondary: 'text-pink-500',
    textLight: 'text-pink-400',
    border: 'border-pink-600',
    hover: 'hover:bg-pink-700',
    gradient: 'from-pink-600 to-pink-500',
    gradientFull: 'bg-gradient-to-br from-pink-600 to-pink-500'},

  // Anime - Purple theme
  anime: {
    primary: 'purple-600',
    secondary: 'purple-500',
    light: 'purple-400',
    dark: 'purple-700',
    bg: 'bg-purple-600',
    bgSecondary: 'bg-purple-500',
    bgLight: 'bg-purple-400',
    bgDark: 'bg-purple-700',
    text: 'text-purple-600',
    textSecondary: 'text-purple-500',
    textLight: 'text-purple-400',
    border: 'border-purple-600',
    hover: 'hover:bg-purple-700',
    gradient: 'from-purple-600 to-purple-500',
    gradientFull: 'bg-gradient-to-br from-purple-600 to-purple-500'},

  // Events - Green theme
  events: {
    primary: 'green-600',
    secondary: 'green-500',
    light: 'green-400',
    dark: 'green-700',
    bg: 'bg-green-600',
    bgSecondary: 'bg-green-500',
    bgLight: 'bg-green-400',
    bgDark: 'bg-green-700',
    text: 'text-green-600',
    textSecondary: 'text-green-500',
    textLight: 'text-green-400',
    border: 'border-green-600',
    hover: 'hover:bg-green-700',
    gradient: 'from-green-600 to-green-500',
    gradientFull: 'bg-gradient-to-br from-green-600 to-green-500'},

  // Movies/VOD - Blue theme (default)
  movies: {
    primary: 'blue-600',
    secondary: 'blue-500',
    light: 'blue-400',
    dark: 'blue-700',
    bg: 'bg-blue-600',
    bgSecondary: 'bg-blue-500',
    bgLight: 'bg-blue-400',
    bgDark: 'bg-blue-700',
    text: 'text-blue-600',
    textSecondary: 'text-blue-500',
    textLight: 'text-blue-400',
    border: 'border-blue-600',
    hover: 'hover:bg-blue-700',
    gradient: 'from-blue-600 to-blue-500',
    gradientFull: 'bg-gradient-to-br from-blue-600 to-blue-500'},

  // Series/Shows - Indigo theme
  series: {
    primary: 'indigo-600',
    secondary: 'indigo-500',
    light: 'indigo-400',
    dark: 'indigo-700',
    bg: 'bg-indigo-600',
    bgSecondary: 'bg-indigo-500',
    bgLight: 'bg-indigo-400',
    bgDark: 'bg-indigo-700',
    text: 'text-indigo-600',
    textSecondary: 'text-indigo-500',
    textLight: 'text-indigo-400',
    border: 'border-indigo-600',
    hover: 'hover:bg-indigo-700',
    gradient: 'from-indigo-600 to-indigo-500',
    gradientFull: 'bg-gradient-to-br from-indigo-600 to-indigo-500'},

  // Live TV - Cyan theme
  live: {
    primary: 'cyan-600',
    secondary: 'cyan-500',
    light: 'cyan-400',
    dark: 'cyan-700',
    bg: 'bg-cyan-600',
    bgSecondary: 'bg-cyan-500',
    bgLight: 'bg-cyan-400',
    bgDark: 'bg-cyan-700',
    text: 'text-cyan-600',
    textSecondary: 'text-cyan-500',
    textLight: 'text-cyan-400',
    border: 'border-cyan-600',
    hover: 'hover:bg-cyan-700',
    gradient: 'from-cyan-600 to-cyan-500',
    gradientFull: 'bg-gradient-to-br from-cyan-600 to-cyan-500'}} as const;

// Type for category keys
export type CategoryKey = keyof typeof CATEGORY_COLORS;

// Type accepted by category helpers
export type CategoryInput =
  | string
  | {
      category_type?: string | null;
      name?: string | null;
    }
  | null
  | undefined;

const DEFAULT_CATEGORY: CategoryKey = 'movies';

// Normalize a string for lookup usage.
const toAliasKey = (value: string) => value.replace(/[^a-z0-9]/gi, '').toLowerCase();

const CATEGORY_SYNONYMS: Record<string, CategoryKey> = {
  anime: 'anime',
  cartoon: 'kids',
  cartoons: 'kids',
  childrens: 'kids',
  children: 'kids',
  event: 'events',
  events: 'events',
  film: 'movies',
  films: 'movies',
  kids: 'kids',
  livetv: 'live',
  live: 'live',
  movie: 'movies',
  movies: 'movies',
  show: 'series',
  shows: 'series',
  series: 'series',
  tv: 'live',
  vod: 'movies'};

const extractCategoryString = (category: CategoryInput): string => {
  if (!category) return '';

  if (typeof category === 'string') return category;

  if (typeof category === 'object') {
    const { category_type, name } = category;
    if (typeof category_type === 'string') return category_type;
    if (typeof name === 'string') return name;
  }

  return '';
};

export function normalizeCategory(category: CategoryInput): CategoryKey {
  const rawValue = extractCategoryString(category).trim();
  if (rawValue) {
    const normalized = rawValue.toLowerCase();
    if (normalized in CATEGORY_COLORS) {
      return normalized as CategoryKey;
    }

    const alias = toAliasKey(normalized);
    if (alias in CATEGORY_COLORS) {
      return alias as CategoryKey;
    }

    if (CATEGORY_SYNONYMS[alias]) {
      return CATEGORY_SYNONYMS[alias];
    }
    if (CATEGORY_SYNONYMS[normalized]) {
      return CATEGORY_SYNONYMS[normalized];
    }
  }

  return DEFAULT_CATEGORY;
}

export function getCategoryLabel(category: CategoryInput): string {
  const rawValue = extractCategoryString(category).trim();
  if (rawValue) return rawValue;

  const normalized = normalizeCategory(category);
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

// Helper function to get category colors
export function getCategoryColors(category: CategoryInput): (typeof CATEGORY_COLORS)[CategoryKey] {
  const normalizedCategory = normalizeCategory(category);
  return CATEGORY_COLORS[normalizedCategory] || CATEGORY_COLORS.movies;
}

// Helper function to get category gradient class
export function getCategoryGradient(category: CategoryInput): string {
  const colors = getCategoryColors(category);
  return colors.gradientFull;
}

// Helper function to get category primary color class
export function getCategoryPrimaryBg(category: CategoryInput): string {
  const colors = getCategoryColors(category);
  return colors.bg;
}

// Helper function to get category text color class
export function getCategoryTextColor(category: CategoryInput): string {
  const colors = getCategoryColors(category);
  return colors.text;
}

// Helper function to get category border color class
export function getCategoryBorderColor(category: CategoryInput): string {
  const colors = getCategoryColors(category);
  return colors.border;
}

// Raw color values (for inline styles or dynamic usage)
export const CATEGORY_COLOR_VALUES = {
  kids: {
    primary: '#db2777',
    secondary: '#ec4899',
    light: '#f472b6',
    dark: '#be185d'},
  anime: {
    primary: '#9333ea',
    secondary: '#a855f7',
    light: '#c084fc',
    dark: '#7e22ce'},
  events: {
    primary: '#16a34a',
    secondary: '#22c55e',
    light: '#4ade80',
    dark: '#15803d'},
  movies: {
    primary: '#2563eb',
    secondary: '#3b82f6',
    light: '#60a5fa',
    dark: '#1d4ed8'},
  series: {
    primary: '#4f46e5',
    secondary: '#6366f1',
    light: '#818cf8',
    dark: '#4338ca'},
  live: {
    primary: '#0891b2',
    secondary: '#06b6d4',
    light: '#22d3ee',
    dark: '#0e7490'}} as const;

// Helper to get raw color value
export function getCategoryColorValue(
  category: CategoryInput,
  shade: 'primary' | 'secondary' | 'light' | 'dark' = 'primary'
): string {
  const normalizedCategory = normalizeCategory(category);
  const categoryColors = CATEGORY_COLOR_VALUES[normalizedCategory] || CATEGORY_COLOR_VALUES.movies;
  return categoryColors[shade];
}
