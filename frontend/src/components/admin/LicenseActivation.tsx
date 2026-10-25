'use client';

import { useState } from 'react';
import { useLicense } from '@/hooks/useLicense';
import { Shield, CheckCircle2, AlertTriangle, Loader2, Key, ExternalLink } from 'lucide-react';

/**
 * Full-screen license activation gate.
 * Shown on first admin access if no license is active.
 * After activation, calls `onActivated()` to let the parent continue.
 */
export default function LicenseActivation({ onActivated }: { onActivated: () => void }) {
    const { activate, isLoading } = useLicense();
    const [code, setCode] = useState('');
    const [result, setResult] = useState<{
        success: boolean;
        message: string;
        licenseType?: string;
        buyer?: string;
    } | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = code.trim();
        if (!trimmed) return;

        setResult(null);
        const res = await activate(trimmed);

        if (res.success) {
            setResult({
                success: true,
                message: `License activated successfully!`,
                licenseType: res.status?.license_type ?? undefined,
                buyer: res.status?.buyer ?? undefined,
            });
            // Wait a moment so the user sees the success, then proceed
            setTimeout(() => onActivated(), 2000);
        } else {
            setResult({
                success: false,
                message: res.error || 'Activation failed',
            });
        }
    };

    const handleSkip = () => {
        onActivated();
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
            <div className="w-full max-w-md">
                {/* Logo / Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg shadow-blue-500/20 mb-4">
                        <Shield className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">StreamCore License</h1>
                    <p className="text-slate-400 mt-2 text-sm">
                        Enter your Envato purchase code to activate
                    </p>
                </div>

                {/* Activation Form */}
                <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-2xl">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="purchase-code" className="block text-sm font-medium text-slate-300 mb-2">
                                <Key className="inline w-4 h-4 mr-1.5 -mt-0.5" />
                                Purchase Code
                            </label>
                            <input
                                id="purchase-code"
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                                className="w-full px-4 py-3 rounded-lg bg-slate-900/50 border border-slate-600/50 text-white font-mono text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                                disabled={isLoading}
                                autoFocus
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading || !code.trim()}
                            className="w-full py-3 px-4 rounded-lg font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Verifying...
                                </>
                            ) : (
                                'Activate License'
                            )}
                        </button>
                    </form>

                    {/* Result */}
                    {result && (
                        <div
                            className={`mt-4 p-4 rounded-lg border ${result.success
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                    : 'bg-red-500/10 border-red-500/30 text-red-400'
                                }`}
                        >
                            <div className="flex items-start gap-2">
                                {result.success ? (
                                    <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" />
                                ) : (
                                    <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                                )}
                                <div>
                                    <p className="font-medium text-sm">{result.message}</p>
                                    {result.licenseType && (
                                        <p className="text-xs mt-1 opacity-80">
                                            Type: <span className="font-semibold">{result.licenseType}</span>
                                        </p>
                                    )}
                                    {result.buyer && (
                                        <p className="text-xs mt-0.5 opacity-80">
                                            Buyer: <span className="font-semibold">{result.buyer}</span>
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Help */}
                    <div className="mt-5 p-3 rounded-lg bg-slate-700/30 border border-slate-600/30">
                        <p className="text-xs text-slate-400 leading-relaxed">
                            💡 Find your purchase code in your{' '}
                            <a
                                href="https://codecanyon.net/downloads"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-0.5"
                            >
                                Envato Downloads
                                <ExternalLink className="w-3 h-3" />
                            </a>{' '}
                            page under &quot;License certificate &amp; purchase code&quot;.
                        </p>
                    </div>

                    {/* Skip */}
                    <div className="mt-4 text-center">
                        <button
                            onClick={handleSkip}
                            className="text-xs text-slate-500 hover:text-slate-400 underline underline-offset-2 transition-colors"
                        >
                            Skip for now (some features will be limited)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
