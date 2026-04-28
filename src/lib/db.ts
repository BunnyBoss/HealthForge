import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve(process.cwd(), "healthforge.db");

let db: Database.Database;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS auth_event_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      relationship TEXT DEFAULT 'self',
      phone_number TEXT,
      age INTEGER,
      gender TEXT,
      height_cm REAL,
      weight_kg REAL,
      activity_level TEXT DEFAULT 'moderate',
      dietary_preference TEXT DEFAULT 'no_preference',
      medical_conditions TEXT DEFAULT '[]',
      allergies TEXT DEFAULT '[]',
      medications TEXT DEFAULT '[]',
      goals TEXT DEFAULT '[]',
      is_archived INTEGER DEFAULT 0,
      additional_notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS health_plans (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      plan_type TEXT NOT NULL DEFAULT 'weekly',
      title TEXT,
      content TEXT NOT NULL,
      focus_areas TEXT DEFAULT '[]',
      is_archived INTEGER DEFAULT 0,
      model_used TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      group_id TEXT REFERENCES profile_groups(id) ON DELETE CASCADE,
      plan_id TEXT REFERENCES health_plans(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      group_id TEXT REFERENCES profile_groups(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      model_used TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );


    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      api_url TEXT,
      api_key TEXT,
      preferred_model TEXT,
      default_country_iso TEXT DEFAULT 'IN',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS profile_groups (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      group_type TEXT DEFAULT 'custom',
      group_goals TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS profile_group_members (
      group_id TEXT NOT NULL REFERENCES profile_groups(id) ON DELETE CASCADE,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      PRIMARY KEY (group_id, profile_id)
    );

    CREATE TABLE IF NOT EXISTS notification_schedules (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      profile_id TEXT,
      group_id TEXT,
      phone_number TEXT NOT NULL,
      schedule_type TEXT NOT NULL DEFAULT 'daily_morning',
      cron_expression TEXT DEFAULT '0 8 * * *',
      message_template TEXT NOT NULL DEFAULT 'plan_summary',
      custom_message TEXT,
      is_active INTEGER DEFAULT 1,
      last_sent_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS whatsapp_config (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      is_connected INTEGER DEFAULT 0,
      phone_number TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS queued_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
      group_id TEXT REFERENCES profile_groups(id) ON DELETE CASCADE,
      plan_id TEXT REFERENCES health_plans(id) ON DELETE SET NULL,
      target_phone TEXT NOT NULL,
      cc_phone TEXT,
      message_text TEXT NOT NULL,
      scheduled_for DATETIME NOT NULL,
      status TEXT DEFAULT 'pending',
      wa_message_id TEXT,
      submitted_at DATETIME,
      delivered_at DATETIME,
      read_at DATETIME,
      last_error TEXT,
      attempt_count INTEGER DEFAULT 0,
      last_attempt_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Add group_id to health_plans if not exists
  try {
    db.exec(`ALTER TABLE health_plans ADD COLUMN group_id TEXT REFERENCES profile_groups(id) ON DELETE CASCADE`);
  } catch {
    // Column already exists
  }

  // Add is_archived to health_plans if not exists
  try {
    db.exec(`ALTER TABLE health_plans ADD COLUMN is_archived INTEGER DEFAULT 0`);
  } catch {
    // Column already exists
  }

  // Add phone_number to profiles if not exists
  try {
    db.exec(`ALTER TABLE profiles ADD COLUMN phone_number TEXT`);
  } catch {
    // Column already exists
  }

  // Add is_archived to profiles if not exists
  try {
    db.exec(`ALTER TABLE profiles ADD COLUMN is_archived INTEGER DEFAULT 0`);
  } catch {
    // Column already exists
  }

  // Add admin_phone to user_settings if not exists
  try {
    db.exec(`ALTER TABLE user_settings ADD COLUMN admin_phone TEXT`);
  } catch {
    // Column already exists
  }

  // Add default_country_iso to user_settings if not exists
  try {
    db.exec(`ALTER TABLE user_settings ADD COLUMN default_country_iso TEXT DEFAULT 'IN'`);
  } catch {
    // Column already exists
  }

  // Add user_id and plan_id to chat_sessions if not exists
  try { db.exec(`ALTER TABLE chat_sessions ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE`); } catch {}
  try { db.exec(`ALTER TABLE chat_sessions ADD COLUMN plan_id TEXT REFERENCES health_plans(id) ON DELETE SET NULL`); } catch {}
  try { db.exec(`ALTER TABLE chat_sessions ADD COLUMN group_id TEXT REFERENCES profile_groups(id) ON DELETE CASCADE`); } catch {}
  try { db.exec(`ALTER TABLE chat_messages ADD COLUMN group_id TEXT REFERENCES profile_groups(id) ON DELETE CASCADE`); } catch {}

  // Backfill legacy chat_sessions.user_id from owning profile
  db.exec(`
    UPDATE chat_sessions
    SET user_id = (
      SELECT p.user_id
      FROM profiles p
      WHERE p.id = chat_sessions.profile_id
      LIMIT 1
    )
    WHERE user_id IS NULL
  `);

  // Add plan_id to queued_messages if not exists
  try {
    db.exec(`ALTER TABLE queued_messages ADD COLUMN plan_id TEXT REFERENCES health_plans(id) ON DELETE SET NULL`);
  } catch {
    // Column already exists
  }

  // Add delivery-tracking fields to queued_messages if not exists
  try { db.exec(`ALTER TABLE queued_messages ADD COLUMN wa_message_id TEXT`); } catch {}
  try { db.exec(`ALTER TABLE queued_messages ADD COLUMN submitted_at DATETIME`); } catch {}
  try { db.exec(`ALTER TABLE queued_messages ADD COLUMN delivered_at DATETIME`); } catch {}
  try { db.exec(`ALTER TABLE queued_messages ADD COLUMN read_at DATETIME`); } catch {}
  try { db.exec(`ALTER TABLE queued_messages ADD COLUMN last_error TEXT`); } catch {}
  try { db.exec(`ALTER TABLE queued_messages ADD COLUMN attempt_count INTEGER DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE queued_messages ADD COLUMN last_attempt_at DATETIME`); } catch {}

  // Normalize legacy status naming.
  db.exec(`UPDATE queued_messages SET status = 'submitted' WHERE status = 'sent'`);
  db.exec(`
    UPDATE queued_messages
    SET delivered_at = COALESCE(delivered_at, submitted_at, created_at, CURRENT_TIMESTAMP)
    WHERE status IN ('delivered', 'read')
      AND delivered_at IS NULL
  `);
  db.exec(`
    UPDATE queued_messages
    SET read_at = COALESCE(read_at, delivered_at, submitted_at, created_at, CURRENT_TIMESTAMP)
    WHERE status = 'read'
      AND read_at IS NULL
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_queued_messages_wa_message_id ON queued_messages(wa_message_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_profiles_user_archived ON profiles(user_id, is_archived)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_health_plans_profile_created ON health_plans(profile_id, created_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_health_plans_group_created ON health_plans(group_id, created_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_profile_updated ON chat_sessions(user_id, profile_id, updated_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_group_updated ON chat_sessions(user_id, group_id, updated_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_messages_session_user_created ON chat_messages(session_id, user_id, created_at ASC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_queued_messages_status_scheduled ON queued_messages(status, scheduled_for)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_queued_messages_user_profile_sched ON queued_messages(user_id, profile_id, scheduled_for)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_queued_messages_user_group_sched ON queued_messages(user_id, group_id, scheduled_for)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_auth_event_logs_user_created ON auth_event_logs(user_id, created_at DESC)`);
}

export default getDb;
