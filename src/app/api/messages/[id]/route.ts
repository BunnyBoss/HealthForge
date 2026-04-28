import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import getDb from "@/lib/db";
import { normalizeCountryIso, normalizePhoneNumber } from "@/lib/phone";

// PUT: Edit message text or scheduled_for
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { message_text, scheduled_for, target_phone, target_country_iso } = await req.json();
  const db = getDb();

  const current = db
    .prepare("SELECT status FROM queued_messages WHERE id = ? AND user_id = ?")
    .get(id, session.user.id) as { status: string } | undefined;

  if (!current) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  if (current.status === "delivered" || current.status === "read") {
    return NextResponse.json({ error: "Delivered or read messages cannot be edited." }, { status: 409 });
  }

  if (scheduled_for !== undefined && scheduled_for !== null) {
    const parsed = new Date(String(scheduled_for));
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "scheduled_for must be a valid datetime" }, { status: 400 });
    }
  }

  let normalizedTargetPhone: string | null = null;
  if (typeof target_phone === "string" && target_phone.trim()) {
    const settings = db
      .prepare("SELECT default_country_iso FROM user_settings WHERE user_id = ?")
      .get(session.user.id) as { default_country_iso?: string | null } | undefined;
    const defaultCountry = normalizeCountryIso(settings?.default_country_iso);
    const normalized = normalizePhoneNumber(target_phone, target_country_iso || defaultCountry);
    if (!normalized.ok) {
      return NextResponse.json({ error: `Invalid target_phone: ${normalized.error}` }, { status: 400 });
    }
    normalizedTargetPhone = normalized.digits;
  }

  db.prepare(`
    UPDATE queued_messages
    SET message_text = COALESCE(?, message_text),
        scheduled_for = COALESCE(?, scheduled_for),
        target_phone = COALESCE(?, target_phone),
        status = 'pending',
        wa_message_id = NULL,
        submitted_at = NULL,
        delivered_at = NULL,
        read_at = NULL,
        last_error = NULL
    WHERE id = ? AND user_id = ?
  `).run(message_text ?? null, scheduled_for ?? null, normalizedTargetPhone, id, session.user.id);

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
