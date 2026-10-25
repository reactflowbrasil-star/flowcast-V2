import { z } from 'zod';
import i18n from '@/lib/i18n';

export const creditConfigSchema = z.object({
  default_devices: z.number().min(1).max(10),
  credit_per_user_3_devices: z.number().min(0),
  credit_per_user_5_devices: z.number().min(0),
  credit_per_extra_device: z.number().min(0)
});

export const tmdbConfigSchema = z
  .object({
    tmdb_api_key: z.string().optional(),
    tmdb_enabled: z.boolean(),
    tmdb_language: z.string().optional(),
    tmdb_languages: z.string().optional(),
    // Use 'online' | 'offline' to match backend config types
    tmdb_mode: z.enum(['online', 'offline']),
    tmdb_metadata_path: z.string().optional(),
    tmdb_preferred_format: z
      .enum(['original', 'webp', 'png', 'jpg'])
      .optional()
  })
  .superRefine((data, ctx) => {
    // When TMDB is enabled and running in online mode, API key is required
    if (data.tmdb_enabled && data.tmdb_mode === 'online' && !data.tmdb_api_key?.trim()) {
      ctx.addIssue({
        path: ['tmdb_api_key'],
        code: z.ZodIssueCode.custom,
        message: i18n.t('errors.invalidData')
      });
    }
    // When TMDB is configured to run in offline mode, metadata path is required
    if (data.tmdb_mode === 'offline' && !data.tmdb_metadata_path?.trim()) {
      ctx.addIssue({
        path: ['tmdb_metadata_path'],
        code: z.ZodIssueCode.custom,
        message: i18n.t('errors.invalidData')
      });
    }
  });

export type CreditConfigData = z.infer<typeof creditConfigSchema>;
export type TMDBConfigData = z.infer<typeof tmdbConfigSchema>;
