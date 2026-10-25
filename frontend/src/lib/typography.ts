/**
 * Typography Utility Classes
 * Provides consistent typography styles across the application
 */

export const typographyClasses = {
  // Headings
  h1: 'text-3xl font-bold text-white',
  h2: 'text-2xl font-semibold text-white',
  h3: 'text-xl font-semibold text-white',
  h4: 'text-lg font-medium text-white',
  h5: 'text-base font-medium text-white',
  h6: 'text-sm font-medium text-white',
  
  // Body text
  body: 'text-base text-slate-300',
  bodyLarge: 'text-lg text-slate-300',
  bodySmall: 'text-sm text-slate-400',
  bodyXs: 'text-xs text-slate-500',
  
  // Primary variants (white text)
  h1Primary: 'text-3xl font-bold text-white',
  h2Primary: 'text-2xl font-semibold text-white',
  h3Primary: 'text-xl font-semibold text-white',
  bodyPrimary: 'text-base text-white',
  
  // Secondary variants (lighter text)
  h1Secondary: 'text-3xl font-bold text-slate-300',
  h2Secondary: 'text-2xl font-semibold text-slate-300',
  h3Secondary: 'text-xl font-semibold text-slate-400',
  bodySecondary: 'text-base text-slate-400',
  
  // With truncation
  h1Truncate: 'text-3xl font-bold text-white truncate',
  h2Truncate: 'text-2xl font-semibold text-white truncate',
  h3Truncate: 'text-xl font-semibold text-white truncate',
  h4Truncate: 'text-lg font-medium text-white truncate',
  bodyTruncate: 'text-base text-slate-300 truncate',
  
  // With line clamp
  bodyClamp2: 'text-base text-slate-300 line-clamp-2',
  bodyClamp3: 'text-base text-slate-300 line-clamp-3',
  bodySmallClamp2: 'text-sm text-slate-400 line-clamp-2',
  
  // Component-specific
  cardTitle: 'text-xl font-semibold text-white',
  cardDescription: 'text-sm text-slate-400',
  modalTitle: 'text-2xl font-semibold text-white',
  modalDescription: 'text-base text-slate-300',
  tableHeader: 'text-sm font-medium text-slate-400',
  tableCell: 'text-sm text-slate-300',
  buttonText: 'text-sm font-medium',
  badgeText: 'text-xs font-medium',
  labelText: 'text-sm font-medium text-slate-300',
  
  // Stats and numbers
  statValue: 'text-3xl font-bold text-white',
  statLabel: 'text-sm font-medium text-slate-400',
  statChange: 'text-xs text-slate-400',
  
  // Links
  link: 'text-blue-500 hover:text-blue-400 underline',
  linkSubtle: 'text-slate-400 hover:text-slate-300'} as const;

export type TypographyVariant = keyof typeof typographyClasses;

/**
 * Get typography class by variant
 */
export function getTypography(variant: TypographyVariant): string {
  return typographyClasses[variant];
}

/**
 * Combine typography class with custom classes
 */
export function withTypography(variant: TypographyVariant, customClasses?: string): string {
  return `${typographyClasses[variant]} ${customClasses || ''}`.trim();
}

/**
 * Get responsive typography classes
 */
export function getResponsiveTypography(
  mobile: TypographyVariant,
  tablet?: TypographyVariant,
  desktop?: TypographyVariant
): string {
  // Explicitly type as string[] to allow prefixed responsive classes
  const classes: string[] = [typographyClasses[mobile]];
  
  if (tablet) {
    // Extract size and apply with md: prefix
    const tabletClass = typographyClasses[tablet];
    classes.push(`md:${tabletClass}`);
  }
  
  if (desktop) {
    // Extract size and apply with lg: prefix
    const desktopClass = typographyClasses[desktop];
    classes.push(`lg:${desktopClass}`);
  }
  
  return classes.join(' ');
}

/**
 * Typography presets for common use cases
 */
export const typographyPresets = {
  // Page headers
  pageTitle: typographyClasses.h1,
  pageSubtitle: typographyClasses.h2,
  sectionTitle: typographyClasses.h3,
  
  // Cards
  cardTitle: typographyClasses.cardTitle,
  cardDescription: typographyClasses.cardDescription,
  cardValue: typographyClasses.statValue,
  
  // Modals
  modalTitle: typographyClasses.modalTitle,
  modalDescription: typographyClasses.modalDescription,
  
  // Tables
  tableHeader: typographyClasses.tableHeader,
  tableCell: typographyClasses.tableCell,
  
  // Forms
  label: typographyClasses.labelText,
  input: typographyClasses.body,
  helper: typographyClasses.bodySmall,
  error: 'text-sm text-red-500',
  
  // Lists
  listTitle: typographyClasses.h4Truncate,
  listDescription: typographyClasses.bodySmallClamp2,
  listMeta: typographyClasses.bodyXs} as const;

/**
 * Get text color based on status
 */
export function getStatusTextColor(status: 'success' | 'error' | 'warning' | 'info'): string {
  switch (status) {
    case 'success':
      return 'text-green-500';
    case 'error':
      return 'text-red-500';
    case 'warning':
      return 'text-yellow-500';
    case 'info':
      return 'text-blue-500';
    default:
      return 'text-slate-400';
  }
}

/**
 * Get text color based on category
 */
export function getCategoryTextColor(category: string): string {
  const normalizedCategory = category.toLowerCase();
  
  switch (normalizedCategory) {
    case 'kids':
      return 'text-pink-500';
    case 'anime':
      return 'text-purple-500';
    case 'events':
      return 'text-green-500';
    case 'movies':
      return 'text-blue-500';
    case 'series':
      return 'text-indigo-500';
    case 'live':
      return 'text-cyan-500';
    case 'music':
      return 'text-violet-500';
    default:
      return 'text-slate-400';
  }
}

