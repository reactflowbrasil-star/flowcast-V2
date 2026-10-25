/**
 * Grid Layout Utilities
 * 
 * Standardized responsive grid layouts for consistent spacing and breakpoints
 */

/**
 * Standard Grid Layouts
 */
export const gridLayouts = {
  // Content grids (movies, series, etc.)
  content: 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4',
  contentLarge: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6',
  contentSmall: 'grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3',
  
  // Stats/Cards grids
  stats: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6',
  statsCompact: 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4',
  
  // Admin grids
  admin: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4',
  adminWide: 'grid grid-cols-1 md:grid-cols-2 gap-6',
  
  // Form grids
  form: 'grid grid-cols-1 md:grid-cols-2 gap-4',
  formWide: 'grid grid-cols-1 gap-4',
  
  // List grids
  list: 'grid grid-cols-1 gap-3',
  listCompact: 'grid grid-cols-1 gap-2'} as const;

export type GridLayout = keyof typeof gridLayouts;

/**
 * Get grid layout classes
 */
export function getGridLayout(layout: GridLayout): string {
  return gridLayouts[layout];
}

/**
 * Custom Grid Builder
 */
export interface GridConfig {
  cols?: {
    default?: number;
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
    '2xl'?: number;
  };
  gap?: number | string;
}

export function buildGrid(config: GridConfig): string {
  const { cols = {}, gap = 4 } = config;
  
  const classes: string[] = ['grid'];
  
  // Add column classes
  if (cols.default) classes.push(`grid-cols-${cols.default}`);
  if (cols.sm) classes.push(`sm:grid-cols-${cols.sm}`);
  if (cols.md) classes.push(`md:grid-cols-${cols.md}`);
  if (cols.lg) classes.push(`lg:grid-cols-${cols.lg}`);
  if (cols.xl) classes.push(`xl:grid-cols-${cols.xl}`);
  if (cols['2xl']) classes.push(`2xl:grid-cols-${cols['2xl']}`);
  
  // Add gap class
  if (typeof gap === 'number') {
    classes.push(`gap-${gap}`);
  } else {
    classes.push(gap);
  }
  
  return classes.join(' ');
}

/**
 * Responsive Column Counts
 */
export const columnCounts = {
  // Content layouts
  contentDefault: { default: 2, md: 3, lg: 4, xl: 6 },
  contentLarge: { default: 1, md: 2, lg: 3, xl: 4 },
  contentSmall: { default: 3, md: 4, lg: 6, xl: 8 },
  
  // Stats layouts
  stats: { default: 1, md: 2, lg: 4 },
  statsCompact: { default: 2, md: 3, lg: 4, xl: 6 },
  
  // Admin layouts
  admin: { default: 1, md: 2, lg: 3 },
  adminWide: { default: 1, md: 2 },
  
  // Form layouts
  form: { default: 1, md: 2 },
  formWide: { default: 1 }} as const;

export type ColumnCount = keyof typeof columnCounts;

/**
 * Get column count configuration
 */
export function getColumnCount(layout: ColumnCount) {
  return columnCounts[layout];
}

/**
 * Gap Sizes
 */
export const gapSizes = {
  xs: 'gap-2',
  sm: 'gap-3',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8',
  '2xl': 'gap-10'} as const;

export type GapSize = keyof typeof gapSizes;

/**
 * Get gap size class
 */
export function getGap(size: GapSize): string {
  return gapSizes[size];
}

/**
 * Responsive Grid Utilities
 */
export const gridUtils = {
  // Auto-fit grids (responsive without breakpoints)
  autoFit: (minWidth: string = '250px', gap: string = '1rem') =>
    `grid grid-cols-[repeat(auto-fit,minmax(${minWidth},1fr))] gap-[${gap}]`,
  
  // Auto-fill grids
  autoFill: (minWidth: string = '250px', gap: string = '1rem') =>
    `grid grid-cols-[repeat(auto-fill,minmax(${minWidth},1fr))] gap-[${gap}]`,
  
  // Equal columns
  equal: (cols: number, gap: GapSize = 'md') =>
    `grid grid-cols-${cols} ${getGap(gap)}`,
  
  // Responsive equal columns
  responsiveEqual: (cols: { default: number; md?: number; lg?: number; xl?: number }, gap: GapSize = 'md') => {
    const classes = [`grid`, `grid-cols-${cols.default}`, getGap(gap)];
    if (cols.md) classes.push(`md:grid-cols-${cols.md}`);
    if (cols.lg) classes.push(`lg:grid-cols-${cols.lg}`);
    if (cols.xl) classes.push(`xl:grid-cols-${cols.xl}`);
    return classes.join(' ');
  }} as const;

/**
 * Common Grid Patterns
 */
export const gridPatterns = {
  // Sidebar + Main content
  sidebarLayout: 'grid grid-cols-1 md:grid-cols-[260px_1fr] gap-0',
  sidebarLayoutWide: 'grid grid-cols-1 md:grid-cols-[300px_1fr] gap-0',
  sidebarLayoutCollapsible: 'grid grid-cols-1 md:grid-cols-[auto_1fr] gap-0',
  
  // Dashboard layouts
  dashboardTwoColumn: 'grid grid-cols-1 lg:grid-cols-2 gap-6',
  dashboardThreeColumn: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6',
  dashboardFourColumn: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6',
  
  // Asymmetric layouts
  mainSidebar: 'grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6',
  sidebarMain: 'grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6',
  
  // Gallery layouts
  galleryMasonry: 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-auto',
  gallerySquare: 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-fr',
  
  // List layouts
  listSingle: 'grid grid-cols-1 gap-3',
  listDouble: 'grid grid-cols-1 md:grid-cols-2 gap-3'} as const;

export type GridPattern = keyof typeof gridPatterns;

/**
 * Get grid pattern classes
 */
export function getGridPattern(pattern: GridPattern): string {
  return gridPatterns[pattern];
}

/**
 * Flex Grid Alternative (for complex layouts)
 */
export const flexGrids = {
  wrap: 'flex flex-wrap gap-4',
  wrapCenter: 'flex flex-wrap gap-4 justify-center',
  wrapBetween: 'flex flex-wrap gap-4 justify-between',
  wrapEvenly: 'flex flex-wrap gap-4 justify-evenly'} as const;

export type FlexGrid = keyof typeof flexGrids;

/**
 * Get flex grid classes
 */
export function getFlexGrid(grid: FlexGrid): string {
  return flexGrids[grid];
}

/**
 * Example Usage:
 * 
 * // Using predefined layouts
 * <div className={getGridLayout('content')}>
 *   {items.map(item => <Card key={item.id} />)}
 * </div>
 * 
 * // Using custom grid builder
 * <div className={buildGrid({ cols: { default: 1, md: 2, lg: 4 }, gap: 6 })}>
 *   {items.map(item => <Card key={item.id} />)}
 * </div>
 * 
 * // Using grid patterns
 * <div className={getGridPattern('sidebarLayout')}>
 *   <Sidebar />
 *   <Main />
 * </div>
 * 
 * // Using grid utilities
 * <div className={gridUtils.autoFit('300px', '1.5rem')}>
 *   {items.map(item => <Card key={item.id} />)}
 * </div>
 */

