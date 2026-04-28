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
  const normalizedName = typeof name === "string" ? name.trim() : "";

  if (!normalizedName) {
    return NextResponse.json({ error: "Group name is required" }, { status: 400 });
  }

  if (normalizedName.length > 120) {
    return NextResponse.json({ error: "Group name must be 120 characters or less" }, { status: 400 });
  }

  db.prepare(`
    UPDATE profile_groups SET name = ?, description = ?, group_type = ?, group_goals = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(normalizedName, description || "", group_type || "custom", JSON.stringify(group_goals || []), id);

  if (member_ids) {
    const requestedMemberIds = Array.isArray(member_ids)
      ? Array.from(new Set(member_ids.filter((memberId: unknown): memberId is string => typeof memberId === "string")))
      : [];
    if (requestedMemberIds.length < 2) {
      return NextResponse.json({ error: "At least 2 members required" }, { status: 400 });
    }

    const placeholders = requestedMemberIds.map(() => "?").join(",");
    const validMembers = db
      .prepare(`SELECT id FROM profiles WHERE user_id = ? AND id IN (${placeholders})`)
      .all(session.user.id, ...requestedMemberIds) as { id: string }[];
    if (validMembers.length < 2) {
      return NextResponse.json({ error: "At least 2 valid members required" }, { status: 400 });
    }

    db.prepare("DELETE FROM profile_group_members WHERE group_id = ?").run(id);
    const insertMember = db.prepare(
      "INSERT INTO profile_group_members (group_id, profile_id) VALUES (?, ?)"
    );
    for (const profile of validMembers) {
      insertMember.run(id, profile.id);
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
