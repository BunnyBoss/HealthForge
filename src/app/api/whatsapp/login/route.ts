import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { auth } from "@/lib/auth";
import { startWhatsAppPairing } from "@/lib/whatsapp";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await startWhatsAppPairing(session.user.id);
  const qr_data_url = status.qr ? await QRCode.toDataURL(status.qr) : null;

  return NextResponse.json({
    ...status,
    qr_data_url,
  });
}
