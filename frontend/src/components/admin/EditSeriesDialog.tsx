'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { contentService } from '@/services';
import { Content } from '@/types';
import EpisodesManagementDialog from './EpisodesManagementDialog';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { extractErrorMessage } from '@/lib/error-message';
import i18n from '@/lib/i18n';

// Validation schema for Series editing
const editSeriesSchema = z.object({
  title: z.string().min(1, i18n.t('manualSeries.titleRequired')),
  description: z.string().optional(),
  poster_url: z.string().url(i18n.t('errors.invalidData')).optional().or(z.literal('')),
  backdrop_url: z.string().url(i18n.t('errors.invalidData')).optional().or(z.literal('')),
  year: z.number().min(1900).max(2030).optional(),
  total_seasons: z.number().min(1).optional(),
  tmdb_id: z.number().optional(),
  active: z.boolean()
});

type EditSeriesData = z.infer<typeof editSeriesSchema>;

interface EditSeriesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  content: Content;
  onSuccess: () => void;
}

export default function EditSeriesDialog({
  isOpen,
  onClose,
  content,
  onSuccess }: EditSeriesDialogProps) {
  const nsLoading = useLoadNamespace('admin/content');
  const { t, i18n } = useTranslation(['admin/content', 'admin', 'translation']);
  const [isEpisodesDialogOpen, setIsEpisodesDialogOpen] = useState(false);

  const form = useForm<EditSeriesData>({
    resolver: zodResolver(editSeriesSchema),
    defaultValues: {
      title: '',
      description: '',
      poster_url: '',
      backdrop_url: '',
      year: undefined,
      total_seasons: undefined,
      tmdb_id: undefined,
      active: true
    }
  });

  // Update series mutation
  const updateSeriesMutation = useMutation({
    mutationFn: async (data: EditSeriesData) => {
      const result = await contentService.updateContent(content.id, data);
      if (result.success) {
        return result.data;
      }
      throw new Error(extractErrorMessage(result.error, t('common.serverError')));
    },
    onSuccess: () => {
      onSuccess();
      onClose();
    }
  });

  // Load content data into form when dialog opens
  useEffect(() => {
    if (isOpen && content) {
      // Fetch content with decrypted URL for editing
      const loadContentForEdit = async () => {
        try {
          // Use contentService which has proper auth configuration
          const result = await contentService.getContentWithSeasonsForEdit(content.id);

          if (result.success) {
            const editableContent = result.data;
            form.setValue('title', editableContent.title);
            form.setValue('description', editableContent.description || '');
            form.setValue('poster_url', editableContent.image_url || '');
            form.setValue('backdrop_url', editableContent.backdrop_url || '');
            form.setValue('year', editableContent.year || undefined);
            form.setValue('total_seasons', editableContent.total_seasons || undefined);
            form.setValue('tmdb_id', editableContent.tmdb_id || undefined);
            form.setValue('active', editableContent.active);
          } else {
            console.error('Failed to load content for editing:', result.error);
            // Fallback to original content data
            form.setValue('title', content.title);
            form.setValue('description', content.description || '');
            form.setValue('poster_url', content.poster_url || '');
            form.setValue('backdrop_url', content.backdrop_url || '');
            form.setValue('year', content.year || undefined);
            form.setValue('tmdb_id', content.tmdb_id || undefined);
            form.setValue('active', content.active);
          }
        } catch (error) {
          console.error('Error loading content for editing:', error);
          // Fallback to original content data
          form.setValue('title', content.title);
          form.setValue('description', content.description || '');
          form.setValue('poster_url', content.poster_url || '');
          form.setValue('backdrop_url', content.backdrop_url || '');
          form.setValue('year', content.year || undefined);
          form.setValue('tmdb_id', content.tmdb_id || undefined);
          form.setValue('active', content.active);
        }
      };

      loadContentForEdit();
    }
  }, [isOpen, content]);

  const handleSubmit = (data: EditSeriesData) => {
    updateSeriesMutation.mutate(data);
  };

  if (isOpen && nsLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('common.loading')}</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="!max-w-[90vw] sm:!max-w-[80vw] md:!max-w-[65vw] max-h-[75vh] overflow-y-auto" style={{ maxWidth: '90vw' }}>
        <DialogHeader>
          <DialogTitle>
            {content.content_type === 'anime' ? t('content.editDialogs.series.titleAnime') : t('content.editDialogs.series.title')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            {/* Title */}
            <div className="col-span-2">
              <Label htmlFor="title">{t('content.editDialogs.series.name')}</Label>
              <Input
                id="title"
                {...form.register('title')}
                placeholder={t('placeholders.enterTitle', {})}
              />
              {form.formState.errors.title && (
                <p className="text-sm text-red-600 mt-1">
                  {form.formState.errors.title.message}
                </p>
              )}
            </div>

            {/* Description */}
            <div className="col-span-2">
              <Label htmlFor="description">{t('content.editDialogs.series.description')}</Label>
              <Textarea
                id="description"
                {...form.register('description')}
                placeholder={t('placeholders.enterDescription', {})}
                rows={3}
              />
            </div>

            {/* Year */}
            <div>
              <Label htmlFor="year">{t('content.editDialogs.series.year')}</Label>
              <Input
                id="year"
                type="number"
                {...form.register('year', { valueAsNumber: true })}
                placeholder="2024"
                min="1900"
                max="2030"
              />
            </div>

            {/* TMDB ID */}
            <div>
              <Label htmlFor="tmdb_id">{t('content.editDialogs.series.tmdbId')}</Label>
              <Input
                id="tmdb_id"
                type="number"
                {...form.register('tmdb_id', { valueAsNumber: true })}
                placeholder="123456"
              />
            </div>

            {/* Total Seasons */}
            <div>
              <Label htmlFor="total_seasons">{t('content.editDialogs.series.totalSeasons')}</Label>
              <Input
                id="total_seasons"
                type="number"
                {...form.register('total_seasons', { valueAsNumber: true })}
                placeholder="1"
                min="1"
              />
            </div>

            {/* Series Episodes Management */}
            <div className="col-span-2 p-4 rounded-lg border bg-input/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">
                    <strong>{t('content.editDialogs.series.episodesManagement')}:</strong> {t('content.editDialogs.series.episodesHelp')}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="hover:bg-accent"
                  onClick={() => setIsEpisodesDialogOpen(true)}
                >
                  {t('content.editDialogs.series.manageEpisodes')}
                </Button>
              </div>
            </div>

            {/* Poster URL */}
            <div>
              <Label htmlFor="poster_url">{t('content.editDialogs.series.posterUrl')}</Label>
              <Input
                id="poster_url"
                {...form.register('poster_url')}
                placeholder={t('createContent.form.posterUrlPlaceholder', { ns: 'translation' })}
              />
            </div>

            {/* Backdrop URL */}
            <div>
              <Label htmlFor="backdrop_url">{t('content.editDialogs.series.backdropUrl')}</Label>
              <Input
                id="backdrop_url"
                {...form.register('backdrop_url')}
                placeholder={t('createContent.form.backdropUrlPlaceholder', { ns: 'translation' })}
              />
            </div>

            {/* Active */}
            <div className="col-span-2 flex items-center space-x-2">
              <Switch
                id="active"
                checked={form.watch('active')}
                onCheckedChange={(checked) => form.setValue('active', checked)}
              />
              <Label htmlFor="active">{t('content.editDialogs.series.active')}</Label>
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('content.editDialogs.series.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={updateSeriesMutation.isPending}
            >
              {updateSeriesMutation.isPending ? t('content.editDialogs.series.updating') : t('content.editDialogs.series.save')}
            </Button>
          </div>
        </form>
      </DialogContent>

      {/* Episodes Management Dialog */}
      <EpisodesManagementDialog
        isOpen={isEpisodesDialogOpen}
        onClose={() => setIsEpisodesDialogOpen(false)}
        series={content}
        onSuccess={() => {
          // Refresh series data if needed
          onSuccess();
        }}
      />
    </Dialog>
  );
}
