import cron from "node-cron";
import getDb from "@/lib/db";
import { sendWhatsAppMessage, isConnected, initializeWhatsApp } from "@/lib/whatsapp";

let mainTask: ReturnType<typeof cron.schedule> | null = null;
let isExecuting = false;

async function processQueue() {
  if (isExecuting) return;
  isExecuting = true;

  try {
    const db = getDb();
    const pendingMessages = db
      .prepare("SELECT * FROM queued_messages WHERE status = 'pending' AND scheduled_for <= CURRENT_TIMESTAMP")
      .all() as any[];

    if (pendingMessages.length === 0) {
      isExecuting = false;
      return;
    }

    if (!isConnected()) {
      console.log(`[Scheduler] WhatsApp not connected, but have ${pendingMessages.length} pending messages. Attempting reconnect...`);
      initializeWhatsApp();
      isExecuting = false;
      return;
    }

    for (const msg of pendingMessages) {
      try {
        // Send to target phone
        await sendWhatsAppMessage(msg.target_phone, msg.message_text);

        // CC if exists
        if (msg.cc_phone) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // Delay for CC
          const ccPrefix = msg.profile_id ? `[CC for Profile]` : `[CC for Group]`;
          await sendWhatsAppMessage(msg.cc_phone, `${ccPrefix}\n\n${msg.message_text}`);
        }

        // Mark as sent
        db.prepare("UPDATE queued_messages SET status = 'sent' WHERE id = ?").run(msg.id);
        console.log(`[Scheduler] Sent message ${msg.id} to ${msg.target_phone}`);

        // Random delay to avoid spam filters
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
      } catch (err) {
        console.error(`[Scheduler] Failed to send message ${msg.id}:`, err);
        db.prepare("UPDATE queued_messages SET status = 'failed' WHERE id = ?").run(msg.id);
      }
    }
  } catch (error) {
    console.error("[Scheduler] Error processing queue:", error);
  } finally {
    isExecuting = false;
  }
}

export function loadAllSchedules() {
  try {
    // Initialize WhatsApp connection in the background
    initializeWhatsApp();

    // Start single minute-by-minute worker
    if (mainTask) {
      mainTask.stop();
    }

    mainTask = cron.schedule("* * * * *", () => {
      processQueue();
    });

    console.log(`[Scheduler] Started main message queue worker (runs every minute).`);
  } catch (error) {
    console.error("[Scheduler] Failed to start queue worker:", error);
  }
}

export function getActiveTaskCount(): number {
  return mainTask ? 1 : 0;
}
