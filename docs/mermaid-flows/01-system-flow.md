```mermaid
flowchart TD
  U[User]
  UI[Next.js UI Pages]
  API[API Routes]
  AUTH[Auth Layer next-auth credentials]
  AI[AI Prompt + Completion Layer]
  WA[WhatsApp Layer + Scheduler]
  DB[(SQLite healthforge.db)]

  U --> UI
  UI --> API

  API --> AUTH
  AUTH -->|SELECT user by email| DB
  AUTH -->|bcrypt compare password_hash| AUTH
  AUTH -->|JWT session| UI

  UI -->|Create/Update/View Profile| API
  API -->|/api/profiles| DB
  API -->|/api/profiles/[id]| DB

  UI -->|Generate Plan| API
  API -->|/api/plans or /api/groups/[id]/plan| AI
  AI -->|buildSystemPrompt + buildPlanPrompt / group prompts| AI
  AI -->|LLM completion| API
  API -->|INSERT health_plans| DB

  UI -->|Chat with profile + optional plan| API
  API -->|/api/chat| DB
  API -->|load profile + optional selected plan content| DB
  API -->|buildSystemPrompt + context| AI
  AI -->|streamChat completion| API
  API -->|INSERT chat_sessions + chat_messages| DB
  API --> UI

  UI -->|Generate Notifications| API
  API -->|/api/messages POST| AI
  AI -->|AI mode: plan-item extraction| API
  AI -->|Manual mode: days x messages_per_day schedule| API
  API -->|normalize phones + validate ownership| DB
  API -->|INSERT queued_messages status=pending| DB

  WA -->|Scheduler selects due pending| DB
  WA -->|send WhatsApp message| WA
  WA -->|update submitting/submitted + wa_message_id| DB
  WA -->|receipt updates delivered/read| DB
  UI -->|Notification Queue list| API
  API -->|/api/messages GET| DB
  API --> UI
```