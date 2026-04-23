import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";
import getDb from "@/lib/db";
import {
  getAiConfig,
  buildGroupSystemPrompt,
  buildGroupPlanPrompt,
  generateCompletion,
  type ProfileData,
} from "@/lib/ai";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const { focusAreas, action, content: providedContent, title: providedTitle, planType } = await req.json();
    const db = getDb();

    // Get group
    const group = db
      .prepare("SELECT * FROM profile_groups WHERE id = ? AND user_id = ?")
      .get(id, session.user.id) as Record<string, unknown> | undefined;

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // Get members
    const members = db
      .prepare(`
        SELECT p.* FROM profiles p
        JOIN profile_group_members gm ON p.id = gm.profile_id
        WHERE gm.group_id = ?
      `)
      .all(id) as Record<string, unknown>[];

    if (members.length === 0) {
      return NextResponse.json({ error: "Group has no members" }, { status: 400 });
    }

    const profilesData: ProfileData[] = members.map((m) => ({
      name: m.name as string,
      age: m.age as number | undefined,
      gender: m.gender as string | undefined,
      height_cm: m.height_cm as number | undefined,
      weight_kg: m.weight_kg as number | undefined,
      activity_level: m.activity_level as string | undefined,
      dietary_preference: m.dietary_preference as string | undefined,
      medical_conditions: JSON.parse((m.medical_conditions as string) || "[]"),
      allergies: JSON.parse((m.allergies as string) || "[]"),
      medications: JSON.parse((m.medications as string) || "[]"),
      goals: JSON.parse((m.goals as string) || "[]"),
      additional_notes: m.additional_notes as string | undefined,
    }));

    const config = getAiConfig(session.user.id);
    const groupGoals = JSON.parse((group.group_goals as string) || "[]");
    const groupType = (group.group_type as string) || "custom";
    const selectedPlanType = typeof planType === "string" && planType.trim() ? planType.trim() : "weekly";
    const areas = focusAreas || [];

    if (action === "save") {
      if (!providedContent || !String(providedContent).trim()) {
        return NextResponse.json({ error: "content is required to save a plan" }, { status: 400 });
      }
      const planId = uuidv4();
      const title = providedTitle || `Group Plan: ${group.name as string} (${profilesData.map((p) => p.name).join(", ")})`;

      db.prepare(`
        INSERT INTO health_plans (id, profile_id, group_id, plan_type, title, content, focus_areas, model_used)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(planId, members[0].id as string, id, selectedPlanType, title, providedContent, JSON.stringify(areas), config.model);

      return NextResponse.json({
        id: planId,
        title,
        content: providedContent,
        plan_type: selectedPlanType,
        focus_areas: areas,
        model_used: config.model,
        created_at: new Date().toISOString(),
      });
    }

    const messages = [
      { role: "system", content: buildGroupSystemPrompt(profilesData) },
      { role: "user", content: buildGroupPlanPrompt(profilesData, groupType, groupGoals, areas) },
    ];

    const content = await generateCompletion(config, messages);
    const memberNames = profilesData.map((p) => p.name).join(", ");
    const title = `Group Plan: ${group.name as string} (${memberNames})`;

    if (action === "generate") {
      return NextResponse.json({
        id: "temp_" + Date.now(),
        title,
        content,
        plan_type: selectedPlanType,
        focus_areas: areas,
        model_used: config.model,
        created_at: new Date().toISOString(),
        isTemp: true,
      });
    }

    // Legacy default: save and generate
    const planId = uuidv4();
    db.prepare(`
      INSERT INTO health_plans (id, profile_id, group_id, plan_type, title, content, focus_areas, model_used)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(planId, members[0].id as string, id, selectedPlanType, title, content, JSON.stringify(areas), config.model);

    return NextResponse.json({
      id: planId,
      title,
      content,
      plan_type: selectedPlanType,
      focus_areas: areas,
      model_used: config.model,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Group plan error:", error);
    const errMsg = error instanceof Error ? error.message : "Plan generation failed";
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

// GET group plans
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

  const group = db
    .prepare("SELECT id FROM profile_groups WHERE id = ? AND user_id = ?")
    .get(id, session.user.id);

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const plans = db
    .prepare("SELECT * FROM health_plans WHERE group_id = ? ORDER BY created_at DESC")
    .all(id) as Record<string, unknown>[];

  const parsed = plans.map((p) => ({
    ...p,
    focus_areas: JSON.parse((p.focus_areas as string) || "[]"),
  }));

  return NextResponse.json(parsed);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids) ? body.ids.filter((planId: unknown) => typeof planId === "string") : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids array is required" }, { status: 400 });
  }

  const db = getDb();
  const group = db
    .prepare("SELECT id FROM profile_groups WHERE id = ? AND user_id = ?")
    .get(id, session.user.id);

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const placeholders = ids.map(() => "?").join(",");
  const result = db.prepare(`
    DELETE FROM health_plans
    WHERE group_id = ?
      AND id IN (${placeholders})
  `).run(id, ...ids);

  return NextResponse.json({ deleted: result.changes });
}
