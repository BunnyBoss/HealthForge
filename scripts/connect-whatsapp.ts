import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import path from "path";
import fs from "fs";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import pino from "pino";

const AUTH_DIR = path.resolve(process.cwd(), "wa_auth");
const command = process.argv[2] || "login"; // Default to login

async function checkStatus() {
  console.log("Checking WhatsApp connection status...");
  if (!fs.existsSync(AUTH_DIR) || !fs.readdirSync(AUTH_DIR).length) {
    console.log("❌ Not connected. No authentication data found.");
    console.log("Run 'npx tsx scripts/connect-whatsapp.ts login' to connect.");
    process.exit(0);
  }

  const { state } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }) as never, // Silence the logs for status check
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "open") {
      console.log("✅ Status: CONNECTED");
      console.log("Your WhatsApp admin account is successfully linked and active.");
      process.exit(0);
    } else if (connection === "close") {
      const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log("❌ Status: LOGGED OUT");
        console.log("The session is no longer valid. You need to log in again.");
      } else {
        console.log("⚠️ Status: DISCONNECTED (Network issue or reconnecting...)");
      }
      process.exit(0);
    }
  });

  // Timeout if it takes too long
  setTimeout(() => {
    console.log("⏳ Status: TIMEOUT. Could not verify connection. Check your network.");
    process.exit(1);
  }, 10000);
}

function doLogout() {
  console.log("Logging out of WhatsApp admin account...");
  if (fs.existsSync(AUTH_DIR)) {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    console.log("✅ Successfully logged out. Authentication data deleted.");
  } else {
    console.log("⚠️ Already logged out. No authentication data found.");
  }
  process.exit(0);
}

async function connectToWhatsApp() {
  console.log("Starting WhatsApp Admin Connection Script...");
  console.log(`Auth state will be saved to: ${AUTH_DIR}`);

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  
  console.log(`Using WA v${version.join(".")}, isLatest: ${isLatest}`);

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ["HealthForge Admin", "Chrome", "1.0.0"],
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\nSCAN THIS QR CODE WITH YOUR WHATSAPP:\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      
      console.log(
        "Connection closed due to ",
        lastDisconnect?.error,
        ", reconnecting ",
        shouldReconnect
      );
      
      if (shouldReconnect) {
        connectToWhatsApp();
      } else {
        console.log("Logged out! You will need to delete the wa_auth directory and run this script again to scan a new QR code.");
        process.exit(1);
      }
    } else if (connection === "open") {
      console.log("✅ Successfully connected to WhatsApp!");
      console.log("The session has been saved.");
      console.log("You can now safely terminate this script (Ctrl+C). The main HealthForge application will use this saved session.");
    }
  });
}

// Route command
if (command === "status") {
  checkStatus();
} else if (command === "logout") {
  doLogout();
} else if (command === "login") {
  connectToWhatsApp();
} else {
  console.log(`Unknown command: ${command}`);
  console.log("Available commands: login, status, logout");
  process.exit(1);
}
