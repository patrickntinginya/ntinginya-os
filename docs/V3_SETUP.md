# Personal Life OS V3 - Setup Guide (for beginners)

> **Gemini integration verification (October 7, 2026):** 168 automated tests passed. Live Gemini responses and a
> validated task proposal were checked without changing user records. Authenticated function tests used mocked
> services, not a real signed-in account. Build and deployment validation were left to the managed platform;
> the new production deployment was not confirmed. Real browser flows and PWA installation still need verification.
> No SQL migrations or SQL isolation tests were executed during this integration.

## 0. What you need
- Node.js 20 or newer (https://nodejs.org) and a terminal.
- A free Supabase account (https://supabase.com) and a Netlify account (https://netlify.com).
- Optional: a Google Gemini API key for the AI features. Other existing providers remain supported; the app works without AI.

## 1. Install and test the code
```bash
npm install
npm test          # unit tests - should all pass
npm run build     # production build - should finish without errors
```
There is no lint tool configured, so there is no `npm run lint`.

## 2. Supabase
1. Create a project in Supabase.
2. Open **SQL Editor -> New query**. Paste the whole of `supabase/migrations/001_v1_foundation.sql` and press **Run**.
   (If you already ran V1, skip this file.)
3. New query again. Paste `supabase/migrations/002_v2.sql` and **Run** it **once**. Then do the same with `supabase/migrations/003_v3.sql` (habits, links between goals/projects/ideas/notes, AI on/off switch, account deletion).
   Both migrations are additive: they never drop a table or delete your rows.
   - It never deletes a table. It adds columns and tables, and maps old values to new ones:
     goals `not_started`/`in_progress` become `active`; ideas `new`->`idea`, `building`->`active`,
     `launched`->`completed`, `archived`->`paused`.
   - Profiles that still had the V1 default currency `USD` are switched to `TZS`.
4. **Authentication -> URL Configuration:** set *Site URL* to your Netlify address and add
   `http://localhost:8888/**`, `http://localhost:5173/**` and your Netlify address with `/**` to *Redirect URLs*.
5. **Project Settings -> API:** copy the *Project URL* and the *anon public* key. Never use the `service_role` key.

### Row Level Security (RLS) - what keeps your data private
Every table has `user_id` and four policies (select / insert / update / delete) that only allow rows where
`user_id = auth.uid()`. Logged-out visitors have no table access. A trigger also stops a record linking to another
person's goal/project/task/conversation. **Do not turn RLS off to "make something work".**

### Prove it: the isolation test
Open a new SQL query, paste `supabase/tests/rls_isolation.sql` and run it. It creates two fake users, tries to read and
change one user's data as the other, prints `PASS`/`FAIL` lines in the *Messages* tab and rolls everything back.
You want to see `ALL CHECKS PASSED`. Run it again after any future schema change.

## 3. Environment variables
Copy `.env.example` to `.env` and fill in:

| Name | Where it runs | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | browser | Project URL |
| `VITE_SUPABASE_ANON_KEY` | browser | anon public key only |
| `AI_PROVIDER` | **server only** | `gemini`, `anthropic`, `openai`, `ollama` or `none`. Unset + `GEMINI_API_KEY` selects Gemini; otherwise `AI_API_KEY` retains the Anthropic fallback |
| `GEMINI_API_KEY` | **server only** | Google Gemini key. Set in Netlify with Functions scope for the relevant deployment contexts. Never prefix with `VITE_` |
| `AI_API_KEY` | **server only** | optional. Never starts with `VITE_` |
| `AI_MODEL` | server only | defaults: gemini `gemini-3.5-flash`, anthropic `claude-sonnet-5-5`, openai `gpt-4o-mini`, ollama `llama3.1` |
| `AI_BASE_URL` | server only | needed for ollama (must be reachable from Netlify, not your laptop's localhost) |
| `AI_MAX_TOKENS` | server only | default 1400 |
| `AI_DAILY_LIMIT` | server only | AI messages per user per 24h, default 100 |

With no provider/key every AI screen says **"AI Assistant is not configured yet."** and the rest of the app works.

## 4. Run locally
- Everything except AI: `npm run dev` (http://localhost:5173).
- With AI: `npx netlify dev` (http://localhost:8888). It runs the app and the AI function together.
  `npm run dev` cannot run the function, so AI shows "not available here".

## 5. How the AI works (and its limits)
- The browser calls `netlify/functions/ai-chat.js` with your login token. The function checks the token with Supabase,
  reads **your** rows using that same token (so RLS applies), builds a summary of your real data, and calls the model.
- The model is told to use only that data and to say "Not enough data yet" instead of guessing.
- The AI **cannot change anything**. It can only *propose* actions. Each proposal is saved as `pending` and appears as a
  card with **Confirm** / **Cancel**. Only Confirm writes to your data. The AI cannot propose deletions.
- Money amounts are in TZS and shown as `TSh 20,000`. Financial comments are general guidance, not professional advice.
- The function stops waiting for the model after 24 seconds. Netlify's default function limit may be shorter (often 10 s
  on the free plan), so long answers can time out there. If that happens, raise the function timeout in Netlify or shorten the question.
- AI daily/weekly reviews and the idea validator use only your data. The idea validator does **no** web/market research.

## 6. Deploy to Netlify
1. Push the project to GitHub (`.env` is git-ignored - never commit it) and import it in Netlify.
   Build command `npm run build`, publish directory `dist` (already in `netlify.toml`).
2. Add the environment variables from section 3 in **Site settings -> Environment variables**. Redeploy.
3. Open the site, register, and check the dashboard loads.

## 7. Install on Android (PWA)
Open the Netlify address in Chrome -> menu -> **Install app** (or *Add to Home screen*). HTTPS is required (Netlify provides it).
**Offline:** only the app shell is cached. Your data needs a connection. There is no offline editing.

## 8. Reminders and notifications - what is real
- The **Notifications** page is built from your data (overdue tasks, due reminders, budget at 70/90/100%, goal and learning deadlines).
- **Device notifications** (Settings): the app asks permission when you press the button and has a **Send test** button.
  Notifications are shown **while the app is open or running in the background on your phone**. Push to a fully closed
  app needs a push server, which V2 does not have. The app never says a notification was delivered unless the browser
  accepted it.

## 9. Manual test checklist
Sign up two accounts (use two browsers). For each item, confirm it works as expected:
1. Register, log in, log out, forgot password. 2. Add a task, mark it done, add a recurring task. 3. Add an event and
view Day/Week/Month. 4. Add a reminder. 5. Add income and an expense: amounts show as `TSh`. 6. Create a budget and
watch the warning at 70/90/100%. 7. Create a savings goal and add money. 8. Open Finance -> Overview charts.
9. Create a goal with milestones, link a task. 10. Add a learning topic and log a study session. 11. Add an idea.
12. Create a project, note, and use Search. 13. Open Notifications; mark read/unread. 14. AI: ask a question, then
confirm one proposed action and cancel another. 15. In account B confirm you cannot see anything from account A.
16. Install the PWA on Android and check it opens full screen. Also run `supabase/tests/rls_isolation.sql`.

## 10. Troubleshooting
- "Database tables are missing": run the migrations.
- Blank page + "Supabase is not configured": set the two `VITE_` variables and restart.
- AI says "not configured": set `AI_API_KEY` on the server (Netlify) and redeploy.
- AI says "not available here": use `npx netlify dev`.


## 11. V3 additions - what they are and how to check them
- **Home (Dashboard):** Life Score, daily briefing, rule-based insights, today, goals, projects, finance, learning and habits. Works without AI.
- **Life Score:** each dimension (productivity, goals, finance, learning, habits, planning) is computed from your records and shows its reason. A dimension with too little data is left out instead of guessed.
- **Habits:** daily/weekday habits, streaks, weekly and monthly completion, archive. Reminder time creates an in-app notification.
- **Goal -> Project -> Task:** "Create project" on a goal; progress rolls up from milestones and tasks. Converting an idea/note/topic twice does not create a duplicate (the database enforces one conversion per source).
- **Finance -> Smart tab:** month-end forecast per budget, unusual spending vs last month, recurring expenses still to come, and "Can I afford this?" (the calculation is shown line by line).
- **Weekly review:** now includes projects and habits. All statistics work without AI; the AI button only adds a written summary.
- **Settings:** AI status (provider/model/status, never the key) and an on/off switch, data export (JSON), and account deletion (type DELETE).
- **Offline:** an offline banner is shown when the phone loses connection. Only the app shell is cached; your data needs internet.

## 12. Account deletion
Settings -> Privacy -> type `DELETE`. This calls the database function `delete_my_account()` (created by 003_v3.sql), which only acts on the signed-in user and removes their account and, through cascading foreign keys, all their records. No service-role key is used anywhere.
