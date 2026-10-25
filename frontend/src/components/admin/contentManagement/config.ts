import type { ComponentProps } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Baby, Film, Gamepad2, Heart, Play, Tv } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContentType } from '@/types';

export type CategoryConfig = {
  type: ContentType;
  icon: LucideIcon;
  labelKey: string;
  descriptionKey: string;
  tmdbType?: string;
};

export type ActionConfig = {
  key: string;
  label: string;
  onSelect: () => void;
  icon?: LucideIcon;
  iconClassName?: string;
  variant?: ComponentProps<typeof Button>['variant'];
  className?: string;
  disabled?: boolean;
};

export const CATEGORY_CONFIG: CategoryConfig[] = [
  {
    type: ContentType.VOD,
    icon: Film,
    labelKey: 'content.categories.vod.label',
    descriptionKey: 'content.categories.vod.description',
    tmdbType: 'VOD'},
  {
    type: ContentType.TV,
    icon: Tv,
    labelKey: 'content.categories.tv.label',
    descriptionKey: 'content.categories.tv.description',
    tmdbType: 'TV'},
  {
    type: ContentType.SERIES,
    icon: Play,
    labelKey: 'content.categories.series.label',
    descriptionKey: 'content.categories.series.description',
    tmdbType: 'Series'},
  {
    type: ContentType.EVENTS,
    icon: Heart,
    labelKey: 'content.categories.events.label',
    descriptionKey: 'content.categories.events.description'},
  {
    type: ContentType.KIDS,
    icon: Baby,
    labelKey: 'content.categories.kids.label',
    descriptionKey: 'content.categories.kids.description'},
  {
    type: ContentType.ANIME,
    icon: Gamepad2,
    labelKey: 'content.categories.anime.label',
    descriptionKey: 'content.categories.anime.description',
    tmdbType: 'Anime'},
];
