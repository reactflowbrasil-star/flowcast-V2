'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Upload } from 'lucide-react';
import { contentService } from '@/services';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { extractErrorMessage } from '@/lib/error-message';

type FormData = {
  text: string;
  provider?: string;
  description?: string;
  format?: 'DRM' | 'M3U8';
  country?: string;
  start_channel_number?: number;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export default function BulkImportTVChannelsDialog({ open, onOpenChange, onSuccess }: Props) {
  useLoadNamespace('admin/bulkImportTVChannels');
  const { t } = useTranslation(['admin/bulkImportTVChannels', 'admin', 'translation']);
  const [form, setForm] = useState<FormData>({ text: '', provider: '', description: '', format: 'DRM', country: '', start_channel_number: undefined });
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Store result if you need to show a summary in the future

  const schema = z.object({
    text: z.string().min(1, t('bulkImportTVChannels.validation.pasteM3uContent')),
    provider: z.string().optional(),
    description: z.string().optional(),
    format: z.enum(['DRM', 'M3U8']).optional(),
    country: z.string().optional(),
    start_channel_number: z
      .string()
      .optional()
      .transform((v) => (v && v.trim() !== '' ? Number(v) : undefined))
      .refine((v) => v === undefined || (Number.isInteger(v) && v > 0), t('bulkImportTVChannels.validation.mustBePositiveNumber'))
  });

  const mutation = useMutation({
    mutationFn: async () => {
      setError(null);
      const parsed = schema.safeParse(form);
      if (!parsed.success) {
        const first = (parsed.error as z.ZodError<FormData>)?.issues?.[0]?.message;
        throw new Error(first || t('bulkImportTVChannels.validation.invalidData'));
      }
      const payload = {
        text: parsed.data.text,
        provider: parsed.data.provider || undefined,
        description: parsed.data.description || undefined,
        format: parsed.data.format || undefined,
        country: parsed.data.country || undefined,
        start_channel_number: parsed.data.start_channel_number};
      const res = await contentService.bulkImportTVChannels(payload);
      if (!res.success) {
        throw new Error(extractErrorMessage(res.error, t('bulkImportTVChannels.validation.bulkImportFailed')));
      }
      return res.data || [];
    },
    onSuccess: () => {
      onSuccess();
      onOpenChange(false);
      setForm({ text: '', provider: form.provider, description: '', format: form.format, country: form.country, start_channel_number: undefined });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : t('bulkImportTVChannels.validation.unknownError');
      setError(msg);
    }});

  const handleChooseFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const fileText = await file.text();
      setError(null);
      setForm((f) => ({ ...f, text: fileText }));
    } catch {
      setError(t('bulkImportTVChannels.validation.fileReadFailed'));
    } finally {
      e.target.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('bulkImportTVChannels.title')}</DialogTitle>
          <DialogDescription>{t('bulkImportTVChannels.description')}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" className="mb-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>{t('bulkImportTVChannels.labels.format')}</Label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="format"
                  checked={form.format === 'DRM'}
                  onChange={() => setForm((f) => ({ ...f, format: 'DRM' }))}
                />
                DRM
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="format"
                  checked={form.format === 'M3U8'}
                  onChange={() => setForm((f) => ({ ...f, format: 'M3U8' }))}
                />
                M3U8
              </label>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>{t('bulkImportTVChannels.labels.provider')}</Label>
            <Input value={form.provider || ''} onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))} placeholder={t('bulkImportTVChannels.placeholders.provider')} />
          </div>

            <div className="grid gap-2">
              <Label>{t('bulkImportTVChannels.labels.globalDescription')}</Label>
              <Input value={form.description || ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder={t('bulkImportTVChannels.placeholders.description')} />
            </div>

          <div className="grid gap-2">
            <Label>{t('bulkImportTVChannels.labels.country')}</Label>
            <Input value={form.country || ''} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} placeholder={t('bulkImportTVChannels.placeholders.country')} />
          </div>

          <div className="grid gap-2">
            <Label>{t('bulkImportTVChannels.labels.startChannelNumber')}</Label>
            <Input
              type="number"
              min={1}
              value={form.start_channel_number ? String(form.start_channel_number) : ''}
              onChange={(e) => setForm((f) => ({ ...f, start_channel_number: e.target.value ? Number(e.target.value) : undefined }))}
              placeholder={t('bulkImportTVChannels.placeholders.startChannelNumber')}
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <Label>{t('bulkImportTVChannels.labels.m3uList')}</Label>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".m3u,.m3u8,text/plain"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button type="button" size="sm" variant="outline" onClick={handleChooseFile}>
                  {t('bulkImportTVChannels.buttons.chooseFile')}
                </Button>
              </div>
            </div>
            <Textarea
              rows={12}
              value={form.text}
              onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
              className="h-64 max-h-[60vh] overflow-y-auto resize-y"
              placeholder={`#EXTM3U\n\n#EXTINF:-1 tvg-name="STARZ COMEDY" tvg-logo="https://...",STARZ COMEDY\n#KODIPROP:inputstream.adaptive.license_type=clearkey\n#KODIPROP:inputstream.adaptive.license_key=KID:KEY o {"kid":"key"}\nhttps://.../cenc.mpd`}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>{t('bulkImportTVChannels.buttons.cancel')}</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            <Upload className="h-4 w-4 mr-2" />
            {t('bulkImportTVChannels.buttons.import')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
