'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Upload, CheckCircle2 } from 'lucide-react';
import { contentService } from '@/services';
import { useTranslation } from 'react-i18next';
import { extractErrorMessage } from '@/lib/error-message';
import useLoadNamespace from '@/hooks/useLoadNamespace';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
    /** Backend category_type: 'vod', 'series', 'kids', 'anime' */
    contentType: string;
    /** Human-readable label for this content type, e.g. "Movies", "Series", "Kids", "Anime" */
    categoryLabel: string;
}

export default function BulkImportContentDialog({ open, onOpenChange, onSuccess, contentType, categoryLabel }: Props) {
    useLoadNamespace('admin/bulkImportContent');
    const { t } = useTranslation(['admin/bulkImportContent', 'translation']);
    const [text, setText] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [importResult, setImportResult] = useState<{ total: number; success: number; failed: number } | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const schema = z.object({
        text: z.string().min(1, t('bulkImportContent.validation.pasteM3uContent')),
    });

    const mutation = useMutation({
        mutationFn: async () => {
            setError(null);
            setImportResult(null);
            const parsed = schema.safeParse({ text });
            if (!parsed.success) {
                const first = parsed.error.issues?.[0]?.message;
                throw new Error(first || t('bulkImportContent.validation.invalidData'));
            }
            const res = await contentService.bulkImportContent({
                text: parsed.data.text,
                category_type: contentType,
            });
            if (!res.success) {
                throw new Error(extractErrorMessage(res.error, t('bulkImportContent.validation.importFailed')));
            }
            const items = res.data || [];
            const successCount = items.filter(i => !i.error).length;
            const failedCount = items.filter(i => i.error).length;
            setImportResult({ total: items.length, success: successCount, failed: failedCount });
            return items;
        },
        onSuccess: () => {
            onSuccess();
        },
        onError: (e: unknown) => {
            const msg = e instanceof Error ? e.message : t('bulkImportContent.validation.unknownError');
            setError(msg);
        },
    });

    const handleChooseFile = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const fileText = await file.text();
            setError(null);
            setText(fileText);
        } catch {
            setError(t('bulkImportContent.validation.fileReadFailed'));
        } finally {
            e.target.value = '';
        }
    };

    const handleClose = (openState: boolean) => {
        if (!openState) {
            setText('');
            setError(null);
            setImportResult(null);
        }
        onOpenChange(openState);
    };

    return (
            <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {t('bulkImportContent.title', { category: categoryLabel })}
                    </DialogTitle>
                    <DialogDescription>
                        {t('bulkImportContent.description', { category: categoryLabel })}
                    </DialogDescription>
                </DialogHeader>

                {error && (
                    <Alert variant="destructive" className="mb-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {importResult && (
                    <Alert className="mb-2 border-green-500/50 bg-green-500/10">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <AlertDescription className="text-green-700 dark:text-green-400">
                            {t(importResult.failed > 0 ? 'bulkImportContent.resultWithFailed' : 'bulkImportContent.result', {
                                success: importResult.success,
                                total: importResult.total,
                                failed: importResult.failed,
                            })}
                        </AlertDescription>
                    </Alert>
                )}

                <div className="grid gap-4 py-2">
                    <div className="grid gap-2">
                        <div className="flex items-center justify-between gap-3">
                            <Label>{t('bulkImportContent.labels.playlist')}</Label>
                            <div className="flex items-center gap-2">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".m3u,.m3u8,text/plain"
                                    className="hidden"
                                    onChange={handleFileChange}
                                />
                                <Button type="button" variant="outline" size="sm" onClick={handleChooseFile}>
                                    {t('bulkImportContent.buttons.chooseFile')}
                                </Button>
                            </div>
                        </div>
                        <Textarea
                            rows={12}
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            className="h-64 max-h-[60vh] overflow-y-auto resize-y font-mono text-xs"
                            placeholder={`#EXTM3U\n\n#EXTINF:-1 tvg-name="Title" tvg-logo="https://image.example.com/poster.jpg" group-title="${categoryLabel}",Title\nhttps://example.com/stream.m3u8\n\n#EXTINF:-1 tvg-name="Another Title" tvg-logo="https://image.example.com/poster2.jpg" group-title="${categoryLabel}",Another Title\nhttps://example.com/stream2.m3u8`}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => handleClose(false)} disabled={mutation.isPending}>
                        {t('bulkImportContent.buttons.cancel')}
                    </Button>
                    <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !text.trim()}>
                        <Upload className="h-4 w-4 mr-2" />
                        {mutation.isPending
                            ? t('bulkImportContent.buttons.importing')
                            : t('bulkImportContent.buttons.import', { category: categoryLabel })}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
