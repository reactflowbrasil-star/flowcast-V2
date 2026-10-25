import {
  Film,
  Clapperboard,
  Baby,
  Flame,
  Wand2,
  Clock,
  Heart,
  Radio,
  type LucideIcon} from 'lucide-react';

/**
 * Centralized category icons for consistent usage across the application
 * Use these constants instead of hardcoding icons in components
 */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  // Main categories
  VOD: Film,
  Movies: Film,
  TV: Radio,
  'Live TV': Radio,
  LiveTV: Radio,
  Series: Clapperboard,
  Shows: Clapperboard,
  
  // Special categories
  Kids: Baby,
  'Soap Operas': Flame,
  Anime: Wand2,
  Events: Clock,
  Eventos: Clock,
  
  // Favorites
  Favorites: Heart,
  Favourites: Heart};

/**
 * Get icon for a category type
 * @param categoryType - The category type (VOD, TV, Series, Kids, etc.)
 * @returns The corresponding Lucide icon component
 */
export function getCategoryIcon(categoryType: string): LucideIcon {
  const normalized = categoryType?.trim();
  return CATEGORY_ICONS[normalized] || Film; // Default to Film icon
}

/**
 * Category type to icon mapping for lowercase/normalized keys
 */
export const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  vod: Film,
  movies: Film,
  tv: Radio,
  livetv: Radio,
  'live tv': Radio,
  series: Clapperboard,
  shows: Clapperboard,
  kids: Baby,
  'soap operas': Flame,
  anime: Wand2,
  events: Clock,
  eventos: Clock,
  favorites: Heart,
  favourites: Heart};

/**
 * Get icon for a category with case-insensitive matching
 * @param categoryType - The category type
 * @returns The corresponding Lucide icon component
 */
export function getCategoryIconNormalized(categoryType: string): LucideIcon {
  const normalized = categoryType?.toLowerCase().trim();
  return CATEGORY_ICON_MAP[normalized] || Film;
}

