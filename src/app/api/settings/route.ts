import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import getDb from "@/lib/db";

// GET settings
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const settings = db
    .prepare("SELECT * FROM user_settings WHERE user_id = ?")
    .get(session.user.id) as Record<string, unknown> | undefined;

  return NextResponse.json(
    settings || {
      api_url: process.env.LITELLM_API_URL || "http://localhost:4000",
      api_key: "",
      preferred_model: process.env.DEFAULT_MODEL || "gpt-4o",
      admin_phone: "",
    }
  );
}

// PUT update settings
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { api_url, api_key, preferred_model, admin_phone } = await req.json();
    const db = getDb();

    db.prepare(`
      INSERT INTO user_settings (user_id, api_url, api_key, preferred_model, admin_phone, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        api_url = excluded.api_url,
        api_key = excluded.api_key,
        preferred_model = excluded.preferred_model,
        admin_phone = excluded.admin_phone,
        updated_at = CURRENT_TIMESTAMP
    `).run(session.user.id, api_url || null, api_key || null, preferred_model || null, admin_phone || null);

    return NextResponse.json({ message: "Settings saved" });
  } catch (error) {
    console.error("Settings error:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
