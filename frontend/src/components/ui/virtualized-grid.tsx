import React from 'react';

interface VirtualizedGridProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  columnCount?: number;
  rowHeight?: number;
  columnWidth?: number;
  gap?: number;
  className?: string;
}

/**
 * VirtualizedGrid Component
 *
 * Renders a grid of items.
 *
 * @example
 * ```tsx
 * <VirtualizedGrid
 *   items={movies}
 *   renderItem={(movie) => <MovieCard movie={movie} />}
 *   columnCount={6}
 *   rowHeight={300}
 * />
 * ```
 */
export function VirtualizedGrid<T>({
  items,
  renderItem,
  columnCount = 6,
  gap = 16,
  className = ''}: VirtualizedGridProps<T>) {
  return (
    <div className={className} style={{ width: '100%' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
          gap: `${gap}px`}}
      >
        {items.map((item, index) => (
          <div key={index}>
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    </div>
  );
}

interface VirtualizedListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  itemHeight?: number;
  className?: string;
}

/**
 * VirtualizedList Component
 *
 * Renders a list of items.
 *
 * @example
 * ```tsx
 * <VirtualizedList
 *   items={users}
 *   renderItem={(user) => <UserRow user={user} />}
 *   itemHeight={60}
 * />
 * ```
 */
export function VirtualizedList<T>({
  items,
  renderItem,
  className = ''}: VirtualizedListProps<T>) {
  return (
    <div className={className} style={{ width: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {items.map((item, index) => (
          <div key={index}>
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    </div>
  );
}

interface ResponsiveVirtualizedGridProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  minColumnWidth?: number;
  rowHeight?: number;
  gap?: number;
  className?: string;
}

/**
 * ResponsiveVirtualizedGrid Component
 *
 * Renders a grid of items with responsive column count.
 *
 * @example
 * ```tsx
 * <ResponsiveVirtualizedGrid
 *   items={movies}
 *   renderItem={(movie) => <MovieCard movie={movie} />}
 *   minColumnWidth={200}
 *   rowHeight={300}
 * />
 * ```
 */
export function ResponsiveVirtualizedGrid<T>({
  items,
  renderItem,
  minColumnWidth = 200,
  gap = 16,
  className = ''}: ResponsiveVirtualizedGridProps<T>) {
  return (
    <div className={className} style={{ width: '100%' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fill, minmax(${minColumnWidth}px, 1fr))`,
          gap: `${gap}px`}}
      >
        {items.map((item, index) => (
          <div key={index}>
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Hook to determine if virtualization should be used
 * 
 * @param itemCount - Number of items in the list
 * @param threshold - Minimum number of items to enable virtualization (default: 100)
 * @returns boolean indicating if virtualization should be used
 */
export function useVirtualization(itemCount: number, threshold: number = 100): boolean {
  return itemCount >= threshold;
}

