import type { NextConfig } from 'next';

// Opt in only for the exact AI Studio preview hostname; never allow *.run.app.
// Production ignores this setting and retains the original anti-framing header.
const previewHost = process.env.NODE_ENV === 'development'
  ? process.env.BHUVERIFY_PREVIEW_HOST?.trim() : undefined;
if (previewHost && !/^(?=.{1,253}$)[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?)+$/i.test(previewHost)) {
  throw new Error('BHUVERIFY_PREVIEW_HOST must be an exact hostname, without a scheme, port, path or wildcard.');
}

const config: NextConfig = {
  output: 'standalone', poweredByHeader: false, devIndicators: false,
  ...(process.env.NODE_ENV === 'development' ? { experimental: { reactDebugChannel: false } } : {}),
  ...(previewHost ? { allowedDevOrigins: [previewHost] } : {}),
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'same-origin' },
      ...(previewHost
        ? [{ key: 'Content-Security-Policy', value: "frame-ancestors 'self' https://aistudio.google.com" }]
        : [{ key: 'X-Frame-Options', value: 'DENY' }]),
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }];
  },
};
export default config;
