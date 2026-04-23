import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  WASocket,
} from "@whiskeysockets/baileys";
import path from "path";
import { Boom } from "@hapi/boom";
import fs from "fs";

const AUTH_DIR = path.resolve(process.cwd(), "wa_auth");

let sock: WASocket | null = null;
let connectionStatus: "disconnected" | "connecting" | "connected" = "disconnected";
let isInitializing = false;

export async function initializeWhatsApp() {
  if (isInitializing || sock) return;
  isInitializing = true;

  // Only attempt to connect if the auth directory exists and has credentials
  if (!fs.existsSync(AUTH_DIR)) {
    console.warn("[WhatsApp] Admin auth directory not found. WhatsApp features will be disabled. Run 'npx tsx scripts/connect-whatsapp.ts' to pair.");
    isInitializing = false;
    return;
  }

  connectionStatus = "connecting";

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[WhatsApp] Using WA v${version.join(".")}, isLatest: ${isLatest}`);

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "close") {
        const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
        if (reason === DisconnectReason.loggedOut) {
          console.warn("[WhatsApp] Admin account logged out. Please re-run the pairing script.");
          connectionStatus = "disconnected";
          sock = null;
        } else {
          // Reconnect on non-logout disconnections
          console.log("[WhatsApp] Connection closed, reconnecting...");
          sock = null;
          isInitializing = false;
          setTimeout(initializeWhatsApp, 5000);
        }
      }

      if (connection === "open") {
        console.log("[WhatsApp] ✅ Admin connection established successfully.");
        connectionStatus = "connected";
      }
    });
  } catch (error) {
    console.error("[WhatsApp] Connection error:", error);
    connectionStatus = "disconnected";
    sock = null;
  } finally {
    isInitializing = false;
  }
}

export async function sendWhatsAppMessage(
  phone: string,
  message: string
): Promise<boolean> {
  if (!sock || connectionStatus !== "connected") {
    throw new Error("WhatsApp is not connected");
  }

  try {
    // Normalize phone number: remove +, spaces, dashes
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    const jid = `${cleanPhone}@s.whatsapp.net`;

    await sock.sendMessage(jid, { text: message });
    return true;
  } catch (error) {
    console.error("WhatsApp send error:", error);
    throw error;
  }
}

export function isConnected(): boolean {
  return connectionStatus === "connected" && sock !== null;
}
