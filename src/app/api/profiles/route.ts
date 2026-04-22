import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";
import getDb from "@/lib/db";

// GET all profiles for the current user
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const profiles = db
    .prepare("SELECT * FROM profiles WHERE user_id = ? ORDER BY created_at ASC")
    .all(session.user.id);

  // Parse JSON fields
  const parsed = (profiles as Record<string, unknown>[]).map((p) => ({
    ...p,
    medical_conditions: JSON.parse((p.medical_conditions as string) || "[]"),
    allergies: JSON.parse((p.allergies as string) || "[]"),
    medications: JSON.parse((p.medications as string) || "[]"),
    goals: JSON.parse((p.goals as string) || "[]"),
  }));

  return NextResponse.json(parsed);
}

// POST create a new profile
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const db = getDb();
    const id = uuidv4();

    db.prepare(`
      INSERT INTO profiles (id, user_id, name, relationship, age, gender, height_cm, weight_kg,
        activity_level, dietary_preference, medical_conditions, allergies, medications, goals, additional_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      session.user.id,
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
      body.additional_notes || ""
    );

    return NextResponse.json({ id, message: "Profile created" }, { status: 201 });
  } catch (error) {
    console.error("Create profile error:", error);
    return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
  }
}
