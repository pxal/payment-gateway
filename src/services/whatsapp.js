import fs from "node:fs";
import path from "node:path";
import { recordWhatsAppMessage } from "./notifications.js";

const authDir = path.resolve(process.cwd(), "data", "wa-auth");

const state = {
  status: "disconnected",
  qr: null,
  jid: null,
  last_error: null,
  last_disconnect_code: null,
  last_message_at: null,
  started_at: null,
};

let socket = null;
let starting = null;
let reconnectTimer = null;
let lastTerminalStatus = null;

const silentLogger = {
  level: "silent",
  child() {
    return this;
  },
  fatal() {},
  error() {},
  warn() {},
  info() {},
  debug() {},
  trace() {},
};

function setStatus(patch) {
  Object.assign(state, patch);
}

function logTerminalStatus(status) {
  if (lastTerminalStatus === status) return;
  lastTerminalStatus = status;
  console.log(status === "connected" ? "WhatsApp tersambung" : "WhatsApp terputus");
}

function removeAuthSession() {
  if (fs.existsSync(authDir)) {
    fs.rmSync(authDir, { recursive: true, force: true });
  }
}

function scheduleReconnect(reason = "WhatsApp reconnect required") {
  if (reconnectTimer) return;

  setStatus({
    status: "reconnecting",
    qr: null,
    jid: null,
    last_error: reason,
  });

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startWhatsApp().catch((error) => {
      setStatus({
        status: "error",
        last_error: error.message || "Failed to reconnect WhatsApp",
      });
    });
  }, 1500);
}

function extractMessageText(message) {
  const content = message?.message || {};
  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.documentMessage?.caption ||
    content.buttonsResponseMessage?.selectedDisplayText ||
    content.listResponseMessage?.title ||
    ""
  ).trim();
}

function shouldProcessWhatsAppText(text) {
  const normalized = String(text || "");
  return /transaksi\s+qr/i.test(normalized) || /nominal\s*:/i.test(normalized) || /rp\.?\s*\d/i.test(normalized);
}

async function loadBaileys() {
  try {
    return await import("@whiskeysockets/baileys");
  } catch (error) {
    throw Object.assign(
      new Error("Dependency WhatsApp belum terpasang. Jalankan npm install lalu restart server."),
      { cause: error },
    );
  }
}

export function getWhatsAppStatus() {
  return { ...state };
}

export async function startWhatsApp() {
  if (socket) return getWhatsAppStatus();
  if (starting) return starting;

  starting = (async () => {
    setStatus({
      status: "connecting",
      qr: null,
      last_error: null,
      started_at: new Date().toISOString(),
    });

    const baileys = await loadBaileys();
    const makeWASocket = baileys.default || baileys.makeWASocket;
    const { state: authState, saveCreds } = await baileys.useMultiFileAuthState(authDir);
    const { version } = await baileys.fetchLatestBaileysVersion();

    socket = makeWASocket({
      auth: authState,
      version,
      logger: silentLogger,
      printQRInTerminal: false,
      browser: ["QRIS Gateway", "Chrome", "1.0.0"],
    });

    socket.ev.on("creds.update", saveCreds);
    socket.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        setStatus({ status: "qr", qr, last_error: null });
      }

      if (connection === "open") {
        setStatus({
          status: "connected",
          qr: null,
          jid: socket?.user?.id || null,
          last_error: null,
        });
        logTerminalStatus("connected");
      }

      if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === baileys.DisconnectReason?.loggedOut;
        const reason = lastDisconnect?.error?.message || "WhatsApp disconnected";
        socket = null;

        if (loggedOut) {
          removeAuthSession();
        }

        setStatus({
          status: loggedOut ? "logged_out" : "disconnected",
          qr: null,
          jid: null,
          last_error: reason,
          last_disconnect_code: code || null,
        });
        logTerminalStatus("disconnected");

        if (!loggedOut) {
          scheduleReconnect(reason);
        }
      }
    });

    socket.ev.on("messages.upsert", async ({ messages }) => {
      for (const message of messages || []) {
        if (message.key?.fromMe) continue;
        const text = extractMessageText(message);
        if (!text || !shouldProcessWhatsAppText(text)) continue;

        try {
          const chatName = message.pushName || message.key?.remoteJid || "WhatsApp";
          await recordWhatsAppMessage({
            chat_name: chatName,
            from: message.key?.remoteJid,
            text,
            received_at: new Date(Number(message.messageTimestamp || Date.now() / 1000) * 1000).toISOString(),
          });
          setStatus({ last_message_at: new Date().toISOString(), last_error: null });
        } catch (error) {
          setStatus({ last_error: error.message });
        }
      }
    });

    return getWhatsAppStatus();
  })();

  try {
    return await starting;
  } finally {
    starting = null;
  }
}

export async function disconnectWhatsApp() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const activeSocket = socket;
  socket = null;

  if (activeSocket) {
    try {
      await activeSocket.logout();
    } catch {
      activeSocket.end?.();
    }
  }

  removeAuthSession();

  setStatus({
    status: "disconnected",
    qr: null,
    jid: null,
    last_error: null,
    last_disconnect_code: null,
  });
  logTerminalStatus("disconnected");

  return getWhatsAppStatus();
}
