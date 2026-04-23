import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import getDb from "@/lib/db";

// PUT: Edit message text or scheduled_for
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { message_text, scheduled_for, target_phone } = await req.json();
  const db = getDb();

  db.prepare(`
    UPDATE queued_messages
    SET message_text = COALESCE(?, message_text),
        scheduled_for = COALESCE(?, scheduled_for),
        target_phone = COALESCE(?, target_phone),
        status = CASE WHEN status = 'failed' THEN 'pending' ELSE status END
    WHERE id = ? AND user_id = ?
  `).run(message_text ?? null, scheduled_for ?? null, target_phone ?? null, id, session.user.id);

  return NextResponse.json({ message: "Updated" });
}

// DELETE: Remove single message
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  db.prepare("DELETE FROM queued_messages WHERE id = ? AND user_id = ?").run(id, session.user.id);
  return NextResponse.json({ message: "Deleted" });
}
