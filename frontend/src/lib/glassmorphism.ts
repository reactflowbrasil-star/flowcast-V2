/**
 * Glassmorphism Utility Classes
 * Provides consistent glassmorphism styles across the application
 */

export const glassClasses = {
  // Modals and dialogs - backdrop-blur-md
  modal: 'bg-slate-900/95 backdrop-blur-md border border-slate-700/50',
  
  // Cards y Contenedores - backdrop-blur-sm
  card: 'bg-slate-800/30 backdrop-blur-sm border border-slate-700/50',
  
  // Headers and navigation - backdrop-blur-md
  header: 'bg-slate-900/80 backdrop-blur-md border-b border-slate-700/50',
  
  // Overlays y Fondos - backdrop-blur-sm
  overlay: 'bg-black/60 backdrop-blur-sm',
  
  // Elementos Flotantes - backdrop-blur-md
  floating: 'bg-slate-800/50 backdrop-blur-md border border-slate-700/30',
  
  // Variantes adicionales
  cardDark: 'bg-slate-900/50 backdrop-blur-sm border border-slate-700/50',
  cardLight: 'bg-slate-700/30 backdrop-blur-sm border border-slate-600/50',
  
  // Para elementos interactivos
  cardHover: 'bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 hover:bg-slate-700/50 transition-all duration-200',
  
  // Para sidebars
  sidebar: 'bg-slate-900/90 backdrop-blur-md border-r border-slate-700/50',
  
  // Para dropdowns
  dropdown: 'bg-slate-900/95 backdrop-blur-md border border-slate-700/50 shadow-xl',
  
  // Para tooltips
  tooltip: 'bg-slate-900/90 backdrop-blur-sm border border-slate-700/50'} as const;

/**
 * Get glassmorphism class by type
 */
export function getGlassClass(type: keyof typeof glassClasses): string {
  return glassClasses[type];
}

/**
 * Combine glassmorphism class with custom classes
 */
export function withGlass(type: keyof typeof glassClasses, customClasses?: string): string {
  return `${glassClasses[type]} ${customClasses || ''}`.trim();
}

/**
 * Check if element should use glassmorphism based on context
 */
export function shouldUseGlass(_context: 'modal' | 'card' | 'header' | 'overlay' | 'floating'): boolean {
  // Could add logic here to disable glassmorphism on low-end devices
  // For now, always return true
  return true;
}

/**
 * Get appropriate text color for glassmorphism backgrounds
 */
export function getGlassTextColor(type: keyof typeof glassClasses): string {
  switch (type) {
    case 'modal':
    case 'header':
    case 'sidebar':
    case 'dropdown':
      return 'text-white';
    case 'card':
    case 'cardDark':
    case 'cardLight':
    case 'cardHover':
    case 'floating':
    case 'tooltip':
      return 'text-slate-100';
    case 'overlay':
      return 'text-white';
    default:
      return 'text-white';
  }
}

/**
 * Get appropriate secondary text color for glassmorphism backgrounds
 */
export function getGlassSecondaryTextColor(type: keyof typeof glassClasses): string {
  switch (type) {
    case 'modal':
    case 'header':
    case 'sidebar':
    case 'dropdown':
      return 'text-slate-300';
    case 'card':
    case 'cardDark':
    case 'cardLight':
    case 'cardHover':
    case 'floating':
    case 'tooltip':
      return 'text-slate-400';
    case 'overlay':
      return 'text-slate-200';
    default:
      return 'text-slate-300';
  }
}

export function generateGlassGradient(_context: CanvasRenderingContext2D, _width: number, _height: number) {
  // Implementation details omitted for brevity
  // This function is a placeholder for the actual implementation
  // which would use the context to generate a gradient
  // For now, it just returns a string
  return `linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.1) 100%)`;
}
