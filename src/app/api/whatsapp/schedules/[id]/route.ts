import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import getDb from "@/lib/db";
import { registerSchedule, unregisterSchedule } from "@/lib/scheduler";

// PUT update schedule (toggle, edit)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();

  const existing = db
    .prepare("SELECT * FROM notification_schedules WHERE id = ? AND user_id = ?")
    .get(id, session.user.id);

  if (!existing) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  const body = await req.json();

  // Toggle active
  if (body.is_active !== undefined) {
    db.prepare("UPDATE notification_schedules SET is_active = ? WHERE id = ?").run(
      body.is_active ? 1 : 0,
      id
    );

    const updated = db.prepare("SELECT * FROM notification_schedules WHERE id = ?").get(id);
    if (body.is_active) {
      registerSchedule(updated as Parameters<typeof registerSchedule>[0]);
    } else {
      unregisterSchedule(id);
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: true });
}

// DELETE schedule
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();

  unregisterSchedule(id);
  db.prepare("DELETE FROM notification_schedules WHERE id = ? AND user_id = ?").run(
    id,
    session.user.id
  );

  return NextResponse.json({ success: true });
}
