import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import getDb from "@/lib/db";
import { randomUUID } from "crypto";
import {
  getAiConfig,
  generateCompletion,
  buildPlanItemQueuePrompt,
  buildManualFrequencyQueuePrompt,
} from "@/lib/ai";
import { normalizeCountryIso, normalizePhoneNumber } from "@/lib/phone";

type GenerationMode = "ai_plan" | "manual_frequency";

interface GeneratedQueueItem {
  day_offset: number;
  time: string;
  message_text: string;
}

function extractJsonArray(raw: string): unknown[] | null {
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isValidTime24(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function normalizeGeneratedItem(input: unknown, maxDayOffset: number): GeneratedQueueItem | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  const dayOffset = Number(row.day_offset);
  const time = String(row.time || "").trim();
  const messageText = String(row.message_text || "").trim();

  if (!Number.isInteger(dayOffset) || dayOffset < 0 || dayOffset > maxDayOffset) return null;
  if (!isValidTime24(time)) return null;
  if (!messageText) return null;

  return {
    day_offset: dayOffset,
    time,
    message_text: messageText,
  };
}

// GET: List all queued messages (optionally filter by profile_id or group_id)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const profileId = searchParams.get("profile_id");
  const groupId = searchParams.get("group_id");

  const db = getDb();
  let query = `
    SELECT qm.*, hp.title AS plan_title
    FROM queued_messages qm
    LEFT JOIN health_plans hp ON qm.plan_id = hp.id
    WHERE qm.user_id = ?
  `;
  const params: unknown[] = [session.user.id];

  if (profileId) { query += " AND qm.profile_id = ?"; params.push(profileId); }
  if (groupId) { query += " AND qm.group_id = ?"; params.push(groupId); }
  query += " ORDER BY datetime(qm.scheduled_for) ASC";

  const messages = db.prepare(query).all(...params);
  return NextResponse.json(messages);
}

// POST: Generate and queue messages via AI
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const {
      profile_id,
      group_id,
      target_phone,
      cc_phone,
      days = 7,
      schedule_time = "08:00",
      generation_mode,
      messages_per_day,
      custom_context,
      recipient_name,
      plan_content,
      plan_id,
      target_country_iso,
      cc_country_iso,
    } = await req.json();

    if (!target_phone || !plan_content) {
      return NextResponse.json({ error: "target_phone and plan_content are required" }, { status: 400 });
    }

    const normalizedDays = Number(days);
    if (!Number.isInteger(normalizedDays) || normalizedDays < 1 || normalizedDays > 30) {
      return NextResponse.json({ error: "days must be an integer between 1 and 30" }, { status: 400 });
    }

    if (
      typeof generation_mode === "string" &&
      generation_mode !== "ai_plan" &&
      generation_mode !== "manual_frequency"
    ) {
      return NextResponse.json({ error: "generation_mode must be ai_plan or manual_frequency" }, { status: 400 });
    }

    const mode: GenerationMode = generation_mode === "ai_plan" ? "ai_plan" : "manual_frequency";
    const hasExplicitMode = typeof generation_mode === "string";

    let normalizedMessagesPerDay = Number(messages_per_day);
    if (mode === "manual_frequency") {
      if (!Number.isFinite(normalizedMessagesPerDay) || normalizedMessagesPerDay <= 0) {
        if (hasExplicitMode) {
          return NextResponse.json({ error: "messages_per_day is required for manual_frequency mode" }, { status: 400 });
        }
        normalizedMessagesPerDay = 1;
      }
      if (!Number.isInteger(normalizedMessagesPerDay) || normalizedMessagesPerDay < 1 || normalizedMessagesPerDay > 12) {
        return NextResponse.json({ error: "messages_per_day must be an integer between 1 and 12" }, { status: 400 });
      }
    }

    // Generate messages with AI
    const config = getAiConfig(session.user.id);
    const prompt = mode === "ai_plan"
      ? buildPlanItemQueuePrompt(plan_content, recipient_name || "Friend", normalizedDays, custom_context)
      : buildManualFrequencyQueuePrompt(
        plan_content,
        recipient_name || "Friend",
        normalizedDays,
        normalizedMessagesPerDay,
        custom_context
      );

    let queueItems: GeneratedQueueItem[] = [];
    try {
      const raw = await generateCompletion(config, [{ role: "user", content: prompt }]);
      const parsedArray = extractJsonArray(raw);
      if (!parsedArray) {
        return NextResponse.json({ error: "AI returned invalid queue JSON format." }, { status: 500 });
      }
      const normalized = parsedArray
        .map((item) => normalizeGeneratedItem(item, normalizedDays - 1))
        .filter((item): item is GeneratedQueueItem => Boolean(item));
      queueItems = normalized;
    } catch {
      return NextResponse.json({ error: "AI failed to generate messages. Check your LLM connection." }, { status: 500 });
    }

    if (!Array.isArray(queueItems) || queueItems.length === 0) {
      return NextResponse.json({ error: "AI returned invalid message format." }, { status: 500 });
    }

    if (mode === "manual_frequency") {
      const expected = normalizedDays * normalizedMessagesPerDay;
      if (queueItems.length !== expected) {
        return NextResponse.json(
          { error: `AI returned ${queueItems.length} items; expected ${expected} for manual frequency mode.` },
          { status: 500 }
        );
      }
      const byDay = new Map<number, number>();
      for (const item of queueItems) {
        byDay.set(item.day_offset, (byDay.get(item.day_offset) || 0) + 1);
      }
      for (let d = 0; d < normalizedDays; d++) {
        if ((byDay.get(d) || 0) !== normalizedMessagesPerDay) {
          return NextResponse.json(
            { error: `AI returned invalid distribution for day ${d + 1}.` },
            { status: 500 }
          );
        }
      }
    }

    const db = getDb();
    const settings = db
      .prepare("SELECT default_country_iso FROM user_settings WHERE user_id = ?")
      .get(session.user.id) as { default_country_iso?: string | null } | undefined;
    const defaultCountry = normalizeCountryIso(settings?.default_country_iso);

    const normalizedTarget = normalizePhoneNumber(target_phone, target_country_iso || defaultCountry);
    if (!normalizedTarget.ok) {
      return NextResponse.json({ error: `Invalid target_phone: ${normalizedTarget.error}` }, { status: 400 });
    }

    let normalizedCcPhone: string | null = null;
    if (cc_phone) {
      const normalizedCc = normalizePhoneNumber(String(cc_phone), cc_country_iso || defaultCountry);
      if (!normalizedCc.ok) {
        return NextResponse.json({ error: `Invalid cc_phone: ${normalizedCc.error}` }, { status: 400 });
      }
      normalizedCcPhone = normalizedCc.digits;
    }

    let linkedPlanId: string | null = null;

    if (plan_id) {
      const linkedPlan = db.prepare(`
        SELECT hp.id, hp.profile_id, hp.group_id
        FROM health_plans hp
        LEFT JOIN profiles p ON hp.profile_id = p.id
        LEFT JOIN profile_groups g ON hp.group_id = g.id
        WHERE hp.id = ? AND (p.user_id = ? OR g.user_id = ?)
      `).get(plan_id, session.user.id, session.user.id) as { id: string; profile_id?: string | null; group_id?: string | null } | undefined;

      if (!linkedPlan) {
        return NextResponse.json({ error: "Invalid plan_id" }, { status: 400 });
      }

      if (profile_id && linkedPlan.profile_id !== profile_id) {
        return NextResponse.json({ error: "plan_id does not belong to this profile" }, { status: 400 });
      }

      if (group_id && linkedPlan.group_id !== group_id) {
        return NextResponse.json({ error: "plan_id does not belong to this group" }, { status: 400 });
      }

      linkedPlanId = linkedPlan.id;
    }

    const [fallbackHour, fallbackMinute] = String(schedule_time || "08:00").split(":").map(Number);
    const insertedMessages = [];
    const sortedQueueItems = [...queueItems].sort((a, b) => {
      if (a.day_offset !== b.day_offset) return a.day_offset - b.day_offset;
      return a.time.localeCompare(b.time);
    });

    for (const item of sortedQueueItems) {
      const scheduledFor = new Date();
      scheduledFor.setDate(scheduledFor.getDate() + item.day_offset);
      const [hour, minute] = item.time.split(":").map(Number);
      scheduledFor.setHours(
        Number.isFinite(hour) ? hour : fallbackHour,
        Number.isFinite(minute) ? minute : fallbackMinute,
        0,
        0
      );

      const id = randomUUID();
      db.prepare(`
        INSERT INTO queued_messages (id, user_id, profile_id, group_id, plan_id, target_phone, cc_phone, message_text, scheduled_for, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `).run(
        id, session.user.id,
        profile_id || null, group_id || null,
        linkedPlanId,
        normalizedTarget.digits, normalizedCcPhone,
        item.message_text,
        scheduledFor.toISOString()
      );

      insertedMessages.push({ id, message_text: item.message_text, scheduled_for: scheduledFor.toISOString(), status: "pending" });
    }

    return NextResponse.json({ created: insertedMessages.length, mode, messages: insertedMessages });
  } catch (error) {
    console.error("Messages API error:", error);
    return NextResponse.json({ error: "Failed to generate messages" }, { status: 500 });
  }
}

// DELETE: Clear all messages for a profile/group
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const profileId = searchParams.get("profile_id");
  const groupId = searchParams.get("group_id");

  const db = getDb();
  if (profileId) {
    db.prepare("DELETE FROM queued_messages WHERE user_id = ? AND profile_id = ?").run(session.user.id, profileId);
  } else if (groupId) {
    db.prepare("DELETE FROM queued_messages WHERE user_id = ? AND group_id = ?").run(session.user.id, groupId);
  }

  return NextResponse.json({ message: "Cleared" });
}
