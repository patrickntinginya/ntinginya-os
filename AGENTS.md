# Personal Life OS V3

This repository contains the user's final V3 project, imported unchanged from the uploaded archive. Preserve its existing architecture and source code when performing deployment work.

## Architecture and directories

The application uses React 18, Vite 5, React Router, Tailwind CSS, and vite-plugin-pwa. Existing Supabase services provide authentication and persistent data. The root `package.json` and `netlify.toml` are the original deployment files.

- `src/pages`, `src/components`, and `src/layouts` contain the interface.
- `src/contexts`, `src/hooks`, `src/services`, `src/lib`, and `src/utils` contain authentication, data access, and domain logic.
- `public` contains the PWA assets.
- `netlify/functions/ai-chat.js` is the existing optional AI endpoint; `netlify/lib/ai` contains its supporting modules.
- `supabase/migrations` and `supabase/tests` contain supplied SQL, not permission to execute it.
- `tests`, `README.md`, and `docs/V3_SETUP.md` contain the existing tests and documentation.

## Conventions and deployment

Follow the existing JavaScript/JSX ES module conventions. Do not replace the application with a template, change its database provider, or add credentials. Preserve the original build settings: `npm run build`, publish directory `dist`, Node.js 20, and functions directory `netlify/functions`.

The frontend needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` available during compilation to work. Without them it displays the existing configuration-missing screen. The AI function accepts the same variables at runtime, or `SUPABASE_URL` and `SUPABASE_ANON_KEY`. AI remains optional; do not add AI API keys for deployment work.

Never print environment-variable values, execute Supabase migrations or SQL tests, reset or modify the existing database, or perform account deletion as part of deployment diagnosis. The managed platform performs installation and build validation; do not run local builds, tests, or development servers in this environment. Distinguish deployment preparation from a confirmed successful production deployment.
