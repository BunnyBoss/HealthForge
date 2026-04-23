import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";
import getDb from "@/lib/db";
import {
  getAiConfig,
  buildSystemPrompt,
  buildPlanPrompt,
  generateCompletion,
  type ProfileData,
} from "@/lib/ai";

// POST generate a new plan
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { profileId, planType, focusAreas, action, content: providedContent, title: providedTitle } = await req.json();

    if (!profileId) {
      return NextResponse.json({ error: "profileId is required" }, { status: 400 });
    }

    const db = getDb();
    const profile = db
      .prepare("SELECT * FROM profiles WHERE id = ? AND user_id = ?")
      .get(profileId, session.user.id) as Record<string, unknown> | undefined;

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const profileData: ProfileData = {
      name: profile.name as string,
      age: profile.age as number | undefined,
      gender: profile.gender as string | undefined,
      height_cm: profile.height_cm as number | undefined,
      weight_kg: profile.weight_kg as number | undefined,
      activity_level: profile.activity_level as string | undefined,
      dietary_preference: profile.dietary_preference as string | undefined,
      medical_conditions: JSON.parse((profile.medical_conditions as string) || "[]"),
      allergies: JSON.parse((profile.allergies as string) || "[]"),
      medications: JSON.parse((profile.medications as string) || "[]"),
      goals: JSON.parse((profile.goals as string) || "[]"),
      additional_notes: profile.additional_notes as string | undefined,
    };

    const config = getAiConfig(session.user.id);
    const type = planType || "weekly";
    const areas = focusAreas || [];

    if (action === "save") {
      if (!providedContent || !String(providedContent).trim()) {
        return NextResponse.json({ error: "content is required to save a plan" }, { status: 400 });
      }
      const planId = uuidv4();
      const title = providedTitle || `${type.charAt(0).toUpperCase() + type.slice(1)} Health Plan for ${profileData.name}`;
      
      db.prepare(`
        INSERT INTO health_plans (id, profile_id, plan_type, title, content, focus_areas, model_used)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(planId, profileId, type, title, providedContent, JSON.stringify(areas), config.model);

      return NextResponse.json({
        id: planId,
        title,
        content: providedContent,
        plan_type: type,
        focus_areas: areas,
        model_used: config.model,
        created_at: new Date().toISOString(),
      });
    }

    // Default or generate action
    const messages = [
      { role: "system", content: buildSystemPrompt(profileData) },
      { role: "user", content: buildPlanPrompt(profileData, type, areas) },
    ];

    const content = await generateCompletion(config, messages);
    const title = `${type.charAt(0).toUpperCase() + type.slice(1)} Health Plan for ${profileData.name}`;

    if (action === "generate") {
      return NextResponse.json({
        id: "temp_" + Date.now(),
        title,
        content,
        plan_type: type,
        focus_areas: areas,
        model_used: config.model,
        created_at: new Date().toISOString(),
        isTemp: true,
      });
    }

    // Legacy behavior: save and generate
    const planId = uuidv4();
    db.prepare(`
      INSERT INTO health_plans (id, profile_id, plan_type, title, content, focus_areas, model_used)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(planId, profileId, type, title, content, JSON.stringify(areas), config.model);

    return NextResponse.json({
      id: planId,
      title,
      content,
      plan_type: type,
      focus_areas: areas,
      model_used: config.model,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Plan generation error:", error);
    const errMsg = error instanceof Error ? error.message : "Plan generation failed";
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

// GET plans for a profile
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profileId = req.nextUrl.searchParams.get("profileId");
  if (!profileId) {
    return NextResponse.json({ error: "profileId required" }, { status: 400 });
  }

  const db = getDb();

  // Verify profile ownership
  const profile = db
    .prepare("SELECT id FROM profiles WHERE id = ? AND user_id = ?")
    .get(profileId, session.user.id);
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const plans = db
    .prepare(
      "SELECT * FROM health_plans WHERE profile_id = ? ORDER BY created_at DESC"
    )
    .all(profileId);

  const parsed = (plans as Record<string, unknown>[]).map((p) => ({
    ...p,
    focus_areas: JSON.parse((p.focus_areas as string) || "[]"),
  }));

  return NextResponse.json(parsed);
}

// DELETE plans for a profile (single/bulk)
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id: unknown) => typeof id === "string") : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids array is required" }, { status: 400 });
  }

  const db = getDb();
  const placeholders = ids.map(() => "?").join(",");
  const result = db.prepare(`
    DELETE FROM health_plans
    WHERE id IN (${placeholders})
      AND profile_id IN (SELECT id FROM profiles WHERE user_id = ?)
  `).run(...ids, session.user.id);

  return NextResponse.json({ deleted: result.changes });
}
