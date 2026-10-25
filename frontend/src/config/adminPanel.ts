/**
 * Admin Panel specific configuration
 * Simplificado: User-Agent validation bypass eliminado
 * Admins and resellers do not require User-Agent validation based on role
 */

/**
 * Admin Panel specific headers
 */
export const getAdminHeaders = () => {
  return {
    'X-Admin-Panel': 'true', // Header identificador para el admin panel
  };
};
