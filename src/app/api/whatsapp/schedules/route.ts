import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";
import getDb from "@/lib/db";

// GET all schedules
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const schedules = db.prepare(`
    SELECT ns.*, p.name as profile_name, g.name as group_name
    FROM notification_schedules ns
    LEFT JOIN profiles p ON ns.profile_id = p.id
    LEFT JOIN profile_groups g ON ns.group_id = g.id
    WHERE ns.user_id = ?
    ORDER BY ns.created_at DESC
  `).all(session.user.id);

  return NextResponse.json(schedules);
}

// POST create schedule (legacy — kept for compatibility)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { profile_id, group_id, phone_number, schedule_type, message_template, custom_message } = await req.json();
    if (!phone_number?.trim()) return NextResponse.json({ error: "Phone number is required" }, { status: 400 });

    const db = getDb();
    const id = uuidv4();
    const cronMap: Record<string, string> = {
      daily_morning: "0 8 * * *",
      daily_evening: "0 20 * * *",
      twice_daily: "0 8,20 * * *",
    };

    db.prepare(`
      INSERT INTO notification_schedules (id, user_id, profile_id, group_id, phone_number, schedule_type, cron_expression, message_template, custom_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, session.user.id, profile_id || null, group_id || null, phone_number.trim(), schedule_type || "daily_morning", cronMap[schedule_type] || "0 8 * * *", message_template || "plan_summary", custom_message || null);

    return NextResponse.json({ id, success: true });
  } catch (error) {
    console.error("Schedule creation error:", error);
    return NextResponse.json({ error: "Failed to create schedule" }, { status: 500 });
  }
}
