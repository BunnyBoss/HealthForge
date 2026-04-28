import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import getDb from "@/lib/db";
import { normalizeCountryIso, normalizePhoneNumber } from "@/lib/phone";

// GET a single profile
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();
  const profile = db
    .prepare("SELECT * FROM profiles WHERE id = ? AND user_id = ?")
    .get(id, session.user.id) as Record<string, unknown> | undefined;

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...profile,
    medical_conditions: JSON.parse((profile.medical_conditions as string) || "[]"),
    allergies: JSON.parse((profile.allergies as string) || "[]"),
    medications: JSON.parse((profile.medications as string) || "[]"),
    goals: JSON.parse((profile.goals as string) || "[]"),
  });
}

// PUT update a profile
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const db = getDb();

    // Verify ownership
    const existing = db
      .prepare("SELECT id FROM profiles WHERE id = ? AND user_id = ?")
      .get(id, session.user.id);
    if (!existing) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const settings = db
      .prepare("SELECT default_country_iso FROM user_settings WHERE user_id = ?")
      .get(session.user.id) as { default_country_iso?: string | null } | undefined;
    const defaultCountry = normalizeCountryIso(settings?.default_country_iso);

    let normalizedPhoneNumber: string | null = null;
    if (typeof body.phone_number === "string" && body.phone_number.trim()) {
      const normalized = normalizePhoneNumber(body.phone_number, body.phone_country_iso || defaultCountry);
      if (!normalized.ok) {
        return NextResponse.json({ error: `Invalid phone number: ${normalized.error}` }, { status: 400 });
      }
      normalizedPhoneNumber = normalized.digits;
    }

    db.prepare(`
      UPDATE profiles SET
        name = ?, relationship = ?, age = ?, gender = ?, height_cm = ?, weight_kg = ?,
        activity_level = ?, dietary_preference = ?, medical_conditions = ?, allergies = ?,
        medications = ?, goals = ?, additional_notes = ?, phone_number = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).run(
      body.name,
      body.relationship || "other",
      body.age || null,
      body.gender || null,
      body.height_cm || null,
      body.weight_kg || null,
      body.activity_level || "moderate",
      body.dietary_preference || "no_preference",
      JSON.stringify(body.medical_conditions || []),
      JSON.stringify(body.allergies || []),
      JSON.stringify(body.medications || []),
      JSON.stringify(body.goals || []),
      body.additional_notes || "",
      normalizedPhoneNumber,
      id,
      session.user.id
    );

    return NextResponse.json({ message: "Profile updated" });
  } catch (error) {
    console.error("Update profile error:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}

// DELETE a profile
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

  const result = db
    .prepare("DELETE FROM profiles WHERE id = ? AND user_id = ?")
    .run(id, session.user.id);

  if (result.changes === 0) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json({ message: "Profile deleted" });
}

// PATCH profile flags (e.g. archive/unarchive)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    if (typeof body?.is_archived !== "boolean") {
      return NextResponse.json({ error: "is_archived boolean is required" }, { status: 400 });
    }

    const db = getDb();
    const result = db
      .prepare("UPDATE profiles SET is_archived = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
      .run(body.is_archived ? 1 : 0, id, session.user.id);

    if (result.changes === 0) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    return NextResponse.json({ message: body.is_archived ? "Profile archived" : "Profile restored" });
  } catch {
    return NextResponse.json({ error: "Failed to update profile archive status" }, { status: 500 });
  }
}
