// Validation utilities

import { z } from 'zod';
import i18n from '@/lib/i18n';

// Common validation schemas
export const usernameSchema = z
  .string()
  .min(3, i18n.t('common.invalidData'))
  .max(50, i18n.t('common.invalidData'))
  .regex(/^[a-zA-Z0-9_]+$/, i18n.t('common.invalidData'));

export const passwordSchema = z
  .string()
  .min(8, i18n.t('common.invalidData'))
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, i18n.t('common.invalidData'));

export const emailSchema = z
  .string()
  .email(i18n.t('common.invalidData'))
  .optional()
  .or(z.literal(''));

// Auth schemas
export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, i18n.t('common.invalidData'))
});

export const createUserSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  email: emailSchema,
  role: z.enum(['admin', 'reseller', 'end_user']),
  credits: z.number().min(0).optional(),
  max_devices: z.number().min(1).max(10).optional()
});

// Content schemas
export const contentSchema = z.object({
  title: z.string().min(1, i18n.t('common.invalidData')).max(255, i18n.t('common.invalidData')),
  description: z.string().max(1000, i18n.t('common.invalidData')).optional(),
  image_url: z.string().url(i18n.t('common.invalidData')).optional().or(z.literal('')),
  category_id: z.number().min(1, i18n.t('common.invalidData')),
  tmdb_id: z.number().optional(),
  year: z.number().min(1900).max(new Date().getFullYear() + 5).optional(),
  runtime: z.number().min(1).optional(),
  channel_number: z.number().min(1).optional(),
  is_live: z.boolean().optional()
});

export const seriesSchema = z.object({
  title: z.string().min(1, i18n.t('common.invalidData')).max(255, i18n.t('common.invalidData')),
  description: z.string().max(1000, i18n.t('common.invalidData')).optional(),
  image_url: z.string().url(i18n.t('common.invalidData')).optional().or(z.literal('')),
  category_id: z.number().min(1, i18n.t('common.invalidData')),
  tmdb_id: z.number().optional(),
  year: z.number().min(1900).max(new Date().getFullYear() + 5).optional(),
  total_seasons: z.number().min(1, i18n.t('common.invalidData'))
});

export const episodeSchema = z.object({
  series_id: z.number().min(1, i18n.t('common.invalidData')),
  season_id: z.number().min(1, i18n.t('common.invalidData')),
  episode_number: z.number().min(1, i18n.t('common.invalidData')),
  title: z.string().min(1, i18n.t('common.invalidData')).max(255, i18n.t('common.invalidData')),
  description: z.string().max(1000, i18n.t('common.invalidData')).optional(),
  image_url: z.string().url(i18n.t('common.invalidData')).optional().or(z.literal('')),
  runtime: z.number().min(1).optional(),
  air_date: z.string().optional()
});

// Search schema
export const searchSchema = z.object({
  q: z.string().min(1, i18n.t('common.invalidData')),
  year: z.number().min(1900).max(new Date().getFullYear() + 5).optional(),
  category_id: z.number().min(1).optional(),
  page: z.number().min(1).optional(),
  limit: z.number().min(1).max(100).optional()
});

// Validation helper functions
export function validateUsername(username: string): { isValid: boolean; error?: string } {
  try {
    usernameSchema.parse(username);
    return { isValid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { isValid: false, error: error.issues[0].message };
    }
    return { isValid: false, error: i18n.t('common.invalidData') };
  }
}

export function validatePassword(password: string): { isValid: boolean; error?: string } {
  try {
    passwordSchema.parse(password);
    return { isValid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { isValid: false, error: error.issues[0].message };
    }
    return { isValid: false, error: i18n.t('common.invalidData') };
  }
}

export function validateEmail(email: string): { isValid: boolean; error?: string } {
  if (!email) return { isValid: true }; // Email is optional

  try {
    emailSchema.parse(email);
    return { isValid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { isValid: false, error: error.issues[0].message };
    }
    return { isValid: false, error: i18n.t('errors.invalidData') };
  }
}

// Type exports for form validation
export type LoginFormData = z.infer<typeof loginSchema>;
export type CreateUserFormData = z.infer<typeof createUserSchema>;
export type ContentFormData = z.infer<typeof contentSchema>;
export type SeriesFormData = z.infer<typeof seriesSchema>;
export type EpisodeFormData = z.infer<typeof episodeSchema>;
export type SearchFormData = z.infer<typeof searchSchema>;
