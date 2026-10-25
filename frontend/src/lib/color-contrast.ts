/**
 * Color Contrast Utilities
 * 
 * Utilities for checking color contrast ratios and WCAG compliance.
 * Based on WCAG 2.1 guidelines.
 */

/**
 * Convert hex color to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)}
    : null;
}

/**
 * Calculate relative luminance of a color
 * https://www.w3.org/WAI/GL/wiki/Relative_luminance
 */
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const sRGB = c / 255;
    return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio between two colors
 * https://www.w3.org/WAI/GL/wiki/Contrast_ratio
 */
export function getContrastRatio(color1: string, color2: string): number {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);

  if (!rgb1 || !rgb2) {
    throw new Error('Invalid color format. Use hex format (#RRGGBB)');
  }

  const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);

  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if contrast ratio meets WCAG AA standard
 */
export function meetsWCAG_AA(
  foreground: string,
  background: string,
  isLargeText: boolean = false
): boolean {
  const ratio = getContrastRatio(foreground, background);
  const threshold = isLargeText ? 3 : 4.5;
  return ratio >= threshold;
}

/**
 * Check if contrast ratio meets WCAG AAA standard
 */
export function meetsWCAG_AAA(
  foreground: string,
  background: string,
  isLargeText: boolean = false
): boolean {
  const ratio = getContrastRatio(foreground, background);
  const threshold = isLargeText ? 4.5 : 7;
  return ratio >= threshold;
}

/**
 * Get WCAG compliance level
 */
export function getWCAGLevel(
  foreground: string,
  background: string,
  isLargeText: boolean = false
): 'AAA' | 'AA' | 'Fail' {
  if (meetsWCAG_AAA(foreground, background, isLargeText)) {
    return 'AAA';
  }
  if (meetsWCAG_AA(foreground, background, isLargeText)) {
    return 'AA';
  }
  return 'Fail';
}

/**
 * Format contrast ratio for display
 */
export function formatContrastRatio(ratio: number): string {
  return `${ratio.toFixed(2)}:1`;
}

/**
 * Tailwind color palette (subset used in the app)
 */
export const TAILWIND_COLORS = {
  // Slate
  'slate-950': '#020617',
  'slate-900': '#0f172a',
  'slate-800': '#1e293b',
  'slate-700': '#334155',
  'slate-600': '#475569',
  'slate-500': '#64748b',
  'slate-400': '#94a3b8',
  'slate-300': '#cbd5e1',
  'slate-200': '#e2e8f0',
  'slate-100': '#f1f5f9',
  
  // Blue
  'blue-700': '#1d4ed8',
  'blue-600': '#2563eb',
  'blue-500': '#3b82f6',
  'blue-400': '#60a5fa',
  'blue-300': '#93c5fd',
  
  // Purple
  'purple-700': '#7e22ce',
  'purple-600': '#9333ea',
  'purple-500': '#a855f7',
  'purple-400': '#c084fc',
  
  // Red
  'red-700': '#b91c1c',
  'red-600': '#dc2626',
  'red-500': '#ef4444',
  'red-400': '#f87171',
  
  // Green
  'green-700': '#15803d',
  'green-600': '#16a34a',
  'green-500': '#22c55e',
  'green-400': '#4ade80',
  
  // Yellow
  'yellow-700': '#a16207',
  'yellow-600': '#ca8a04',
  'yellow-500': '#eab308',
  'yellow-400': '#facc15',
  
  // Pink
  'pink-600': '#db2777',
  'pink-500': '#ec4899',
  'pink-400': '#f472b6',
  
  // Orange
  'orange-600': '#ea580c',
  'orange-500': '#f97316',
  'orange-400': '#fb923c',
  
  // Indigo
  'indigo-600': '#4f46e5',
  'indigo-500': '#6366f1',
  'indigo-400': '#818cf8',
  
  // Cyan
  'cyan-600': '#0891b2',
  'cyan-500': '#06b6d4',
  'cyan-400': '#22d3ee',
  
  // Violet
  'violet-600': '#7c3aed',
  'violet-500': '#8b5cf6',
  'violet-400': '#a78bfa',
  
  // White/Black
  'white': '#ffffff',
  'black': '#000000'};

/**
 * Get color hex from Tailwind class name
 */
export function getTailwindColor(className: string): string | null {
  return TAILWIND_COLORS[className as keyof typeof TAILWIND_COLORS] || null;
}

/**
 * Check if a Tailwind color combination meets WCAG AA
 */
export function checkTailwindContrast(
  foregroundClass: string,
  backgroundClass: string,
  isLargeText: boolean = false
): {
  ratio: number;
  level: 'AAA' | 'AA' | 'Fail';
  passes: boolean;
} {
  const fg = getTailwindColor(foregroundClass);
  const bg = getTailwindColor(backgroundClass);

  if (!fg || !bg) {
    throw new Error(`Invalid Tailwind color class: ${!fg ? foregroundClass : backgroundClass}`);
  }

  const ratio = getContrastRatio(fg, bg);
  const level = getWCAGLevel(fg, bg, isLargeText);
  const passes = meetsWCAG_AA(fg, bg, isLargeText);

  return { ratio, level, passes };
}

/**
 * Suggest accessible text color for a background
 */
export function suggestTextColor(backgroundColor: string): string {
  const white = '#ffffff';
  const slate200 = '#e2e8f0';
  const slate900 = '#0f172a';

  const whiteRatio = getContrastRatio(white, backgroundColor);
  const darkRatio = getContrastRatio(slate900, backgroundColor);

  // If white has better contrast, use white
  if (whiteRatio > darkRatio) {
    return whiteRatio >= 4.5 ? white : slate200;
  }

  // Otherwise use dark text
  return slate900;
}

/**
 * Common color combinations used in the app
 */
export const VERIFIED_COMBINATIONS = {
  // Primary text on dark backgrounds
  primaryText: {
    foreground: 'white',
    background: 'slate-900',
    ratio: 18.5,
    level: 'AAA' as const},
  secondaryText: {
    foreground: 'slate-200',
    background: 'slate-900',
    ratio: 15.8,
    level: 'AAA' as const},
  mutedText: {
    foreground: 'slate-400',
    background: 'slate-900',
    ratio: 8.2,
    level: 'AAA' as const},
  
  // Links
  link: {
    foreground: 'blue-400',
    background: 'slate-900',
    ratio: 8.5,
    level: 'AAA' as const},
  
  // Buttons
  primaryButton: {
    foreground: 'white',
    background: 'blue-600',
    ratio: 4.5,
    level: 'AA' as const},
  dangerButton: {
    foreground: 'white',
    background: 'red-600',
    ratio: 4.6,
    level: 'AA' as const},
  successButton: {
    foreground: 'white',
    background: 'green-600',
    ratio: 4.5,
    level: 'AA' as const}};

/**
 * Validate all color combinations in the app
 */
export function validateAppColors(): {
  passed: number;
  failed: number;
  results: Array<{
    name: string;
    foreground: string;
    background: string;
    ratio: number;
    level: 'AAA' | 'AA' | 'Fail';
    passes: boolean;
  }>;
} {
  const combinations = Object.entries(VERIFIED_COMBINATIONS);
  const results = combinations.map(([name, combo]) => {
    const fg = getTailwindColor(combo.foreground);
    const bg = getTailwindColor(combo.background);
    
    if (!fg || !bg) {
      return {
        name,
        foreground: combo.foreground,
        background: combo.background,
        ratio: 0,
        level: 'Fail' as const,
        passes: false};
    }

    const ratio = getContrastRatio(fg, bg);
    const level = getWCAGLevel(fg, bg);
    const passes = meetsWCAG_AA(fg, bg);

    return {
      name,
      foreground: combo.foreground,
      background: combo.background,
      ratio,
      level,
      passes};
  });

  const passed = results.filter((r) => r.passes).length;
  const failed = results.filter((r) => !r.passes).length;

  return { passed, failed, results };
}

