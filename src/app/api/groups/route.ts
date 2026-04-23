import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";
import getDb from "@/lib/db";

// GET all groups for the user
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const groups = db
    .prepare(`
      SELECT g.*, COUNT(gm.profile_id) as member_count
      FROM profile_groups g
      LEFT JOIN profile_group_members gm ON g.id = gm.group_id
      WHERE g.user_id = ?
      GROUP BY g.id
      ORDER BY g.updated_at DESC
    `)
    .all(session.user.id) as Record<string, unknown>[];

  const parsed = groups.map((g) => ({
    ...g,
    group_goals: JSON.parse((g.group_goals as string) || "[]"),
  }));

  return NextResponse.json(parsed);
}

// POST create a new group
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { name, description, group_type, group_goals, member_ids } = await req.json();

    if (!name?.trim()) {
      return NextResponse.json({ error: "Group name is required" }, { status: 400 });
    }

    if (!member_ids?.length || member_ids.length < 2) {
      return NextResponse.json({ error: "At least 2 members required" }, { status: 400 });
    }

    const db = getDb();
    const groupId = uuidv4();

    db.prepare(`
      INSERT INTO profile_groups (id, user_id, name, description, group_type, group_goals)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      groupId,
      session.user.id,
      name.trim(),
      description || "",
      group_type || "custom",
      JSON.stringify(group_goals || [])
    );

    // Add members
    const insertMember = db.prepare(
      "INSERT INTO profile_group_members (group_id, profile_id) VALUES (?, ?)"
    );
    for (const profileId of member_ids) {
      // Verify profile belongs to user
      const profile = db
        .prepare("SELECT id FROM profiles WHERE id = ? AND user_id = ?")
        .get(profileId, session.user.id);
      if (profile) {
        insertMember.run(groupId, profileId);
      }
    }

    return NextResponse.json({ id: groupId, name, group_type });
  } catch (error) {
    console.error("Group creation error:", error);
    return NextResponse.json({ error: "Failed to create group" }, { status: 500 });
  }
}
