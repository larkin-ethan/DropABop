// Which builds run on sample data instead of the real API (D39).
//
// - `--mode sample` on the dev server: Ethan's local preview of every screen.
// - `--mode demo` builds: the public demo site (a separate site, scripts/deploy-demo.sh). No AWS settings at all, so
//   it can't reach the real app or its data; everything lives in the visitor's browser tab and a refresh resets it.
//
// Both are decided when the code is built (Vite replaces import.meta.env), so the real app's production build is
// false here and the bundler leaves the sample API and its data out (scripts/deploy-web.sh checks that).

export const IS_DEMO_BUILD = import.meta.env.MODE === 'demo';

export const IS_SAMPLE_BUILD = (import.meta.env.DEV && import.meta.env.MODE === 'sample') || IS_DEMO_BUILD;
