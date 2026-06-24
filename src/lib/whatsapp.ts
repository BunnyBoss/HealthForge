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

export type WhatsAppConnectionStatus = "disconnected" | "connecting" | "connected";

export interface WhatsAppStatus {
  status: WhatsAppConnectionStatus;
  is_connected: boolean;
  phone_number: string | null;
  has_auth: boolean;
  qr: string | null;
}

interface UserConnection {
  sock: WASocket | null;
  status: WhatsAppConnectionStatus;
  qr: string | null;
  phoneNumber: string | null;
  initializing: Promise<void> | null;
  reconnectTimer: NodeJS.Timeout | null;
}

const AUTH_ROOT = path.resolve(process.cwd(), "wa_auth", "users");

const connections = new Map<string, UserConnection>();

const STATUS_RANK: Record<string, number> = {
  pending: 1,
  submitting: 2,
  submitted: 3,
  delivered: 4,
  read: 5,
  failed: 0,
};

function getConnection(userId: string): UserConnection {
  const existing = connections.get(userId);
  if (existing) return existing;

  const connection: UserConnection = {
    sock: null,
    status: "disconnected",
    qr: null,
    phoneNumber: null,
    initializing: null,
    reconnectTimer: null,
  };
  connections.set(userId, connection);
  return connection;
}

function safeUserDirName(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getAuthDir(userId: string): string {
  return path.join(AUTH_ROOT, safeUserDirName(userId));
}

function hasAuthData(userId: string): boolean {
  const authDir = getAuthDir(userId);
  return fs.existsSync(authDir) && fs.readdirSync(authDir).length > 0;
}

function normalizePhoneFromJid(jid?: string | null): string | null {
  if (!jid) return null;
  const digits = jid.split(":")[0]?.replace(/[^0-9]/g, "");
  return digits || null;
}

function saveWhatsAppConfig(userId: string, isConnected: boolean, phoneNumber?: string | null) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO whatsapp_config (user_id, is_connected, phone_number, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        is_connected = excluded.is_connected,
        phone_number = excluded.phone_number,
        updated_at = CURRENT_TIMESTAMP
    `).run(userId, isConnected ? 1 : 0, phoneNumber || null);
  } catch (error) {
    console.error(`[WhatsApp] Failed to update config for user ${userId}:`, error);
  }
}

function clearReconnectTimer(connection: UserConnection) {
  if (connection.reconnectTimer) {
    clearTimeout(connection.reconnectTimer);
    connection.reconnectTimer = null;
  }
}

function promoteStatusForMessage(userId: string, waMessageId: string, nextStatus: "delivered" | "read") {
  if (!waMessageId) return;
  try {
    const db = getDb();
    const row = db
      .prepare("SELECT id, status FROM queued_messages WHERE user_id = ? AND wa_message_id = ?")
      .get(userId, waMessageId) as { id: string; status: string } | undefined;

    if (!row) return;

    const currentRank = STATUS_RANK[row.status] ?? -1;
    const nextRank = STATUS_RANK[nextStatus] ?? -1;
    if (nextRank <= currentRank) return;

    if (nextStatus === "delivered") {
      db.prepare(`
        UPDATE queued_messages
        SET status = 'delivered',
            delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP)
        WHERE id = ? AND user_id = ?
      `).run(row.id, userId);
      return;
    }

    db.prepare(`
      UPDATE queued_messages
      SET status = 'read',
          delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP),
          read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
      WHERE id = ? AND user_id = ?
    `).run(row.id, userId);
  } catch (error) {
    console.error(`[WhatsApp] Failed to process receipt update for user ${userId}:`, error);
  }
}

async function waitForQrOrOpen(userId: string, timeoutMs = 15000): Promise<WhatsAppStatus> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const status = getWhatsAppStatus(userId);
    if (status.qr || status.status === "connected" || status.status === "disconnected") {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return getWhatsAppStatus(userId);
}

export function getWhatsAppStatus(userId: string): WhatsAppStatus {
  const connection = getConnection(userId);
  const db = getDb();
  const stored = db
    .prepare("SELECT is_connected, phone_number FROM whatsapp_config WHERE user_id = ?")
    .get(userId) as { is_connected?: number | null; phone_number?: string | null } | undefined;

  const authExists = hasAuthData(userId);
  const status = connection.status === "connected" && connection.sock
    ? "connected"
    : connection.status === "connecting" || connection.initializing
      ? "connecting"
      : "disconnected";

  return {
    status,
    is_connected: status === "connected",
    phone_number: connection.phoneNumber || stored?.phone_number || null,
    has_auth: authExists,
    qr: connection.qr,
  };
}

export async function initializeWhatsApp(userId: string, options: { forcePairing?: boolean } = {}) {
  const connection = getConnection(userId);
  if (connection.initializing) return connection.initializing;
  if (connection.sock && connection.status === "connected") return;
  if (!options.forcePairing && !hasAuthData(userId)) {
    connection.status = "disconnected";
    connection.qr = null;
    saveWhatsAppConfig(userId, false);
    return;
  }

  clearReconnectTimer(connection);
  connection.status = "connecting";
  saveWhatsAppConfig(userId, false);

  connection.initializing = (async () => {
    try {
      const authDir = getAuthDir(userId);
      fs.mkdirSync(authDir, { recursive: true });

      const { state, saveCreds } = await useMultiFileAuthState(authDir);
      const { version, isLatest } = await fetchLatestBaileysVersion();
      console.log(`[WhatsApp] User ${userId}: using WA v${version.join(".")}, isLatest: ${isLatest}`);

      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ["HealthForge", "Chrome", "1.0.0"],
      });

      connection.sock = sock;
      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async (update) => {
        const { connection: nextConnection, lastDisconnect, qr } = update;

        if (qr) {
          connection.qr = qr;
          connection.status = "connecting";
          saveWhatsAppConfig(userId, false);
        }

        if (nextConnection === "close") {
          const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
          connection.sock = null;
          connection.qr = null;

          if (reason === DisconnectReason.loggedOut) {
            console.warn(`[WhatsApp] User ${userId}: account logged out.`);
            connection.status = "disconnected";
            connection.phoneNumber = null;
            fs.rmSync(getAuthDir(userId), { recursive: true, force: true });
            saveWhatsAppConfig(userId, false, null);
            return;
          }

          console.log(`[WhatsApp] User ${userId}: connection closed, reconnecting...`);
          connection.status = "connecting";
          saveWhatsAppConfig(userId, false);
          clearReconnectTimer(connection);
          connection.reconnectTimer = setTimeout(() => {
            connection.initializing = null;
            initializeWhatsApp(userId).catch((error) => {
              console.error(`[WhatsApp] User ${userId}: reconnect failed:`, error);
            });
          }, 5000);
        }

        if (nextConnection === "open") {
          connection.status = "connected";
          connection.qr = null;
          connection.phoneNumber = normalizePhoneFromJid(sock.user?.id);
          saveWhatsAppConfig(userId, true, connection.phoneNumber);
          console.log(`[WhatsApp] User ${userId}: connection established.`);
        }
      });

      sock.ev.on("message-receipt.update", (updates) => {
        for (const update of updates) {
          const waMessageId = update.key?.id;
          if (!waMessageId) continue;
          const receipt = update.receipt;

          if (receipt?.readTimestamp || receipt?.playedTimestamp) {
            promoteStatusForMessage(userId, waMessageId, "read");
            continue;
          }

          if (receipt?.receiptTimestamp || (receipt?.deliveredDeviceJid && receipt.deliveredDeviceJid.length > 0)) {
            promoteStatusForMessage(userId, waMessageId, "delivered");
          }
        }
      });

      sock.ev.on("messages.update", (updates) => {
        for (const update of updates) {
          const waMessageId = update.key?.id;
          if (!waMessageId) continue;
          const status = update.update?.status;
          if (typeof status !== "number") continue;

          if (status === WAMessageStatus.READ || status === WAMessageStatus.PLAYED) {
            promoteStatusForMessage(userId, waMessageId, "read");
            continue;
          }

          if (status === WAMessageStatus.DELIVERY_ACK) {
            promoteStatusForMessage(userId, waMessageId, "delivered");
          }
        }
      });
    } catch (error) {
      console.error(`[WhatsApp] User ${userId}: connection error:`, error);
      connection.status = "disconnected";
      connection.sock = null;
      connection.qr = null;
      saveWhatsAppConfig(userId, false);
    } finally {
      connection.initializing = null;
    }
  })();

  return connection.initializing;
}

export async function startWhatsAppPairing(userId: string): Promise<WhatsAppStatus> {
  await initializeWhatsApp(userId, { forcePairing: true });
  return waitForQrOrOpen(userId);
}

export async function logoutWhatsApp(userId: string) {
  const connection = getConnection(userId);
  clearReconnectTimer(connection);

  if (connection.sock) {
    try {
      await connection.sock.logout();
    } catch {
      // The local auth state is removed below even if the remote logout call fails.
    }
  }

  connection.sock = null;
  connection.status = "disconnected";
  connection.qr = null;
  connection.initializing = null;
  connection.phoneNumber = null;

  fs.rmSync(getAuthDir(userId), { recursive: true, force: true });
  saveWhatsAppConfig(userId, false, null);
}

export async function sendWhatsAppMessage(
  userId: string,
  phone: string,
  message: string
): Promise<{ messageId: string }> {
  if (!isConnected(userId)) {
    await initializeWhatsApp(userId);
  }

  const connection = getConnection(userId);
  if (!connection.sock || connection.status !== "connected") {
    throw new Error("WhatsApp is not connected for this user");
  }

  try {
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    const jid = `${cleanPhone}@s.whatsapp.net`;
    const sent = await connection.sock.sendMessage(jid, { text: message });
    const messageId = sent?.key?.id;
    if (!messageId) {
      throw new Error("WhatsApp send succeeded but message id was missing");
    }
    return { messageId };
  } catch (error) {
    console.error(`[WhatsApp] User ${userId}: send error:`, error);
    throw error;
  }
}

export function isConnected(userId: string): boolean {
  const connection = getConnection(userId);
  return connection.status === "connected" && connection.sock !== null;
}
