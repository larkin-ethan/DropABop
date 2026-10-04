// Vite builds the frontend into static files (dist/) that S3 + CloudFront serve (spec §3). No server runs.
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv, type Plugin } from 'vite';

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
      const env = loadEnv(mode, process.cwd(), 'VITE_');
      const api = env.VITE_API_URL;
      const region = env.VITE_AWS_REGION;
      if (!api || !region) {
        throw new Error(
          'VITE_API_URL and VITE_AWS_REGION are needed to build the website (see scripts/deploy-web.sh).',
        );
      }
      const origin = new URL(api).origin;
      const policy = `connect-src 'self' ${origin} https://cognito-idp.${region}.amazonaws.com`;
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      );
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), exactConnectSrc(mode)],
  server: { port: 5173, strictPort: true },
}));
