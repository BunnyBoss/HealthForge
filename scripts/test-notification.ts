import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import path from "path";
import fs from "fs";
import pino from "pino";
import { randomUUID } from "crypto";
import { COUNTRY_OPTIONS, normalizeCountryIso, normalizePhoneNumber } from "../src/lib/phone";

const AUTH_DIR = path.resolve(process.cwd(), "wa_auth");

function parseCountryArg(args: string[]): { country: string; rest: string[] } {
  const cloned = [...args];
  let country = "IN";

  const idxInline = cloned.findIndex((arg) => arg.startsWith("--country="));
  if (idxInline >= 0) {
    const value = cloned[idxInline].split("=")[1] || "";
    country = normalizeCountryIso(value);
    cloned.splice(idxInline, 1);
    return { country, rest: cloned };
  }

  const idxPair = cloned.findIndex((arg) => arg === "--country");
  if (idxPair >= 0 && cloned[idxPair + 1]) {
    country = normalizeCountryIso(cloned[idxPair + 1]);
    cloned.splice(idxPair, 2);
  }

  return { country, rest: cloned };
}

function normalizeForSendOrQueue(phone: string, countryIso: string): string {
  const normalized = normalizePhoneNumber(phone, countryIso);
  if (!normalized.ok) {
    throw new Error(`Invalid phone number: ${normalized.error}`);
  }
  return normalized.digits;
}

async function sendTestNotification(phone: string, message: string, countryIso: string) {
  if (!fs.existsSync(AUTH_DIR)) {
    console.error("❌ No WhatsApp auth found. Run 'npx tsx scripts/connect-whatsapp.ts login' first.");
    process.exit(1);
  }

  const normalizedPhone = normalizeForSendOrQueue(phone, countryIso);
  console.log(`📤 Sending test notification to +${normalizedPhone}...`);

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }) as any,
  });

  sock.ev.on("creds.update", saveCreds);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Connection timeout")), 15000);

    sock.ev.on("connection.update", async (update) => {
      const { connection } = update;
      if (connection === "open") {
        clearTimeout(timeout);
        try {
          const jid = `${normalizedPhone}@s.whatsapp.net`;
          await sock.sendMessage(jid, { text: message });
          console.log(`✅ Message sent successfully to +${normalizedPhone}!`);
          resolve();
        } catch (err) {
          reject(err);
        }
      } else if (connection === "close") {
        clearTimeout(timeout);
        reject(new Error("Connection closed before message could be sent"));
      }
    });
  });

  await new Promise((resolve) => setTimeout(resolve, 2000));
  process.exit(0);
}

async function flushPending() {
  const db = (await import("better-sqlite3")).default(path.resolve(process.cwd(), "healthforge.db"));

  const duePending = db.prepare(`
    SELECT * FROM queued_messages
    WHERE status = 'pending'
      AND datetime(scheduled_for) <= datetime('now')
    ORDER BY datetime(scheduled_for) ASC
  `).all() as Array<Record<string, any>>;

  const dueFailedCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM queued_messages
    WHERE status = 'failed'
      AND datetime(scheduled_for) <= datetime('now')
  `).get() as { count: number };

  console.log(`[Flush] Due pending: ${duePending.length}`);
  console.log(`[Flush] Due failed (ignored by design): ${dueFailedCount.count}`);
  if (dueFailedCount.count > 0) {
    console.log("[Flush] Failed rows are NOT retried by flush. Edit/requeue them manually.");
  }

  if (duePending.length === 0) {
    console.log("✅ No due pending messages to send.");
    process.exit(0);
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }) as any,
  });
  sock.ev.on("creds.update", saveCreds);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Connection timeout")), 15000);
    sock.ev.on("connection.update", async ({ connection }) => {
      if (connection === "open") {
        clearTimeout(timeout);
        for (const msg of duePending) {
          try {
            db.prepare(`
              UPDATE queued_messages
              SET status = 'submitting',
                  attempt_count = COALESCE(attempt_count, 0) + 1,
                  last_attempt_at = CURRENT_TIMESTAMP,
                  last_error = NULL
              WHERE id = ? AND status = 'pending'
            `).run(msg.id);

            const jid = `${String(msg.target_phone).replace(/[^0-9]/g, "")}@s.whatsapp.net`;
            const sent = await sock.sendMessage(jid, { text: String(msg.message_text) });

            db.prepare(`
              UPDATE queued_messages
              SET status = 'submitted',
                  wa_message_id = ?,
                  submitted_at = COALESCE(submitted_at, CURRENT_TIMESTAMP),
                  last_error = NULL
              WHERE id = ?
            `).run(sent?.key?.id || null, msg.id);
            console.log(`✅ Submitted ${msg.id} to ${msg.target_phone}`);

            if (msg.cc_phone) {
              const ccJid = `${String(msg.cc_phone).replace(/[^0-9]/g, "")}@s.whatsapp.net`;
              await sock.sendMessage(ccJid, { text: `[CC]\n\n${msg.message_text}` });
              console.log(`   📋 CC sent to ${msg.cc_phone}`);
            }
            await new Promise((r) => setTimeout(r, 1500));
          } catch (err) {
            const errorText = err instanceof Error ? err.message : String(err);
            db.prepare(`
              UPDATE queued_messages
              SET status = 'failed',
                  last_error = ?
              WHERE id = ?
            `).run(errorText, msg.id);
            console.error(`❌ Failed to send ${msg.id}:`, errorText);
          }
        }
        resolve();
      } else if (connection === "close") {
        clearTimeout(timeout);
        reject(new Error("Connection closed"));
      }
    });
  });

  await new Promise((resolve) => setTimeout(resolve, 2000));
  process.exit(0);
}

function parseScheduleTime(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const isoLike = trimmed.includes(" ") ? trimmed.replace(" ", "T") : trimmed;
  const withSeconds = isoLike.length === 16 ? `${isoLike}:00` : isoLike;
  const dt = new Date(withSeconds);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

async function queueTestNotification(phone: string, when: string, message: string, countryIso: string) {
  const scheduledFor = parseScheduleTime(when);
  if (!scheduledFor) {
    console.error("❌ Invalid time format. Use YYYY-MM-DDTHH:mm (e.g. 2026-04-23T21:45).");
    process.exit(1);
  }

  const normalizedPhone = normalizeForSendOrQueue(phone, countryIso);
  const db = (await import("better-sqlite3")).default(path.resolve(process.cwd(), "healthforge.db"));
  const user = db.prepare("SELECT id FROM users ORDER BY created_at DESC LIMIT 1").get() as { id: string } | undefined;
  if (!user?.id) {
    console.error("❌ No user found in DB. Please sign up/login once before queuing test notifications.");
    process.exit(1);
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO queued_messages (id, user_id, target_phone, message_text, scheduled_for, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).run(
    id,
    user.id,
    normalizedPhone,
    message,
    scheduledFor.toISOString()
  );

  console.log("✅ Test notification queued.");
  console.log(`   ID: ${id}`);
  console.log(`   Phone: +${normalizedPhone}`);
  console.log(`   Scheduled (local): ${scheduledFor.toLocaleString()}`);
  console.log("   Tip: run `npx tsx scripts/test-notification.ts flush` to process due pending items.");
  process.exit(0);
}

const parsed = parseCountryArg(process.argv.slice(2));
const command = parsed.rest[0];
const args = parsed.rest.slice(1);

if (command === "flush") {
  flushPending().catch((e) => { console.error(e); process.exit(1); });
} else if (command === "send") {
  const phone = args[0];
  const message = args[1];
  if (!phone || !message) {
    console.log("Usage: npx tsx scripts/test-notification.ts send <phone> '<message>' [--country IN]");
    process.exit(1);
  }
  sendTestNotification(phone, message, parsed.country).catch((e) => { console.error("❌ Error:", e.message); process.exit(1); });
} else if (command === "queue") {
  const phone = args[0];
  const when = args[1];
  const message = args[2];
  if (!phone || !when || !message) {
    console.log("Usage: npx tsx scripts/test-notification.ts queue <phone> <YYYY-MM-DDTHH:mm> '<message>' [--country IN]");
    process.exit(1);
  }
  queueTestNotification(phone, when, message, parsed.country).catch((e) => { console.error("❌ Error:", e.message); process.exit(1); });
} else {
  console.log("Usage:");
  console.log("  Send now: npx tsx scripts/test-notification.ts send <phone> '<message>' [--country IN]");
  console.log("  Queue:    npx tsx scripts/test-notification.ts queue <phone> <YYYY-MM-DDTHH:mm> '<message>' [--country IN]");
  console.log("  Flush:    npx tsx scripts/test-notification.ts flush");
  console.log(`  Countries: ${COUNTRY_OPTIONS.map((c) => c.iso).join(", ")}`);
  process.exit(1);
}
