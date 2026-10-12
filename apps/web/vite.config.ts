// Vite builds the frontend into static files (dist/) that S3 + CloudFront serve (spec §3). No server runs.
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * Where the page may send requests. The demo build (D39) talks to nothing but itself: it has no API or sign-in, so
 * its policy is the strictest. Other builds name the exact API and Cognito addresses.
 */
function connectSources(mode: string): string {
  if (mode === 'demo') return "connect-src 'self'";
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const api = env.VITE_API_URL;
  const region = env.VITE_AWS_REGION;
  if (!api || !region) {
    throw new Error(
      'VITE_API_URL and VITE_AWS_REGION are needed to build the website (see scripts/deploy-web.sh).',
    );
  }
  return `connect-src 'self' ${new URL(api).origin} https://cognito-idp.${region}.amazonaws.com`;
}

/**
 * Production builds only: adds a Content Security Policy to index.html that names the exact API and Cognito
 * addresses this build talks to. CloudFront's CSP header (infra/template.yaml) can only allow "any API Gateway in the
 * region"; browsers enforce every policy they're given, so this one narrows it to ours (P9.3 security review).
 */
function exactConnectSrc(mode: string): Plugin {
  return {
    name: 'dropabop-exact-connect-src',
    apply: 'build',
    transformIndexHtml(html) {
      const policy = connectSources(mode);
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      );
    },
  };
}

/**
 * Security headers for hosts that read a `_headers` file (Cloudflare Pages, the temporary host in ADR-0010). Same
 * policy as CloudFront's response headers (infra/template.yaml → WebSecurityHeaders), with the exact API address.
 * Headers can do what the page's own policy can't (refuse to be framed, force HTTPS). On CloudFront the file is just
 * an unused static file.
 */
function securityHeadersFile(mode: string): Plugin {
  return {
    name: 'dropabop-security-headers-file',
    apply: 'build',
    generateBundle() {
      const policy = [
        "default-src 'self'",
        // YouTube's embedded player: its loader, the player script it fetches, and its frame. Only those paths, not
        // all of www.youtube.com (ADR-0011, P13.3; checked with the real player on 2026-10-09).
        "script-src 'self' https://www.youtube.com/iframe_api https://www.youtube.com/s/player/",
        'frame-src https://www.youtube.com',
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https://*.mzstatic.com",
        connectSources(mode),
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join('; ');
      const headers = [
        '/*',
        `  Content-Security-Policy: ${policy}`,
        '  Strict-Transport-Security: max-age=63072000; includeSubDomains',
        '  X-Content-Type-Options: nosniff',
        '  X-Frame-Options: DENY',
        '  Referrer-Policy: strict-origin-when-cross-origin',
        '',
      ].join('\n');
      this.emitFile({ type: 'asset', fileName: '_headers', source: headers });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), exactConnectSrc(mode), securityHeadersFile(mode)],
  server: { port: 5173, strictPort: true },
}));
