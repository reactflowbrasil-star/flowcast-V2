'use client';

import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { apiService } from '@/services/api';

interface UploadProgress {
    loaded: number;
    total: number;
    percentage: number;
}

interface UploadResult {
    url: string;
    path?: string;
    filename: string;
    size: number;
}

interface UseMediaUploadReturn {
    uploadFile: (
        file: File,
        category: string,
        tmdbId?: number,
        title?: string
    ) => Promise<UploadResult>;
    progress: UploadProgress | null;
    isUploading: boolean;
    error: string | null;
    cancelUpload: () => void;
}

/**
 * Hook for uploading media files with progress tracking
 */
export function useMediaUpload(): UseMediaUploadReturn {
    const { t } = useTranslation();
    const [progress, setProgress] = useState<UploadProgress | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const xhrRef = useRef<XMLHttpRequest | null>(null);

    const cancelUpload = useCallback(() => {
        if (xhrRef.current) {
            xhrRef.current.abort();
            xhrRef.current = null;
        }
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsUploading(false);
        setProgress(null);
        setError(t('user.shows.status.cancelled'));
    }, [t]);

    const uploadFile = useCallback(
        async (
            file: File,
            category: string,
            tmdbId?: number,
            title?: string
        ): Promise<UploadResult> => {
            setIsUploading(true);
            setError(null);
            setProgress({ loaded: 0, total: file.size, percentage: 0 });

            return new Promise((resolve, reject) => {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('category', category);
                if (tmdbId) {
                    formData.append('tmdb_id', tmdbId.toString());
                }
                if (title) {
                    formData.append('title', title);
                }

                const xhr = new XMLHttpRequest();
                xhrRef.current = xhr;

                // Progress tracking
                xhr.upload.addEventListener('progress', (event) => {
                    if (event.lengthComputable) {
                        const percentage = Math.round((event.loaded / event.total) * 100);
                        setProgress({
                            loaded: event.loaded,
                            total: event.total,
                            percentage});
                    }
                });

                xhr.addEventListener('load', () => {
                    setIsUploading(false);
                    xhrRef.current = null;

                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const response = JSON.parse(xhr.responseText);
                            setProgress(null);
                            resolve(response);
                        } catch {
                            const message = t('common.serverError');
                            setError(message);
                            reject(new Error(message));
                        }
                    } else {
                        let errorMessage = t('common.serverError');
                        try {
                            const errorResponse = JSON.parse(xhr.responseText);
                            errorMessage = errorResponse.message || errorResponse.error || errorMessage;
                        } catch {
                            // Use default error message
                        }
                        setError(errorMessage);
                        reject(new Error(errorMessage));
                    }
                });

                xhr.addEventListener('error', () => {
                    setIsUploading(false);
                    xhrRef.current = null;
                    const message = t('common.networkErrorDescription');
                    setError(message);
                    reject(new Error(message));
                });

                xhr.addEventListener('abort', () => {
                    setIsUploading(false);
                    xhrRef.current = null;
                    const message = t('user.shows.status.cancelled');
                    setError(message);
                    reject(new Error(message));
                });

                // Get auth token
                const token = typeof window !== 'undefined'
                    ? localStorage.getItem('iptv_auth_token')
                    : null;

                // Build API URL
                const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
                const url = `${baseUrl}/api/admin/media/upload`;

                xhr.open('POST', url);

                if (token) {
                    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                }

                xhr.send(formData);
            });
        },
        [t]
    );

    return {
        uploadFile,
        progress,
        isUploading,
        error,
        cancelUpload};
}

/**
 * Format bytes to human readable string
 */
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
