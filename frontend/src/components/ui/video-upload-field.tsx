'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Input } from './input';
import { Button } from './button';
import { Progress } from './progress';
import { Upload, Link, X, FileVideo } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { toast } from 'sonner';

const SUPPORTED_VIDEO_FORMATS = [
    'video/mp4',
    'video/x-matroska', // mkv
    'video/quicktime', // mov
    'video/x-ms-wmv', // wmv
    'video/x-msvideo', // avi
    'video/webm',
    'video/mpeg',
    'video/x-flv', // flv
    'video/x-vob', // vob (may not be recognized)
];

const ACCEPTED_EXTENSIONS = '.mp4,.mkv,.mov,.wmv,.avi,.webm,.mpeg,.flv,.vob,.m4v,.ts';

interface VideoUploadFieldProps {
    value: string;
    onChange: (value: string) => void;
    onUpload?: (file: File) => Promise<string>;
    disabled?: boolean;
    placeholder?: string;
    className?: string;
    error?: string;
    /** Content ID or Episode ID for upload endpoint */
    uploadId?: number;
    /** Type of content: 'content' for movies, 'episode' for series episodes */
    uploadType?: 'content' | 'episode';
}

export function VideoUploadField({
    value,
    onChange,
    onUpload,
    disabled = false,
    placeholder,
    className,
    error,
    uploadId,
    uploadType = 'content' }: VideoUploadFieldProps) {
    useLoadNamespace('admin/createContent');
    const { t } = useTranslation(['admin/createContent', 'translation']);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            // Validate file type
            const ext = file.name.split('.').pop()?.toLowerCase() || '';
            const validExtensions = ['mp4', 'mkv', 'mov', 'wmv', 'avi', 'webm', 'mpeg', 'flv', 'vob', 'm4v', 'ts'];

            if (!validExtensions.includes(ext)) {
                toast.error(t('createContent.unsupportedFormat', {
                    format: ext,
                    supported: validExtensions.join(', ')
                }));
                return;
            }

            setSelectedFile(file);

            // If we have an upload handler and ID, upload immediately
            if (onUpload && uploadId) {
                handleUpload(file);
            } else if (onUpload) {
                // No uploadId yet - call onUpload to get the pending marker
                try {
                    const result = await onUpload(file);
                    onChange(result);
                } catch (error) {
                    console.error('Error setting pending upload:', error);
                }
            }
        }
    }, [onUpload, uploadId, onChange, t]);

    const handleUpload = async (file: File) => {
        if (!uploadId) {
            // Store file for later upload after content creation
            setSelectedFile(file);
            // Show local file name in input
            onChange(`[Pending Upload] ${file.name}`);
            return;
        }

        if (!onUpload) return;

        setIsUploading(true);
        setUploadProgress(0);

        try {
            // Simulate progress (actual progress would come from XMLHttpRequest)
            const progressInterval = setInterval(() => {
                setUploadProgress(prev => {
                    if (prev >= 90) {
                        clearInterval(progressInterval);
                        return prev;
                    }
                    return prev + 10;
                });
            }, 200);

            const resultPath = await onUpload(file);

            clearInterval(progressInterval);
            setUploadProgress(100);

            onChange(resultPath);
            setSelectedFile(null);
        } catch (error) {
            console.error('Upload error:', error);
            toast.error(t('createContent.uploadFailed'));
        } finally {
            setIsUploading(false);
            setUploadProgress(0);
        }
    };

    const handleBrowseClick = () => {
        fileInputRef.current?.click();
    };

    const handleClearFile = () => {
        setSelectedFile(null);
        if (value.startsWith('[Pending Upload]')) {
            onChange('');
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const isPendingUpload = value.startsWith('[Pending Upload]');

    return (
        <div className={cn('space-y-2', className)}>
            {isPendingUpload ? (
                // File selected - show file info card
                <div className="flex gap-2">
                    <div className="flex-1 flex items-center gap-3 p-3 rounded-lg border border-blue-300 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700">
                        <FileVideo className="h-5 w-5 text-blue-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-blue-700 dark:text-blue-300 truncate">
                                {selectedFile?.name || t('createContent.pendingUpload')}
                            </p>
                            <p className="text-xs text-blue-500 dark:text-blue-400">
                                {selectedFile ? `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB` : t('createContent.uploadVideo')}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleClearFile}
                            className="p-1 rounded hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-500"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleBrowseClick}
                        disabled={disabled || isUploading}
                        className="whitespace-nowrap"
                    >
                        <Upload className="h-4 w-4 mr-2" />
                        {t('common.change')}
                    </Button>
                </div>
            ) : (
                // No file - show URL input + upload button
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Input
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            placeholder={placeholder || t('createContent.form.videoUrlPlaceholder')}
                            disabled={disabled || isUploading}
                            className="pr-10"
                        />
                        {value && !isUploading && (
                            <button
                                type="button"
                                onClick={handleClearFile}
                                className="absolute inset-y-0 right-2 flex items-center text-gray-400 hover:text-gray-600"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>

                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleBrowseClick}
                        disabled={disabled || isUploading}
                        className="whitespace-nowrap"
                    >
                        <Upload className="h-4 w-4 mr-2" />
                        {t('createContent.uploadVideo')}
                    </Button>
                </div>
            )}

            <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                onChange={handleFileSelect}
                className="hidden"
            />

            {isUploading && (
                <div className="space-y-1">
                    <Progress value={uploadProgress} className="h-2" />
                    <p className="text-xs text-muted-foreground">
                        {t('createContent.uploading')} {uploadProgress}%
                    </p>
                </div>
            )}

            {isPendingUpload && !isUploading && (
                <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    {t('createContent.pendingUpload')}
                </p>
            )}

            <p className="text-xs text-muted-foreground">
                {t('createContent.supportedFormats')}
            </p>

            {error && (
                <p className="text-sm text-red-600">{error}</p>
            )}
        </div>
    );
}

export default VideoUploadField;
