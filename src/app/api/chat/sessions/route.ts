import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import getDb from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profileId = req.nextUrl.searchParams.get("profileId");
  const groupId = req.nextUrl.searchParams.get("groupId");
  const showArchived = req.nextUrl.searchParams.get("showArchived") === "true";

  if (!profileId && !groupId) {
    return NextResponse.json({ error: "profileId or groupId required" }, { status: 400 });
  }

  const db = getDb();
  let sessions: unknown[] = [];

  if (profileId) {
    const profile = db
      .prepare("SELECT id FROM profiles WHERE id = ? AND user_id = ?")
      .get(profileId, session.user.id);
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    sessions = db
      .prepare(
        `SELECT * FROM chat_sessions
         WHERE profile_id = ? AND user_id = ?
           AND (group_id IS NULL OR group_id = '')
           ${showArchived ? "" : "AND (is_archived IS NULL OR is_archived = 0)"}
         ORDER BY updated_at DESC`
      )
      .all(profileId, session.user.id);
  } else if (groupId) {
    const group = db
      .prepare("SELECT id FROM profile_groups WHERE id = ? AND user_id = ?")
      .get(groupId, session.user.id);
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    sessions = db
      .prepare(
        `SELECT * FROM chat_sessions
         WHERE group_id = ? AND user_id = ?
           ${showArchived ? "" : "AND (is_archived IS NULL OR is_archived = 0)"}
         ORDER BY updated_at DESC`
      )
      .all(groupId, session.user.id);
  }

  return NextResponse.json(sessions);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const db = getDb();
  const chatSession = db
    .prepare("SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?")
    .get(sessionId, session.user.id);

  if (!chatSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  db.prepare("DELETE FROM chat_sessions WHERE id = ?").run(sessionId);
  return NextResponse.json({ deleted: true });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { sessionId, archived } = body as { sessionId?: string; archived?: boolean };

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const db = getDb();
  const chatSession = db
    .prepare("SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?")
    .get(sessionId, session.user.id);

  if (!chatSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  db.prepare("UPDATE chat_sessions SET is_archived = ? WHERE id = ?").run(
    archived ? 1 : 0,
    sessionId
  );

  return NextResponse.json({ updated: true, archived });
}
