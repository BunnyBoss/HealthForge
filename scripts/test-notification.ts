import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import path from "path";
import fs from "fs";
import pino from "pino";

const AUTH_DIR = path.resolve(process.cwd(), "wa_auth");

async function sendTestNotification(phone: string, message: string) {
  if (!fs.existsSync(AUTH_DIR)) {
    console.error("❌ No WhatsApp auth found. Run 'npx tsx scripts/connect-whatsapp.ts login' first.");
    process.exit(1);
  }

  console.log(`📤 Sending test notification to ${phone}...`);

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
          const cleanPhone = phone.replace(/[^0-9]/g, "");
          const jid = `${cleanPhone}@s.whatsapp.net`;
          await sock.sendMessage(jid, { text: message });
          console.log(`✅ Message sent successfully to ${phone}!`);
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

  // Give time for message delivery, then exit
  await new Promise(resolve => setTimeout(resolve, 2000));
  process.exit(0);
}

// Also expose a way to manually flush pending messages from DB
async function flushPending() {
  const db = (await import("better-sqlite3")).default(
    path.resolve(process.cwd(), "healthforge.db")
  );

  const pending = db.prepare(
    "SELECT * FROM queued_messages WHERE status = 'pending' AND scheduled_for <= CURRENT_TIMESTAMP"
  ).all() as any[];

  if (pending.length === 0) {
    console.log("✅ No pending messages to send.");
    process.exit(0);
  }

  console.log(`Found ${pending.length} pending message(s). Sending...`);

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
        for (const msg of pending) {
          try {
            const jid = `${msg.target_phone.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
            await sock.sendMessage(jid, { text: msg.message_text });
            db.prepare("UPDATE queued_messages SET status = 'sent' WHERE id = ?").run(msg.id);
            console.log(`✅ Sent to ${msg.target_phone}: ${msg.message_text.substring(0, 60)}...`);
            if (msg.cc_phone) {
              const ccJid = `${msg.cc_phone.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
              await sock.sendMessage(ccJid, { text: `[CC]\n\n${msg.message_text}` });
              console.log(`   📋 CC sent to ${msg.cc_phone}`);
            }
            await new Promise(r => setTimeout(r, 1500));
          } catch (err) {
            db.prepare("UPDATE queued_messages SET status = 'failed' WHERE id = ?").run(msg.id);
            console.error(`❌ Failed to send ${msg.id}:`, err);
          }
        }
        resolve();
      } else if (connection === "close") {
        clearTimeout(timeout);
        reject(new Error("Connection closed"));
      }
    });
  });

  await new Promise(resolve => setTimeout(resolve, 2000));
  process.exit(0);
}

// CLI
const command = process.argv[2];
if (command === "flush") {
  flushPending().catch(e => { console.error(e); process.exit(1); });
} else {
  const phone = process.argv[2];
  const message = process.argv[3];
  const time = process.argv[4]; // optional, ignored for manual test

  if (!phone || !message) {
    console.log("Usage:");
    console.log("  Send test: npx tsx scripts/test-notification.ts <phone> '<message>'");
    console.log("  Flush pending DB messages: npx tsx scripts/test-notification.ts flush");
    console.log("\nExample:");
    console.log("  npx tsx scripts/test-notification.ts 919876543210 'Hello! This is a test from HealthForge 🏥'");
    process.exit(1);
  }

  sendTestNotification(phone, message).catch(e => { console.error("❌ Error:", e.message); process.exit(1); });
}
