/**
 * Utility functions for category display names
 * Maps database category names to user-friendly display names
 */

/**
 * Get the display name for a category
 * @param categoryName - The category name from the database
 * @returns The user-friendly display name
 */
export const getDisplayCategoryName = (categoryName: string): string => {
  switch (categoryName) {
    case 'VOD':
      return 'Movies';
    case 'Eventos':
      return 'Events';
    default:
      return categoryName;
  }
};

/**
 * Get the database name for a category from its display name
 * @param displayName - The user-friendly display name
 * @returns The database category name
 */
export const getDatabaseCategoryName = (displayName: string): string => {
  switch (displayName) {
    case 'Movies':
      return 'VOD';
    case 'Events':
      return 'Eventos';
    default:
      return displayName;
  }
};
