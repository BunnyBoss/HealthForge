import cron from "node-cron";
import getDb from "@/lib/db";
import { sendWhatsAppMessage, isConnected, initializeWhatsApp } from "@/lib/whatsapp";
import { getAiConfig, generateCompletion, buildDailySummaryPrompt } from "@/lib/ai";

interface ScheduleRecord {
  id: string;
  user_id: string;
  profile_id: string | null;
  group_id: string | null;
  phone_number: string;
  schedule_type: string;
  cron_expression: string;
  message_template: string;
  custom_message: string | null;
  is_active: number;
}

const activeTasks: Map<string, ReturnType<typeof cron.schedule>> = new Map();

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

async function executeSchedule(schedule: ScheduleRecord) {
  if (!isConnected()) {
    console.log(`[Scheduler] WhatsApp not connected, skipping schedule ${schedule.id}`);
    return;
  }

  try {
    const db = getDb();
    let message = "";

    if (schedule.message_template === "custom" && schedule.custom_message) {
      message = schedule.custom_message;
    } else {
      // Get the latest plan
      let plan: Record<string, unknown> | undefined;

      if (schedule.group_id) {
        plan = db
          .prepare("SELECT content FROM health_plans WHERE group_id = ? ORDER BY created_at DESC LIMIT 1")
          .get(schedule.group_id) as Record<string, unknown> | undefined;
      } else if (schedule.profile_id) {
        plan = db
          .prepare("SELECT content FROM health_plans WHERE profile_id = ? ORDER BY created_at DESC LIMIT 1")
          .get(schedule.profile_id) as Record<string, unknown> | undefined;
      }

      if (!plan) {
        message = "🏥 HealthForge Reminder: No health plan generated yet. Open the app to create your personalized plan!";
      } else {
        const dayOfWeek = DAYS[new Date().getDay()];
        const config = getAiConfig(schedule.user_id);

        try {
          message = await generateCompletion(config, [
            {
              role: "user",
              content: buildDailySummaryPrompt(plan.content as string, dayOfWeek),
            },
          ]);
        } catch {
          // Fallback if AI is unavailable
          const content = (plan.content as string).substring(0, 400);
          message = `🏥 HealthForge Daily Reminder\n\n📋 Your plan highlights:\n${content}...\n\nOpen HealthForge for your full plan!`;
        }
      }
    }

    // Add random delay (1-5 seconds) to mimic human behavior
    const delay = Math.floor(Math.random() * 4000) + 1000;
    await new Promise((resolve) => setTimeout(resolve, delay));

    await sendWhatsAppMessage(schedule.phone_number, message);

    // Update last_sent_at
    db.prepare("UPDATE notification_schedules SET last_sent_at = CURRENT_TIMESTAMP WHERE id = ?").run(
      schedule.id
    );

    console.log(`[Scheduler] Sent message for schedule ${schedule.id} to ${schedule.phone_number}`);
  } catch (error) {
    console.error(`[Scheduler] Failed to execute schedule ${schedule.id}:`, error);
  }
}

export function registerSchedule(schedule: ScheduleRecord) {
  // Remove existing task if any
  unregisterSchedule(schedule.id);

  if (!schedule.is_active) return;

  const cronExpr = schedule.cron_expression || getCronFromType(schedule.schedule_type);

  if (!cron.validate(cronExpr)) {
    console.error(`[Scheduler] Invalid cron expression for schedule ${schedule.id}: ${cronExpr}`);
    return;
  }

  const task = cron.schedule(cronExpr, () => {
    executeSchedule(schedule);
  });

  activeTasks.set(schedule.id, task);
  console.log(`[Scheduler] Registered schedule ${schedule.id} with cron: ${cronExpr}`);
}

export function unregisterSchedule(scheduleId: string) {
  const task = activeTasks.get(scheduleId);
  if (task) {
    task.stop();
    activeTasks.delete(scheduleId);
  }
}

function getCronFromType(type: string): string {
  switch (type) {
    case "daily_morning":
      return "0 8 * * *";
    case "daily_evening":
      return "0 20 * * *";
    case "twice_daily":
      return "0 8,20 * * *";
    default:
      return "0 8 * * *";
  }
}

export function loadAllSchedules() {
  try {
    // Initialize WhatsApp connection in the background
    initializeWhatsApp();

    const db = getDb();
    const schedules = db
      .prepare("SELECT * FROM notification_schedules WHERE is_active = 1")
      .all() as ScheduleRecord[];

    for (const schedule of schedules) {
      registerSchedule(schedule);
    }

    console.log(`[Scheduler] Loaded ${schedules.length} active schedules`);
  } catch (error) {
    console.error("[Scheduler] Failed to load schedules:", error);
  }
}


export function getActiveTaskCount(): number {
  return activeTasks.size;
}
