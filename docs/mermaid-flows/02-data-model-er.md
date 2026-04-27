erDiagram
  USERS {
    text id PK
    text name
    text email UNIQUE
    text password_hash
    datetime created_at
  }

  USER_SETTINGS {
    text user_id PK,FK
    text api_url
    text api_key
    text preferred_model
    text admin_phone
    text default_country_iso
    datetime updated_at
  }

  PROFILES {
    text id PK
    text user_id FK
    text name
    text relationship
    int age
    text gender
    real height_cm
    real weight_kg
    text activity_level
    text dietary_preference
    text medical_conditions_json
    text allergies_json
    text medications_json
    text goals_json
    text additional_notes
    datetime created_at
    datetime updated_at
  }

  PROFILE_GROUPS {
    text id PK
    text user_id FK
    text name
    text group_type
    text goals_json
    datetime created_at
  }

  PROFILE_GROUP_MEMBERS {
    text group_id FK
    text profile_id FK
  }

  HEALTH_PLANS {
    text id PK
    text profile_id FK
    text group_id FK
    text plan_type
    text title
    text content
    text focus_areas_json
    text model_used
    datetime created_at
  }

  CHAT_SESSIONS {
    text id PK
    text user_id FK
    text profile_id FK
    text plan_id FK
    text title
    datetime created_at
    datetime updated_at
  }

  CHAT_MESSAGES {
    text id PK
    text session_id FK
    text profile_id FK
    text user_id FK
    text role
    text content
    datetime created_at
  }

  QUEUED_MESSAGES {
    text id PK
    text user_id FK
    text profile_id FK
    text group_id FK
    text plan_id FK
    text target_phone
    text cc_phone
    text message_text
    datetime scheduled_for
    text status
    text wa_message_id
    datetime submitted_at
    datetime delivered_at
    datetime read_at
    text last_error
    int attempt_count
    datetime last_attempt_at
    datetime created_at
  }

  NOTIFICATION_SCHEDULES {
    text id PK
    text user_id FK
    text profile_id FK
    text group_id FK
    text phone_number
    text schedule_type
    text cron_expression
    text message_template
    text custom_message
    int is_active
    datetime last_sent_at
    datetime created_at
  }

  WHATSAPP_CONFIG {
    text user_id PK,FK
    int is_connected
    text phone_number
    datetime updated_at
  }

  USERS ||--|| USER_SETTINGS : has
  USERS ||--o{ PROFILES : owns
  USERS ||--o{ PROFILE_GROUPS : owns
  PROFILE_GROUPS ||--o{ PROFILE_GROUP_MEMBERS : contains
  PROFILES ||--o{ PROFILE_GROUP_MEMBERS : member_of

  PROFILES ||--o{ HEALTH_PLANS : has
  PROFILE_GROUPS ||--o{ HEALTH_PLANS : has_group_plan

  USERS ||--o{ CHAT_SESSIONS : owns
  PROFILES ||--o{ CHAT_SESSIONS : context_profile
  HEALTH_PLANS ||--o{ CHAT_SESSIONS : optional_context_plan
  CHAT_SESSIONS ||--o{ CHAT_MESSAGES : contains

  USERS ||--o{ QUEUED_MESSAGES : owns
  PROFILES ||--o{ QUEUED_MESSAGES : target_profile
  PROFILE_GROUPS ||--o{ QUEUED_MESSAGES : target_group
  HEALTH_PLANS ||--o{ QUEUED_MESSAGES : source_plan

  USERS ||--o{ NOTIFICATION_SCHEDULES : owns
  PROFILES ||--o{ NOTIFICATION_SCHEDULES : schedule_profile
  PROFILE_GROUPS ||--o{ NOTIFICATION_SCHEDULES : schedule_group

  USERS ||--|| WHATSAPP_CONFIG : has
