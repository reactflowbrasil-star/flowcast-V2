export interface LanguageOption {
  code: string;
  label: string;
  native_label?: string;
}

export interface DiscoveryMediaItem {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  image?: string;
  backdrop?: string;
  media_type?: string;
  content_id?: number;
  episode_id?: number;
  tmdb_id?: number;
  rating?: number;
  year?: number;
  genres?: string[];
  runtime?: number;
  provider?: string;
  channel_number?: number;
  progress?: number;
  badges?: string[];
  genre_ids?: number[];
}

export interface DiscoveryRail {
  slug: string;
  title: string;
  description?: string;
  layout?: string;
  items: DiscoveryMediaItem[];
}

export interface DiscoverySpecialSections {
  kids?: DiscoveryRail;
  anime?: DiscoveryRail;
  events?: DiscoveryRail;
  documentaries?: DiscoveryRail;
  family?: DiscoveryRail;
}

export interface LiveProgram {
  title: string;
  description?: string;
  start: string;
  end: string;
  category?: string;
}

export interface LiveChannelOverview {
  content_id: number;
  title: string;
  image?: string;
  backdrop?: string;
  provider?: string;
  channel_number?: number;
  epg: LiveProgram[];
}

export interface LiveTvOverview {
  headline?: string;
  channels: LiveChannelOverview[];
}

export interface DiscoveryOverview {
  language_options: LanguageOption[];
  tmdb_collections: DiscoveryRail[];
  ai_recommendations: DiscoveryRail[];
  special_sections: DiscoverySpecialSections;
  live_tv?: LiveTvOverview | null;
  series_highlights: DiscoveryRail[];
}
