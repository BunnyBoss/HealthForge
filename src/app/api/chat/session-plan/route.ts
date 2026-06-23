import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import getDb from "@/lib/db";
import { buildGroupSystemPrompt, buildSystemPrompt, generateCompletion, getAiConfig, type ProfileData } from "@/lib/ai";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { profileId, groupId, sessionId, title, planId, unsavedPlanContext } = await req.json();
    if ((!profileId && !groupId) || !sessionId) {
      return NextResponse.json({ error: "profileId or groupId and sessionId are required" }, { status: 400 });
    }

    const db = getDb();
    const existingSession = groupId
      ? db.prepare("SELECT id, plan_id FROM chat_sessions WHERE id = ? AND user_id = ? AND group_id = ?")
        .get(sessionId, session.user.id, groupId) as { id: string; plan_id?: string | null } | undefined
      : db.prepare("SELECT id, plan_id FROM chat_sessions WHERE id = ? AND user_id = ? AND profile_id = ? AND (group_id IS NULL OR group_id = '')")
        .get(sessionId, session.user.id, profileId) as { id: string; plan_id?: string | null } | undefined;
    if (!existingSession) {
      return NextResponse.json({ error: "Chat session not found" }, { status: 404 });
    }

    const messages = db
      .prepare("SELECT role, content FROM chat_messages WHERE session_id = ? AND user_id = ? ORDER BY created_at ASC")
      .all(sessionId, session.user.id) as { role: string; content: string }[];
    if (messages.length === 0) {
      return NextResponse.json({ error: "Chat session has no messages yet" }, { status: 400 });
    }

    const selectedPlanId = typeof planId === "string" && planId ? planId : existingSession.plan_id || null;

    const chatTranscript = messages
      .map((message) => `${message.role === "assistant" ? "Assistant" : "User"}: ${message.content}`)
      .join("\n\n");

    const config = getAiConfig(session.user.id);
    let systemPrompt = "";
    let prompt = "";
    let responseTitle = title || "Customized Plan";
    let responsePlanType = "custom";
    let responseFocusAreas: string[] = [];

    if (groupId) {
      const group = db
        .prepare("SELECT * FROM profile_groups WHERE id = ? AND user_id = ?")
        .get(groupId, session.user.id) as Record<string, unknown> | undefined;
      if (!group) {
        return NextResponse.json({ error: "Group not found" }, { status: 404 });
      }

      const members = db
        .prepare(`
          SELECT p.* FROM profiles p
          JOIN profile_group_members gm ON p.id = gm.profile_id
          WHERE gm.group_id = ?
          ORDER BY p.created_at ASC
        `)
        .all(groupId) as Record<string, unknown>[];
      if (members.length === 0) {
        return NextResponse.json({ error: "Group has no members" }, { status: 400 });
      }

      const profilesData: ProfileData[] = members.map((profile) => ({
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
      }));

      const dbBasePlan = selectedPlanId
        ? db.prepare("SELECT id, title, content, focus_areas, plan_type FROM health_plans WHERE id = ? AND group_id = ?")
          .get(selectedPlanId, groupId) as { id: string; title: string; content: string; focus_areas?: string; plan_type?: string } | undefined
        : undefined;

      const basePlan = unsavedPlanContext ? {
        id: "temp",
        title: unsavedPlanContext.title,
        content: unsavedPlanContext.content,
        focus_areas: unsavedPlanContext.focus_areas ? JSON.stringify(unsavedPlanContext.focus_areas) : undefined,
        plan_type: unsavedPlanContext.plan_type
      } : dbBasePlan;

      responseTitle = title || `Customized Group Plan for ${group.name as string}`;
      responsePlanType = basePlan?.plan_type || "custom";
      responseFocusAreas = basePlan?.focus_areas ? JSON.parse(basePlan.focus_areas) : [];
      systemPrompt = buildGroupSystemPrompt(profilesData);
      prompt = `Create a revised GROUP health plan for ${(group.name as string)} based on this chat session.

Goal:
- Synthesize requested changes from the conversation into one clean, updated group plan.
- If there is a base plan, preserve its useful structure but apply requested changes.
- Keep recommendations practical, specific, and ready to save in the app.
- Include shared recommendations plus per-member modifications when needed.
- Return only plan markdown content. No intro, no code fences.

${basePlan ? `Base plan title: ${basePlan.title}
Base plan type: ${basePlan.plan_type || "custom"}
Base plan focus areas: ${basePlan.focus_areas || "[]"}

Base plan content:
${basePlan.content.substring(0, 5000)}` : "There is no base saved group plan. Build directly from group context and chat guidance."}

Chat transcript:
${chatTranscript.substring(0, 10000)}`;
    } else {
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

      const dbBasePlan = selectedPlanId
        ? db.prepare("SELECT id, title, content, focus_areas, plan_type FROM health_plans WHERE id = ? AND profile_id = ? AND (group_id IS NULL OR group_id = '')")
          .get(selectedPlanId, profileId) as { id: string; title: string; content: string; focus_areas?: string; plan_type?: string } | undefined
        : undefined;

      const basePlan = unsavedPlanContext ? {
        id: "temp",
        title: unsavedPlanContext.title,
        content: unsavedPlanContext.content,
        focus_areas: unsavedPlanContext.focus_areas ? JSON.stringify(unsavedPlanContext.focus_areas) : undefined,
        plan_type: unsavedPlanContext.plan_type
      } : dbBasePlan;

      responseTitle = title || `Customized Plan for ${profileData.name}`;
      responsePlanType = basePlan?.plan_type || "custom";
      responseFocusAreas = basePlan?.focus_areas ? JSON.parse(basePlan.focus_areas) : [];
      systemPrompt = buildSystemPrompt(profileData);
      prompt = `Create a revised health plan for ${profileData.name} based on this chat session.

Goal:
- Synthesize the user's requested changes from the conversation into one clean, updated plan.
- If there is a base plan, preserve the good structure but apply the requested modifications.
- Keep the plan practical, specific, and ready to save into the app.
- Return only the plan markdown content. No intro, no code fences.

${basePlan ? `Base plan title: ${basePlan.title}
Base plan type: ${basePlan.plan_type || "custom"}
Base plan focus areas: ${basePlan.focus_areas || "[]"}

Base plan content:
${basePlan.content.substring(0, 5000)}` : "There is no base saved plan. Build the plan directly from the chat guidance and profile context."}

Chat transcript:
${chatTranscript.substring(0, 10000)}`;
    }

    const content = await generateCompletion(config, [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ]);

    return NextResponse.json({
      title: responseTitle,
      content,
      plan_type: responsePlanType,
      focus_areas: responseFocusAreas,
      model_used: config.model,
      created_at: new Date().toISOString(),
      isTemp: true,
    });
  } catch (error) {
    console.error("Chat session plan error:", error);
    const message = error instanceof Error ? error.message : "Failed to create plan from chat";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
