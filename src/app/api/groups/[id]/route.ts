import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import getDb from "@/lib/db";

// GET group details with members
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
    .prepare("SELECT * FROM profile_groups WHERE id = ? AND user_id = ?")
    .get(id, session.user.id) as Record<string, unknown> | undefined;

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const members = db
    .prepare(`
      SELECT p.* FROM profiles p
      JOIN profile_group_members gm ON p.id = gm.profile_id
      WHERE gm.group_id = ?
    `)
    .all(id) as Record<string, unknown>[];

  const parsedMembers = members.map((m) => ({
    ...m,
    medical_conditions: JSON.parse((m.medical_conditions as string) || "[]"),
    allergies: JSON.parse((m.allergies as string) || "[]"),
    medications: JSON.parse((m.medications as string) || "[]"),
    goals: JSON.parse((m.goals as string) || "[]"),
  }));

  return NextResponse.json({
    ...group,
    group_goals: JSON.parse((group.group_goals as string) || "[]"),
    members: parsedMembers,
  });
}

// PUT update group
export async function PUT(
  req: NextRequest,
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

  const { name, description, group_type, group_goals, member_ids } = await req.json();

  db.prepare(`
    UPDATE profile_groups SET name = ?, description = ?, group_type = ?, group_goals = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name, description || "", group_type || "custom", JSON.stringify(group_goals || []), id);

  if (member_ids) {
    db.prepare("DELETE FROM profile_group_members WHERE group_id = ?").run(id);
    const insertMember = db.prepare(
      "INSERT INTO profile_group_members (group_id, profile_id) VALUES (?, ?)"
    );
    for (const profileId of member_ids) {
      const profile = db
        .prepare("SELECT id FROM profiles WHERE id = ? AND user_id = ?")
        .get(profileId, session.user.id);
      if (profile) {
        insertMember.run(id, profileId);
      }
    }
  }

  return NextResponse.json({ success: true });
}

// DELETE group
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();

  db.prepare("DELETE FROM profile_groups WHERE id = ? AND user_id = ?").run(
    id,
    session.user.id
  );

  return NextResponse.json({ success: true });
}
