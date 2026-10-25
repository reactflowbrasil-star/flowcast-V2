'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { VideoUploadField } from '@/components/ui/video-upload-field';
import { Film, Baby, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { contentService } from '@/services';
import { ContentType } from '@/types';
import { toast } from 'sonner';
import i18n from '@/lib/i18n';

// Manual movie schema - allows pending upload marker or valid URL
const manualMovieSchema = z.object({
  title: z.string().min(1, i18n.t('manualSeries.titleRequired')),
  description: z.string().optional(),
  year: z.number().min(1900).max(new Date().getFullYear() + 5).optional(),
  poster_url: z.string().refine(
    (val) => !val || val.startsWith('http://') || val.startsWith('https://') || val.startsWith('/'),
    i18n.t('errors.invalidData')
  ).optional().or(z.literal('')),
  backdrop_url: z.string().refine(
    (val) => !val || val.startsWith('http://') || val.startsWith('https://') || val.startsWith('/'),
    i18n.t('errors.invalidData')
  ).optional().or(z.literal('')),
  video_url: z.string().min(1, i18n.t('seriesManagement.videoUrlRequired')),
  active: z.boolean()
});

type ManualMovieData = z.infer<typeof manualMovieSchema>;

interface ManualMovieFormProps {
  contentType: ContentType.VOD | ContentType.KIDS;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
}

export default function ManualMovieForm({
  contentType,
  open,
  onOpenChange,
  onClose
}: ManualMovieFormProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const [pendingSubtitleFile, setPendingSubtitleFile] = useState<File | null>(null);
  const [subtitleLanguage, setSubtitleLanguage] = useState('en');

  const form = useForm<ManualMovieData>({
    resolver: zodResolver(manualMovieSchema),
    defaultValues: {
      title: '',
      description: '',
      year: undefined,
      poster_url: '',
      backdrop_url: '',
      video_url: '',
      active: true
    }
  });

  // Create content mutation
  const createContentMutation = useMutation({
    mutationFn: async (data: ManualMovieData) => {
      const result = await contentService.createContent({
        ...data,
        type: contentType
      });

      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content', contentType] });
      toast.success(t('common.success'));
      handleClose();
    },
    onError: (error: Error) => {
      toast.error(t('notifications.content.createFailed', { message: error.message }));
    }
  });

  const handleClose = () => {
    onClose();
    form.reset();
    setPendingUploadFile(null);
    setPendingSubtitleFile(null);
    setSubtitleLanguage('en');
    createContentMutation.reset();
  };

  const handleSubmit = async (data: ManualMovieData) => {
    try {
      const shouldUploadVideo = !!pendingUploadFile && data.video_url.startsWith('[Pending Upload]');

      // Create content
      const result = await contentService.createContent({
        ...data,
        video_url: shouldUploadVideo ? '' : data.video_url,
        type: contentType
      });

      if (!result.success || !result.data) {
        throw new Error(result.error?.details || t('common.serverError'));
      }

      // Upload video file if pending
      if (shouldUploadVideo && pendingUploadFile) {
        const uploadResult = await contentService.uploadContentVideo(
          result.data.id,
          pendingUploadFile
        );
        if (!uploadResult.success) {
          throw new Error(uploadResult.error?.details || t('common.serverError'));
        }
      }

      // Upload subtitle file if selected
      if (pendingSubtitleFile) {
        const subtitleResult = await contentService.uploadContentSubtitle(
          result.data.id,
          pendingSubtitleFile,
          subtitleLanguage || 'en'
        );
        if (!subtitleResult.success) {
          throw new Error(subtitleResult.error?.details || t('common.serverError'));
        }
      }

      queryClient.invalidateQueries({ queryKey: ['content', contentType] });
      toast.success(t('common.success'));
      handleClose();
    } catch (error) {
      toast.error(t('notifications.content.createFailed', {
        message: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  };

  const getContentTypeInfo = () => {
    switch (contentType) {
      case ContentType.VOD:
        return {
          icon: Film,
          title: t('contentType.movie'),
          description: t('createContent.manualAlert'),
          color: 'bg-blue-500'
        };
      case ContentType.KIDS:
        return {
          icon: Baby,
          title: t('contentType.kids'),
          description: t('createContent.manualAlert'),
          color: 'bg-green-500'
        };
      default:
        return {
          icon: Film,
          title: t('contentType.movie'),
          description: t('createContent.manualAlert'),
          color: 'bg-gray-500'
        };
    }
  };

  const getContentTypeLabel = () => {
    return contentType === ContentType.VOD ? t('contentType.movie') : t('contentType.kids');
  };

  const contentInfo = getContentTypeInfo();

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DialogContent className="!max-w-[90vw] sm:!max-w-[80vw] md:!max-w-[65vw] max-h-[75vh] overflow-y-auto" style={{ maxWidth: '90vw' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <contentInfo.icon className="h-5 w-5" />
            {t('createContent.addNew', { type: contentInfo.title })}
          </DialogTitle>
          <DialogDescription>
            {contentInfo.description}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                {t('common.details')}
              </CardTitle>
              <CardDescription>
                {t('createContent.manualAlert')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Title */}
              <div>
                <Label htmlFor="title">{t('createContent.labels.title')} *</Label>
                <Input
                  id="title"
                  {...form.register('title')}
                  placeholder={t('createContent.form.titlePlaceholder')}
                />
                {form.formState.errors.title && (
                  <p className="text-sm text-red-600 mt-1">
                    {form.formState.errors.title.message}
                  </p>
                )}
              </div>

              {/* Description */}
              <div>
                <Label htmlFor="description">{t('createContent.labels.description')}</Label>
                <Textarea
                  id="description"
                  {...form.register('description')}
                  placeholder={t('createContent.form.descriptionPlaceholder')}
                  rows={3}
                />
              </div>

              {/* Year */}
              <div>
                <Label htmlFor="year">{t('createContent.labels.year')}</Label>
                <Input
                  id="year"
                  type="number"
                  {...form.register('year', { valueAsNumber: true })}
                  placeholder={t('createContent.form.yearPlaceholder')}
                />
              </div>

              {/* Poster URL */}
              <div>
                <Label htmlFor="poster_url">{t('createContent.labels.posterUrl')}</Label>
                <Input
                  id="poster_url"
                  {...form.register('poster_url')}
                  placeholder={t('createContent.form.posterUrlPlaceholder')}
                />
                {form.formState.errors.poster_url && (
                  <p className="text-sm text-red-600 mt-1">
                    {form.formState.errors.poster_url.message}
                  </p>
                )}
              </div>

              {/* Backdrop URL */}
              <div>
                <Label htmlFor="backdrop_url">{t('createContent.labels.backdropUrl')}</Label>
                <Input
                  id="backdrop_url"
                  {...form.register('backdrop_url')}
                  placeholder={t('createContent.form.backdropUrlPlaceholder')}
                />
                {form.formState.errors.backdrop_url && (
                  <p className="text-sm text-red-600 mt-1">
                    {form.formState.errors.backdrop_url.message}
                  </p>
                )}
              </div>

              {/* Video URL or Upload */}
              <div>
                <Label htmlFor="video_url">{t('createContent.labels.videoUrl')} *</Label>
                <VideoUploadField
                  value={form.watch('video_url')}
                  onChange={(value) => {
                    form.setValue('video_url', value);
                    // Check if this is a file selection
                    if (value.startsWith('[Pending Upload]')) {
                      // Keep track that we have a pending file
                    }
                  }}
                  onUpload={async (file) => {
                    // Store file for later upload after content creation
                    setPendingUploadFile(file);
                    return `[Pending Upload] ${file.name}`;
                  }}
                  disabled={createContentMutation.isPending}
                  placeholder={t('createContent.form.videoUrlPlaceholder')}
                  error={form.formState.errors.video_url?.message}
                />
              </div>

              {/* Subtitle Upload (Optional) */}
              <div className="rounded-md border p-3 bg-muted/20 space-y-3">
                <Label className="text-sm font-medium">{t('createContent.labels.externalSubtitleOptional')}</Label>
                <div className="grid grid-cols-1 md:grid-cols-[110px_1fr] gap-2 items-end">
                  <div>
                    <Label htmlFor="subtitle_language" className="text-xs">{t('common.language')}</Label>
                    <Input
                      id="subtitle_language"
                      value={subtitleLanguage}
                      onChange={(e) => setSubtitleLanguage(e.target.value.trim().toLowerCase())}
                      placeholder={t('createContent.form.subtitleLanguagePlaceholder')}
                      maxLength={16}
                    />
                  </div>
                  <div>
                    <Label htmlFor="subtitle_file" className="text-xs">{t('createContent.labels.subtitleFile')}</Label>
                    <Input
                      id="subtitle_file"
                      type="file"
                      accept=".srt,.vtt,text/vtt,application/x-subrip"
                      onChange={(e) => setPendingSubtitleFile(e.target.files?.[0] ?? null)}
                    />
                  </div>
                </div>
              </div>

              {/* Active Status */}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="active"
                  {...form.register('active')}
                  className="rounded"
                />
                <Label htmlFor="active">{t('common.active')}</Label>
              </div>
            </CardContent>
          </Card>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={createContentMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={createContentMutation.isPending}
            >
              {createContentMutation.isPending ? t('createContent.creating') : t('createContent.createButton', { type: getContentTypeLabel() })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
