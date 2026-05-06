import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { readDb, updateDb } from "./storage.js";
import { renderDashboard } from "./dashboard.js";
import { authenticateStore } from "./services/auth.js";
import { createPayment, expireOldPayments, getPayment, listPayments } from "./services/payments.js";
import { recordAndroidNotification } from "./services/notifications.js";
import { retryPaymentCallback, startCallbackRetryPoller } from "./services/callbacks.js";
import { disconnectWhatsApp, getWhatsAppStatus, startWhatsApp } from "./services/whatsapp.js";
import { createApiKey, createMerchantId, createWebhookSecret, randomId, signValue, timingSafeEqualString, verifySignedValue } from "./utils/security.js";
import { methodNotAllowed, notFound, readJson, sendHtml, sendJson } from "./utils/http.js";
import { parseQRIS, validateQRIS } from "./qris/index.js";

function publicPayment(payment) {
  return {
    payment_id: payment.id,
    external_id: payment.external_id,
    amount: payment.amount,
    status: payment.status,
    qr_string: payment.qr_string,
    qr_image_url: `${config.baseUrl}/api/payments/${payment.id}/qr`,
    expired_at: payment.expires_at,
    paid_at: payment.paid_at,
    callback_status: payment.callback_status,
    callback_attempts: payment.callback_attempts || 0,
    callback_next_retry_at: payment.callback_next_retry_at || null,
    callback_last_attempt_at: payment.callback_last_attempt_at || null,
  };
}

const adminCookieName = "gateway_admin";
const androidDebugLogPath = path.resolve(process.cwd(), "data", "android-debug.log");

function migrateMerchantIds() {
  updateDb((db) => {
    const idMap = new Map();

    for (const store of db.stores) {
      if (/^VER-[A-Z0-9]{5}$/.test(store.id)) continue;
      const oldId = store.id;
      store.id = createMerchantId(db.stores);
      store.updated_at = new Date().toISOString();
      idMap.set(oldId, store.id);
    }

    if (!idMap.size) return 0;

    for (const apiKey of db.apiKeys) {
      if (idMap.has(apiKey.store_id)) apiKey.store_id = idMap.get(apiKey.store_id);
    }
    for (const payment of db.payments) {
      if (idMap.has(payment.store_id)) payment.store_id = idMap.get(payment.store_id);
    }

    return idMap.size;
  });
}

function redact(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 6) return "***";
  return `${text.slice(0, 3)}***${text.slice(-3)}`;
}

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "";
}

function androidDebug(req, event, details = {}) {
  const entry = {
    at: new Date().toISOString(),
    event,
    method: req.method,
    url: req.url,
    ip: clientIp(req),
    user_agent: req.headers["user-agent"] || "",
    ...details,
  };

  const line = `[android-debug] ${JSON.stringify(entry)}`;
  console.log(line);

  try {
    fs.mkdirSync(path.dirname(androidDebugLogPath), { recursive: true });
    fs.appendFileSync(androidDebugLogPath, `${line}\n`);
  } catch (error) {
    console.error(`[android-debug] failed to write log: ${error.message}`);
  }
}

function readAndroidDebugLog(limit = 100) {
  if (!fs.existsSync(androidDebugLogPath)) return [];
  return fs
    .readFileSync(androidDebugLogPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-limit);
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const index = item.indexOf("=");
        if (index === -1) return [item, ""];
        return [item.slice(0, index), decodeURIComponent(item.slice(index + 1))];
      }),
  );
}

function requireAdmin(req) {
  const headerToken = req.headers["x-admin-token"];
  if (headerToken && timingSafeEqualString(headerToken, config.adminToken)) return true;

  const cookies = parseCookies(req);
  const session = verifySignedValue(cookies[adminCookieName], config.adminToken);
  return session === "admin";
}

function renderLogin(error = "") {
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Login - QRIS Gateway</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
  <style>
    :root {
      color-scheme: light;
      --bg: #0a0e1a;
      --surface: #131829;
      --surface-soft: #1a2138;
      --line: #2a304a;
      --text: #e8ecf5;
      --text-soft: #c2cadb;
      --muted: #94a3b8;
      --primary: #60a5fa;
      --primary-grad: linear-gradient(135deg, #2563eb 0%, #0ea5e9 50%, #06b6d4 100%);
      --bad: #f87171;
      --bad-bg: rgba(239,68,68,.12);
      --bad-ring: rgba(248,113,113,.20);
      --ring: 0 0 0 4px rgba(96,165,250,.20);
      --ease: cubic-bezier(.4, 0, .2, 1);
    }
    * { box-sizing: border-box; }
    *::selection { background: rgba(37,99,235,.30); color: #fff; }
    html, body { height: 100%; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      background:
        radial-gradient(900px 500px at 12% 8%, rgba(37,99,235,.30), transparent 60%),
        radial-gradient(700px 400px at 88% 92%, rgba(14,165,233,.22), transparent 60%),
        radial-gradient(500px 360px at 50% 50%, rgba(14,165,233,.10), transparent 70%),
        var(--bg);
      color: var(--text);
      font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }
    body::before, body::after {
      content: "";
      position: fixed;
      width: 520px;
      height: 520px;
      border-radius: 50%;
      filter: blur(80px);
      opacity: .35;
      pointer-events: none;
      z-index: 0;
    }
    body::before { top: -160px; left: -160px; background: #2563eb; animation: drift1 14s ease-in-out infinite; }
    body::after { bottom: -200px; right: -160px; background: #06b6d4; animation: drift2 16s ease-in-out infinite; }
    @keyframes drift1 {
      0%,100% { transform: translate(0,0); }
      50% { transform: translate(40px,30px); }
    }
    @keyframes drift2 {
      0%,100% { transform: translate(0,0); }
      50% { transform: translate(-40px,-30px); }
    }
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    main {
      position: relative;
      z-index: 1;
      width: min(440px, 100%);
      padding: 36px 32px;
      background: linear-gradient(180deg, rgba(19,24,41,.85), rgba(19,24,41,.92));
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 20px;
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      box-shadow: 0 32px 80px -20px rgba(0,0,0,.65), inset 0 1px 0 rgba(255,255,255,.06);
      animation: fadeUp .5s var(--ease);
    }
    .brand-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 22px;
    }
    .brand-mark {
      position: relative;
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 12px;
      color: #fff;
      font-weight: 800;
      font-size: 18px;
      background: var(--primary-grad);
      box-shadow: 0 10px 22px -6px rgba(37,99,235,.55), inset 0 1px 0 rgba(255,255,255,.20);
    }
    .brand-text strong {
      display: block;
      font-size: 14.5px;
      letter-spacing: -0.005em;
    }
    .brand-text span {
      display: block;
      margin-top: 2px;
      color: var(--muted);
      font-size: 11.5px;
      letter-spacing: 0.02em;
    }
    h1 {
      margin: 0 0 6px;
      font-size: 26px;
      font-weight: 700;
      letter-spacing: -0.025em;
      background: linear-gradient(180deg, #fff, #c7d0e2);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    p {
      margin: 0 0 24px;
      color: var(--muted);
      font-size: 13.5px;
      line-height: 1.55;
    }
    form { display: grid; gap: 14px; }
    label {
      display: grid;
      gap: 7px;
      font-size: 12.5px;
      font-weight: 600;
      color: var(--text-soft);
    }
    .input-wrap {
      position: relative;
    }
    .input-wrap svg {
      position: absolute;
      left: 14px;
      top: 50%;
      transform: translateY(-50%);
      width: 16px;
      height: 16px;
      color: var(--muted);
      pointer-events: none;
    }
    input {
      width: 100%;
      min-height: 46px;
      padding: 12px 14px 12px 40px;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: rgba(15,19,33,.6);
      color: var(--text);
      font: inherit;
      outline: none;
      transition: border-color .15s var(--ease), box-shadow .15s var(--ease), background .15s var(--ease);
    }
    input::placeholder { color: var(--muted); opacity: .7; }
    input:focus {
      border-color: var(--primary);
      box-shadow: var(--ring);
      background: rgba(15,19,33,.85);
    }
    button {
      position: relative;
      width: 100%;
      min-height: 46px;
      padding: 0 16px;
      margin-top: 4px;
      border: none;
      border-radius: 12px;
      background: var(--primary-grad);
      background-size: 180% 180%;
      color: #fff;
      font-weight: 600;
      font-size: 14px;
      letter-spacing: 0.005em;
      cursor: pointer;
      box-shadow: 0 10px 28px -8px rgba(37,99,235,.55), inset 0 1px 0 rgba(255,255,255,.18);
      transition: transform .15s var(--ease), box-shadow .2s var(--ease), background-position .4s var(--ease);
    }
    button:hover {
      background-position: 100% 0;
      box-shadow: 0 14px 32px -8px rgba(37,99,235,.70), inset 0 1px 0 rgba(255,255,255,.22);
    }
    button:active { transform: translateY(1px) scale(.99); }
    .error {
      min-height: 22px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: ${error ? "10px 14px" : "0"};
      border-radius: 10px;
      background: ${error ? "var(--bad-bg)" : "transparent"};
      box-shadow: ${error ? "inset 0 0 0 1px var(--bad-ring)" : "none"};
      color: var(--bad);
      font-size: 12.5px;
      font-weight: 500;
    }
    .footer {
      margin-top: 22px;
      padding-top: 18px;
      border-top: 1px solid rgba(255,255,255,.06);
      color: var(--muted);
      font-size: 11.5px;
      text-align: center;
      letter-spacing: 0.02em;
    }
  </style>
</head>
<body>
  <main>
    <div class="brand-row">
      <div class="brand-mark">Q</div>
      <div class="brand-text">
        <strong>QRIS Gateway</strong>
        <span>Private payment ops</span>
      </div>
    </div>
    <h1>Welcome back</h1>
    <p>Masuk ke dashboard admin untuk monitor transaksi dan kelola integrasi.</p>
    <form method="post" action="/login">
      <label>Admin Token
        <div class="input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <input name="token" type="password" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" autocomplete="current-password" autofocus required>
        </div>
      </label>
      <button type="submit">
        <span>Sign in</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
      </button>
      <div class="error">${error ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>${error}` : ""}</div>
    </form>
    <div class="footer">QRIS Gateway &copy; ${new Date().getFullYear()}</div>
  </main>
</body>
</html>`;
}

async function handleCreatePayment(req, res) {
  const auth = authenticateStore(req);
  if (auth?.error) return sendJson(res, 401, { error: auth.error });
  if (!auth) return sendJson(res, 401, { error: "Invalid API key" });

  const body = await readJson(req);
  const payment = createPayment(auth.store, body);
  return sendJson(res, 201, publicPayment(payment));
}

function handleListPayments(req, res) {
  const auth = authenticateStore(req);
  if (auth?.error) return sendJson(res, 401, { error: auth.error });
  if (!auth) return sendJson(res, 401, { error: "Invalid API key" });

  expireOldPayments();
  return sendJson(res, 200, {
    data: listPayments(auth.store.id).map(publicPayment),
  });
}

function handleGetPayment(req, res, paymentId) {
  const auth = authenticateStore(req);
  if (auth?.error) return sendJson(res, 401, { error: auth.error });
  if (!auth) return sendJson(res, 401, { error: "Invalid API key" });

  expireOldPayments();
  const payment = getPayment(paymentId, auth.store.id);
  if (!payment) return sendJson(res, 404, { error: "Payment not found" });

  return sendJson(res, 200, publicPayment(payment));
}

function handlePaymentQr(req, res, paymentId) {
  const payment = getPayment(paymentId);
  if (!payment) return sendJson(res, 404, { error: "Payment not found" });

  const qrServerUrl = new URL("https://api.qrserver.com/v1/create-qr-code/");
  qrServerUrl.searchParams.set("size", "320x320");
  qrServerUrl.searchParams.set("data", payment.qr_string);

  res.writeHead(302, { Location: qrServerUrl.toString() });
  res.end();
}

async function handleAdminCreatePayment(req, res, url) {
  if (!requireAdmin(req)) return sendJson(res, 401, { error: "Invalid admin session" });

  const body = await readJson(req);
  const db = readDb();
  const store = db.stores.find((item) => item.id === body.store_id);
  if (!store) return sendJson(res, 404, { error: "Store not found" });

  const payment = createPayment(store, body);
  return sendJson(res, 201, publicPayment(payment));
}

async function handleAdminRetryCallback(req, res, paymentId) {
  if (!requireAdmin(req)) return sendJson(res, 401, { error: "Invalid admin session" });

  const result = await retryPaymentCallback(paymentId);
  if (!result.ok) {
    return sendJson(res, result.statusCode || 422, { error: result.error });
  }

  const payment = getPayment(paymentId);
  return sendJson(res, 200, {
    log: result.log,
    payment: payment ? publicPayment(payment) : null,
  });
}

async function handleAndroidNotification(req, res) {
  const secret = req.headers["x-android-secret"];
  const secretMatches = timingSafeEqualString(secret, config.androidSharedSecret);
  androidDebug(req, "notification_request", {
    content_type: req.headers["content-type"] || "",
    content_length: req.headers["content-length"] || "",
    secret_present: Boolean(secret),
    secret_preview: redact(secret),
    secret_matches: secretMatches,
  });

  if (!secretMatches) {
    androidDebug(req, "notification_rejected", { reason: "invalid_android_secret" });
    return sendJson(res, 401, { error: "Invalid Android secret" });
  }

  let body = null;
  try {
    body = await readJson(req);
  } catch (error) {
    androidDebug(req, "notification_bad_json", { error: error.message });
    throw error;
  }

  androidDebug(req, "notification_payload", {
    package_name: body.package_name || body.packageName || body.pkg || "",
    title: body.title || "",
    text: body.text || body.content || body.message || body.body || "",
    big_text: body.big_text || body.bigText || body.extra_text || body.extraText || "",
    amount: body.amount || "",
    received_at: body.received_at || body.receivedAt || body.post_time || body.postTime || "",
  });

  const result = await recordAndroidNotification(body);
  androidDebug(req, "notification_recorded", {
    notification_id: result.notification.id,
    parsed_amount: result.notification.parsed_amount,
    status: result.notification.status,
    matched_payment_id: result.notification.matched_payment_id,
    payment_status: result.payment?.status || null,
    duplicate: Boolean(result.duplicate),
  });

  return sendJson(res, 200, {
    notification_id: result.notification.id,
    parsed_amount: result.notification.parsed_amount,
    status: result.notification.status,
    matched_payment_id: result.notification.matched_payment_id,
    payment_status: result.payment?.status || null,
    duplicate: Boolean(result.duplicate),
  });
}

function handleAndroidHealth(req, res) {
  androidDebug(req, "health_check");
  return sendJson(res, 200, {
    ok: true,
    endpoint: "/api/android/notifications",
    server_time: new Date().toISOString(),
  });
}

function handleAdminAndroidDebug(req, res, url) {
  if (!requireAdmin(req)) return sendJson(res, 401, { error: "Invalid admin session" });
  const limit = Number(url.searchParams.get("limit") || 100);
  const safeLimit = Number.isInteger(limit) && limit > 0 && limit <= 500 ? limit : 100;
  return sendJson(res, 200, {
    file: androidDebugLogPath,
    lines: readAndroidDebugLog(safeLimit),
  });
}

function handleAdminWhatsAppStatus(req, res) {
  if (!requireAdmin(req)) return sendJson(res, 401, { error: "Invalid admin session" });
  return sendJson(res, 200, getWhatsAppStatus());
}

async function handleAdminWhatsAppConnect(req, res) {
  if (!requireAdmin(req)) return sendJson(res, 401, { error: "Invalid admin session" });
  try {
    return sendJson(res, 200, await startWhatsApp());
  } catch (error) {
    return sendJson(res, 500, {
      ...getWhatsAppStatus(),
      status: "error",
      error: error.message || "Failed to start WhatsApp",
    });
  }
}

async function handleAdminWhatsAppDisconnect(req, res) {
  if (!requireAdmin(req)) return sendJson(res, 401, { error: "Invalid admin session" });
  return sendJson(res, 200, await disconnectWhatsApp());
}

async function handleCreateStore(req, res, url) {
  if (!requireAdmin(req)) return sendJson(res, 401, { error: "Invalid admin session" });

  const body = await readJson(req);
  if (!body.name) return sendJson(res, 422, { error: "name is required" });

  if (body.static_qris) {
    const validation = validateQRIS(body.static_qris);
    if (!validation.valid) {
      return sendJson(res, 422, { error: "Invalid QRIS", details: validation.errors });
    }
  }

  const created = updateDb((db) => {
    const store = {
      id: createMerchantId(db.stores),
      name: String(body.name).trim(),
      webhook_secret: createWebhookSecret(),
      static_qris: String(body.static_qris || "").trim(),
      created_at: new Date().toISOString(),
    };
    const apiKey = {
      id: randomId("key"),
      store_id: store.id,
      key: createApiKey(),
      name: body.api_key_name || "Default API Key",
      active: true,
      created_at: new Date().toISOString(),
    };

    db.stores.unshift(store);
    db.apiKeys.unshift(apiKey);
    return { store, api_key: apiKey.key };
  });

  return sendJson(res, 201, created);
}

async function handleUpdateStore(req, res, storeId) {
  if (!requireAdmin(req)) return sendJson(res, 401, { error: "Invalid admin session" });

  const body = await readJson(req);
  if (!body.name) return sendJson(res, 422, { error: "name is required" });

  if (body.static_qris) {
    const validation = validateQRIS(body.static_qris);
    if (!validation.valid) {
      return sendJson(res, 422, { error: "Invalid QRIS", details: validation.errors });
    }
  }

  const updated = updateDb((db) => {
    const store = db.stores.find((item) => item.id === storeId);
    if (!store) return null;

    store.name = String(body.name).trim();
    if (body.static_qris !== undefined) {
      store.static_qris = String(body.static_qris || "").trim();
    }
    store.updated_at = new Date().toISOString();
    return store;
  });

  if (!updated) return sendJson(res, 404, { error: "Store not found" });
  return sendJson(res, 200, { store: updated });
}

async function handleDeleteStore(req, res, storeId) {
  if (!requireAdmin(req)) return sendJson(res, 401, { error: "Invalid admin session" });

  const deleted = updateDb((db) => {
    const index = db.stores.findIndex((item) => item.id === storeId);
    if (index === -1) return null;

    const [store] = db.stores.splice(index, 1);
    db.apiKeys = db.apiKeys.filter((key) => key.store_id !== storeId);
    return store;
  });

  if (!deleted) return sendJson(res, 404, { error: "Store not found" });
  return sendJson(res, 200, { deleted: true, store: deleted });
}

async function handleUpdateStoreQris(req, res, url, storeId) {
  if (!requireAdmin(req)) return sendJson(res, 401, { error: "Invalid admin session" });

  const body = await readJson(req);
  const validation = validateQRIS(body.static_qris || "");
  if (!validation.valid) {
    return sendJson(res, 422, { error: "Invalid QRIS", details: validation.errors });
  }

  const info = parseQRIS(body.static_qris);
  const updated = updateDb((db) => {
    const store = db.stores.find((item) => item.id === storeId);
    if (!store) return null;
    store.static_qris = body.static_qris.trim();
    store.updated_at = new Date().toISOString();
    return store;
  });

  if (!updated) return sendJson(res, 404, { error: "Store not found" });
  return sendJson(res, 200, { store: updated, qris_info: info });
}

function handleAdminData(req, res, url) {
  if (!requireAdmin(req)) return sendJson(res, 401, { error: "Invalid admin session" });
  expireOldPayments();
  return sendJson(res, 200, readDb());
}

function handleDashboard(req, res, url) {
  if (!requireAdmin(req)) {
    res.writeHead(302, { Location: "/login" });
    res.end();
    return;
  }

  expireOldPayments();
  return sendHtml(res, 200, renderDashboard(readDb(), {
    baseUrl: config.baseUrl,
    androidSharedSecret: config.androidSharedSecret,
  }));
}

async function handleLogin(req, res) {
  if (req.method === "GET") return sendHtml(res, 200, renderLogin());
  if (req.method !== "POST") return methodNotAllowed(res);

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  const token = body.get("token") || "";

  if (!timingSafeEqualString(token, config.adminToken)) {
    return sendHtml(res, 401, renderLogin("Token admin tidak valid."));
  }

  const cookieValue = encodeURIComponent(signValue("admin", config.adminToken));
  res.writeHead(302, {
    "Set-Cookie": `${adminCookieName}=${cookieValue}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`,
    Location: "/dashboard",
  });
  res.end();
}

function handleLogout(res) {
  res.writeHead(302, {
    "Set-Cookie": `${adminCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
    Location: "/login",
  });
  res.end();
}

async function router(req, res) {
  const url = new URL(req.url, config.baseUrl);
  const path = url.pathname;

  try {
    if (path.startsWith("/api/android")) {
      androidDebug(req, "android_route_seen", { path });
    }

    if (path === "/" && req.method === "GET") {
      res.writeHead(302, { Location: "/dashboard" });
      res.end();
      return;
    }

    if (path === "/login") {
      return handleLogin(req, res);
    }

    if (path === "/logout" && req.method === "POST") {
      return handleLogout(res);
    }

    if (path === "/dashboard" && req.method === "GET") {
      return handleDashboard(req, res, url);
    }

    if (path === "/api/admin/data" && req.method === "GET") {
      return handleAdminData(req, res, url);
    }

    if (path === "/api/admin/android-debug" && req.method === "GET") {
      return handleAdminAndroidDebug(req, res, url);
    }

    if (path === "/api/admin/wa/status" && req.method === "GET") {
      return handleAdminWhatsAppStatus(req, res);
    }

    if (path === "/api/admin/wa/connect" && req.method === "POST") {
      return handleAdminWhatsAppConnect(req, res);
    }

    if (path === "/api/admin/wa/disconnect" && req.method === "POST") {
      return handleAdminWhatsAppDisconnect(req, res);
    }

    if (path === "/api/admin/stores" && req.method === "POST") {
      return handleCreateStore(req, res, url);
    }

    const storeMatch = path.match(/^\/api\/admin\/stores\/([^/]+)$/);
    if (storeMatch && req.method === "PUT") {
      return handleUpdateStore(req, res, storeMatch[1]);
    }
    if (storeMatch && req.method === "DELETE") {
      return handleDeleteStore(req, res, storeMatch[1]);
    }

    if (path === "/api/admin/payments" && req.method === "POST") {
      return handleAdminCreatePayment(req, res, url);
    }

    const adminRetryCallbackMatch = path.match(/^\/api\/admin\/payments\/([^/]+)\/retry-callback$/);
    if (adminRetryCallbackMatch && req.method === "POST") {
      return handleAdminRetryCallback(req, res, adminRetryCallbackMatch[1]);
    }

    const storeQrisMatch = path.match(/^\/api\/admin\/stores\/([^/]+)\/qris$/);
    if (storeQrisMatch && req.method === "PUT") {
      return handleUpdateStoreQris(req, res, url, storeQrisMatch[1]);
    }

    if (path === "/api/payments") {
      if (req.method === "POST") return handleCreatePayment(req, res);
      if (req.method === "GET") return handleListPayments(req, res);
      return methodNotAllowed(res);
    }

    const paymentMatch = path.match(/^\/api\/payments\/([^/]+)$/);
    if (paymentMatch && req.method === "GET") {
      return handleGetPayment(req, res, paymentMatch[1]);
    }

    const paymentQrMatch = path.match(/^\/api\/payments\/([^/]+)\/qr$/);
    if (paymentQrMatch && req.method === "GET") {
      return handlePaymentQr(req, res, paymentQrMatch[1]);
    }

    if (path === "/api/android/health" && req.method === "GET") {
      return handleAndroidHealth(req, res);
    }

    if (path === "/api/android/notifications" || path === "/api/android/notification") {
      if (req.method === "POST") return handleAndroidNotification(req, res);
      androidDebug(req, "notification_method_not_allowed", { path });
      return methodNotAllowed(res);
    }

    if (path.startsWith("/api/android")) {
      androidDebug(req, "android_route_not_found", { path });
    }

    return notFound(res);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return sendJson(res, statusCode, {
      error: error.message || "Internal server error",
      details: error.details || undefined,
    });
  }
}

const server = http.createServer(router);

migrateMerchantIds();
startCallbackRetryPoller();

server.listen(config.port, () => {
  console.log(`QRIS Gateway running at ${config.baseUrl}`);
  console.log(`Dashboard: ${config.baseUrl}/dashboard`);
});
