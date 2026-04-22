import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import getDb from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { name, email, password } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email, and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const db = getDb();

    const existing = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(email);
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    const userId = uuidv4();
    const passwordHash = await hash(password, 12);

    db.prepare(
      "INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)"
    ).run(userId, name, email, passwordHash);

    // Auto-create a "Self" profile
    const profileId = uuidv4();
    db.prepare(
      "INSERT INTO profiles (id, user_id, name, relationship) VALUES (?, ?, ?, ?)"
    ).run(profileId, userId, name, "self");

    return NextResponse.json(
      { message: "Account created successfully", userId },
      { status: 201 }
    );
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
