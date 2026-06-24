import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getWhatsAppStatus, initializeWhatsApp } from "@/lib/whatsapp";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let status = getWhatsAppStatus(session.user.id);
  if (status.has_auth && status.status === "disconnected") {
    await initializeWhatsApp(session.user.id);
    status = getWhatsAppStatus(session.user.id);
  }

  return NextResponse.json(status);
}
