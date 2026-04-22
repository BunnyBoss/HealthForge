import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";
import getDb from "@/lib/db";
import {
  getAiConfig,
  buildSystemPrompt,
  buildProfileContext,
  streamChat,
  type ProfileData,
} from "@/lib/ai";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { profileId, message } = await req.json();

    if (!profileId || !message) {
      return NextResponse.json(
        { error: "profileId and message are required" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Get profile
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

    // Get chat history (last 20 messages for context)
    const history = db
      .prepare(
        "SELECT role, content FROM chat_messages WHERE profile_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 20"
      )
      .all(profileId, session.user.id) as { role: string; content: string }[];

    history.reverse();

    // Save user message
    db.prepare(
      "INSERT INTO chat_messages (id, profile_id, user_id, role, content) VALUES (?, ?, ?, ?, ?)"
    ).run(uuidv4(), profileId, session.user.id, "user", message);

    // Build messages array
    const config = getAiConfig(session.user.id);
    const messages = [
      { role: "system", content: buildSystemPrompt(profileData) },
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
              "INSERT INTO chat_messages (id, profile_id, user_id, role, content, model_used) VALUES (?, ?, ?, ?, ?, ?)"
            ).run(
              uuidv4(),
              profileId,
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

  const profileId = req.nextUrl.searchParams.get("profileId");
  if (!profileId) {
    return NextResponse.json({ error: "profileId required" }, { status: 400 });
  }

  const db = getDb();
  const messages = db
    .prepare(
      "SELECT * FROM chat_messages WHERE profile_id = ? AND user_id = ? ORDER BY created_at ASC"
    )
    .all(profileId, session.user.id);

  return NextResponse.json(messages);
}
