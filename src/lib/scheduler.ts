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
      .prepare(`
        SELECT * FROM queued_messages
        WHERE status = 'pending'
          AND datetime(scheduled_for) <= datetime('now')
        ORDER BY datetime(scheduled_for) ASC
      `)
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
        const lock = db.prepare(`
          UPDATE queued_messages
          SET status = 'submitting',
              attempt_count = COALESCE(attempt_count, 0) + 1,
              last_attempt_at = CURRENT_TIMESTAMP,
              last_error = NULL
          WHERE id = ? AND status = 'pending'
        `).run(msg.id);

        if (lock.changes === 0) {
          continue;
        }

        // Send to target phone
        const targetResult = await sendWhatsAppMessage(msg.target_phone, msg.message_text);

        // CC if exists
        if (msg.cc_phone) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // Delay for CC
          const ccPrefix = msg.profile_id ? `[CC for Profile]` : `[CC for Group]`;
          await sendWhatsAppMessage(msg.cc_phone, `${ccPrefix}\n\n${msg.message_text}`);
        }

        // Mark as submitted to WhatsApp transport
        db.prepare(`
          UPDATE queued_messages
          SET status = 'submitted',
              wa_message_id = ?,
              submitted_at = COALESCE(submitted_at, CURRENT_TIMESTAMP),
              last_error = NULL
          WHERE id = ?
        `).run(targetResult.messageId, msg.id);
        console.log(`[Scheduler] Submitted message ${msg.id} to ${msg.target_phone}`);

        // Random delay to avoid spam filters
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
      } catch (err) {
        console.error(`[Scheduler] Failed to send message ${msg.id}:`, err);
        const errorText = err instanceof Error ? err.message : String(err);
        db.prepare(`
          UPDATE queued_messages
          SET status = 'failed',
              last_error = ?
          WHERE id = ?
        `).run(errorText, msg.id);
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
