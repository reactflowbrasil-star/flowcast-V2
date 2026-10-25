import type React from 'react';
// Type definitions for video players (Shaka Player and HLS.js)

// Shaka Player types
export interface ShakaTextTrack {
    id: number;
    language: string;
    label?: string;
    kind?: string;
    roles?: string[];
}

export interface ShakaPlayer {
    load(manifestUri: string, startTime?: number, mimeType?: string): Promise<void>;
    unload(): Promise<void>;
    destroy(): Promise<void>;
    configure(config: ShakaPlayerConfig): void;
    getTextTracks(): ShakaTextTrack[];
    selectTextTrack(track: ShakaTextTrack): void;
    setTextTrackVisibility(visible: boolean): void;
    addEventListener(type: string, listener: (event: ShakaPlayerError) => void): void;
    getNetworkingEngine(): ShakaNetworkingEngine | null;
}

export interface ShakaPlayerConfig {
    drm?: {
        servers?: Record<string, string>;
        advanced?: Record<string, ShakaAdvancedDrmConfig>;
        clearKeys?: Record<string, string>;
    };
    streaming?: {
        bufferingGoal?: number;
        rebufferingGoal?: number;
        retryParameters?: {
            timeout?: number;
            maxAttempts?: number;
        };
    };
}

export interface ShakaAdvancedDrmConfig {
    videoRobustness?: string;
    audioRobustness?: string;
    distinctiveIdentifierRequired?: boolean;
    persistentStateRequired?: boolean;
    headers?: Record<string, string>;
}

export interface ShakaPlayerError {
    detail?: {
        code?: number;
        message?: string;
    };
    code?: number;
    message?: string;
}

export interface ShakaNetworkingEngine {
    registerRequestFilter(filter: (type: number, request: ShakaRequest) => void): void;
}

export interface ShakaRequest {
    headers: Record<string, string>;
}

export interface ShakaPolyfill {
    installAll(): void;
}

export interface ShakaStatic {
    Player: new (videoElement: HTMLVideoElement) => ShakaPlayer;
    polyfill: ShakaPolyfill;
}

// HLS.js types
export interface HlsConfig {
    debug?: boolean;
    enableWorker?: boolean;
    lowLatencyMode?: boolean;
    xhrSetup?: (xhr: XMLHttpRequest, url: string) => void;
}

export interface HlsErrorData {
    type: string;
    details: string;
    fatal: boolean;
}

export interface HlsInstance {
    loadSource(url: string): void;
    attachMedia(video: HTMLVideoElement): void;
    startLoad(startPosition?: number): void;
    destroy(): void;
    on(event: string, callback: (event: string, data?: HlsErrorData) => void): void;
}

export interface HlsStatic {
    isSupported(): boolean;
    Events: {
        MANIFEST_PARSED: string;
        ERROR: string;
        MEDIA_ATTACHED: string;
    };
    ErrorTypes: {
        NETWORK_ERROR: string;
        MEDIA_ERROR: string;
    };
    new(config?: HlsConfig): HlsInstance;
}

// Augment Window interface
declare global {
    interface Window {
        shaka?: ShakaStatic;
        Hls?: HlsStatic;
    }
}

// Menu item type for sidebar navigation
export interface MenuItem {
    labelKey?: string;
    label: string;
    href: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icon: React.ComponentType<any>;
    basePath: string;
}

// Related content item
export interface RelatedContentItem {
    id: number;
    title: string;
    image_url?: string;
    backdrop_url?: string;
    content_type?: string;
}

export { };
