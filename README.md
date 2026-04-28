# HealthForge

AI-assisted health planning platform built with Next.js, SQLite, and WhatsApp notifications.

## Overview

HealthForge helps you:
- Manage individual health profiles and profile groups
- Generate AI-based health plans (preview + save flow)
- Chat with AI in profile context
- Schedule and send WhatsApp reminders from saved plans

## Tech Stack

- Next.js 15 (App Router)
- React 19 + TypeScript
- SQLite (`better-sqlite3`)
- NextAuth (auth/session)
- Baileys (WhatsApp Web integration)
- node-cron (background queue worker)

## Environment Variables

Copy `.env.example` to `.env.local` and set values for your environment.

- `NEXTAUTH_SECRET`: required in production; use a long random value
- `NEXTAUTH_URL`: app base URL (`http://localhost:3000` in local)
- `LITELLM_API_URL`: OpenAI-compatible endpoint for generation/chat
- `LITELLM_API_KEY`: optional key for LLM endpoint
- `DEFAULT_MODEL`: default model used by AI routes/settings

## Project Structure

```text
src/
  app/
    (auth)/              # Login/signup pages
    (app)/               # Dashboard/profiles/groups/settings pages
    api/                 # API routes
  components/            # Reusable UI components
  lib/                   # DB, AI, auth, scheduler, WhatsApp helpers
  instrumentation.ts     # Boot-time scheduler startup
scripts/
  connect-whatsapp.ts    # WhatsApp login/status helper
  test-notification.ts   # Send/queue/flush notification tester
healthforge.db           # SQLite database
wa_auth/                 # WhatsApp auth session files
```

## Prerequisites

- Node.js 20+
- npm 10+
- A local/remote LLM API endpoint (OpenAI-compatible interface expected by app settings)
- A dedicated WhatsApp number for bot automation (recommended)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create/update local env file (`.env.local`) with auth/app values used by NextAuth.
   You can start from `.env.example`.

3. Start dev server:

```bash
npm run dev
```

4. Open `http://localhost:3000`.

## Build & Run

```bash
npm run build
npm run start
```

## Quality Gates

```bash
npm run lint
npm run typecheck
npm run build
npm run check
```

## Core Usage Flow

1. Sign up / log in
2. Create one or more profiles
3. (Optional) Create profile groups
4. Configure AI settings in **Settings**
5. Generate plan in **Plan** tab
6. Save plan preview
7. Go to **Plans & Notifications** tab to generate/schedule messages

## WhatsApp Setup

Authenticate WhatsApp once (stores session in `wa_auth/`):

```bash
npx tsx scripts/connect-whatsapp.ts login
```

Check status:

```bash
npx tsx scripts/connect-whatsapp.ts status
```

## Notification Test Script

- Send immediately:

```bash
npx tsx scripts/test-notification.ts send <phone> '<message>'
```

- Queue for a specific time:

```bash
npx tsx scripts/test-notification.ts queue <phone> <YYYY-MM-DDTHH:mm> '<message>'
```

- Flush all due `pending` messages now:

```bash
npx tsx scripts/test-notification.ts flush
```

Backward-compatible shorthand is also supported:

```bash
npx tsx scripts/test-notification.ts <phone> '<message>'
npx tsx scripts/test-notification.ts <phone> <YYYY-MM-DDTHH:mm> '<message>'
```

## Scheduler Behavior

- Background worker starts at app boot via `src/instrumentation.ts`
- It checks queued messages every minute
- Due messages (`scheduled_for <= now`) are sent and marked `submitted`/`failed`

## Key API Routes

- `POST /api/plans` / `GET /api/plans?profileId=...`
- `POST /api/groups/:id/plan` / `GET /api/groups/:id/plan`
- `GET|POST|DELETE /api/messages`
- `PUT|DELETE /api/messages/:id`
- `GET|PUT /api/settings`

## Notes

- SQLite schema auto-initializes in `src/lib/db.ts`
- Existing DB migrations are additive (`ALTER TABLE ...` wrapped in `try/catch`)
- Use a non-primary WhatsApp account for automation to reduce account-risk exposure
- In production, set a strong `NEXTAUTH_SECRET` and point `NEXTAUTH_URL` to the deployed HTTPS domain.

## Production Checklist

1. Set production env values (`NEXTAUTH_SECRET`, `NEXTAUTH_URL`, LLM URL/key/model).
2. Run `npm run check` in CI before deploy.
3. Run behind HTTPS reverse proxy.
4. Persist and back up `healthforge.db` and `wa_auth/`.
5. Run a single scheduler instance to avoid duplicate message sends.

## Troubleshooting

- If notifications remain `pending`, verify:
  - WhatsApp is connected (`status` command)
  - `scheduled_for` is in the past/current time
  - app server is running (scheduler active)
- If AI generation fails, check API URL/key/model in Settings.
