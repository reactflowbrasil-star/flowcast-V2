'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { User, Mail, Lock, Loader2, Eye, EyeOff, ArrowRight, CheckCircle2, XCircle } from 'lucide-react';
import packagesService from '@/services/packages';
import { authService } from '@/services';

function RegisterForm() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [requiresVerification, setRequiresVerification] = useState(false);
    const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
    const [checkingEmail, setCheckingEmail] = useState(false);
    const [registrationEnabled, setRegistrationEnabled] = useState<boolean | null>(null);

    useEffect(() => {
        const checkRegistration = async () => {
            try {
                const res = await fetch('/api/public/config/ui');
                if (res.ok) {
                    const data = await res.json();
                    setRegistrationEnabled(data.allow_direct_registration ?? false);
                }
            } catch {
                setRegistrationEnabled(false);
            }
        };
        checkRegistration();
    }, []);

    // Debounced email check
    useEffect(() => {
        if (!email || !email.includes('@') || email.length < 5) {
            setEmailAvailable(null);
            return;
        }
        const timeout = setTimeout(async () => {
            setCheckingEmail(true);
            try {
                const result = await packagesService.checkEmail(email);
                if (result.data) {
                    setEmailAvailable(result.data.available);
                }
            } catch {
                setEmailAvailable(null);
            } finally {
                setCheckingEmail(false);
            }
        }, 500);
        return () => clearTimeout(timeout);
    }, [email]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }
        if (username.length < 3) {
            setError('Username must be at least 3 characters');
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await packagesService.register({ username, email, password });
            if (result.data) {
                if (result.data.requires_verification) {
                    setRequiresVerification(true);
                    setSuccess('Account created! Please check your email to verify your account.');
                } else {
                    // Auto-login with token — use authService so AuthContext picks it up
                    if (result.data.token) {
                        authService.setAuthToken(result.data.token);
                        authService.setStoredUser({
                            id: result.data.user_id,
                            username,
                            email,
                            role: 'end_user' as any,
                            active: true,
                            subscription_source: 'direct',
                        } as any);
                        // Also set cookie for middleware
                        document.cookie = `iptv_auth_token=${result.data.token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
                    }
                    router.push('/plans');
                }
            } else if (result.error) {
                setError(result.error.error || 'Registration failed');
            }
        } catch {
            setError('An unexpected error occurred');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (registrationEnabled === null) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#0b0e14]">
                <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
            </div>
        );
    }

    if (!registrationEnabled) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#0b0e14] text-white p-6">
                <div className="text-center space-y-4">
                    <XCircle className="h-16 w-16 text-red-500 mx-auto" />
                    <h1 className="text-2xl font-bold">Registration Disabled</h1>
                    <p className="text-gray-400">Self-registration is not currently available.</p>
                    <Link href="/login">
                        <Button variant="outline" className="mt-4">Back to Login</Button>
                    </Link>
                </div>
            </div>
        );
    }

    if (requiresVerification) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#0b0e14] text-white p-6">
                <div className="max-w-md w-full text-center space-y-6">
                    <div className="h-20 w-20 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto ring-1 ring-blue-500/20">
                        <Mail className="h-10 w-10 text-blue-400" />
                    </div>
                    <h1 className="text-2xl font-bold">Check Your Email</h1>
                    <p className="text-gray-400">
                        We&apos;ve sent a verification link to <strong className="text-white">{email}</strong>.
                        Please click the link to verify your account.
                    </p>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-gray-400">
                        <p>Didn&apos;t receive the email? Check your spam folder or try registering again.</p>
                    </div>
                    <Link href="/login">
                        <Button className="w-full h-12 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-semibold rounded-xl mt-4">
                            Back to Login
                        </Button>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen w-full bg-[#0b0e14] text-white flex overflow-hidden font-sans">
            {/* Left Side - Branding */}
            <div className="hidden lg:flex lg:w-1/2 relative flex-col items-center justify-center overflow-hidden bg-black">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-900/40 via-purple-900/30 to-black" />
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl animate-pulse" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />

                <div className="relative z-10 p-12 max-w-lg mx-auto text-center space-y-8">
                    <div className="relative w-[250px] h-24 mx-auto">
                        <Image src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/flowcast-logo.png`} alt="Flowcast" fill className="object-contain drop-shadow-[0_0_25px_rgba(255,255,255,0.2)]" priority />
                    </div>
                    <h2 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                        Start Streaming Today
                    </h2>
                    <p className="text-gray-400 text-lg leading-relaxed">
                        Create your account and choose a plan that fits your needs. Start watching premium content in minutes.
                    </p>
                </div>
            </div>

            {/* Right Side - Register Form */}
            <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-6 lg:p-12 bg-[#0b0e14] relative overflow-hidden">
                <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[100px] animate-pulse" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-600/5 rounded-full blur-[100px] animate-pulse delay-700" />

                <div className="w-full max-w-[440px] space-y-8 relative z-10">
                    {/* Mobile Logo */}
                    <div className="lg:hidden flex flex-col items-center mb-6">
                        <Image src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/flowcast-logo.png`} alt="Flowcast" width={180} height={64} className="mb-4 drop-shadow-lg" />
                    </div>

                    <div className="space-y-2 text-center lg:text-left">
                        <h2 className="text-3xl font-bold tracking-tight text-white">Create Account</h2>
                        <p className="text-gray-400">Fill in your details to get started</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Username */}
                        <div className="space-y-2">
                            <label htmlFor="reg-username" className="text-sm font-medium text-gray-300 ml-1">Username</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <User className="h-5 w-5 text-gray-500 group-focus-within:text-cyan-400 transition-colors" />
                                </div>
                                <Input
                                    id="reg-username"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="pl-12 h-12 bg-white/5 border-white/10 focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 text-white placeholder:text-gray-600 rounded-xl"
                                    placeholder="Choose a username"
                                    disabled={isSubmitting}
                                    required
                                    minLength={3}
                                    maxLength={50}
                                />
                            </div>
                        </div>

                        {/* Email */}
                        <div className="space-y-2">
                            <label htmlFor="reg-email" className="text-sm font-medium text-gray-300 ml-1">Email</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Mail className="h-5 w-5 text-gray-500 group-focus-within:text-blue-400 transition-colors" />
                                </div>
                                <Input
                                    id="reg-email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="pl-12 pr-12 h-12 bg-white/5 border-white/10 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 text-white placeholder:text-gray-600 rounded-xl"
                                    placeholder="your@email.com"
                                    disabled={isSubmitting}
                                    required
                                />
                                <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
                                    {checkingEmail && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
                                    {!checkingEmail && emailAvailable === true && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                                    {!checkingEmail && emailAvailable === false && <XCircle className="h-5 w-5 text-red-500" />}
                                </div>
                            </div>
                            {emailAvailable === false && (
                                <p className="text-xs text-red-400 ml-1">This email is already registered</p>
                            )}
                        </div>

                        {/* Password */}
                        <div className="space-y-2">
                            <label htmlFor="reg-password" className="text-sm font-medium text-gray-300 ml-1">Password</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-gray-500 group-focus-within:text-purple-400 transition-colors" />
                                </div>
                                <Input
                                    id="reg-password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="pl-12 pr-12 h-12 bg-white/5 border-white/10 focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 text-white placeholder:text-gray-600 rounded-xl"
                                    placeholder="Create a password"
                                    disabled={isSubmitting}
                                    required
                                    minLength={6}
                                />
                                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-white transition-colors">
                                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                </button>
                            </div>
                        </div>

                        {/* Confirm Password */}
                        <div className="space-y-2">
                            <label htmlFor="reg-confirm" className="text-sm font-medium text-gray-300 ml-1">Confirm Password</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-gray-500 group-focus-within:text-purple-400 transition-colors" />
                                </div>
                                <Input
                                    id="reg-confirm"
                                    type={showPassword ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="pl-12 h-12 bg-white/5 border-white/10 focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 text-white placeholder:text-gray-600 rounded-xl"
                                    placeholder="Confirm your password"
                                    disabled={isSubmitting}
                                    required
                                />
                            </div>
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="animate-shake bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3 text-red-200">
                                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                                <span className="text-sm">{error}</span>
                            </div>
                        )}

                        {/* Submit */}
                        <Button
                            type="submit"
                            disabled={isSubmitting || !username || !email || !password || !confirmPassword || emailAvailable === false}
                            className="w-full h-12 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-purple-900/20 disabled:opacity-50"
                        >
                            {isSubmitting ? (
                                <div className="flex items-center justify-center gap-2">
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    <span>Creating account...</span>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center gap-2 group">
                                    <span>Create Account</span>
                                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                                </div>
                            )}
                        </Button>
                    </form>

                    <div className="text-center pt-2">
                        <p className="text-sm text-gray-500">
                            Already have an account?{' '}
                            <Link href="/login" className="text-cyan-400 hover:text-cyan-300 font-medium hover:underline transition-all">
                                Sign in
                            </Link>
                        </p>
                    </div>
                </div>
            </div>

            <style jsx global>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-shake { animation: shake 0.5s ease-in-out; }
      `}</style>
        </div>
    );
}

export default function RegisterPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#0b0e14]"><Loader2 className="h-12 w-12 animate-spin text-blue-500" /></div>}>
            <RegisterForm />
        </Suspense>
    );
}
