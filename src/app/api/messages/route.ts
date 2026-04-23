import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import getDb from "@/lib/db";
import { randomUUID } from "crypto";
import { getAiConfig, generateCompletion, buildBulkMessagesPrompt } from "@/lib/ai";
import { normalizeCountryIso, normalizePhoneNumber } from "@/lib/phone";

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

    // Generate messages with AI
    const config = getAiConfig(session.user.id);
    const prompt = buildBulkMessagesPrompt(plan_content, recipient_name || "Friend", days, custom_context);

    let messages: string[] = [];
    try {
      const raw = await generateCompletion(config, [{ role: "user", content: prompt }]);
      // Extract JSON array from response
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        messages = JSON.parse(jsonMatch[0]);
      }
    } catch {
      return NextResponse.json({ error: "AI failed to generate messages. Check your LLM connection." }, { status: 500 });
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "AI returned invalid message format." }, { status: 500 });
    }

    // Schedule each message on consecutive days at schedule_time
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

    const [hour, minute] = schedule_time.split(":").map(Number);
    const insertedMessages = [];

    for (let i = 0; i < Math.min(messages.length, days); i++) {
      const scheduledFor = new Date();
      scheduledFor.setDate(scheduledFor.getDate() + i);
      scheduledFor.setHours(hour, minute, 0, 0);

      const id = randomUUID();
      db.prepare(`
        INSERT INTO queued_messages (id, user_id, profile_id, group_id, plan_id, target_phone, cc_phone, message_text, scheduled_for, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `).run(
        id, session.user.id,
        profile_id || null, group_id || null,
        linkedPlanId,
        normalizedTarget.digits, normalizedCcPhone,
        messages[i],
        scheduledFor.toISOString()
      );

      insertedMessages.push({ id, message_text: messages[i], scheduled_for: scheduledFor.toISOString(), status: "pending" });
    }

    return NextResponse.json({ created: insertedMessages.length, messages: insertedMessages });
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
