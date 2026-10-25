/**
 * Spacing Utility Classes
 * Provides consistent spacing (padding) across the application
 */

export const paddingClasses = {
  xs: 'p-2',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
  xl: 'p-8',
  '2xl': 'p-10'} as const;

export const marginClasses = {
  xs: 'm-2',
  sm: 'm-3',
  md: 'm-4',
  lg: 'm-6',
  xl: 'm-8',
  '2xl': 'm-10'} as const;

export const gapClasses = {
  xs: 'gap-2',
  sm: 'gap-3',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8',
  '2xl': 'gap-10'} as const;

export const spaceYClasses = {
  xs: 'space-y-2',
  sm: 'space-y-3',
  md: 'space-y-4',
  lg: 'space-y-6',
  xl: 'space-y-8',
  '2xl': 'space-y-10'} as const;

export const spaceXClasses = {
  xs: 'space-x-2',
  sm: 'space-x-3',
  md: 'space-x-4',
  lg: 'space-x-6',
  xl: 'space-x-8',
  '2xl': 'space-x-10'} as const;

export type SpacingSize = keyof typeof paddingClasses;

/**
 * Get padding class by size
 */
export function getPadding(size: SpacingSize): string {
  return paddingClasses[size];
}

/**
 * Get margin class by size
 */
export function getMargin(size: SpacingSize): string {
  return marginClasses[size];
}

/**
 * Get gap class by size
 */
export function getGap(size: SpacingSize): string {
  return gapClasses[size];
}

/**
 * Get space-y class by size
 */
export function getSpaceY(size: SpacingSize): string {
  return spaceYClasses[size];
}

/**
 * Get space-x class by size
 */
export function getSpaceX(size: SpacingSize): string {
  return spaceXClasses[size];
}

/**
 * Get appropriate padding for card type
 */
export function getCardPadding(type: 'mini' | 'small' | 'medium' | 'large' | 'xlarge'): string {
  switch (type) {
    case 'mini':
      return paddingClasses.xs;
    case 'small':
      return paddingClasses.sm;
    case 'medium':
      return paddingClasses.md;
    case 'large':
      return paddingClasses.lg;
    case 'xlarge':
      return paddingClasses.xl;
    default:
      return paddingClasses.md;
  }
}

/**
 * Get appropriate gap for grid based on card size
 */
export function getGridGap(cardSize: 'mini' | 'small' | 'medium' | 'large' | 'xlarge'): string {
  switch (cardSize) {
    case 'mini':
      return gapClasses.xs;
    case 'small':
      return gapClasses.sm;
    case 'medium':
      return gapClasses.md;
    case 'large':
      return gapClasses.lg;
    case 'xlarge':
      return gapClasses.xl;
    default:
      return gapClasses.md;
  }
}

/**
 * Get responsive padding classes
 */
export function getResponsivePadding(
  mobile: SpacingSize,
  tablet?: SpacingSize,
  desktop?: SpacingSize
): string {
  // Explicitly type as string[] to allow prefixed responsive classes
  const classes: string[] = [paddingClasses[mobile]];
  
  if (tablet) {
    classes.push(`md:${paddingClasses[tablet]}`);
  }
  
  if (desktop) {
    classes.push(`lg:${paddingClasses[desktop]}`);
  }
  
  return classes.join(' ');
}

/**
 * Spacing presets for common use cases
 */
export const spacingPresets = {
  // Cards
  miniCard: paddingClasses.sm,
  standardCard: paddingClasses.md,
  statsCard: paddingClasses.lg,
  heroCard: paddingClasses.xl,
  
  // Modals
  smallModal: paddingClasses.md,
  mediumModal: paddingClasses.lg,
  largeModal: paddingClasses.xl,
  
  // Containers
  section: paddingClasses.md,
  page: paddingClasses.lg,
  
  // Lists
  listItem: paddingClasses.sm,
  listItemLarge: paddingClasses.md,
  
  // Grids
  gridGapTight: gapClasses.xs,
  gridGapNormal: gapClasses.md,
  gridGapLoose: gapClasses.lg} as const;

