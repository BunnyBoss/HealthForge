import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import getDb from "@/lib/db";
import { randomUUID } from "crypto";

function getClientIp(req: NextRequest): string | null {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  return realIp?.trim() || null;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO auth_event_logs (id, user_id, event_type, ip_address, user_agent)
      VALUES (?, ?, 'logout', ?, ?)
    `).run(
      randomUUID(),
      session.user.id,
      getClientIp(req),
      req.headers.get("user-agent") || null
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Logout log error:", error);
    return NextResponse.json({ error: "Failed to record logout log" }, { status: 500 });
  }
}
