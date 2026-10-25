import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ROUTES, STORAGE_KEYS } from '@/constants';

// Define protected routes and their required roles
const PROTECTED_ROUTES = {
  [ROUTES.ADMIN.BASE]: ['admin'],
  [ROUTES.ADMIN.USERS]: ['admin'],
  [ROUTES.ADMIN.CONTENT]: ['admin'],
  [ROUTES.ADMIN.CATEGORIES]: ['admin'],
  [ROUTES.ADMIN.SERIES]: ['admin'],
  [ROUTES.ADMIN.ANALYTICS]: ['admin'],
  [ROUTES.RESELLER.BASE]: ['admin', 'reseller'],
  [ROUTES.RESELLER.CUSTOMERS]: ['admin', 'reseller'],
  [ROUTES.RESELLER.CONTENT]: ['admin', 'reseller'],
  [ROUTES.RESELLER.ANALYTICS]: ['admin', 'reseller'],
  [ROUTES.USER.BASE]: ['admin', 'reseller', 'end_user'],
  [ROUTES.USER.CONTENT]: ['admin', 'reseller', 'end_user'],
  [ROUTES.USER.DEVICES]: ['admin', 'reseller', 'end_user'],
  [ROUTES.USER.PROFILE]: ['admin', 'reseller', 'end_user']
} as const;

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  ROUTES.HOME,
  ROUTES.LOGIN,
  ROUTES.DEMO,
  ROUTES.REDEEM,
  '/banned', // Allow access to banned page for banned users
  '/forgot-password',
  '/reset-password',
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function getRequiredRoles(pathname: string): string[] | null {
  // Check exact match first
  if (PROTECTED_ROUTES[pathname as keyof typeof PROTECTED_ROUTES]) {
    return [...PROTECTED_ROUTES[pathname as keyof typeof PROTECTED_ROUTES]];
  }

  // Check if pathname starts with any protected route
  for (const [route, roles] of Object.entries(PROTECTED_ROUTES)) {
    if (pathname.startsWith(route)) {
      return [...roles];
    }
  }

  return null;
}

function getUserFromToken(token: string): { role: string } | null {
  try {
    // Decode JWT token payload (works both in edge and node runtimes)
    const base = token.split('.')[1] || '';
    const payloadJson = (() => {
      try {
        // prefer atob if available (edge/browser-like runtimes)
        if (typeof atob === 'function') {
          return atob(base);
        }
      } catch {
        // fallthrough
      }
      // Node fallback
      try {
        return Buffer.from(base, 'base64').toString('utf-8');
      } catch {
        return '';
      }
    })();

    if (!payloadJson) return null;
    const payload = JSON.parse(payloadJson || '{}');

    // Normalize role strings into canonical values used by the app
    const rawRole = String(payload.role ?? '').trim();
    const normalized = rawRole.toLowerCase().replace(/[-\s]/g, '_');

    if (normalized === 'admin') return { role: 'admin' };
    if (normalized === 'reseller') return { role: 'reseller' };
    if (normalized === 'end_user' || normalized === 'enduser' || normalized.includes('user')) return { role: 'end_user' };

    // Fallback: return normalized value
    return { role: normalized };
  } catch {
    return null;
  }
}

function getDefaultRouteForRole(role: string): string {
  switch (role) {
    case 'admin':
      return ROUTES.ADMIN.BASE;
    case 'reseller':
      return ROUTES.RESELLER.BASE;
    case 'end_user':
      return ROUTES.USER.BASE;
    default:
      return ROUTES.HOME;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === ROUTES.DEMO || pathname.startsWith(`${ROUTES.DEMO}/`) || pathname === ROUTES.REDEEM || pathname.startsWith(`${ROUTES.REDEEM}/`)) {
    return NextResponse.next();
  }

  // Skip middleware entirely for static builds
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_STATIC_EXPORT === 'true') {
    return NextResponse.next();
  }

  // Skip middleware for static files and API routes
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/') ||
    pathname.includes('.') // Static files
  ) {
    return NextResponse.next();
  }
  // Get token from cookies or headers
  const token = request.cookies.get(STORAGE_KEYS.AUTH_TOKEN)?.value ||
    request.headers.get('authorization')?.replace('Bearer ', '');

  // Check if route is public
  if (isPublicRoute(pathname)) {
    // If user is authenticated and trying to access login, redirect to dashboard
    if (token && pathname === ROUTES.LOGIN) {
      const user = getUserFromToken(token);
      if (user) {
        const defaultRoute = getDefaultRouteForRole(user.role);
        return NextResponse.redirect(new URL(defaultRoute, request.url));
      }
    }
    return NextResponse.next();
  }

  // Check if route requires authentication
  const requiredRoles = getRequiredRoles(pathname);

  if (requiredRoles) {
    // Route requires authentication
    if (!token) {
      // No token, redirect to login
      const loginUrl = new URL(ROUTES.LOGIN, request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Verify token and check role
    const user = getUserFromToken(token);
    if (!user) {
      // Invalid token, redirect to login
      const loginUrl = new URL(ROUTES.LOGIN, request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Check if user has required role
    if (!requiredRoles.includes(user.role)) {
      // User doesn't have required role, redirect to their default dashboard
      const defaultRoute = getDefaultRouteForRole(user.role);
      return NextResponse.redirect(new URL(defaultRoute, request.url));
    }
  }

  // Handle root path redirect for authenticated users
  if (pathname === ROUTES.HOME && token) {
    const user = getUserFromToken(token);
    if (user) {
      const defaultRoute = getDefaultRouteForRole(user.role);
      return NextResponse.redirect(new URL(defaultRoute, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ]
};
