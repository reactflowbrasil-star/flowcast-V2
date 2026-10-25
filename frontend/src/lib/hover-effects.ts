/**
 * Hover Effects Utility Classes
 * Provides consistent hover effects across the application
 */

export const hoverEffects = {
  // Card hover effects
  card: 'hover:bg-slate-700/50 transition-all duration-200',
  cardScale: 'hover:bg-slate-700/50 hover:scale-105 transition-all duration-200',
  cardGlow: 'hover:bg-slate-700/50 hover:shadow-lg hover:shadow-blue-500/20 transition-all duration-200',
  
  // Button hover effects
  button: 'hover:opacity-90 transition-opacity duration-200',
  buttonScale: 'hover:scale-105 transition-transform duration-200',
  buttonGlow: 'hover:shadow-lg transition-shadow duration-200',
  
  // Link hover effects
  link: 'hover:text-blue-400 transition-colors duration-200',
  linkUnderline: 'hover:underline transition-all duration-200',
  
  // Icon hover effects
  icon: 'hover:text-white transition-colors duration-200',
  iconScale: 'hover:scale-110 transition-transform duration-200',
  iconRotate: 'hover:rotate-12 transition-transform duration-200',
  
  // Image hover effects
  image: 'hover:opacity-80 transition-opacity duration-200',
  imageScale: 'hover:scale-110 transition-transform duration-300',
  imageZoom: 'hover:scale-105 transition-transform duration-200',
  
  // Background hover effects
  bgHover: 'hover:bg-slate-800/50 transition-colors duration-200',
  bgHoverLight: 'hover:bg-slate-700/30 transition-colors duration-200',
  bgHoverDark: 'hover:bg-slate-900/70 transition-colors duration-200',
  
  // Border hover effects
  border: 'hover:border-blue-500 transition-colors duration-200',
  borderGlow: 'hover:border-blue-500 hover:shadow-sm hover:shadow-blue-500/50 transition-all duration-200',
  
  // Text hover effects
  text: 'hover:text-white transition-colors duration-200',
  textGlow: 'hover:text-white hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)] transition-all duration-200',
  
  // Combined effects
  cardInteractive: 'hover:bg-slate-700/50 hover:scale-[1.02] hover:shadow-lg transition-all duration-200 cursor-pointer',
  cardClickable: 'hover:bg-slate-700/50 active:scale-95 transition-all duration-200 cursor-pointer',
  
  // Subtle effects
  subtle: 'hover:bg-slate-800/30 transition-colors duration-200',
  subtleScale: 'hover:scale-[1.01] transition-transform duration-200',
  
  // Intense effects
  intense: 'hover:bg-blue-600/20 hover:scale-105 hover:shadow-xl hover:shadow-blue-500/30 transition-all duration-200'} as const;

export type HoverEffect = keyof typeof hoverEffects;

/**
 * Get hover effect class by type
 */
export function getHoverEffect(effect: HoverEffect): string {
  return hoverEffects[effect];
}

/**
 * Combine hover effect with custom classes
 */
export function withHoverEffect(effect: HoverEffect, customClasses?: string): string {
  return `${hoverEffects[effect]} ${customClasses || ''}`.trim();
}

/**
 * Get appropriate hover effect for component type
 */
export function getComponentHoverEffect(
  component: 'card' | 'button' | 'link' | 'icon' | 'image'
): string {
  switch (component) {
    case 'card':
      return hoverEffects.cardScale;
    case 'button':
      return hoverEffects.button;
    case 'link':
      return hoverEffects.link;
    case 'icon':
      return hoverEffects.iconScale;
    case 'image':
      return hoverEffects.imageZoom;
    default:
      return hoverEffects.subtle;
  }
}

/**
 * Hover effect presets for common use cases
 */
export const hoverPresets = {
  // Cards
  contentCard: hoverEffects.cardScale,
  statsCard: hoverEffects.cardGlow,
  miniCard: hoverEffects.cardInteractive,
  
  // Buttons
  primaryButton: hoverEffects.button,
  iconButton: hoverEffects.iconScale,
  
  // Lists
  listItem: hoverEffects.bgHover,
  listItemClickable: hoverEffects.cardClickable,
  
  // Images
  thumbnail: hoverEffects.imageZoom,
  cover: hoverEffects.imageScale,
  
  // Links
  navLink: hoverEffects.link,
  textLink: hoverEffects.linkUnderline} as const;

