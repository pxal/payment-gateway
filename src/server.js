import http from "node:http";
import { config } from "./config.js";
import { readDb, updateDb } from "./storage.js";
import { renderDashboard } from "./dashboard.js";
import { authenticateStore } from "./services/auth.js";
import { createPayment, expireOldPayments, getPayment, listPayments } from "./services/payments.js";
import { recordAndroidNotification } from "./services/notifications.js";
import { createApiKey, createWebhookSecret, randomId, signValue, timingSafeEqualString, verifySignedValue } from "./utils/security.js";
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
  };
}

const adminCookieName = "gateway_admin";

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
  <style>
    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      background: #f6f7f9;
      color: #18202f;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      width: min(420px, calc(100vw - 32px));
      background: #fff;
      border: 1px solid #d9dee7;
      border-radius: 8px;
      padding: 24px;
    }
    h1 { margin: 0 0 6px; font-size: 22px; }
    p { margin: 0 0 20px; color: #657083; }
    form { display: grid; gap: 12px; }
    label { display: grid; gap: 6px; font-size: 13px; font-weight: 650; color: #657083; }
    input, button {
      min-height: 42px;
      border-radius: 6px;
      border: 1px solid #d9dee7;
      font: inherit;
    }
    input { padding: 8px 10px; }
    button {
      border-color: #0f766e;
      background: #0f766e;
      color: #fff;
      font-weight: 750;
      cursor: pointer;
    }
    .error { min-height: 20px; color: #b42318; font-size: 13px; }
  </style>
</head>
<body>
  <main>
    <h1>QRIS Gateway</h1>
    <p>Masuk ke dashboard admin.</p>
    <form method="post" action="/login">
      <label>Admin Token
        <input name="token" type="password" autocomplete="current-password" autofocus required>
      </label>
      <button type="submit">Login</button>
      <div class="error">${error}</div>
    </form>
  </main>
</body>
</html>`;
}

async function handleCreatePayment(req, res) {
  const auth = authenticateStore(req);
  if (!auth) return sendJson(res, 401, { error: "Invalid API key" });

  const body = await readJson(req);
  const payment = createPayment(auth.store, body);
  return sendJson(res, 201, publicPayment(payment));
}

function handleListPayments(req, res) {
  const auth = authenticateStore(req);
  if (!auth) return sendJson(res, 401, { error: "Invalid API key" });

  expireOldPayments();
  return sendJson(res, 200, {
    data: listPayments(auth.store.id).map(publicPayment),
  });
}

function handleGetPayment(req, res, paymentId) {
  const auth = authenticateStore(req);
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

async function handleAndroidNotification(req, res) {
  const secret = req.headers["x-android-secret"];
  if (!timingSafeEqualString(secret, config.androidSharedSecret)) {
    return sendJson(res, 401, { error: "Invalid Android secret" });
  }

  const body = await readJson(req);
  const result = await recordAndroidNotification(body);
  return sendJson(res, 200, {
    notification_id: result.notification.id,
    parsed_amount: result.notification.parsed_amount,
    status: result.notification.status,
    matched_payment_id: result.notification.matched_payment_id,
    payment_status: result.payment?.status || null,
  });
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
      id: randomId("store"),
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

    if (path === "/api/android/notifications") {
      if (req.method === "POST") return handleAndroidNotification(req, res);
      return methodNotAllowed(res);
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

server.listen(config.port, () => {
  console.log(`QRIS Gateway running at ${config.baseUrl}`);
  console.log(`Dashboard: ${config.baseUrl}/dashboard`);
});
