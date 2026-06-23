# HealthForge Architecture

HealthForge is a local-first health planning web app. It combines profile management, AI-generated health plans, plan-aware chat, group planning, and scheduled WhatsApp reminders. The app is built as a Next.js App Router application backed by a local SQLite database.

## System Overview

```text
Browser UI
  -> Next.js pages and components
  -> Next.js API routes
  -> SQLite via better-sqlite3
  -> AI provider via OpenAI-compatible chat completions
  -> WhatsApp Web via Baileys
```

Core runtime pieces:

- `src/app/(auth)` contains login and signup screens.
- `src/app/(app)` contains authenticated app pages: dashboard, profiles, groups, settings, and help.
- `src/app/api` contains all server-side API routes.
- `src/lib/db.ts` owns SQLite connection, schema creation, additive migrations, and indexes.
- `src/lib/ai.ts` owns AI provider config and prompt construction.
- `src/lib/auth.ts` owns NextAuth credentials auth.
- `src/lib/scheduler.ts` owns background queued-message processing.
- `src/lib/whatsapp.ts` owns the Baileys WhatsApp socket and delivery/read receipt handling.
- `src/components/CommunicationsTab.tsx` owns the Plans & Notifications table UI.

## Data Model

SQLite database file:

- `healthforge.db`

Important tables:

- `users`: application users with bcrypt password hashes.
- `auth_event_logs`: login/logout related audit events.
- `profiles`: user-owned health profiles, including demographics, health constraints, phone number, and archive state.
- `profile_groups`: user-owned profile groups.
- `profile_group_members`: join table between groups and profiles.
- `health_plans`: saved profile or group plans. Group plans use `group_id`; profile plans use `profile_id`.
- `chat_sessions`: user-owned chat threads linked to a profile or group and optionally a selected plan.
- `chat_messages`: persisted user and assistant messages.
- `user_settings`: AI provider settings, admin WhatsApp number, and default country.
- `queued_messages`: generated notification queue with WhatsApp transport status.
- `notification_schedules` and `whatsapp_config`: older compatibility tables still present in schema.

Schema evolution is handled inside `initSchema()` in `src/lib/db.ts` with `CREATE TABLE IF NOT EXISTS` plus additive `ALTER TABLE` blocks. This project currently does not use a standalone migration tool.

## Authentication

Authentication uses NextAuth Credentials provider in `src/lib/auth.ts`.

Flow:

1. Signup calls `POST /api/signup`.
2. Passwords are hashed with bcrypt and stored in `users.password_hash`.
3. Login uses `src/lib/auth.ts` to compare the submitted password against the stored hash.
4. Session strategy is JWT.
5. Authenticated layout in `src/app/(app)/layout.tsx` protects app routes and displays user context.

Production requires `NEXTAUTH_SECRET`.

## Profiles, Groups, And Plans

Profile routes:

- `GET /api/profiles`
- `POST /api/profiles`
- `GET /api/profiles/[id]`
- `PUT /api/profiles/[id]`
- `DELETE /api/profiles/[id]`

Group routes:

- `GET /api/groups`
- `POST /api/groups`
- `GET /api/groups/[id]`
- `PUT /api/groups/[id]`
- `DELETE /api/groups/[id]`

Plan routes:

- `GET /api/plans?profileId=...`
- `POST /api/plans`
- `DELETE /api/plans`
- `PATCH /api/plans`
- `GET /api/groups/[id]/plan`
- `POST /api/groups/[id]/plan`
- `DELETE /api/groups/[id]/plan`
- `PATCH /api/groups/[id]/plan`

Plan generation uses `src/lib/ai.ts` prompts:

- Profile plans use `buildSystemPrompt()` and `buildPlanPrompt()`.
- Group plans use `buildGroupSystemPrompt()` and `buildGroupPlanPrompt()`.

Saved plans are displayed and managed in `CommunicationsTab`. The table supports search, sort, pagination, viewing full plan content, manual plan creation, archive/delete actions, CSV export, and starting a chat with a selected plan as context.

## AI Integration

AI settings are user-configurable in Settings and stored in `user_settings`:

- `api_url`
- `api_key`
- `preferred_model`

`src/lib/ai.ts` reads user settings with fallback environment defaults:

- `LITELLM_API_URL`
- `LITELLM_API_KEY`
- `DEFAULT_MODEL`

The app expects an OpenAI-compatible `/v1/chat/completions` API.

Main AI use cases:

- Generate profile health plans.
- Generate group health plans.
- Chat about a profile or group.
- Chat with a selected plan injected into context.
- Generate queued WhatsApp notification messages from a plan.
- Generate updated plan drafts from chat via `src/app/api/chat/session-plan/route.ts`.

## Chat Architecture

Chat route:

- `POST /api/chat`
- `GET /api/chat?sessionId=...`

Chat session listing:

- `GET /api/chat/sessions?profileId=...`
- `GET /api/chat/sessions?groupId=...`

Chat supports two scopes:

- Profile chat: profile health data is injected into the system prompt.
- Group chat: all group members are injected into the system prompt.

Optional plan context:

- The UI lets users select a plan before chatting.
- `planId` is sent to `POST /api/chat`.
- The API verifies the plan belongs to the selected profile or group.
- The selected plan title, ID, and content are appended to the system prompt.
- New chat sessions store `plan_id`.

Responses are streamed using the AI provider response stream. The route captures streamed assistant output and stores the complete assistant message when the stream flushes.

## Notifications And WhatsApp Queue

Notification generation route:

- `GET /api/messages`
- `POST /api/messages`
- `DELETE /api/messages`
- `PUT /api/messages/[id]`
- `DELETE /api/messages/[id]`

`POST /api/messages` asks the AI to produce structured notification items from a selected plan. It validates:

- exactly one target entity: `profile_id` or `group_id`
- plan ownership
- phone numbers
- start date
- manual or AI-selected day/frequency settings

Phone normalization is centralized in `src/lib/phone.ts`.

### Timezone-Aware Scheduling

Schedule times are generated by the AI in `HH:MM` (24h) local time format. The browser sends its `getTimezoneOffset()` (minutes west of UTC) with every `POST /api/messages` request. The backend converts each AI-generated local time to an exact UTC timestamp using `Date.UTC` plus the offset, so messages fire precisely at the intended local time regardless of the server's own timezone (e.g. UTC inside Docker).

Supported queue statuses:

- `pending`
- `submitting`
- `submitted` — accepted by the WhatsApp client socket; not yet confirmed delivered to the recipient device.
- `delivered` — receipt event confirmed delivery to recipient.
- `read` — receipt event confirmed read by recipient.
- `failed`

`src/lib/scheduler.ts` runs every minute and processes due `pending` messages:

1. Lock row by setting `status = 'submitting'`.
2. Send via `sendWhatsAppMessage()`.
3. Store `wa_message_id`.
4. Mark as `submitted`.
5. Mark as `failed` with `last_error` if sending throws.

`src/lib/whatsapp.ts` listens for Baileys receipt events:

- `message-receipt.update`
- `messages.update`

Those events promote queued messages from `submitted` to `delivered` or `read` using `wa_message_id`. Status promotion is monotonic, so a later weaker signal cannot downgrade a message.

> **Important**: The database must be writable for receipt events to be stored. If the process does not have write permissions to `healthforge.db`, delivery/read status updates will silently fail and rows will stay as `submitted`.

The scheduler starts from `src/instrumentation.ts` when the Next.js runtime registers in Node.js.

## WhatsApp Scripts

Admin WhatsApp connection:

```bash
npx tsx scripts/connect-whatsapp.ts login
npx tsx scripts/connect-whatsapp.ts status
npx tsx scripts/connect-whatsapp.ts logout
```

Auth state is stored in:

- `wa_auth/`

Notification test helper:

```bash
npx tsx scripts/test-notification.ts send <phone> '<message>' [--country IN]
npx tsx scripts/test-notification.ts queue <phone> <YYYY-MM-DDTHH:mm> '<message>' [--country IN]
npx tsx scripts/test-notification.ts flush
```

`flush` processes due `pending` rows only. It intentionally does not retry `failed` rows.

## Important UI Components

- `src/components/CommunicationsTab.tsx`: plan management and notification queue UI.
- `src/components/PedigreeGraph.tsx`: graph view of relationships using React Flow.
- `src/components/PlanDocument.tsx`: plan rendering helper.

Profile and group detail pages host the main workflows:

- `src/app/(app)/profiles/[id]/page.tsx`
- `src/app/(app)/groups/[id]/page.tsx`

Both support plan generation, plan-aware chat, and notifications.

## Operational Notes

Development:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Full check:

```bash
npm run check
```

**Production Docker Deployment:**

HealthForge supports a standalone Docker deployment to ensure a consistent, production-ready environment. The `Dockerfile` leverages Next.js standalone output to minimize image size.

```bash
docker compose up --build -d
```

The `docker-compose.yml` uses **Host Bind Mounts** (not named Docker volumes):
- `./healthforge.db` → `/app/data/healthforge.db` — SQLite database lives directly on the host filesystem.
- `./wa_auth` → `/app/wa_auth` — Baileys WhatsApp authentication state.

This means the same `healthforge.db` and `wa_auth/` folder are shared between `npm run dev` and Docker with no copying required.

Since the container runs as root (to avoid `EACCES`/`SQLITE_READONLY` on host-mounted files), WhatsApp auth can be done from the **host** directly:
```bash
npx tsx scripts/connect-whatsapp.ts login
```

### Docker Proxy Auto-Discovery

The Dockerfile sets `ENV DOCKER_CONTAINER=true`. `src/lib/ai.ts` checks this flag at runtime. If the user-configured `api_url` points to `localhost` or `127.0.0.1`, the app automatically rewrites it to `host.docker.internal` so the container can reach an LLM proxy (e.g. LiteLLM) running on the Docker host. This logic is **skipped entirely** outside of Docker, so `npm run dev` behaviour is unaffected.

The project is local-first and stores data locally in SQLite. Do not commit local runtime files such as `healthforge.db`, `healthforge.db-wal`, `healthforge.db-shm`, `.next/`, or `wa_auth/`.

## Extension Guidelines

- Add DB columns through `src/lib/db.ts` additive migrations unless a formal migration system is introduced.
- Keep user ownership checks in every API route before reading or mutating profile, group, plan, chat, or queue data.
- Prefer adding helper functions in `src/lib` when behavior is shared across UI, API routes, and scripts.
- Keep phone handling centralized through `src/lib/phone.ts`.
- Treat `submitted` as "accepted by WhatsApp client", not delivered to the recipient.
- Use `delivered` and `read` only when receipt events confirm them.
- Keep queue retries explicit. Current `flush` behavior is pending-only by design.

