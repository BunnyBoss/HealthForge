import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getWhatsAppStatus, logoutWhatsApp } from "@/lib/whatsapp";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await logoutWhatsApp(session.user.id);
  return NextResponse.json(getWhatsAppStatus(session.user.id));
}
