# HealthForge

AI-assisted health planning for individuals, families, groups, and care networks.

HealthForge helps you create rich health profiles, generate personalized wellness plans with an OpenAI-compatible model, chat with an AI assistant in profile context, and turn saved plans into WhatsApp reminders.

## What You Can Do

### Manage Health Profiles

- Create and manage profiles for yourself, family members, friends, clients, or community members.
- Capture age, gender, height, weight, BMI, activity level, dietary preferences, allergies, medications, medical conditions, and personal goals.
- Use profile context to generate more relevant health, lifestyle, diet, fitness, and habit plans.
- Keep multiple profiles organized from one dashboard.

### Generate AI Health Plans

- Generate personalized plans from each profile or group.
- Create weekly, monthly, or custom-duration health and lifestyle plans.
- Tailor output around goals, medical constraints, diet preference, activity level, allergies, and notes.
- Preview plans before saving them.
- Save generated plans for later review, communication, and reminder scheduling.

### Chat With an AI Health Assistant

- Ask follow-up questions in the context of a selected profile or group.
- Refine plans through chat interactions.
- Request lifestyle guidance, habit recommendations, meal ideas, activity adjustments, and plan improvements.
- Use the configured LLM endpoint through LiteLLM or any OpenAI-compatible API.

### Manage Families and Groups

- Create profile groups for families, teams, clients, or wellness circles.
- Generate plans that consider multiple members together.
- Coordinate family meals, group activities, wellness routines, fitness challenges, or shared health goals.
- Manage group members and group plans from a central view.

### Schedule Smart Notifications

- Convert saved plans into reminder messages.
- Schedule WhatsApp notifications with flexible timing.
- Track message status through the notification queue.
- Send immediate test messages or flush pending messages using helper scripts.
- Let the background scheduler process due reminders automatically.

### Configure AI Per User

- Use `.env` defaults for API URL, API key, and model.
- Keep the default API key hidden from the browser.
- Override settings per user from the Settings page.
- Reset AI settings back to `.env` defaults when needed.

## Typical Usage Flow

1. Sign up or log in.
2. Open Settings and confirm the AI endpoint/model.
3. Create one or more health profiles.
4. Add details such as health conditions, goals, diet preferences, allergies, medications, and notes.
5. Optionally create a group for family or shared planning.
6. Generate an AI plan from a profile or group.
7. Preview the generated plan and save it when it looks useful.
8. Open Plans and Notifications to create reminder messages from saved plans.
9. Schedule WhatsApp reminders or send test notifications.
10. Use chat to refine plans, ask follow-up questions, or adapt recommendations.

## Main Screens

- Dashboard: quick entry point into profiles, groups, and recent work.
- Profiles: create, edit, search, and manage individual health profiles.
- Profile Detail: generate plans, chat with AI, and review saved profile plans.
- Groups: create multi-profile groups for family, team, or client planning.
- Group Detail: generate group-aware plans and chat in group context.
- Plans and Notifications: manage saved plans and WhatsApp reminder messages.
- Settings: configure LLM endpoint, model, hidden API key behavior, admin phone, and default country.
- Help/About: in-app guide for major workflows.

## Current Feature Set

### Health Profile Management

- Multiple profiles per account
- Demographics and body metrics
- BMI-related profile data
- Activity level and dietary preference
- Allergies, medications, and medical conditions
- Personalized goals and additional notes

### AI-Powered Planning

- Profile-aware plan generation
- Group-aware plan generation
- Preview and save flow
- Saved plan history
- Configurable OpenAI-compatible endpoint
- Per-user settings with `.env` fallback

### Group and Family Health Management

- Profile groups
- Multi-member planning
- Centralized group views
- Shared wellness use cases such as family meals, group activities, and coordinated routines

### Smart Notifications

- WhatsApp-based delivery
- Scheduled reminder queue
- Manual test/send/flush helper script
- Background scheduler at app startup
- Message status tracking

### AI Health Assistant

- Context-aware chat
- Profile and group context support
- Plan refinement
- Lifestyle and habit guidance

## Roadmap

### Near-Term

- Progress tracking with daily, weekly, and monthly check-ins
- Habit completion tracking, streaks, and consistency metrics
- Weight, activity, sleep, and nutrition progress monitoring
- Weekly progress summaries
- AI-generated encouragement and coaching
- Missed-task recovery plans
- Adaptive reminders based on engagement
- Milestone celebrations
- Evidence-based recommendations with explanations and trusted references
- Profile ownership, consent, sharing, and role-based permissions
- Group challenges, shared goals, and group progress dashboards

### Mid-Term

- Android and iOS applications
- Push notifications
- Offline access and synchronization
- Google Fit, Apple Health, Garmin, Fitbit, Samsung Health, and smartwatch integrations
- Multi-language interface, localized plans, and local-language notifications
- Voice reminders, voice coaching, and voice-based progress updates
- Advanced analytics for trends, risk factors, adherence, and optimization insights

### Long-Term Vision

HealthForge is designed to grow into an AI-powered Family Health Operating System: a place where one person can help manage, motivate, and improve the health habits of the people they care about.

Long-term areas include:

- Digital health records
- Medical report and prescription tracking
- Vaccination and lab report history
- Long-term AI health memory
- Preventive health intelligence
- Caregiver collaboration
- Healthcare provider integration
- Appointment tracking and care coordination

## Tech Stack

- Next.js 15 App Router
- React 19
- TypeScript
- SQLite with `better-sqlite3`
- NextAuth
- Baileys for WhatsApp Web integration
- node-cron for the background queue worker

## Project Structure

```text
src/
  app/
    (auth)/              # Login and signup pages
    (app)/               # Dashboard, profiles, groups, settings, help
    api/                 # API routes
  components/            # Reusable UI components
  lib/                   # DB, AI, auth, scheduler, phone, WhatsApp helpers
  instrumentation.ts     # Boot-time scheduler startup
scripts/
  connect-whatsapp.ts    # WhatsApp login/status helper
  test-notification.ts   # Send/queue/flush notification tester
healthforge.db           # Local SQLite database, ignored by Git
wa_auth/                 # WhatsApp auth session files, ignored by Git
```

## Prerequisites

- Miniconda or Anaconda, recommended for environment isolation
- Or Node.js 20+ with npm 10+ installed directly
- A local or remote OpenAI-compatible LLM API endpoint, such as LiteLLM
- A dedicated WhatsApp number for bot automation, strongly recommended
- Native build tools required by `better-sqlite3` and `@whiskeysockets/baileys`

Linux:

```bash
sudo apt install python3 make g++ build-essential
```

macOS:

```bash
xcode-select --install
```

Windows: use the standard Node.js native build toolchain for your environment.

## Installation

### Option A: Conda Environment

This repo ships an `environment.yml` that pins Node.js 20 so your system Node version does not matter.

```bash
conda env create -f environment.yml
conda activate HealthForge
node --version
npm install
```

Update the environment later:

```bash
conda env update -f environment.yml --prune
```

Remove it:

```bash
conda deactivate
conda env remove -n HealthForge
```

### Option B: Python venv With nodeenv

Use this if you prefer plain Python virtual environments. `requirements.txt` installs `nodeenv`, which embeds Node.js in the venv.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
nodeenv --node=20.19.2 --python-virtualenv
node --version
npm --version
npm install
```

Re-enter later:

```bash
source .venv/bin/activate
nodeenv --python-virtualenv --prebuilt
npm run dev
```

Remove it:

```bash
deactivate
rm -rf .venv
```

### Option C: System Node.js

```bash
node --version
npm --version
npm install
```

Node must be version 20 or newer.

## Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Set values for your environment:

| Variable | Required | Description |
|---|---:|---|
| `NEXTAUTH_SECRET` | Yes | Long random string for session signing |
| `NEXTAUTH_URL` | Yes | App base URL, such as `http://localhost:3000` |
| `LITELLM_API_URL` | Yes | OpenAI-compatible LLM endpoint |
| `LITELLM_API_KEY` | No | API key for the LLM endpoint |
| `DEFAULT_MODEL` | No | Default model used by AI routes and settings |

Example:

```env
NEXTAUTH_SECRET=replace-with-long-random-secret
NEXTAUTH_URL=http://localhost:3000
LITELLM_API_URL=http://localhost:4000
LITELLM_API_KEY=api_key
DEFAULT_MODEL=gpt-4o
```

## Run Locally

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Build and Run

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

## WhatsApp Setup

Authenticate WhatsApp once. This stores the session in `wa_auth/`.

```bash
npx tsx scripts/connect-whatsapp.ts login
```

Check status:

```bash
npx tsx scripts/connect-whatsapp.ts status
```

Use a non-primary WhatsApp account for automation to reduce account-risk exposure.

## Notification Test Script

Send immediately:

```bash
npx tsx scripts/test-notification.ts send <phone> '<message>'
```

Queue for a specific time:

```bash
npx tsx scripts/test-notification.ts queue <phone> <YYYY-MM-DDTHH:mm> '<message>'
```

Flush all due pending messages:

```bash
npx tsx scripts/test-notification.ts flush
```

Backward-compatible shorthand is also supported:

```bash
npx tsx scripts/test-notification.ts <phone> '<message>'
npx tsx scripts/test-notification.ts <phone> <YYYY-MM-DDTHH:mm> '<message>'
```

## Scheduler Behavior

- The background worker starts at app boot through `src/instrumentation.ts`.
- It checks queued messages every minute.
- Due messages with `scheduled_for <= now` are sent and marked `submitted` or `failed`.
- Avoid running multiple app instances against the same database unless scheduler behavior is coordinated.

## Key API Routes

- `GET|PUT /api/settings`
- `POST /api/plans`
- `GET /api/plans?profileId=...`
- `POST /api/groups/:id/plan`
- `GET /api/groups/:id/plan`
- `GET|POST|DELETE /api/messages`
- `PUT|DELETE /api/messages/:id`

## Docker Deployment

HealthForge supports standalone Docker deployment through Docker Compose. The compose setup uses host bind mounts so the SQLite database and WhatsApp session persist on the host.

1. Configure the environment:

```bash
cp .env.example .env
# Edit .env and set NEXTAUTH_SECRET, NEXTAUTH_URL, and LLM settings.
```

2. Build and start:

```bash
docker compose up --build -d
```

3. Authenticate WhatsApp:

Because Docker binds to the local `./wa_auth` folder, you can run the pairing script locally on the host or inside the container.

```bash
npx tsx scripts/connect-whatsapp.ts login
```

View logs:

```bash
docker compose logs -f
```

Stop the container:

```bash
docker compose down
```

### Docker LLM URL Handling

When running through Docker, `DOCKER_CONTAINER=true` lets HealthForge detect it is containerized. If your LLM URL is set to `http://localhost:...`, HealthForge maps it to `host.docker.internal` so the container can reach a proxy running on the host.

## Production Checklist

1. Set strong production values for `NEXTAUTH_SECRET` and `NEXTAUTH_URL`.
2. Use HTTPS in production.
3. Keep `.env`, `healthforge.db`, and `wa_auth/` out of Git.
4. Use Docker Compose or another supervised process manager.
5. Do not run multiple scheduler instances against the same notification queue unless intentional.
6. Use a dedicated WhatsApp account for automation.

## Troubleshooting

### Notifications remain pending or fail

- Confirm WhatsApp is connected with `npx tsx scripts/connect-whatsapp.ts status`.
- Confirm `wa_auth/` exists and is writable.
- Confirm the app can write to `healthforge.db`.
- In Docker, confirm the bind-mounted database is writable by the container.

### AI generation fails

- Open Settings and check the API URL, hidden API key state, and model.
- Confirm the model exists in your LLM proxy.
- Confirm the endpoint supports OpenAI-compatible routes.
- If using Docker and a host LLM proxy, use `http://localhost:...` in `.env`; the app maps it for container access.

### Dates or times feel shifted

- Scheduling is timezone-aware.
- The time selected in the UI represents the browser's local timezone.
- The backend stores and compares normalized times so messages fire at the requested local time.

### Settings do not appear to use `.env`

- Restart the dev server after editing `.env`.
- Use Reset AI Defaults on the Settings page to clear per-user AI overrides.
- The default API key is intentionally hidden and is never sent back to the browser.

## Notes

- SQLite schema initializes automatically in `src/lib/db.ts`.
- Existing DB migrations are additive and wrapped defensively.
- Local runtime files such as `.env`, `healthforge.db`, `healthforge.db-*`, and `wa_auth/` are ignored by Git.
