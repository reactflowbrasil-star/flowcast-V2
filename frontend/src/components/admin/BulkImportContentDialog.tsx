'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Upload, CheckCircle2, CircleX, LoaderCircle, CircleCheck } from 'lucide-react';
import { contentService } from '@/services';
import { useTranslation } from 'react-i18next';
import { extractErrorMessage } from '@/lib/error-message';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { buildM3uPlaylist, parseM3uPlaylist } from '@/lib/m3uPlaylist';

type LinkCheck = { status: 'checking' | 'valid' | 'invalid'; message?: string };

async function checkPlaylistUrl(url: string, signal: AbortSignal): Promise<LinkCheck> {
    const proxyPath = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/api/proxy/stream`;
    const params = new URLSearchParams({ url });
    const endpoint = `${proxyPath}?${params.toString()}`;
    const request = async (method: 'HEAD' | 'GET') => {
        const controller = new AbortController();
        const onAbort = () => controller.abort();
        signal.addEventListener('abort', onAbort, { once: true });
        const timeout = window.setTimeout(() => controller.abort(), 9000);
        try {
            return await fetch(endpoint, {
                method,
                credentials: 'same-origin',
                signal: controller.signal,
                headers: method === 'GET' ? { Range: 'bytes=0-0' } : undefined,
                cache: 'no-store',
            });
        } finally {
            window.clearTimeout(timeout);
            signal.removeEventListener('abort', onAbort);
        }
    };

    try {
        let response = await request('HEAD');
        if ([403, 405, 501].includes(response.status)) response = await request('GET');
        if (response.ok) {
            if (response.body) await response.body.cancel().catch(() => undefined);
            return { status: 'valid', message: `HTTP ${response.status}` };
        }
        return { status: 'invalid', message: `HTTP ${response.status}` };
    } catch (error) {
        if (signal.aborted) return { status: 'invalid', message: 'Verificação cancelada' };
        try {
            const response = await request('GET');
            if (response.ok) {
                if (response.body) await response.body.cancel().catch(() => undefined);
                return { status: 'valid', message: `HTTP ${response.status}` };
            }
            return { status: 'invalid', message: `HTTP ${response.status}` };
        } catch {
            return { status: 'invalid', message: error instanceof Error && error.name === 'AbortError' ? 'Tempo esgotado' : 'Link inacessível' };
        }
    }
}

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
    const [linkChecks, setLinkChecks] = useState<Record<number, LinkCheck>>({});
    const [isValidatingLinks, setIsValidatingLinks] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const validationAbortRef = useRef<AbortController | null>(null);
    const parsedPlaylist = useMemo(() => parseM3uPlaylist(text), [text]);
    const validEntries = parsedPlaylist.entries.filter(entry => linkChecks[entry.index]?.status === 'valid');
    const invalidEntries = parsedPlaylist.entries.filter(entry => linkChecks[entry.index]?.status === 'invalid');
    const verificationFinished = parsedPlaylist.entries.length > 0 &&
        !isValidatingLinks && parsedPlaylist.entries.every(entry => linkChecks[entry.index]?.status === 'valid' || linkChecks[entry.index]?.status === 'invalid');

    useEffect(() => {
        validationAbortRef.current?.abort();
        setLinkChecks({});
        if (!open || parsedPlaylist.entries.length === 0) {
            setIsValidatingLinks(false);
            return;
        }

        const controller = new AbortController();
        validationAbortRef.current = controller;
        let cancelled = false;
        setIsValidatingLinks(true);
        const initial: Record<number, LinkCheck> = {};
        parsedPlaylist.entries.forEach(entry => { initial[entry.index] = { status: 'checking' }; });
        setLinkChecks(initial);

        const timer = window.setTimeout(async () => {
            let cursor = 0;
            const workers = Array.from({ length: Math.min(6, parsedPlaylist.entries.length) }, async () => {
                while (!controller.signal.aborted) {
                    const index = cursor++;
                    const entry = parsedPlaylist.entries[index];
                    if (!entry) return;
                    const result = await checkPlaylistUrl(entry.url, controller.signal);
                    if (cancelled || controller.signal.aborted) return;
                    setLinkChecks(previous => ({ ...previous, [entry.index]: result }));
                }
            });
            await Promise.all(workers);
            if (!cancelled) setIsValidatingLinks(false);
        }, 450);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [open, parsedPlaylist]);

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
            const currentPlaylist = parseM3uPlaylist(parsed.data.text);
            const currentValidEntries = currentPlaylist.entries.filter(entry => linkChecks[entry.index]?.status === 'valid');
            const checkedCount = currentPlaylist.entries.filter(entry => linkChecks[entry.index]?.status === 'valid' || linkChecks[entry.index]?.status === 'invalid').length;
            if (checkedCount !== currentPlaylist.entries.length || currentValidEntries.length === 0) {
                throw new Error(t('bulkImportContent.linkCheck.waitForCheck', { defaultValue: 'Wait for link checks to finish and keep at least one valid link to import.' }));
            }
            const verifiedText = buildM3uPlaylist(currentPlaylist.header, currentValidEntries);
            const res = await contentService.bulkImportContent({
                text: verifiedText,
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
            validationAbortRef.current?.abort();
            setLinkChecks({});
            setIsValidatingLinks(false);
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
                    {text.trim() && (
                        <div className="grid gap-3 rounded-md border p-3 text-sm" aria-live="polite">
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                <span>{t('bulkImportContent.linkCheck.found', { count: parsedPlaylist.entries.length, defaultValue: '{{count}} links found' })}</span>
                                <span className="inline-flex items-center gap-1 text-emerald-600"><CircleCheck className="h-4 w-4" />{t('bulkImportContent.linkCheck.valid', { count: validEntries.length, defaultValue: '{{count}} valid' })}</span>
                                <span className="inline-flex items-center gap-1 text-destructive"><CircleX className="h-4 w-4" />{t('bulkImportContent.linkCheck.invalid', { count: invalidEntries.length, defaultValue: '{{count}} invalid' })}</span>
                                {(isValidatingLinks || !verificationFinished) && parsedPlaylist.entries.length > 0 && (
                                    <span className="inline-flex items-center gap-1 text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />{t('bulkImportContent.linkCheck.checking', { checked: validEntries.length + invalidEntries.length, total: parsedPlaylist.entries.length, defaultValue: 'Checking {{checked}}/{{total}}…' })}</span>
                                )}
                            </div>
                            {parsedPlaylist.entries.length === 0 && <p className="text-destructive">{t('bulkImportContent.linkCheck.noLinks', { defaultValue: 'No valid HTTP/HTTPS links were found in the playlist.' })}</p>}
                            {invalidEntries.length > 0 && (
                                <details className="rounded border border-destructive/30 p-2">
                                    <summary className="cursor-pointer text-destructive">{t('bulkImportContent.linkCheck.invalidList', { count: invalidEntries.length, defaultValue: 'Links that will not be imported ({{count}})' })}</summary>
                                    <ul className="mt-2 max-h-32 space-y-1 overflow-auto text-xs">
                                        {invalidEntries.map(entry => (
                                            <li key={entry.index} className="break-all">
                                                <span className="font-medium">{entry.title}</span> — {linkChecks[entry.index]?.message}: {entry.url}
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            )}
                            {verificationFinished && validEntries.length > 0 && (
                                <details className="rounded border border-emerald-500/30 p-2">
                                    <summary className="cursor-pointer text-emerald-700 dark:text-emerald-400">{t('bulkImportContent.linkCheck.validList', { count: validEntries.length, defaultValue: 'Valid links for import ({{count}})' })}</summary>
                                    <ul className="mt-2 max-h-32 space-y-1 overflow-auto text-xs">
                                        {validEntries.map(entry => (
                                            <li key={entry.index} className="break-all">
                                                <span className="font-medium">{entry.title}</span> — {entry.url}
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            )}
                            {verificationFinished && validEntries.length > 0 && (
                                <p className="text-emerald-700 dark:text-emerald-400">{t('bulkImportContent.linkCheck.importOnlyValid', { count: validEntries.length, defaultValue: 'Only the {{count}} valid links will be imported.' })}</p>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => handleClose(false)} disabled={mutation.isPending}>
                        {t('bulkImportContent.buttons.cancel')}
                    </Button>
                    <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !text.trim() || !verificationFinished || validEntries.length === 0}>
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
