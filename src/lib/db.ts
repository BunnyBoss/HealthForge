import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve(process.cwd(), "healthforge.db");

let db: Database.Database;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
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

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      relationship TEXT DEFAULT 'self',
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
      model_used TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
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
  `);

  // Add group_id to health_plans if not exists
  try {
    db.exec(`ALTER TABLE health_plans ADD COLUMN group_id TEXT REFERENCES profile_groups(id) ON DELETE CASCADE`);
  } catch {
    // Column already exists
  }
}

export default getDb;
