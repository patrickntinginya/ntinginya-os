# Personal Life OS - V3

One system for time, tasks, goals, projects, money, learning, notes, ideas and habits. React + Vite + Tailwind +
Supabase (auth, Postgres, Row Level Security) + PWA, deployed on Netlify. Money is in **Tanzanian Shillings** (stored as
numeric, shown as `TSh 1,500,000`).

> **Verification status.** Written in an environment with no npm registry and no database. **Run so far:** `npm test`
> (120 unit/wiring tests, all passing) and a script that checks every file parses and every import resolves.
> **Not run yet:** `npm install`, `npm run build`, `npm run preview`, the SQL migrations, `supabase/tests/rls_isolation.sql`,
> the Netlify function, PWA installation, and any screen in a real browser or phone. Do those first (see docs/V3_SETUP.md).

## What it does
- **Home:** Life Score (transparent, per-dimension reasons), daily briefing, rule-based insights, today, goals, projects, finance, learning, habits.
- **Today / Planner / Schedule (day, week, month) / Tasks / Reminders:** smart priority (shown as a recommendation, you can override), free-time plan that is only *proposed* until you confirm.
- **Goals -> Projects -> Tasks:** milestones, project progress, "Create project" from a goal, progress rolls up.
- **Habits:** weekday schedules, streaks, longest streak, weekly/monthly completion, history, archive.
- **Finance (TSh):** transactions, categories, budgets, savings goals, recurring items, charts, month-end forecast, unusual spending, and a "Can I afford this?" calculator that shows its arithmetic.
- **Second Brain:** notes, ideas, learning and projects linked; one-click idea -> project/task, note -> project/task, topic -> goal, goal -> project, without duplicates.
- **Search** (grouped by type), **Notifications** (in-app), **Insights**, **Daily and Weekly reviews** (statistics work without AI).
- **AI Assistant (optional):** chat with history, reviews, idea validator, goal coach, learning plans. Uses summaries of your own data and can only *propose* actions.
- **Settings:** profile, notifications, AI status/switch, theme, JSON data export, account deletion.

## Architecture
```
src/pages, components, layouts   UI (mobile-first; bottom navigation on phones, sidebar on desktop)
src/utils                        pure calculation code (tested): habits, lifeScore, financeIntel, briefing, reviews, planner, ...
src/services, hooks              Supabase access; every query runs as the signed-in user, so RLS applies
src/lib/ai/actions.js            AI action definitions + validation (shared by browser and server)
netlify/functions/ai-chat.js     the only server code: verifies the user, builds a data summary, calls the AI provider
netlify/lib/ai/providers/        anthropic, openai, ollama  (gemini is recognised but NOT implemented)
supabase/migrations/001..003     schema (additive); supabase/tests/rls_isolation.sql
tests/                           node --test
```

## Setup (short version; full beginner guide in docs/V3_SETUP.md)
1. `npm install`, `npm test`, `npm run build`.
2. In Supabase SQL editor run `001_v1_foundation.sql`, `002_v2.sql`, `003_v3.sql` in order (skip ones already run). Then run `supabase/tests/rls_isolation.sql` and expect `ALL CHECKS PASSED`.
3. Copy `.env.example` to `.env` and fill the two `VITE_` values. Add the redirect URLs in Supabase Auth settings.
4. `npm run dev` (everything except AI) or `npx netlify dev` (with AI).

## Environment variables
| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | browser | Supabase project (anon key only) |
| `AI_PROVIDER` | server | `anthropic`, `openai`, `ollama`, `none` (empty + key = anthropic) |
| `AI_API_KEY` | server | provider key; never exposed to the browser |
| `AI_MODEL`, `AI_BASE_URL`, `AI_MAX_TOKENS`, `AI_DAILY_LIMIT` | server | optional tuning (`AI_BASE_URL` needed for ollama) |

## Deploy to Netlify
Build `npm run build`, publish `dist`, functions `netlify/functions` (all in `netlify.toml`). Add the variables above in Netlify, add your site URL to Supabase redirect URLs, redeploy.
The two `VITE_SUPABASE_` variables must include the **Builds** scope and the deployment context being built (production or deploy preview). Vite embeds them during compilation; adding variables does not update an already-published bundle. A new deployment is required. Production builds now stop with the missing variable names instead of publishing the configuration-missing screen. Variable values are never included in that error.
The service-worker config keeps `/.netlify/` calls away from the cached app shell.

## Install as an app (PWA)
Open the site in Android Chrome -> menu -> Install app. It opens standalone with the Life OS icon. **Offline:** only the app shell is cached and an offline banner is shown; data needs a connection. This is a PWA, **not** an APK.

## AI configuration and no-AI mode
With no provider/key the whole app works; AI screens say "AI Assistant is not configured yet." The AI never writes to your data: it proposes actions that are saved as `pending`, and only your **Confirm** executes them. It cannot propose deletions. Financial text is general guidance, not professional advice. No provider is permanently free: you pay your provider, and `AI_DAILY_LIMIT` caps usage per user.

## Security
- Every user table has `user_id` + RLS (select/insert/update/delete only where `user_id = auth.uid()`); `anon` has no table access.
- A database trigger rejects links to another user's goal/project/task/idea/note/conversation.
- The AI function verifies the caller's token, reads data with that token (RLS applies), validates input size and every proposed action, and logs no user data.
- No service-role key is used anywhere. Account deletion uses a database function that only acts on `auth.uid()`.
- Search terms are sanitised before use in queries; React escapes rendered text.

## Testing
`npm test` runs 120 tests (habits and streaks, Life Score, finance intelligence and affordability, conversions without duplicates, daily briefing, weekly review, notification rules, AI provider selection and no-AI fallback, action validation, schema/migration checks, security and wiring checks). Database isolation is tested by `supabase/tests/rls_isolation.sql`, which you must run yourself.

## Known limitations
- Not built or run in the authoring environment (see top).
- **No push notifications.** Notifications are in-app; device alerts appear only while the app is open/running. The code is not push-ready beyond that, and Android push is not implemented or tested.
- Gemini is not implemented. Ollama needs a server address reachable from Netlify.
- AI calls stop after 24 s; Netlify's default function timeout may be shorter.
- No lint tool is configured. Rate limiting is a per-user daily message cap only.
- Life Score weights are simple, documented rules, not a validated model.
- Dashboards read up to 1000 rows per table (finance totals are computed in SQL); very large histories are not paginated in every list.
- Monthly recurring items on day 29-31 may drift to earlier days after short months.
- Habit reminder times create in-app notifications only.
