'use client';

import { Shield, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface LicenseRequiredOverlayProps {
    featureName?: string;
    requiredLicense?: 'Extended License' | 'any';
}

/**
 * Full replacement overlay for tabs that require a higher license tier.
 * Replaces the gated content entirely (no content rendered behind it).
 * Uses theme-aware colors so it works in both light and dark modes.
 */
export default function LicenseRequiredOverlay({
    featureName = 'This feature',
    requiredLicense = 'Extended License',
}: LicenseRequiredOverlayProps) {
    const isExtended = requiredLicense === 'Extended License';
    const router = useRouter();

    return (
        <div className="w-full min-h-[400px] rounded-xl border border-border bg-card flex items-center justify-center">
            <div className="max-w-sm text-center p-8">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 mb-4">
                    <Shield className="w-7 h-7 text-amber-500" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                    {isExtended ? 'Extended License Required' : 'License Required'}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                    {featureName} requires {isExtended ? 'an Extended License' : 'a valid license'} to use.
                    {isExtended && (
                        <> Upgrade your license in Settings.</>
                    )}
                </p>
                <button
                    onClick={() => router.push('/admin?tab=settings')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-sm font-medium hover:bg-amber-500/20 transition-colors cursor-pointer"
                >
                    {isExtended ? 'Upgrade License' : 'Activate License'}
                    <ArrowRight className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
}
