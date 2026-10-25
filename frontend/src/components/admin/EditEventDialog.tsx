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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { contentService } from '@/services';
import { Content } from '@/types';
import { apiErrorMessage } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import i18n from '@/lib/i18n';

// Validation schema for Event editing
const editEventSchema = z.object({
  title: z.string().min(1, i18n.t('manualSeries.titleRequired')),
  description: z.string().optional(),
  poster_url: z.string().url(i18n.t('errors.invalidData')).optional().or(z.literal('')),
  video_url: z.string().url(i18n.t('seriesManagement.videoUrlRequired')),
  provider: z.string().optional(),
  country: z.string().optional(),
  format: z.enum(['DRM', 'M3U8']).optional(),
  drm_keys: z.string().optional(),
  active: z.boolean()
});

type EditEventData = z.infer<typeof editEventSchema>;

interface EditEventDialogProps {
  isOpen: boolean;
  onClose: () => void;
  content: Content;
  onSuccess: () => void;
}

export default function EditEventDialog({
  isOpen,
  onClose,
  content,
  onSuccess }: EditEventDialogProps) {
  const nsLoading = useLoadNamespace('admin/content');
  const { t, i18n } = useTranslation(['admin/content', 'admin', 'translation']);

  const form = useForm<EditEventData>({
    resolver: zodResolver(editEventSchema),
    defaultValues: {
      title: '',
      description: '',
      poster_url: '',
      video_url: '',
      provider: '',
      country: '',
      format: undefined,
      drm_keys: '',
      active: true
    }
  });

  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // Update event mutation
  const updateEventMutation = useMutation({
    mutationFn: async (data: EditEventData) => {
      const result = await contentService.updateContent(content.id, data);
      if (result.success) {
        return result.data;
      }
      throw new Error(apiErrorMessage(result.error, t('common.serverError')));
    },
    onSuccess: () => {
      onSuccess();
      onClose();
    }
  });

  // Load content data into form when dialog opens
  useEffect(() => {
    if (isOpen && content) {
      setIsDataLoaded(false);
      // Fetch content with decrypted URL for editing
      const loadContentForEdit = async () => {
        try {
          const result = await contentService.getContentForEdit(content.id);
          if (result.success) {
            const editableContent = result.data;
            form.setValue('title', editableContent.title);
            form.setValue('description', editableContent.description || '');
            form.setValue('poster_url', editableContent.poster_url || '');
            form.setValue('video_url', (editableContent as any).stream_url || editableContent.video_url || ''); // Backend returns stream_url

            form.setValue('provider', editableContent.provider || '');

            form.setValue('country', editableContent.country || '');

            form.setValue('format', editableContent.format as 'DRM' | 'M3U8' | undefined || undefined);

            form.setValue('drm_keys', editableContent.drm_keys || '');

            form.setValue('active', editableContent.active);

            // Force re-render to show conditional fields
            setIsDataLoaded(true);
          } else {
            console.error('Failed to load content for editing:', result.error);
            // Fallback to original content data - include all fields
            form.setValue('title', content.title);
            form.setValue('description', content.description || '');
            form.setValue('poster_url', content.poster_url || '');
            form.setValue('video_url', (content as any).stream_url || content.video_url || '');
            form.setValue('provider', content.provider || '');
            form.setValue('country', content.country || '');
            form.setValue('format', content.format as 'DRM' | 'M3U8' | undefined || undefined);
            form.setValue('drm_keys', content.drm_keys || '');
            form.setValue('active', content.active);
            setIsDataLoaded(true);
          }
        } catch (error) {
          console.error('Error loading content for editing:', error);
          // Fallback to original content data - include all fields
          form.setValue('title', content.title);
          form.setValue('description', content.description || '');
          form.setValue('poster_url', content.poster_url || '');
          form.setValue('video_url', (content as any).stream_url || content.video_url || '');
          form.setValue('provider', content.provider || '');
          form.setValue('country', content.country || '');
          form.setValue('format', content.format as 'DRM' | 'M3U8' | undefined || undefined);
          form.setValue('drm_keys', content.drm_keys || '');
          form.setValue('active', content.active);
          setIsDataLoaded(true);
        }
      };

      loadContentForEdit();
    } else if (!isOpen) {
      // Reset state when dialog closes
      setIsDataLoaded(false);
    }
  }, [isOpen, content]);

  const handleSubmit = (data: EditEventData) => {
    updateEventMutation.mutate(data);
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
          <DialogTitle>{t('content.editDialogs.event.title')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            {/* Title */}
            <div className="col-span-2">
              <Label htmlFor="title">{t('content.editDialogs.event.name')}</Label>
              <Input
                id="title"
                {...form.register('title')}
                placeholder={t('placeholders.enterName', {})}
              />
              {form.formState.errors.title && (
                <p className="text-sm text-red-600 mt-1">
                  {form.formState.errors.title.message}
                </p>
              )}
            </div>

            {/* Description */}
            <div className="col-span-2">
              <Label htmlFor="description">{t('content.editDialogs.event.description')}</Label>
              <Textarea
                id="description"
                {...form.register('description')}
                placeholder={t('placeholders.enterDescription', {})}
                rows={3}
              />
            </div>



            {/* Provider */}
            <div>
              <Label htmlFor="provider">{t('content.editDialogs.event.provider')}</Label>
              <Input
                id="provider"
                {...form.register('provider')}
                placeholder={t('placeholders.enterProvider', {})}
              />
            </div>

            {/* Country */}
            <div>
              <Label htmlFor="country">{t('content.editDialogs.event.country')}</Label>
              <Input
                id="country"
                {...form.register('country')}
                placeholder={t('placeholders.enterCountry', {})}
              />
            </div>

            {/* Format */}
            <div>
              <Label htmlFor="format">{t('content.editDialogs.event.format')}</Label>
              <Select
                value={form.watch('format') ?? undefined}
                onValueChange={(value) => form.setValue('format', value as 'DRM' | 'M3U8', { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('placeholders.selectFormat', {})} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="M3U8">{t('createContent.form.formatOption.m3u8')}</SelectItem>
                  <SelectItem value="DRM">{t('createContent.form.formatOption.drm')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* DRM Keys - Show only when DRM format is selected */}
            {form.watch('format') === 'DRM' && (
              <div className="col-span-2">
                <Label htmlFor="drm_keys">{t('content.editDialogs.event.clearkeyKeys')}</Label>
                <Textarea
                  id="drm_keys"
                  {...form.register('drm_keys')}
                  placeholder={t('createContent.form.drmPlaceholder', { ns: 'translation' })}
                  rows={3}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t('content.editDialogs.event.clearkeyHelp')}
                </p>
              </div>
            )}

            {/* Video URL */}
            <div className="col-span-2">
              <Label htmlFor="video_url">{t('content.editDialogs.event.streamUrl')}</Label>
              <Input
                id="video_url"
                {...form.register('video_url')}
                placeholder={t('placeholders.enterStreamUrl', {})}
              />
              {form.formState.errors.video_url && (
                <p className="text-sm text-red-600 mt-1">
                  {form.formState.errors.video_url.message}
                </p>
              )}
            </div>

            {/* Poster URL */}
            <div className="col-span-2">
              <Label htmlFor="poster_url">{t('content.editDialogs.event.posterUrl')}</Label>
              <Input
                id="poster_url"
                {...form.register('poster_url')}
                placeholder={t('placeholders.enterPosterUrl', {})}
              />
            </div>

            {/* Active */}
            <div className="col-span-2 flex items-center space-x-2">
              <Switch
                id="active"
                checked={form.watch('active')}
                onCheckedChange={(checked) => form.setValue('active', checked)}
              />
              <Label htmlFor="active">{t('content.editDialogs.event.active')}</Label>
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('content.editDialogs.event.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={updateEventMutation.isPending}
            >
              {updateEventMutation.isPending ? t('content.editDialogs.event.updating') : t('content.editDialogs.event.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
