import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import getDb from "@/lib/db";
import { normalizeCountryIso, normalizePhoneNumber } from "@/lib/phone";

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
    settings
      ? {
        ...settings,
        default_country_iso: normalizeCountryIso(settings.default_country_iso as string | undefined),
      }
      : {
        api_url: process.env.LITELLM_API_URL || "http://localhost:4000",
        api_key: "",
        preferred_model: process.env.DEFAULT_MODEL || "gpt-4o",
        admin_phone: "",
        default_country_iso: "IN",
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
    const { api_url, api_key, preferred_model, admin_phone, default_country_iso } = await req.json();
    const db = getDb();
    const normalizedDefaultCountry = normalizeCountryIso(default_country_iso);

    let normalizedAdminPhone: string | null = null;
    if (typeof admin_phone === "string" && admin_phone.trim()) {
      const normalized = normalizePhoneNumber(admin_phone, normalizedDefaultCountry);
      if (!normalized.ok) {
        return NextResponse.json({ error: `Invalid admin phone: ${normalized.error}` }, { status: 400 });
      }
      normalizedAdminPhone = normalized.digits;
    }

    db.prepare(`
      INSERT INTO user_settings (user_id, api_url, api_key, preferred_model, admin_phone, default_country_iso, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        api_url = excluded.api_url,
        api_key = excluded.api_key,
        preferred_model = excluded.preferred_model,
        admin_phone = excluded.admin_phone,
        default_country_iso = excluded.default_country_iso,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      session.user.id,
      api_url || null,
      api_key || null,
      preferred_model || null,
      normalizedAdminPhone,
      normalizedDefaultCountry
    );

    return NextResponse.json({ message: "Settings saved" });
  } catch (error) {
    console.error("Settings error:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
