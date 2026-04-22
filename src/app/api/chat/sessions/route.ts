import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import getDb from "@/lib/db";

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
  
  // Verify profile belongs to user
  const profile = db
    .prepare("SELECT id FROM profiles WHERE id = ? AND user_id = ?")
    .get(profileId, session.user.id);
    
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const sessions = db
    .prepare(
      "SELECT * FROM chat_sessions WHERE profile_id = ? ORDER BY updated_at DESC"
    )
    .all(profileId);

  return NextResponse.json(sessions);
}
