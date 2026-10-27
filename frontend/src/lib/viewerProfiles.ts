export interface ViewerProfile {
  id: number;
  name: string;
  avatar: string;
  cover: string;
  favorite_genres: string[];
  is_kids: boolean;
}

export interface ViewerProfileInput {
  name: string;
  avatar?: string;
  cover?: string;
  favorite_genres?: string[];
  is_kids?: boolean;
}

export const PROFILE_AVATARS = ['🍿', '🎬', '🦊', '🐼', '🦁', '🐸', '🐱', '🐨', '🐯', '🐰'] as const;

export const PROFILE_COVERS: Record<string, string> = {
  violet: 'from-violet-700 via-fuchsia-700 to-rose-800',
  ocean: 'from-cyan-700 via-blue-800 to-indigo-950',
  sunset: 'from-orange-600 via-rose-700 to-purple-900',
  forest: 'from-emerald-700 via-teal-800 to-slate-950',
  midnight: 'from-slate-700 via-slate-900 to-black',
  gold: 'from-amber-500 via-orange-700 to-red-950',
};

export const VIEWER_GENRES = [
  { id: 'action', label: 'Ação' },
  { id: 'adventure', label: 'Aventura' },
  { id: 'comedy', label: 'Comédia' },
  { id: 'drama', label: 'Drama' },
  { id: 'scifi', label: 'Ficção científica' },
  { id: 'thriller', label: 'Suspense' },
  { id: 'romance', label: 'Romance' },
  { id: 'horror', label: 'Terror' },
  { id: 'documentary', label: 'Documentário' },
  { id: 'animation', label: 'Animação' },
  { id: 'fantasy', label: 'Fantasia' },
  { id: 'crime', label: 'Policial' },
] as const;

export function getViewerProfileStorageKey(userId: string | number): string {
  return `flowcast-active-viewer-profile:${userId}`;
}
