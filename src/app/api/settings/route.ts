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
    .get(session.user.id) as {
      api_url?: string | null;
      api_key?: string | null;
      preferred_model?: string | null;
      admin_phone?: string | null;
      default_country_iso?: string | null;
    } | undefined;

  return NextResponse.json(
    settings
      ? {
        api_url: settings.api_url || "",
        api_key: "",
        has_api_key: Boolean(settings.api_key),
        preferred_model: settings.preferred_model || "",
        admin_phone: settings.admin_phone || "",
        default_country_iso: normalizeCountryIso(settings.default_country_iso as string | undefined),
      }
      : {
        api_url: process.env.LITELLM_API_URL || "http://localhost:4000",
        api_key: "",
        has_api_key: false,
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
    const { api_url, api_key, preferred_model, admin_phone, default_country_iso, clear_api_key } = await req.json();
    const db = getDb();
    const existing = db
      .prepare("SELECT api_key FROM user_settings WHERE user_id = ?")
      .get(session.user.id) as { api_key?: string | null } | undefined;

    let normalizedApiUrl: string | null = null;
    if (typeof api_url === "string" && api_url.trim()) {
      const trimmed = api_url.trim();
      try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return NextResponse.json({ error: "api_url must start with http:// or https://" }, { status: 400 });
        }
        normalizedApiUrl = trimmed;
      } catch {
        return NextResponse.json({ error: "api_url is not a valid URL" }, { status: 400 });
      }
    }

    const normalizedModel = typeof preferred_model === "string" && preferred_model.trim()
      ? preferred_model.trim().slice(0, 120)
      : null;

    let normalizedApiKey: string | null = existing?.api_key || null;
    if (typeof api_key === "string") {
      const trimmed = api_key.trim();
      if (trimmed) {
        normalizedApiKey = trimmed;
      } else if (clear_api_key) {
        normalizedApiKey = null;
      }
    } else if (clear_api_key) {
      normalizedApiKey = null;
    }

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
      normalizedApiUrl,
      normalizedApiKey,
      normalizedModel,
      normalizedAdminPhone,
      normalizedDefaultCountry
    );

    return NextResponse.json({ message: "Settings saved" });
  } catch (error) {
    console.error("Settings error:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
