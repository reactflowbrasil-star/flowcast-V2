/** @type {import('next').NextConfig} */
const isStaticExport = process.env.NEXT_STATIC_EXPORT === 'true';
const appBasePath = '/flowcastv2';

const nextConfig = {
  // This deployment is served from a Coolify path-prefix route.
  basePath: appBasePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: appBasePath,
  },

  // Configure output only for static export builds to avoid disabling Middleware and API in dev/server
  ...(isStaticExport
    ? {
      output: 'export',
      trailingSlash: true,
      skipTrailingSlashRedirect: true,
    }
    : {
      // defaults in dev/server mode
      trailingSlash: false,
      skipTrailingSlashRedirect: false,
    }),

  // Image optimization settings
  // When using output: 'export', Next Image API is not available.
  // Force unoptimized in all environments to avoid runtime errors in dev/export.
  images: {
    unoptimized: true,
  },

  // Headers configuration for development/server mode
  async headers() {
    return [
      {
        // Apply to all routes
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              process.env.NODE_ENV === 'development'
                ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* http://127.0.0.1:* https: chrome-extension:*; style-src 'self' 'unsafe-inline'; img-src * data: blob:; connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:* https: http:; media-src 'self' blob: data: http://localhost:* http://127.0.0.1:* https://localhost:* https://127.0.0.1:*; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';"
                : "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https:; style-src 'self' 'unsafe-inline'; img-src * data: blob:; connect-src 'self' https: http: ws: wss:; media-src 'self' https: http: data: blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; worker-src 'self' blob:;",
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },

  // Webpack configuration (Turbopack will warn; safe to keep for Webpack builds)
  webpack: (config, { isServer }) => {
    // Handle SVG imports
    config.module.rules.push({
      test: /\.svg$/,
      use: ['@svgr/webpack'],
    });
    return config;
  },

  // TypeScript & ESLint during Docker build
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Keep default source maps/minification settings for smaller bundles

  // Redirects
  async redirects() {
    return [
      {
        source: '/dashboard',
        destination: '/',
        permanent: false,
      },
    ];
  },

  turbopack: {},

  // Rewrites for API proxy in dev/server mode
  async rewrites() {
    if (isStaticExport) {
      // Rewrites are not supported in static export
      return [];
    }
    const apiBase =
      process.env.INTERNAL_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:3000';
    return [
      {
        source: '/api/:path*',
        destination: `${apiBase}/api/:path*`,
      },
      {
        source: '/media/:path*',
        destination: `${apiBase}/media/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;

