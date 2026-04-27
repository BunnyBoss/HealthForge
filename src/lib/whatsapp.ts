import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  WASocket,
  WAMessageStatus,
} from "@whiskeysockets/baileys";
import path from "path";
import { Boom } from "@hapi/boom";
import fs from "fs";
import getDb from "@/lib/db";

const AUTH_DIR = path.resolve(process.cwd(), "wa_auth");

let sock: WASocket | null = null;
let connectionStatus: "disconnected" | "connecting" | "connected" = "disconnected";
let isInitializing = false;

const STATUS_RANK: Record<string, number> = {
  pending: 1,
  submitting: 2,
  submitted: 3,
  delivered: 4,
  read: 5,
  failed: 0,
};

function promoteStatusForMessage(waMessageId: string, nextStatus: "delivered" | "read") {
  if (!waMessageId) return;
  try {
    const db = getDb();
    const row = db
      .prepare("SELECT id, status FROM queued_messages WHERE wa_message_id = ?")
      .get(waMessageId) as { id: string; status: string } | undefined;

    if (!row) return;

    const currentRank = STATUS_RANK[row.status] ?? -1;
    const nextRank = STATUS_RANK[nextStatus] ?? -1;
    if (nextRank <= currentRank) return;

    if (nextStatus === "delivered") {
      db.prepare(`
        UPDATE queued_messages
        SET status = 'delivered',
            delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP)
        WHERE id = ?
      `).run(row.id);
      return;
    }

    db.prepare(`
      UPDATE queued_messages
      SET status = 'read',
          delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP),
          read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
      WHERE id = ?
    `).run(row.id);
  } catch (error) {
    console.error("[WhatsApp] Failed to process receipt update:", error);
  }
}

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

    sock.ev.on("message-receipt.update", (updates) => {
      for (const update of updates) {
        const waMessageId = update.key?.id;
        if (!waMessageId) continue;
        const receipt = update.receipt;

        if (receipt?.readTimestamp || receipt?.playedTimestamp) {
          promoteStatusForMessage(waMessageId, "read");
          continue;
        }

        if (receipt?.receiptTimestamp || (receipt?.deliveredDeviceJid && receipt.deliveredDeviceJid.length > 0)) {
          promoteStatusForMessage(waMessageId, "delivered");
        }
      }
    });

    // For 1:1 chats, Baileys emits delivery/read in "messages.update" instead of
    // "message-receipt.update", so listen to both channels.
    sock.ev.on("messages.update", (updates) => {
      for (const update of updates) {
        const waMessageId = update.key?.id;
        if (!waMessageId) continue;
        const status = update.update?.status;
        if (typeof status !== "number") continue;

        if (status === WAMessageStatus.READ || status === WAMessageStatus.PLAYED) {
          promoteStatusForMessage(waMessageId, "read");
          continue;
        }

        if (status === WAMessageStatus.DELIVERY_ACK) {
          promoteStatusForMessage(waMessageId, "delivered");
        }
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
): Promise<{ messageId: string }> {
  if (!sock || connectionStatus !== "connected") {
    throw new Error("WhatsApp is not connected");
  }

  try {
    // Normalize phone number: remove +, spaces, dashes
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    const jid = `${cleanPhone}@s.whatsapp.net`;
    const sent = await sock.sendMessage(jid, { text: message });
    const messageId = sent?.key?.id;
    if (!messageId) {
      throw new Error("WhatsApp send succeeded but message id was missing");
    }
    return { messageId };
  } catch (error) {
    console.error("WhatsApp send error:", error);
    throw error;
  }
}

export function isConnected(): boolean {
  return connectionStatus === "connected" && sock !== null;
}
