'use client';

import {
    Sparkles, Shield, Wrench, Zap, Database,
    Smartphone, Globe, Server, CheckCircle2, Info
} from 'lucide-react';
import { APP_CONFIG } from '@/constants/app';

const CURRENT_VERSION = '1.2.0';
const RELEASE_DATE = 'March 2026';

interface FeatureSection {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    color: string;
    items: string[];
}

const sections: FeatureSection[] = [
    {
        icon: Shield,
        title: 'Security Hardening',
        color: 'text-red-500',
        items: [
            'Master API Keys — bcrypt hashed, shown once, auto-migrated',
            'System role (UserRole::System) for API keys — no more blanket admin bypass',
            'IP spoofing patched — uses TCP ConnectInfo, proxy headers trusted only from loopback',
            'Stripe webhook idempotency — atomic INSERT ON CONFLICT prevents double-credits',
            'Gift code double-spend prevention with FOR UPDATE row locks',
            'SMTP password encryption upgraded to AES-256-GCM',
            '2FA fail-open vulnerability patched — refuses login if 2FA check fails',
            'Password reset race condition fixed with atomic token consumption',
            'IP-based login rate limiting — 10 attempts/min, 50/hr per IP',
        ],
    },
    {
        icon: Wrench,
        title: 'Bug Fixes',
        color: 'text-amber-500',
        items: [
            'Schema search_path reordered — application schemas now take priority',
            'Series/Anime edit dialog routing fixed (case-mismatch)',
            'ClearKey DRM kid/key swap fixed — consistent hex format across stack',
            'Episode DRM inheritance from parent series via SQL JOIN',
            'Public API middleware no longer kills successful responses',
            'Bulk user update SQL duplicate field issue fixed',
            'Subtitle URL priority — English preferred, fallback to first available',
            'Subscription flow: package max_devices now correctly applied to user accounts',
            'Free package subscription redirect fixed (no more 404 on success)',
            'Post-registration auth token handling fixed — subscribe works immediately',
            'User categories stored correctly in billing.user_subscriptions on subscribe',
        ],
    },
    {
        icon: Sparkles,
        title: 'New Features & Enhancements',
        color: 'text-purple-500',
        items: [
            'Per-file upload progress bars with real-time percentage',
            'EPG display fixed on phone app — correct bulk endpoint',
            'Per-episode multi-stream support (quality, language, DRM per episode)',
            'Episode stream editor UI with set-default, edit, delete actions',
            'Stripe payment settings in admin panel (DB-first, env fallback)',
            'Admin-configurable Stripe keys, currency, and URLs',
            'Watch progress API for granular episode position tracking',
            'Series creation accepts full season/episode data in single request',
            'HEVC 10-bit playback improvements for Android TV',
            'End-user self-registration with automatic activation',
            'Package-based subscriptions — free packages activate instantly',
            'Regular License enforcement — only free packages allowed',
            'Direct subscription system with billing.direct_subscriptions tracking',
        ],
    },
    {
        icon: Database,
        title: 'Database & Migrations',
        color: 'text-blue-500',
        items: [
            'Automatic v1.1.2 → v1.2.0 migration (44 tables, FK-safe ordering)',
            'Polymorphic content split: flat → media_content + movies + tv_channels + streams',
            'Schema-qualified all migration DDL (no cross-schema hazards)',
            'Sequence auto-fix for all 49 auto-increment sequences',
            'media_streams gains episode_id column for per-episode multi-stream',
        ],
    },
    {
        icon: Smartphone,
        title: 'Mobile Apps (Phone & TV)',
        color: 'text-emerald-500',
        items: [
            'ClearKey DRM fully fixed across phone and TV apps',
            'DASH manifest parser rewritten for proper ClearKey injection',
            'Device registration persistence — no more re-prompts on launch',
            'Watch progress contract parity between phone/TV/backend',
            'Device endpoints hardened for mixed payload shapes',
        ],
    },
    {
        icon: Globe,
        title: 'Frontend Improvements',
        color: 'text-cyan-500',
        items: [
            'URL validation relaxed to accept local filesystem paths',
            'Responsive dialogs (90vw mobile → 80vw tablet → 65vw desktop)',
            'Fixed proxy auth endpoint, reseller deep links, registration token',
            'Fixed device API contract mismatches with proper response wrapping',
            'Search sort-by-rating bug fixed',
            'Sidebar and navigation now filtered by user subscribed categories only',
            'Plans page: select & subscribe packages post-registration without re-login',
            'Profile & security page shows correct plan status and max devices',
            'Google Fonts build dependency removed — uses local Outfit font for Docker reliability',
        ],
    },
    {
        icon: Server,
        title: 'Performance & Quality',
        color: 'text-orange-500',
        items: [
            '77K+ RPS on content endpoints, 7.5ms average latency',
            '82 automated tests (62 unit + 20 integration) — 0 failures',
            '64→0 Clippy warnings, removed 6 dangerous .unwrap() calls',
            'Graceful shutdown with connection draining on SIGTERM',
            'Enhanced /api/health with DB connectivity check + uptime',
        ],
    },
];

export default function VersionTab() {
    return (
        <div className="space-y-6">
            {/* Version Header */}
            <div className="rounded-xl border border-border bg-gradient-to-br from-card via-card to-muted/40 p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <div className="mb-2 flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <Zap className="h-5 w-5" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-foreground">{APP_CONFIG.NAME}</h2>
                                <p className="text-sm text-muted-foreground">IPTV/OTT Platform</p>
                            </div>
                        </div>
                    </div>
                    <div className="text-left sm:text-right">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-1.5 text-sm font-semibold text-foreground">
                            v{CURRENT_VERSION}
                        </span>
                        <p className="mt-1 text-xs text-muted-foreground">{RELEASE_DATE}</p>
                    </div>
                </div>

                {/* Quick stats */}
                <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {[
                        { label: 'Security Fixes', value: '9+', color: 'bg-red-500/10 text-red-700 dark:text-red-300' },
                        { label: 'Bug Fixes', value: '30+', color: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
                        { label: 'New Features', value: '20+', color: 'bg-purple-500/10 text-purple-700 dark:text-purple-300' },
                        { label: 'Tests', value: '82', color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
                    ].map((stat) => (
                        <div key={stat.label} className={`rounded-lg border border-border/60 p-3 text-center ${stat.color}`}>
                            <div className="text-lg font-bold">{stat.value}</div>
                            <div className="text-xs opacity-90">{stat.label}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Feature Sections */}
            {sections.map((section, i) => {
                const Icon = section.icon;
                return (
                    <div key={i} className="rounded-xl border bg-card overflow-hidden">
                        <div className="flex items-center gap-2 p-4 border-b bg-muted/30">
                            <Icon className={`h-4.5 w-4.5 ${section.color}`} />
                            <h3 className="text-sm font-semibold">{section.title}</h3>
                            <span className="ml-auto text-xs text-muted-foreground">{section.items.length} items</span>
                        </div>
                        <ul className="divide-y divide-border">
                            {section.items.map((item, j) => (
                                <li key={j} className="flex items-start gap-2.5 px-4 py-2.5 text-sm hover:bg-muted/30 transition-colors">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                );
            })}

            {/* Footer info */}
            <div className="rounded-xl border bg-muted/30 p-4">
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <p>
                        Full release notes and detailed changelog available in <code className="text-primary">RELEASE_1.2.0.md</code>.
                        For support, visit the item&apos;s support page on CodeCanyon.
                    </p>
                </div>
            </div>
        </div>
    );
}
