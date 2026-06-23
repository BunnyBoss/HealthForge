import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import getDb from "@/lib/db";
import { randomUUID } from "crypto";
import {
  getAiConfig,
  generateCompletion,
  buildPlanItemQueuePrompt,
} from "@/lib/ai";
import { normalizeCountryIso, normalizePhoneNumber } from "@/lib/phone";

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
  if (profileId && groupId) {
    return NextResponse.json({ error: "Provide only one of profile_id or group_id" }, { status: 400 });
  }

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
      target_phones,
      cc_phone,
      schedule_time = "08:00",
      days_mode = "auto",
      days,
      frequency_mode = "auto",
      messages_per_day,
      start_date,
      focus_areas,
      custom_context,
      recipient_name,
      plan_content,
      plan_id,
      plan_title,
      target_country_iso,
      cc_country_iso,
      user_timezone_offset,
    } = await req.json();

    if ((profile_id && group_id) || (!profile_id && !group_id)) {
      return NextResponse.json({ error: "Provide exactly one of profile_id or group_id" }, { status: 400 });
    }

    if (!plan_content) {
      return NextResponse.json({ error: "plan_content is required" }, { status: 400 });
    }

    if (days_mode !== "auto" && days_mode !== "manual") {
      return NextResponse.json({ error: "days_mode must be auto or manual" }, { status: 400 });
    }

    if (frequency_mode !== "auto" && frequency_mode !== "manual") {
      return NextResponse.json({ error: "frequency_mode must be auto or manual" }, { status: 400 });
    }

    const requestedStartDate = typeof start_date === "string" && start_date ? start_date : new Date().toISOString().slice(0, 10);
    const startDate = new Date(`${requestedStartDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (Number.isNaN(startDate.getTime()) || startDate < today) {
      return NextResponse.json({ error: "start_date must be today or a future date in YYYY-MM-DD format" }, { status: 400 });
    }

    let normalizedDays: number | undefined;
    if (days_mode === "manual") {
      normalizedDays = Number(days);
      if (!Number.isInteger(normalizedDays) || normalizedDays < 1 || normalizedDays > 30) {
        return NextResponse.json({ error: "days must be an integer between 1 and 30 when days_mode is manual" }, { status: 400 });
      }
    }

    let normalizedMessagesPerDay: number | undefined;
    if (frequency_mode === "manual") {
      normalizedMessagesPerDay = Number(messages_per_day);
      if (!Number.isInteger(normalizedMessagesPerDay) || normalizedMessagesPerDay < 1 || normalizedMessagesPerDay > 12) {
        return NextResponse.json({ error: "messages_per_day must be an integer between 1 and 12 when frequency_mode is manual" }, { status: 400 });
      }
    }

    // Generate messages with AI
    const config = getAiConfig(session.user.id);
    const prompt = buildPlanItemQueuePrompt(
      plan_content,
      recipient_name || "Friend",
      {
        planTitle: typeof plan_title === "string" ? plan_title : undefined,
        planId: typeof plan_id === "string" ? plan_id : undefined,
        focusAreas: Array.isArray(focus_areas) ? focus_areas : [],
        startDate: requestedStartDate,
        daysMode: days_mode,
        days: normalizedDays,
        frequencyMode: frequency_mode,
        messagesPerDay: normalizedMessagesPerDay,
      },
      custom_context
    );

    let queueItems: GeneratedQueueItem[] = [];
    try {
      const raw = await generateCompletion(config, [{ role: "user", content: prompt }]);
      const parsedArray = extractJsonArray(raw);
      if (!parsedArray) {
        return NextResponse.json({ error: "AI returned invalid queue JSON format." }, { status: 500 });
      }
      const maxDayOffset = Math.max(29, normalizedDays ? normalizedDays + 7 : 45);
      const normalized = parsedArray
        .map((item) => normalizeGeneratedItem(item, maxDayOffset))
        .filter((item): item is GeneratedQueueItem => Boolean(item));
      queueItems = normalized;
    } catch {
      return NextResponse.json({ error: "AI failed to generate messages. Check your LLM connection." }, { status: 500 });
    }

    if (!Array.isArray(queueItems) || queueItems.length === 0) {
      return NextResponse.json({ error: "AI returned invalid message format." }, { status: 500 });
    }

    if (days_mode === "manual" && normalizedDays) {
      const maxAllowedOffset = normalizedDays - 1;
      if (queueItems.some((item) => item.day_offset > maxAllowedOffset)) {
        return NextResponse.json({ error: "AI returned notifications beyond the requested number of days." }, { status: 500 });
      }
    }

    if (frequency_mode === "manual" && normalizedMessagesPerDay) {
      const byDay = new Map<number, number>();
      for (const item of queueItems) {
        byDay.set(item.day_offset, (byDay.get(item.day_offset) || 0) + 1);
      }
      for (const [, count] of byDay) {
        if (count < 1 || count > normalizedMessagesPerDay + 1) {
          return NextResponse.json({ error: "AI returned an invalid per-day notification distribution." }, { status: 500 });
        }
      }
    }

    const db = getDb();
    if (profile_id) {
      const ownedProfile = db
        .prepare("SELECT id FROM profiles WHERE id = ? AND user_id = ?")
        .get(profile_id, session.user.id);
      if (!ownedProfile) {
        return NextResponse.json({ error: "Profile not found" }, { status: 404 });
      }
    }
    if (group_id) {
      const ownedGroup = db
        .prepare("SELECT id FROM profile_groups WHERE id = ? AND user_id = ?")
        .get(group_id, session.user.id);
      if (!ownedGroup) {
        return NextResponse.json({ error: "Group not found" }, { status: 404 });
      }
    }

    const settings = db
      .prepare("SELECT default_country_iso FROM user_settings WHERE user_id = ?")
      .get(session.user.id) as { default_country_iso?: string | null } | undefined;
    const defaultCountry = normalizeCountryIso(settings?.default_country_iso);

    const requestedPhones = Array.isArray(target_phones)
      ? target_phones.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
    if (requestedPhones.length === 0 && (!target_phone || !String(target_phone).trim())) {
      return NextResponse.json({ error: "At least one target phone is required" }, { status: 400 });
    }

    const normalizedTargets = (requestedPhones.length > 0 ? requestedPhones : [String(target_phone)])
      .map((phone) => normalizePhoneNumber(phone, target_country_iso || defaultCountry));
    const invalidTarget = normalizedTargets.find((item) => !item.ok);
    if (invalidTarget && !invalidTarget.ok) {
      return NextResponse.json({ error: `Invalid target_phone: ${invalidTarget.error}` }, { status: 400 });
    }
    const uniqueTargets = Array.from(
      new Set(
        normalizedTargets
          .filter((item): item is Extract<typeof item, { ok: true }> => item.ok)
          .map((item) => item.digits)
      )
    );

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
        SELECT hp.id, hp.profile_id, hp.group_id, hp.title
        FROM health_plans hp
        LEFT JOIN profiles p ON hp.profile_id = p.id
        LEFT JOIN profile_groups g ON hp.group_id = g.id
        WHERE hp.id = ? AND (p.user_id = ? OR g.user_id = ?)
      `).get(plan_id, session.user.id, session.user.id) as { id: string; profile_id?: string | null; group_id?: string | null; title?: string | null } | undefined;

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

    const dateParts = requestedStartDate.split("-").map(Number);
    const tzOffset = Number(user_timezone_offset || 0);

    for (const item of sortedQueueItems) {
      const [hour, minute] = item.time.split(":").map(Number);
      const h = Number.isFinite(hour) ? hour : fallbackHour;
      const m = Number.isFinite(minute) ? minute : fallbackMinute;

      const scheduledFor = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2] + item.day_offset, h, m, 0, 0));
      scheduledFor.setMinutes(scheduledFor.getMinutes() + tzOffset);

      for (const targetDigits of uniqueTargets) {
        const id = randomUUID();
        db.prepare(`
          INSERT INTO queued_messages (id, user_id, profile_id, group_id, plan_id, target_phone, cc_phone, message_text, scheduled_for, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `).run(
          id, session.user.id,
          profile_id || null, group_id || null,
          linkedPlanId,
          targetDigits, normalizedCcPhone,
          item.message_text,
          scheduledFor.toISOString()
        );

        insertedMessages.push({ id, message_text: item.message_text, scheduled_for: scheduledFor.toISOString(), status: "pending", target_phone: targetDigits });
      }
    }

    return NextResponse.json({
      created: insertedMessages.length,
      mode: "ai_plan",
      days_mode,
      frequency_mode,
      start_date: requestedStartDate,
      messages: insertedMessages,
    });
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
  if (profileId && groupId) {
    return NextResponse.json({ error: "Provide only one of profile_id or group_id" }, { status: 400 });
  }

  const db = getDb();
  if (profileId) {
    db.prepare("DELETE FROM queued_messages WHERE user_id = ? AND profile_id = ?").run(session.user.id, profileId);
  } else if (groupId) {
    db.prepare("DELETE FROM queued_messages WHERE user_id = ? AND group_id = ?").run(session.user.id, groupId);
  }

  return NextResponse.json({ message: "Cleared" });
}
