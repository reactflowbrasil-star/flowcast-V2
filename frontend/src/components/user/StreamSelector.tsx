'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tv, Globe, Shield, Check } from 'lucide-react';
import type { StreamPublicInfo } from '@/types';
import { cn } from '@/lib/utils';

interface StreamSelectorProps {
    streams: StreamPublicInfo[];
    selectedStreamId: number | null;
    onSelect: (stream: StreamPublicInfo) => void;
    onClose: () => void;
}

/** Badge color for quality labels */
function qualityColor(q?: string | null): string {
    if (!q) return 'bg-slate-700 text-slate-300';
    const lq = q.toLowerCase();
    if (lq.includes('4k') || lq.includes('2160')) return 'bg-amber-500/20 text-amber-400 border border-amber-500/40';
    if (lq.includes('1080')) return 'bg-blue-500/20 text-blue-400 border border-blue-500/40';
    if (lq.includes('720')) return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40';
    if (lq.includes('480') || lq.includes('sd')) return 'bg-slate-500/20 text-slate-400 border border-slate-500/40';
    return 'bg-purple-500/20 text-purple-400 border border-purple-500/40';
}

/** Human-readable label from stream metadata */
function streamLabel(s: StreamPublicInfo): string {
    const parts: string[] = [];
    if (s.quality) parts.push(s.quality);
    if (s.language) parts.push(s.language);
    if (s.format) parts.push(s.format.toUpperCase());
    if (parts.length === 0) {
        if (s.is_default) return 'Default';
        return `Stream #${s.id}`;
    }
    return parts.join(' · ');
}

export function StreamSelector({ streams, selectedStreamId, onSelect, onClose }: StreamSelectorProps) {
    const { t } = useTranslation();

    // Local selected state — defaults to parent's selectedStreamId or the default stream
    const defaultId = selectedStreamId ?? streams.find(s => s.is_default)?.id ?? streams[0]?.id ?? null;
    const [localSelectedId, setLocalSelectedId] = useState<number | null>(defaultId);

    if (streams.length <= 1) return null;

    const handlePlay = () => {
        const chosen = streams.find(s => s.id === localSelectedId) ?? streams[0];
        onSelect(chosen);
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="w-full max-w-sm mx-4 bg-[#0d1117] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-6 duration-300">
                {/* Header */}
                <div className="px-5 pt-5 pb-3">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
                            <Tv className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <h3 className="text-white font-semibold text-base">
                                {t('user.stream.selectQuality', 'Select Quality')}
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                                {t('user.stream.availableStreams', '{{count}} streams available', { count: streams.length })}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Stream List */}
                <div className="px-3 pb-3 max-h-[50vh] overflow-y-auto">
                    {streams.map((stream) => {
                        const isSelected = localSelectedId === stream.id;
                        return (
                            <button
                                key={stream.id}
                                onClick={() => setLocalSelectedId(stream.id)}
                                className={cn(
                                    'w-full flex items-center gap-3 px-3 py-3 rounded-xl mb-1.5 transition-all text-left group',
                                    isSelected
                                        ? 'bg-blue-500/15 border border-blue-500/40 shadow-[0_0_12px_rgba(59,130,246,0.1)]'
                                        : 'bg-white/[0.03] border border-transparent hover:bg-white/[0.06] hover:border-white/10'
                                )}
                            >
                                {/* Quality Badge */}
                                <div className={cn('px-2 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide shrink-0', qualityColor(stream.quality))}>
                                    {stream.quality || 'AUTO'}
                                </div>

                                {/* Stream Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm text-white font-medium truncate">
                                        {streamLabel(stream)}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        {stream.language && (
                                            <span className="flex items-center gap-0.5 text-[10px] text-slate-500">
                                                <Globe className="w-2.5 h-2.5" />
                                                {stream.language}
                                            </span>
                                        )}
                                        {stream.drm_type && stream.drm_type !== 'clearkey' && (
                                            <span className="flex items-center gap-0.5 text-[10px] text-blue-400/60">
                                                <Shield className="w-2.5 h-2.5" />
                                                {stream.drm_type.toUpperCase()}
                                            </span>
                                        )}
                                        {stream.is_default && (
                                            <span className="text-[10px] text-emerald-400/60 font-medium">
                                                {t('user.stream.default', 'Default')}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Selection Indicator */}
                                <div className={cn(
                                    'shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-all',
                                    isSelected
                                        ? 'bg-blue-500 text-white'
                                        : 'border border-white/20 group-hover:border-white/40'
                                )}>
                                    {isSelected && <Check className="w-3 h-3" strokeWidth={3} />}
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Footer — Play button triggers playback */}
                <div className="px-5 py-3 border-t border-white/5 bg-white/[0.02]">
                    <button
                        onClick={handlePlay}
                        className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
                    >
                        {t('user.stream.play', 'Play')}
                    </button>
                </div>
            </div>
        </div>
    );
}

