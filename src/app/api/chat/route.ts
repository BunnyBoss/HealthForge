import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";
import getDb from "@/lib/db";
import {
  getAiConfig,
  buildSystemPrompt,
  buildGroupSystemPrompt,
  streamChat,
  type ProfileData,
} from "@/lib/ai";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { profileId, groupId, message, sessionId: providedSessionId, planId } = await req.json();

    if ((!profileId && !groupId) || !message) {
      return NextResponse.json(
        { error: "profileId or groupId and message are required" },
        { status: 400 }
      );
    }

    const db = getDb();
    let systemPrompt = "";
    let sessionProfileId = profileId as string | null;
    let selectedPlanContent: string | null = null;
    let selectedPlanMeta: { id: string; title: string } | null = null;

    if (groupId) {
      const group = db
        .prepare("SELECT id FROM profile_groups WHERE id = ? AND user_id = ?")
        .get(groupId, session.user.id);

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

      sessionProfileId = members[0].id as string;
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

      if (planId) {
        const selectedPlan = db
          .prepare(`
            SELECT id, title, content
            FROM health_plans
            WHERE id = ? AND group_id = ?
          `)
          .get(planId, groupId) as { id: string; title: string; content: string } | undefined;
        if (!selectedPlan) {
          return NextResponse.json({ error: "Selected plan not found for this group" }, { status: 404 });
        }
        selectedPlanMeta = { id: selectedPlan.id, title: selectedPlan.title };
        selectedPlanContent = selectedPlan.content;
      }

      systemPrompt = buildGroupSystemPrompt(profilesData) + (selectedPlanContent
        ? `\n\n## Selected Group Plan Context\nPlan ID: ${selectedPlanMeta?.id}\nPlan Title: ${selectedPlanMeta?.title}\n\nUse this plan as primary context for recommendations when relevant.\n\n${selectedPlanContent}`
        : "");
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

      if (planId) {
        const selectedPlan = db
          .prepare(`
            SELECT id, title, content
            FROM health_plans
            WHERE id = ? AND profile_id = ? AND (group_id IS NULL OR group_id = '')
          `)
          .get(planId, profileId) as { id: string; title: string; content: string } | undefined;

        if (!selectedPlan) {
          return NextResponse.json({ error: "Selected plan not found for this profile" }, { status: 404 });
        }
        selectedPlanMeta = { id: selectedPlan.id, title: selectedPlan.title };
        selectedPlanContent = selectedPlan.content;
      }

      systemPrompt = buildSystemPrompt(profileData) + (selectedPlanContent
        ? `\n\n## Selected Plan Context\nPlan ID: ${selectedPlanMeta?.id}\nPlan Title: ${selectedPlanMeta?.title}\n\nUse this plan as primary context for recommendations when relevant.\n\n${selectedPlanContent}`
        : "");
    }

    // Determine session ID
    let sessionId = providedSessionId;
    if (!sessionId) {
      sessionId = uuidv4();
      const title = message.length > 30 ? message.substring(0, 30) + '...' : message;
      db.prepare(
        "INSERT INTO chat_sessions (id, user_id, profile_id, group_id, plan_id, title) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(sessionId, session.user.id, sessionProfileId, groupId || null, selectedPlanMeta?.id || null, title);
    } else {
      const existingSession = groupId
        ? db.prepare("SELECT id FROM chat_sessions WHERE id = ? AND user_id = ? AND group_id = ?")
          .get(sessionId, session.user.id, groupId)
        : db.prepare("SELECT id FROM chat_sessions WHERE id = ? AND user_id = ? AND profile_id = ? AND (group_id IS NULL OR group_id = '')")
          .get(sessionId, session.user.id, profileId);
      if (!existingSession) {
        return NextResponse.json({ error: "Chat session not found" }, { status: 404 });
      }

      // Update session timestamp and optionally selected plan link
      db.prepare(
        "UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP, plan_id = COALESCE(?, plan_id) WHERE id = ?"
      ).run(selectedPlanMeta?.id || null, sessionId);
    }

    // Get chat history for this session (last 20 messages for context)
    const history = db
      .prepare(
        "SELECT role, content FROM chat_messages WHERE session_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 20"
      )
      .all(sessionId, session.user.id) as { role: string; content: string }[];

    history.reverse();

    // Save user message
    db.prepare(
      "INSERT INTO chat_messages (id, session_id, profile_id, group_id, user_id, role, content) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(uuidv4(), sessionId, sessionProfileId, groupId || null, session.user.id, "user", message);

    // Build messages array
    const config = getAiConfig(session.user.id);

    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message },
    ];

    // Stream response
    const stream = await streamChat(config, messages);

    // Create a transform stream to capture full response for saving
    let fullResponse = "";
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        // Extract content from SSE chunks
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const json = JSON.parse(line.slice(6));
              const content = json.choices?.[0]?.delta?.content;
              if (content) {
                fullResponse += content;
              }
            } catch {
              // Skip non-JSON lines
            }
          }
        }
        controller.enqueue(chunk);
      },
      async flush() {
        // Save assistant response to DB
        if (fullResponse) {
          try {
            db.prepare(
              "INSERT INTO chat_messages (id, session_id, profile_id, group_id, user_id, role, content, model_used) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            ).run(
              uuidv4(),
              sessionId,
              sessionProfileId,
              groupId || null,
              session.user.id,
              "assistant",
              fullResponse,
              config.model
            );
          } catch (e) {
            console.error("Failed to save assistant message:", e);
          }
        }
      },
    });

    return new Response(stream.pipeThrough(transformStream), {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Session-ID": sessionId,
      },
    });
  } catch (error) {
    console.error("Chat error:", error);
    const errMsg = error instanceof Error ? error.message : "Chat failed";
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

// GET chat history
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const db = getDb();
  const messages = db
    .prepare(
      "SELECT * FROM chat_messages WHERE session_id = ? AND user_id = ? ORDER BY created_at ASC"
    )
    .all(sessionId, session.user.id);

  return NextResponse.json(messages);
}
