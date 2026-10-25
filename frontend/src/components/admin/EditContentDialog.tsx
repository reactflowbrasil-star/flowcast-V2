'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { contentService } from '@/services';
import { Content, StreamInfo } from '@/types';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { extractErrorMessage } from '@/lib/error-message';
import i18nInstance from '@/lib/i18n';

// Validation schema - allow URLs or local media paths
const editContentSchema = z.object({
  title: z.string().min(1, i18nInstance.t('manualSeries.titleRequired')),
  description: z.string().optional(),
  year: z.number().min(1900).max(new Date().getFullYear() + 5).optional(),
  poster_url: z.string().url(i18nInstance.t('errors.invalidData')).optional().or(z.literal('')),
  backdrop_url: z.string().url(i18nInstance.t('errors.invalidData')).optional().or(z.literal('')),
  video_url: z.string(),
  active: z.boolean(),
  // DRM fields
  drm_keys: z.string().optional(),
  drm_type: z.string().optional(),
  license_server_url: z.string().optional(),
  drm_headers: z.string().optional(),
  // Stream header fields
  origin: z.string().optional(),
  user_agent: z.string().optional(),
  referer: z.string().optional(),
  custom_headers: z.string().optional(),
});

type EditContentData = z.infer<typeof editContentSchema>;

interface EditContentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  content: Content;
  onSuccess: () => void;
}

export default function EditContentDialog({
  isOpen,
  onClose,
  content,
  onSuccess }: EditContentDialogProps) {
  const form = useForm<EditContentData>({
    resolver: zodResolver(editContentSchema),
    defaultValues: {
      title: '',
      description: '',
      year: undefined,
      poster_url: '',
      backdrop_url: '',
      video_url: '',
      active: true,
      drm_keys: '',
      drm_type: '',
      license_server_url: '',
      drm_headers: '',
      origin: '',
      user_agent: '',
      referer: '',
      custom_headers: '',
    }
  });

  useLoadNamespace('admin/editContent');
  const { t } = useTranslation(['admin/editContent', 'admin', 'translation']);

  // Update content mutation
  const updateContentMutation = useMutation({
    mutationFn: async (data: EditContentData) => {
      const result = await contentService.updateContent(content.id, data as any);
      if (result.success) {
        return result.data;
      }
      throw new Error(extractErrorMessage(result.error, t('common.serverError')));
    },
    onSuccess: () => {
      onSuccess();
    }
  });

  // ── Stream management state ─────────────────────────────────────────────
  const [streams, setStreams] = useState<StreamInfo[]>([]);
  const [loadingStreams, setLoadingStreams] = useState(false);
  interface NewStreamDraft {
    stream_url: string; quality: string; language: string; audio_languages: string; format: string;
    drm_keys: string; drm_type: string;
  }
  const emptyDraft: NewStreamDraft = { stream_url: '', quality: '', language: '', audio_languages: '', format: '', drm_keys: '', drm_type: '' };
  const [showAddStream, setShowAddStream] = useState(false);
  const [newStream, setNewStream] = useState<NewStreamDraft>(emptyDraft);
  const [addingStream, setAddingStream] = useState(false);
  const [uploadingStreamFile, setUploadingStreamFile] = useState(false);
  const streamFileRef = useRef<HTMLInputElement | null>(null);
  const [editingStreamId, setEditingStreamId] = useState<number | null>(null);

  // ── Subtitle state ─────────────────────────────────────────────────────
  // Track loaded subtitles for chips
  const [subtitleTracks, setSubtitleTracks] = useState<Array<{ id: number; language: string; label?: string; url?: string; }>>([]);
  // Multi-row subtitle upload
  interface SubtitleRow { id: number; language: string; file: File | null; url: string; mode: 'file' | 'url'; uploading: boolean; }
  const [subtitleRows, setSubtitleRows] = useState<SubtitleRow[]>([{ id: Date.now(), language: 'en', file: null, url: '', mode: 'file', uploading: false }]);
  const [deletingSubtitleId, setDeletingSubtitleId] = useState<number | null>(null);
  const subtitleFileRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const canUploadManualSubtitles = ['vod', 'series', 'anime', 'kids'].includes(
    String(content.content_type || '').toLowerCase()
  );

  // ── Stream CRUD functions ───────────────────────────────────────────────
  const loadStreams = useCallback(async () => {
    setLoadingStreams(true);
    try {
      const res = await contentService.getContentStreams(content.id);
      if (res.success && res.data) { setStreams(res.data); } else setStreams([]);
    } catch { setStreams([]); }
    setLoadingStreams(false);
  }, [content.id]);

  const handleAddStream = async () => {
    if (!newStream.stream_url.trim()) return;
    setAddingStream(true);
    try {
      const payload: Partial<StreamInfo> = {
        stream_url: newStream.stream_url,
        quality: newStream.quality || undefined,
        language: newStream.language || undefined,
        audio_languages: newStream.audio_languages || undefined,
        format: newStream.format || undefined,
        drm_keys: newStream.drm_keys || undefined,
        drm_type: newStream.drm_type || undefined,
        is_default: streams.length === 0,
      };
      await contentService.addContentStream(content.id, payload);
      setNewStream(emptyDraft);
      setShowAddStream(false);
      await loadStreams();
    } catch (err) { console.error('Add stream failed:', err); }
    setAddingStream(false);
  };

  const handleDeleteStream = async (streamId: number) => {
    if (!window.confirm('Delete this stream?')) return;
    try {
      await contentService.deleteContentStream(content.id, streamId);
      await loadStreams();
    } catch (err) { console.error('Delete stream failed:', err); }
  };

  const handleSetDefaultStream = async (streamId: number) => {
    try {
      await contentService.updateContentStream(content.id, streamId, { is_default: true } as Partial<StreamInfo>);
      await loadStreams();
    } catch (err) { console.error('Set default failed:', err); }
  };

  const handleEditStream = (s: StreamInfo) => {
    setEditingStreamId(s.id);
    setNewStream({
      stream_url: s.stream_url || '',
      quality: s.quality || '',
      language: s.language || '',
      audio_languages: s.audio_languages || '',
      format: s.format || '',
      drm_keys: s.drm_keys || '',
      drm_type: s.drm_type || '',
    });
    setShowAddStream(true);
  };

  const handleSaveEditStream = async () => {
    if (!editingStreamId || !newStream.stream_url.trim()) return;
    setAddingStream(true);
    try {
      const payload: Partial<StreamInfo> = {
        stream_url: newStream.stream_url,
        quality: newStream.quality || undefined,
        language: newStream.language || undefined,
        audio_languages: newStream.audio_languages || undefined,
        format: newStream.format || undefined,
        drm_keys: newStream.drm_keys || undefined,
        drm_type: newStream.drm_type || undefined,
      };
      await contentService.updateContentStream(content.id, editingStreamId, payload);
      setNewStream(emptyDraft);
      setEditingStreamId(null);
      setShowAddStream(false);
      await loadStreams();
    } catch (err) { console.error('Edit stream failed:', err); }
    setAddingStream(false);
  };

  const loadContentForEdit = useCallback(async () => {
    try {
      const result = await contentService.getContentForEdit(content.id);
      if (result.success) {
        const editableContent: any = result.data;
        form.setValue('title', editableContent.title);
        form.setValue('description', editableContent.description || '');
        form.setValue('year', editableContent.year || undefined);
        form.setValue('poster_url', editableContent.poster_url || editableContent.image_url || '');
        form.setValue('backdrop_url', editableContent.backdrop_url || '');
        form.setValue('video_url', editableContent.stream_url || editableContent.video_url || '');
        form.setValue('active', editableContent.active);
        // Load DRM values
        form.setValue('drm_keys', editableContent.drm_keys || '');
        form.setValue('drm_type', editableContent.drm_type || '');
        form.setValue('license_server_url', editableContent.license_server_url || '');
        form.setValue('drm_headers', editableContent.drm_headers || '');
        // Load stream header values
        form.setValue('origin', editableContent.origin || '');
        form.setValue('user_agent', editableContent.user_agent || '');
        form.setValue('referer', editableContent.referer || '');
        form.setValue('custom_headers', editableContent.custom_headers || '');
        // Load subtitles array if provided by backend
        if (Array.isArray(editableContent.subtitles) && editableContent.subtitles.length > 0) {
          setSubtitleTracks(editableContent.subtitles.map((s: any) => ({
            id: Number(s.id),
            language: String(s.language || '').toUpperCase(),
            label: s.label,
            url: s.url
          })));
        } else {
          // Fallback: fetch stream info to discover subtitles list if edit payload doesn't include them
          try {
            const streamRes = await contentService.getStreamUrl(content.id);
            const subs: any[] | undefined = (streamRes.success && streamRes.data && Array.isArray((streamRes.data as any).subtitles))
              ? (streamRes.data as any).subtitles
              : undefined;

            if (subs && subs.length > 0) {
              setSubtitleTracks(subs.map((s: any) => ({
                id: Number(s.id),
                language: String(s.language || '').toUpperCase(),
                label: s.label,
                url: s.url
              })));
            } else {
              setSubtitleTracks([]);
            }
          } catch {
            setSubtitleTracks([]);
          }
        }
      } else {
        console.error('Failed to load content for editing:', result.error);
        // Fallback to original content data
        form.setValue('title', content.title);
        form.setValue('description', content.description || '');
        form.setValue('year', content.year || undefined);
        form.setValue('poster_url', content.poster_url || content.image_url || '');
        form.setValue('backdrop_url', content.backdrop_url || '');
        form.setValue('video_url', (content as any).stream_url || content.video_url || '');
        form.setValue('active', content.active);
        setSubtitleTracks([]);
      }
    } catch (error) {
      console.error('Error loading content for editing:', error);
      // Fallback to original content data
      form.setValue('title', content.title);
      form.setValue('description', content.description || '');
      form.setValue('year', content.year || undefined);
      form.setValue('poster_url', content.poster_url || content.image_url || '');
      form.setValue('backdrop_url', content.backdrop_url || '');
      form.setValue('video_url', (content as any).stream_url || content.video_url || '');
      form.setValue('active', content.active);
      setSubtitleTracks([]);
    }
  }, [content, form]);

  const uploadSubtitleForRow = async (rowId: number) => {
    const row = subtitleRows.find((r) => r.id === rowId);
    if (!row || !row.language.trim()) return;

    // Validate based on mode
    if (row.mode === 'file' && !row.file) return;
    if (row.mode === 'url' && !row.url.trim()) return;

    setSubtitleRows((prev) => prev.map((r) => r.id === rowId ? { ...r, uploading: true } : r));
    try {
      let result;
      if (row.mode === 'url') {
        result = await contentService.addContentSubtitleUrl(content.id, row.language, row.url);
      } else {
        result = await contentService.uploadContentSubtitle(content.id, row.file!, row.language);
      }
      if (!result.success) {
        throw new Error(extractErrorMessage(result.error, t('common.serverError')));
      }
      // Remove the uploaded row and reload subtitles
      setSubtitleRows((prev) => {
        const remaining = prev.filter((r) => r.id !== rowId);
        return remaining.length === 0 ? [{ id: Date.now(), language: 'en', file: null, url: '', mode: 'file', uploading: false }] : remaining;
      });
      await loadContentForEdit();
    } catch (err) {
      console.error('Subtitle upload/url failed:', err);
      setSubtitleRows((prev) => prev.map((r) => r.id === rowId ? { ...r, uploading: false } : r));
    }
  };

  const addSubtitleRow = () => {
    setSubtitleRows((prev) => [...prev, { id: Date.now(), language: '', file: null, url: '', mode: 'file', uploading: false }]);
  };

  const removeSubtitleRow = (rowId: number) => {
    setSubtitleRows((prev) => {
      const remaining = prev.filter((r) => r.id !== rowId);
      return remaining.length === 0 ? [{ id: Date.now(), language: 'en', file: null, url: '', mode: 'file', uploading: false }] : remaining;
    });
  };

  const deleteSubtitleMutation = useMutation({
    mutationFn: async (subtitleId: number) => {
      const result = await contentService.deleteContentSubtitle(content.id, subtitleId);
      if (result.success) {
        return result.data;
      }
      throw new Error(extractErrorMessage(result.error, t('common.serverError')));
    },
    onMutate: (subtitleId) => {
      setDeletingSubtitleId(subtitleId);
    },
    onSuccess: async () => {
      await loadContentForEdit();
    },
    onSettled: () => {
      setDeletingSubtitleId(null);
    }
  });

  // Load content data + streams when dialog opens
  useEffect(() => {
    if (isOpen && content) {
      loadContentForEdit();
      loadStreams();
    }
  }, [content, isOpen, loadContentForEdit, loadStreams]);

  const handleSubmit = (data: EditContentData) => {
    updateContentMutation.mutate(data);
  };

  const getContentTypeLabel = () => {
    switch (content.content_type) {
      case 'vod': return t('contentType.movie');
      case 'tv': return t('contentTypeExtended.tvChannel');
      case 'series': return t('contentTypeExtended.tvSeries');
      case 'events': return t('contentTypeExtended.event');
      case 'kids': return t('contentType.kids');
      case 'anime': return t('contentTypeExtended.anime');
      default: return t('contentTypeExtended.content');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="!max-w-[90vw] sm:!max-w-[80vw] md:!max-w-[65vw] max-h-[75vh] overflow-y-auto" style={{ maxWidth: '90vw' }}>
        <DialogHeader>
          <DialogTitle>{t('common.edit')} {getContentTypeLabel()}</DialogTitle>
          <DialogDescription>
            {t('createContent.description', { type: getContentTypeLabel() })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-title">{t('createContent.labels.title')} *</Label>
              <Input
                id="edit-title"
                {...form.register('title')}
                placeholder={t('createContent.form.titlePlaceholder')}
              />
              {form.formState.errors.title && (
                <p className="text-sm text-red-600 mt-1">
                  {form.formState.errors.title.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="edit-year">{t('editContent.labels.year')}</Label>
              <Input
                id="edit-year"
                type="number"
                min="1900"
                max={new Date().getFullYear() + 5}
                {...form.register('year', { valueAsNumber: true })}
                placeholder={t('createContent.form.yearPlaceholder')}
              />
              {form.formState.errors.year && (
                <p className="text-sm text-red-600 mt-1">
                  {form.formState.errors.year.message}
                </p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="edit-description">{t('editContent.labels.description')}</Label>
            <Textarea
              id="edit-description"
              {...form.register('description')}
              placeholder={t('createContent.form.descriptionPlaceholder')}
              rows={3}
            />
          </div>

          {/* ── Multi-Stream Manager ────────────────────────────────────── */}
          <div className="rounded-md border p-3 bg-muted/10 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Streams</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowAddStream(true)}>
                <Plus className="w-4 h-4 mr-1" /> Add Stream
              </Button>
            </div>

            {loadingStreams ? (
              <p className="text-xs text-muted-foreground py-2">Loading streams…</p>
            ) : streams.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No streams yet. Add one to enable playback.</p>
            ) : (
              <div className="space-y-2">
                {streams.map((s) => (
                  <div key={s.id} className={`flex items-center gap-2 rounded border px-3 py-2 text-sm ${s.is_default ? 'border-primary bg-primary/5' : 'bg-white'}`}>
                    <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                      {s.is_default && <span className="text-[10px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded">DEFAULT</span>}
                      {s.quality && <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{s.quality}</span>}
                      {s.language && <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{s.language}</span>}
                      {s.audio_languages && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">🔊 {s.audio_languages}</span>}
                      {s.format && <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">{s.format}</span>}
                      {s.drm_type && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">🔒 {s.drm_type}</span>}
                      <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={s.stream_url}>{s.stream_url}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!s.is_default && (
                        <Button type="button" variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => handleSetDefaultStream(s.id)} title="Set as default">
                          ⭐
                        </Button>
                      )}
                      <Button type="button" variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => handleEditStream(s)} title="Edit stream">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="text-xs h-7 px-2 text-red-600 hover:text-red-700" onClick={() => handleDeleteStream(s.id)} title="Delete stream">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add Stream inline form */}
            {showAddStream && (
              <div className="rounded border border-dashed border-primary/40 p-3 bg-primary/5 space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="md:col-span-2">
                    <Label className="text-xs">Stream URL *</Label>
                    <div className="flex gap-2">
                      <Input
                        className="flex-1"
                        value={newStream.stream_url}
                        onChange={(e) => setNewStream(p => ({ ...p, stream_url: e.target.value }))}
                        placeholder="https://... or /media/..."
                        disabled={uploadingStreamFile}
                      />
                      <input
                        ref={streamFileRef}
                        type="file"
                        accept="video/*,.mkv,.avi,.ts,.m2ts"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setUploadingStreamFile(true);
                          try {
                            const result = await contentService.uploadContentVideo(content.id, file);
                            if (result.success && result.data?.path) {
                              setNewStream(p => ({ ...p, stream_url: result.data!.path }));
                            } else {
                              console.error('Upload failed:', result.error);
                            }
                          } catch (err) {
                            console.error('Upload error:', err);
                          }
                          setUploadingStreamFile(false);
                          if (streamFileRef.current) streamFileRef.current.value = '';
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        disabled={uploadingStreamFile}
                        onClick={() => streamFileRef.current?.click()}
                      >
                        {uploadingStreamFile ? (
                          <span className="animate-spin mr-1">⏳</span>
                        ) : (
                          <Upload className="w-4 h-4 mr-1" />
                        )}
                        {uploadingStreamFile ? 'Uploading…' : 'Upload File'}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Quality</Label>
                    <select
                      value={newStream.quality}
                      onChange={(e) => setNewStream(p => ({ ...p, quality: e.target.value }))}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="">—</option>
                      <option value="360p">360p</option>
                      <option value="480p">480p</option>
                      <option value="720p">720p (HD)</option>
                      <option value="1080p">1080p (Full HD)</option>
                      <option value="4K">4K (Ultra HD)</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Language</Label>
                    <Input value={newStream.language} onChange={(e) => setNewStream(p => ({ ...p, language: e.target.value }))} placeholder="ENG, ESP, LAT..." />
                  </div>
                  <div>
                    <Label className="text-xs">Audio</Label>
                    <Input value={newStream.audio_languages} onChange={(e) => setNewStream(p => ({ ...p, audio_languages: e.target.value }))} placeholder="DUAL, 5.1, ENG-LAT..." />
                  </div>
                  <div>
                    <Label className="text-xs">Format</Label>
                    <select
                      value={newStream.format}
                      onChange={(e) => setNewStream(p => ({ ...p, format: e.target.value }))}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="">—</option>
                      <option value="HLS">HLS (m3u8)</option>
                      <option value="DASH">DASH (mpd)</option>
                      <option value="FILE">File (mp4, mkv, avi…)</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">{t('editContent.drm.clearKeyKeys')}</Label>
                    <Textarea
                      value={newStream.drm_keys}
                      onChange={(e) => setNewStream(p => ({ ...p, drm_keys: e.target.value }))}
                      placeholder="kid_hex:key_hex"
                      rows={2}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">{t('editContent.drm.clearKeyFormat')} — one per line</p>
                  </div>
                  <div>
                    <Label className="text-xs">{t('editContent.drm.drmType')}</Label>
                    <select
                      value={newStream.drm_type}
                      onChange={(e) => setNewStream(p => ({ ...p, drm_type: e.target.value }))}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="">{t('editContent.drm.noDrm')}</option>
                      <option value="clearkey">{t('editContent.drm.clearkey')}</option>
                      <option value="widevine">{t('editContent.drm.widevine')}</option>
                      <option value="playready">{t('editContent.drm.playready')}</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  {editingStreamId ? (
                    <Button type="button" size="sm" onClick={handleSaveEditStream} disabled={addingStream || !newStream.stream_url.trim()}>
                      {addingStream ? '⏳' : <Pencil className="w-4 h-4 mr-1" />} Update Stream
                    </Button>
                  ) : (
                    <Button type="button" size="sm" onClick={handleAddStream} disabled={addingStream || !newStream.stream_url.trim()}>
                      {addingStream ? '⏳' : <Plus className="w-4 h-4 mr-1" />} Save Stream
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setShowAddStream(false); setNewStream(emptyDraft); setEditingStreamId(null); }}>Cancel</Button>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-poster-url">{t('createContent.labels.posterUrl')}</Label>
              <Input
                id="edit-poster-url"
                {...form.register('poster_url')}
                placeholder={t('createContent.form.posterUrlPlaceholder')}
              />
              {form.formState.errors.poster_url && (
                <p className="text-sm text-red-600 mt-1">
                  {form.formState.errors.poster_url.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="edit-backdrop-url">{t('createContent.labels.backdropUrl')}</Label>
              <Input
                id="edit-backdrop-url"
                {...form.register('backdrop_url')}
                placeholder={t('createContent.form.backdropUrlPlaceholder')}
              />
              {form.formState.errors.backdrop_url && (
                <p className="text-sm text-red-600 mt-1">
                  {form.formState.errors.backdrop_url.message}
                </p>
              )}
            </div>
          </div>

          {/* Subtitles chips */}
          <div className="mt-3">
            <Label>{t('editContent.labels.subtitles')}</Label>
            {subtitleTracks.length === 0 ? (
              <p className="text-xs text-muted-foreground mt-1">{t('editContent.noSubtitles')}</p>
            ) : (
              <div className="flex flex-wrap gap-2 mt-1">
                {subtitleTracks.map((s) => (
                  <div
                    key={s.id}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border bg-white"
                    title={s.label || s.language}
                  >
                    <a
                      href={s.url || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 hover:text-primary transition"
                    >
                      <span className="font-mono">{s.language}</span>
                      {s.label ? <span className="text-muted-foreground">({s.label})</span> : null}
                    </a>
                    <button
                      type="button"
                      className="text-red-600 hover:text-red-700 disabled:opacity-50"
                      onClick={() => {
                        const confirmed = window.confirm(`${t('common.delete')} ${t('editContent.labels.subtitles').toLowerCase()} ${s.language}?`);
                        if (confirmed) {
                          deleteSubtitleMutation.mutate(s.id);
                        }
                      }}
                      disabled={deleteSubtitleMutation.isPending && deletingSubtitleId === s.id}
                      title={`${t('common.delete')} ${t('editContent.labels.subtitles').toLowerCase()}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {canUploadManualSubtitles ? (
              <div className="mt-3 rounded-md border p-3 bg-muted/20 space-y-2">
                {subtitleRows.map((row, idx) => (
                  <div key={row.id} className="grid grid-cols-1 md:grid-cols-[110px_auto_1fr_auto_auto] gap-2 items-end">
                    <div>
                      {idx === 0 && <Label htmlFor={`subtitle-lang-${row.id}`}>{t('common.language')}</Label>}
                      <Input
                        id={`subtitle-lang-${row.id}`}
                        value={row.language}
                        onChange={(e) => setSubtitleRows((prev) => prev.map((r) => r.id === row.id ? { ...r, language: e.target.value.trim().toLowerCase() } : r))}
                        placeholder={t('editContent.subtitleLanguagePlaceholder')}
                        maxLength={16}
                        disabled={row.uploading}
                      />
                    </div>
                    <div>
                      {idx === 0 && <Label className="text-xs">&nbsp;</Label>}
                      <Button
                        type="button"
                        size="sm"
                        variant={row.mode === 'url' ? 'default' : 'outline'}
                        className="text-xs px-2 h-9 w-full"
                        onClick={() => setSubtitleRows((prev) => prev.map((r) => r.id === row.id ? { ...r, mode: r.mode === 'file' ? 'url' : 'file' } : r))}
                        disabled={row.uploading}
                        title="Toggle File / URL mode"
                      >
                        {row.mode === 'url' ? '🔗 URL' : '📁 File'}
                      </Button>
                    </div>
                    <div>
                      {row.mode === 'file' ? (
                        <>
                          {idx === 0 && <Label htmlFor={`subtitle-file-${row.id}`}>{t('editContent.labels.subtitles')} (.srt/.vtt)</Label>}
                          <Input
                            id={`subtitle-file-${row.id}`}
                            ref={(el) => { subtitleFileRefs.current[row.id] = el; }}
                            type="file"
                            accept=".srt,.vtt,text/vtt,application/x-subrip"
                            onChange={(e) => setSubtitleRows((prev) => prev.map((r) => r.id === row.id ? { ...r, file: e.target.files?.[0] ?? null } : r))}
                            disabled={row.uploading}
                          />
                        </>
                      ) : (
                        <>
                          {idx === 0 && <Label htmlFor={`subtitle-url-${row.id}`}>Subtitle URL (.srt/.vtt)</Label>}
                          <Input
                            id={`subtitle-url-${row.id}`}
                            value={row.url}
                            onChange={(e) => setSubtitleRows((prev) => prev.map((r) => r.id === row.id ? { ...r, url: e.target.value } : r))}
                            placeholder="https://example.com/subtitles/en.srt"
                            disabled={row.uploading}
                          />
                        </>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => uploadSubtitleForRow(row.id)}
                      disabled={row.uploading || (!row.file && row.mode === 'file') || (!row.url.trim() && row.mode === 'url') || !row.language.trim()}
                      title={row.mode === 'url' ? `Add URL ${row.language || '...'}` : `${t('common.upload')} ${row.language || '...'}`}
                    >
                      {row.uploading ? (
                        <span className="animate-spin text-xs">⏳</span>
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                    </Button>
                    {subtitleRows.length > 1 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeSubtitleRow(row.id)}
                        disabled={row.uploading}
                        title={t('common.delete')}
                      >
                        <X className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  onClick={addSubtitleRow}
                >
                  <Plus className="w-4 h-4 mr-1" /> {t('editContent.labels.subtitles')}
                </Button>
                {deleteSubtitleMutation.error ? (
                  <p className="text-sm text-red-600 mt-2">
                    {(deleteSubtitleMutation.error as Error).message}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* DRM Settings — only when no multi-streams (content-level DRM) */}
          {streams.length === 0 && (
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">🔒</span>
                <h3 className="text-sm font-semibold">{t('editContent.drm.sectionTitle')}</h3>
                <span className="text-xs text-muted-foreground">{t('editContent.drm.optional')}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-drm-type">{t('editContent.drm.drmType')}</Label>
                  <select
                    id="edit-drm-type"
                    {...form.register('drm_type')}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">{t('editContent.drm.noDrm')}</option>
                    <option value="clearkey">{t('editContent.drm.clearkey')}</option>
                    <option value="widevine">{t('editContent.drm.widevine')}</option>
                    <option value="playready">{t('editContent.drm.playready')}</option>
                  </select>
                </div>
              </div>

              {form.watch('drm_type') === 'clearkey' && (
                <div className="mt-3">
                  <Label htmlFor="edit-drm-keys">{t('editContent.drm.clearKeyKeys')}</Label>
                  <Input
                    id="edit-drm-keys"
                    {...form.register('drm_keys')}
                    placeholder="kid_hex:key_hex"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">{t('editContent.drm.clearKeyFormat')}</p>
                </div>
              )}

              {(form.watch('drm_type') === 'widevine' || form.watch('drm_type') === 'playready') && (
                <div className="mt-3 space-y-3">
                  <div>
                    <Label htmlFor="edit-license-server">{t('editContent.drm.licenseServerUrl')}</Label>
                    <Input
                      id="edit-license-server"
                      {...form.register('license_server_url')}
                      placeholder="https://license.example.com/wv"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-drm-headers">{t('editContent.drm.drmHeadersJson')}</Label>
                    <Textarea
                      id="edit-drm-headers"
                      {...form.register('drm_headers')}
                      placeholder='{"X-Custom-Header": "value"}'
                      rows={2}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">{t('editContent.drm.licenseHeadersNote')}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Advanced Stream Settings */}
          <details className="border-t pt-4">
            <summary className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
              <span>⚙️</span> {t('editContent.streamHeaders.sectionTitle')}
            </summary>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-origin">{t('editContent.streamHeaders.origin')}</Label>
                <Input
                  id="edit-origin"
                  {...form.register('origin')}
                  placeholder="https://example.com"
                />
                <p className="text-xs text-gray-500 mt-1">{t('editContent.streamHeaders.originNote')}</p>
              </div>
              <div>
                <Label htmlFor="edit-user-agent">{t('editContent.streamHeaders.userAgent')}</Label>
                <Input
                  id="edit-user-agent"
                  {...form.register('user_agent')}
                  placeholder="Mozilla/5.0..."
                />
              </div>
              <div>
                <Label htmlFor="edit-referer">{t('editContent.streamHeaders.referer')}</Label>
                <Input
                  id="edit-referer"
                  {...form.register('referer')}
                  placeholder="https://example.com/"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="edit-custom-headers">{t('editContent.streamHeaders.customHeaders')}</Label>
                <Textarea
                  id="edit-custom-headers"
                  {...form.register('custom_headers')}
                  placeholder='{"X-Custom-Header": "value"}'
                  rows={2}
                  className="font-mono text-sm"
                />
              </div>
            </div>
          </details>

          <div className="flex items-center space-x-2">
            <Switch
              id="edit-active"
              checked={form.watch('active')}
              onCheckedChange={(checked) => form.setValue('active', checked)}
            />
            <Label htmlFor="edit-active">{t('common.active')}</Label>
          </div>

          {content.tmdb_id && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {t('admin:content.tmdb.confirm', { category: getContentTypeLabel() })} ID: {content.tmdb_id}. {t('admin:content.tmdb.warning', { count: 0 })}
              </AlertDescription>
            </Alert>
          )}

          {updateContentMutation.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {updateContentMutation.error.message}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={updateContentMutation.isPending}
            >
              {updateContentMutation.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
