'use client';

import Link from 'next/link';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { XCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SubscriptionCancelPage() {
    return (
        <div className="min-h-screen w-full bg-[#0b0e14] flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background Gradients */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 opacity-10 pointer-events-none">
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-500 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
                <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-red-500 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '5s' }} />
            </div>

            <Card className="max-w-md w-full border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl text-white">
                <CardHeader className="flex flex-col items-center text-center pb-2">
                    <div className="h-20 w-20 rounded-full bg-amber-500/10 flex items-center justify-center mb-4 ring-1 ring-amber-500/20">
                        <XCircle className="h-10 w-10 text-amber-500" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight">Checkout Canceled</h1>
                    <p className="text-gray-400 mt-2">
                        Your subscription checkout was canceled. No charges were made.
                    </p>
                </CardHeader>

                <CardContent className="space-y-4 pb-2">
                    <div className="rounded-xl bg-white/5 p-4 border border-white/10 text-sm">
                        <div className="flex items-start gap-3">
                            <div className="p-1 bg-amber-500/10 rounded-full mt-0.5">
                                <div className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                            </div>
                            <div className="space-y-1">
                                <p className="font-medium text-white">No worries!</p>
                                <p className="text-gray-400 text-xs">
                                    You can return to the plans page anytime to choose a subscription that works for you.
                                </p>
                            </div>
                        </div>
                    </div>
                </CardContent>

                <CardFooter className="flex flex-col gap-3 pt-6">
                    <Link
                        href="/plans"
                        className={cn(buttonVariants({ variant: 'default', size: 'lg' }), 'w-full h-11 gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 shadow-lg shadow-blue-900/20 text-white border-0')}
                    >
                        <RefreshCw className="h-4 w-4" />
                        Try Again
                    </Link>
                    <Link
                        href="/login"
                        className={cn(buttonVariants({ variant: 'outline' }), 'w-full h-11 gap-2 border-white/10 text-gray-300 hover:bg-white/5 hover:text-white')}
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Login
                    </Link>
                </CardFooter>
            </Card>
        </div>
    );
}
