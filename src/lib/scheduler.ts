import cron from "node-cron";
import getDb from "@/lib/db";
import { sendWhatsAppMessage, isConnected, initializeWhatsApp } from "@/lib/whatsapp";

let mainTask: ReturnType<typeof cron.schedule> | null = null;
let isExecuting = false;

interface PendingQueuedMessage {
  id: string;
  user_id: string;
  profile_id: string | null;
  target_phone: string;
  cc_phone: string | null;
  message_text: string;
}

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
      .all() as PendingQueuedMessage[];

    if (pendingMessages.length === 0) {
      isExecuting = false;
      return;
    }

    const messagesByUser = new Map<string, PendingQueuedMessage[]>();
    for (const msg of pendingMessages) {
      const userMessages = messagesByUser.get(msg.user_id) || [];
      userMessages.push(msg);
      messagesByUser.set(msg.user_id, userMessages);
    }

    for (const [userId, userMessages] of messagesByUser) {
      if (!isConnected(userId)) {
        console.log(`[Scheduler] WhatsApp not connected for user ${userId}; attempting reconnect for ${userMessages.length} pending messages.`);
        await initializeWhatsApp(userId);
      }

      if (!isConnected(userId)) {
        db.prepare(`
          UPDATE queued_messages
          SET last_error = ?
          WHERE user_id = ?
            AND status = 'pending'
            AND datetime(scheduled_for) <= datetime('now')
        `).run("WhatsApp is not connected for this user", userId);
        continue;
      }

      for (const msg of userMessages) {
        try {
          const lock = db.prepare(`
            UPDATE queued_messages
            SET status = 'submitting',
                attempt_count = COALESCE(attempt_count, 0) + 1,
                last_attempt_at = CURRENT_TIMESTAMP,
                last_error = NULL
            WHERE id = ? AND user_id = ? AND status = 'pending'
          `).run(msg.id, userId);

          if (lock.changes === 0) {
            continue;
          }

          const targetResult = await sendWhatsAppMessage(userId, msg.target_phone, msg.message_text);

          if (msg.cc_phone) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const ccPrefix = msg.profile_id ? `[CC for Profile]` : `[CC for Group]`;
            await sendWhatsAppMessage(userId, msg.cc_phone, `${ccPrefix}\n\n${msg.message_text}`);
          }

          db.prepare(`
            UPDATE queued_messages
            SET status = 'submitted',
                wa_message_id = ?,
                submitted_at = COALESCE(submitted_at, CURRENT_TIMESTAMP),
                last_error = NULL
            WHERE id = ? AND user_id = ?
          `).run(targetResult.messageId, msg.id, userId);
          console.log(`[Scheduler] Submitted message ${msg.id} for user ${userId} to ${msg.target_phone}`);

          await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
        } catch (err) {
          console.error(`[Scheduler] Failed to send message ${msg.id}:`, err);
          const errorText = err instanceof Error ? err.message : String(err);
          db.prepare(`
            UPDATE queued_messages
            SET status = 'failed',
                last_error = ?
            WHERE id = ? AND user_id = ?
          `).run(errorText, msg.id, userId);
        }
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
