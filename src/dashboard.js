import { MAX_CALLBACK_ATTEMPTS } from "./services/callbacks.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatWibDateTime(value = new Date()) {
  return `${new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))} WIB`;
}

function statusClass(status) {
  return {
    paid: "good",
    sent: "good",
    success: "good",
    matched: "good",
    pending: "warn",
    expired: "muted",
    failed: "bad",
    exhausted: "bad",
    skipped: "muted",
    unmatched: "muted",
  }[status] || "muted";
}

function money(value) {
  return `Rp${Number(value || 0).toLocaleString("id-ID")}`;
}

function callbackLabel(payment) {
  if (payment.status === "paid") {
    const status = payment.callback_status || "pending";
    if ((status === "failed" || status === "exhausted") && payment.callback_attempts) {
      return `${status} (${payment.callback_attempts}/${MAX_CALLBACK_ATTEMPTS})`;
    }
    return status;
  }
  if (payment.status === "expired") return "expired";
  return "-";
}

function callbackTooltip(payment) {
  if (payment.status !== "paid") return "";
  const parts = [];
  if (payment.callback_attempts) parts.push(`Attempts: ${payment.callback_attempts}/${MAX_CALLBACK_ATTEMPTS}`);
  if (payment.callback_last_attempt_at) parts.push(`Last: ${formatDate(payment.callback_last_attempt_at)}`);
  if (payment.callback_next_retry_at) parts.push(`Next retry: ${formatDate(payment.callback_next_retry_at)}`);
  if (payment.callback_last_error) parts.push(`Error: ${payment.callback_last_error}`);
  return parts.join(" \u2022 ");
}

function callbackCell(payment) {
  const label = callbackLabel(payment);
  const tooltip = callbackTooltip(payment);
  const titleAttr = tooltip ? ` title="${escapeHtml(tooltip)}"` : "";
  const pillClass = payment.status === "paid" ? (payment.callback_status || "pending") : label;
  const pill = `<span class="pill ${statusClass(pillClass)}"${titleAttr}>${escapeHtml(label)}</span>`;
  const status = payment.callback_status;
  const canRetry = payment.status === "paid" && payment.callback_url && (status === "failed" || status === "exhausted");
  const retryButton = canRetry
    ? `<button type="button" class="callback-retry" data-retry-callback="${escapeHtml(payment.id)}">Retry</button>`
    : "";
  return `<div class="callback-cell">${pill}${retryButton}</div>`;
}

export function renderDashboard(db, options = {}) {
  const baseUrl = options.baseUrl || "http://localhost:1000";
  const androidSharedSecret = options.androidSharedSecret || "ANDROID_SHARED_SECRET";
  const payments = db.payments.slice(0, 100);
  const overviewPayments = db.payments.slice(0, 5);
  const notifications = db.notifications;
  const androidNotifications = notifications.filter((item) => item.source !== "whatsapp");
  const whatsappNotifications = notifications.filter((item) => item.source === "whatsapp");
  const callbacks = db.callbacks.slice(0, 30);
  const paid = db.payments.filter((payment) => payment.status === "paid");
  const pending = db.payments.filter((payment) => payment.status === "pending");
  const expired = db.payments.filter((payment) => payment.status === "expired");
  const stores = db.stores;
  const firstStore = stores[0] || {};
  const firstApiKey = db.apiKeys.find((key) => key.store_id === firstStore.id) || db.apiKeys[0] || {};
  const revenue = paid.reduce((sum, payment) => sum + payment.amount, 0);
  const successRate = db.payments.length
    ? Math.round((paid.length / db.payments.length) * 100)
    : 0;

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>QRIS Gateway Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap">
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7fb;
      --bg-grad: radial-gradient(1200px 600px at 10% -10%, rgba(99,102,241,.10), transparent 60%),
                 radial-gradient(900px 500px at 110% 10%, rgba(14,165,233,.08), transparent 60%),
                 #f5f7fb;
      --surface: #ffffff;
      --surface-soft: #f3f5fa;
      --surface-elev: #ffffff;
      --line: #e3e7ee;
      --line-soft: #eef1f6;
      --text: #0f172a;
      --text-soft: #475569;
      --muted: #64748b;
      --nav-bg: linear-gradient(180deg, #0f172a 0%, #111634 100%);
      --nav-pattern: radial-gradient(800px 400px at 0% 0%, rgba(99,102,241,.18), transparent 55%),
                     radial-gradient(600px 380px at 100% 100%, rgba(14,165,233,.12), transparent 55%);
      --nav-border: rgba(255,255,255,.06);
      --nav-text: #c7d0e2;
      --nav-text-soft: #8a93ab;
      --nav-active-bg: linear-gradient(135deg, rgba(99,102,241,.30), rgba(14,165,233,.18));
      --nav-active-border: rgba(255,255,255,.12);
      --primary: #6366f1;
      --primary-strong: #4f46e5;
      --primary-grad: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #06b6d4 100%);
      --primary-glow: 0 6px 20px -6px rgba(99,102,241,.55);
      --accent: #06b6d4;
      --good: #059669;
      --good-bg: #ecfdf5;
      --good-ring: rgba(16,185,129,.18);
      --warn: #b45309;
      --warn-bg: #fffbeb;
      --warn-ring: rgba(245,158,11,.18);
      --bad: #b91c1c;
      --bad-bg: #fef2f2;
      --bad-ring: rgba(239,68,68,.18);
      --info: #1d4ed8;
      --info-bg: #eff6ff;
      --info-ring: rgba(59,130,246,.18);
      --code-bg: #eef2ff;
      --code-text: #3730a3;
      --pre-bg: linear-gradient(160deg, #0b1024 0%, #0f172a 100%);
      --pre-text: #e2e8f0;
      --shadow-sm: 0 1px 2px rgba(15,23,42,.04), 0 1px 1px rgba(15,23,42,.02);
      --shadow: 0 12px 28px -12px rgba(15,23,42,.12), 0 4px 10px -4px rgba(15,23,42,.06);
      --shadow-lg: 0 24px 60px -20px rgba(15,23,42,.18), 0 8px 18px -10px rgba(15,23,42,.08);
      --shadow-glow: 0 0 0 1px rgba(99,102,241,.18), 0 12px 30px -10px rgba(99,102,241,.30);
      --radius-sm: 8px;
      --radius: 12px;
      --radius-lg: 16px;
      --radius-xl: 20px;
      --ring: 0 0 0 4px rgba(99,102,241,.15);
      --ease: cubic-bezier(.4, 0, .2, 1);
    }
    :root[data-theme="dark"] {
      color-scheme: dark;
      --bg: #0a0e1a;
      --bg-grad: radial-gradient(1200px 600px at 10% -10%, rgba(99,102,241,.18), transparent 60%),
                 radial-gradient(900px 500px at 110% 10%, rgba(14,165,233,.10), transparent 60%),
                 #0a0e1a;
      --surface: #131829;
      --surface-soft: #1a2138;
      --surface-elev: #161c30;
      --line: #2a304a;
      --line-soft: #232841;
      --text: #e8ecf5;
      --text-soft: #c2cadb;
      --muted: #94a3b8;
      --nav-bg: linear-gradient(180deg, #0a0e1a 0%, #0c1226 100%);
      --nav-border: rgba(255,255,255,.04);
      --nav-text: #c5cee3;
      --nav-text-soft: #7c869f;
      --nav-active-bg: linear-gradient(135deg, rgba(99,102,241,.35), rgba(14,165,233,.22));
      --nav-active-border: rgba(255,255,255,.10);
      --primary: #818cf8;
      --primary-strong: #6366f1;
      --primary-glow: 0 6px 22px -6px rgba(129,140,248,.55);
      --accent: #22d3ee;
      --good: #34d399;
      --good-bg: rgba(16,185,129,.12);
      --good-ring: rgba(52,211,153,.20);
      --warn: #fbbf24;
      --warn-bg: rgba(245,158,11,.12);
      --warn-ring: rgba(251,191,36,.20);
      --bad: #f87171;
      --bad-bg: rgba(239,68,68,.12);
      --bad-ring: rgba(248,113,113,.20);
      --info: #60a5fa;
      --info-bg: rgba(59,130,246,.12);
      --info-ring: rgba(96,165,250,.20);
      --code-bg: rgba(99,102,241,.12);
      --code-text: #c7d2fe;
      --pre-bg: linear-gradient(160deg, #050816 0%, #0a0e1f 100%);
      --pre-text: #e2e8f0;
      --shadow-sm: 0 1px 2px rgba(0,0,0,.30), 0 1px 1px rgba(0,0,0,.20);
      --shadow: 0 12px 28px -12px rgba(0,0,0,.50), 0 4px 10px -4px rgba(0,0,0,.30);
      --shadow-lg: 0 24px 60px -20px rgba(0,0,0,.60), 0 8px 18px -10px rgba(0,0,0,.40);
      --shadow-glow: 0 0 0 1px rgba(129,140,248,.22), 0 12px 30px -10px rgba(129,140,248,.40);
      --ring: 0 0 0 4px rgba(129,140,248,.20);
    }
    * { box-sizing: border-box; }
    *::selection { background: rgba(99,102,241,.25); color: var(--text); }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-feature-settings: 'cv11', 'ss01', 'ss03';
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      color: var(--text);
      background: var(--bg-grad);
      background-attachment: fixed;
    }
    .app {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 268px minmax(0, 1fr);
    }
    .sidebar {
      position: sticky;
      top: 0;
      height: 100vh;
      display: flex;
      flex-direction: column;
      gap: 22px;
      padding: 22px 14px;
      background: var(--nav-bg);
      background-image: var(--nav-pattern), var(--nav-bg);
      border-right: 1px solid var(--nav-border);
      color: var(--nav-text);
      overflow-y: auto;
    }
    .sidebar::-webkit-scrollbar { width: 6px; }
    .sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,.08); border-radius: 99px; }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 4px 8px 8px;
    }
    .brand-mark {
      position: relative;
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      color: #fff;
      font-weight: 800;
      font-size: 17px;
      background: var(--primary-grad);
      box-shadow: 0 8px 18px -6px rgba(99,102,241,.5), inset 0 1px 0 rgba(255,255,255,.20);
    }
    .brand-mark::after {
      content: "";
      position: absolute;
      inset: -1px;
      border-radius: inherit;
      padding: 1px;
      background: linear-gradient(180deg, rgba(255,255,255,.40), rgba(255,255,255,0));
      -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
      -webkit-mask-composite: xor;
              mask-composite: exclude;
      pointer-events: none;
    }
    .brand strong { display: block; font-size: 15px; color: #fff; letter-spacing: -0.01em; }
    .brand span { display: block; margin-top: 2px; color: var(--nav-text-soft); font-size: 11.5px; }
    .nav-label {
      padding: 0 12px;
      color: var(--nav-text-soft);
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: .12em;
      text-transform: uppercase;
    }
    .nav {
      display: grid;
      gap: 3px;
    }
    .nav a {
      position: relative;
      display: flex;
      align-items: center;
      gap: 12px;
      height: 42px;
      padding: 0 12px;
      border-radius: 10px;
      color: var(--nav-text);
      text-decoration: none;
      font-size: 13.5px;
      font-weight: 600;
      transition: background .18s var(--ease), color .18s var(--ease), transform .15s var(--ease);
    }
    .nav a:hover {
      background: rgba(255,255,255,.05);
      color: #fff;
    }
    .nav a.active {
      background: var(--nav-active-bg);
      color: #fff;
      box-shadow: inset 0 0 0 1px var(--nav-active-border);
    }
    .nav a.active::before {
      content: "";
      position: absolute;
      left: 0;
      top: 8px;
      bottom: 8px;
      width: 3px;
      border-radius: 0 4px 4px 0;
      background: var(--primary-grad);
    }
    .nav svg {
      flex: 0 0 auto;
      width: 18px;
      height: 18px;
      stroke-width: 1.8;
    }
    .sidebar-foot {
      margin-top: auto;
      padding: 14px 12px 6px;
      border-top: 1px solid var(--nav-border);
      color: var(--nav-text-soft);
      font-size: 11px;
      line-height: 1.5;
    }
    .main {
      min-width: 0;
      display: grid;
      grid-template-rows: auto 1fr;
    }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 5;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 32px;
      border-bottom: 1px solid var(--line);
      background: color-mix(in oklab, var(--bg) 75%, transparent);
      backdrop-filter: saturate(180%) blur(18px);
      -webkit-backdrop-filter: saturate(180%) blur(18px);
    }
    .topbar::before {
      content: "";
      flex: 1;
    }
    .icon-button {
      width: 40px;
      min-height: 40px;
      padding: 0;
      border-radius: 10px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--text-soft);
      cursor: pointer;
      transition: background .15s var(--ease), color .15s var(--ease), transform .15s var(--ease), border-color .15s var(--ease);
    }
    .icon-button:hover {
      background: var(--surface-soft);
      color: var(--text);
      border-color: color-mix(in oklab, var(--primary) 35%, var(--line));
    }
    .icon-button:active { transform: scale(.96); }
    .icon-button svg { width: 18px; height: 18px; stroke-width: 1.8; }
    .mobile-menu-button {
      display: none;
      width: 40px;
      min-height: 40px;
      padding: 0;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--surface);
      color: var(--text);
      cursor: pointer;
    }
    .mobile-menu-button:hover { background: var(--surface-soft); }
    .mobile-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 8;
      background: rgba(7, 11, 24, .55);
      backdrop-filter: blur(4px);
    }
    body.sidebar-open .mobile-backdrop { display: block; }
    .page-heading {
      margin-bottom: 22px;
      animation: fadeUp .35s var(--ease);
    }
    .page-heading h1 {
      margin: 0;
      font-size: 26px;
      line-height: 1.18;
      letter-spacing: -0.02em;
      font-weight: 700;
    }
    .page-heading p {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 14px;
    }
    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .time-chip {
      min-height: 38px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 0 14px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--surface);
      color: var(--muted);
      font-size: 12.5px;
      font-weight: 500;
    }
    .time-chip::before {
      content: "";
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--good);
      box-shadow: 0 0 0 4px var(--good-ring);
      animation: pulse 2.4s ease-in-out infinite;
    }
    @keyframes pulse {
      0%,100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.15); opacity: .7; }
    }
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    main.content {
      min-width: 0;
      width: 100%;
      max-width: 1480px;
      margin: 0 auto;
      padding: 32px 36px 56px;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
    }
    .metric {
      position: relative;
      padding: 20px;
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      background: var(--surface);
      box-shadow: var(--shadow-sm);
      overflow: hidden;
      transition: transform .25s var(--ease), box-shadow .25s var(--ease), border-color .25s var(--ease);
      animation: fadeUp .4s var(--ease) both;
    }
    .metric:nth-child(1) { animation-delay: .02s; }
    .metric:nth-child(2) { animation-delay: .06s; }
    .metric:nth-child(3) { animation-delay: .10s; }
    .metric:nth-child(4) { animation-delay: .14s; }
    .metric::before {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      padding: 1px;
      background: linear-gradient(135deg, rgba(99,102,241,.0), rgba(99,102,241,.0));
      -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
      -webkit-mask-composite: xor;
              mask-composite: exclude;
      opacity: 0;
      transition: opacity .3s var(--ease), background .3s var(--ease);
      pointer-events: none;
    }
    .metric:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow);
      border-color: color-mix(in oklab, var(--primary) 25%, var(--line));
    }
    .metric:hover::before {
      opacity: 1;
      background: linear-gradient(135deg, rgba(99,102,241,.45), rgba(14,165,233,.30) 50%, rgba(99,102,241,0) 100%);
    }
    .metric-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      color: var(--muted);
      font-size: 12.5px;
      font-weight: 600;
      letter-spacing: 0.01em;
    }
    .metric-icon {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      border-radius: 10px;
      color: var(--primary);
      background: color-mix(in oklab, var(--primary) 12%, transparent);
      box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--primary) 22%, transparent);
    }
    .metric-icon svg { width: 18px; height: 18px; stroke-width: 1.8; }
    .metric strong {
      display: block;
      margin-top: 16px;
      font-size: 30px;
      line-height: 1.1;
      letter-spacing: -0.025em;
      font-weight: 700;
      background: linear-gradient(180deg, var(--text), color-mix(in oklab, var(--text) 75%, var(--muted)));
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .metric small {
      display: block;
      margin-top: 6px;
      color: var(--muted);
      font-size: 12px;
    }
    .panel-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 420px;
      gap: 18px;
      margin-top: 20px;
      align-items: start;
    }
    .stack {
      display: grid;
      gap: 18px;
    }
    .panel {
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      background: var(--surface);
      box-shadow: var(--shadow-sm);
      animation: fadeUp .4s var(--ease) both;
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 18px 20px;
      border-bottom: 1px solid var(--line-soft);
    }
    .panel-header h2 {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    .panel-header p {
      margin: 4px 0 0;
      color: var(--muted);
      font-size: 12.5px;
    }
    .panel-body { padding: 20px; }
    .table-wrap { overflow-x: auto; }
    .table-wrap::-webkit-scrollbar { height: 8px; }
    .table-wrap::-webkit-scrollbar-thumb { background: var(--line); border-radius: 99px; }
    table {
      width: 100%;
      min-width: 920px;
      border-collapse: collapse;
    }
    th, td {
      padding: 13px 16px;
      border-bottom: 1px solid var(--line-soft);
      text-align: left;
      vertical-align: middle;
      font-size: 13px;
    }
    th {
      position: sticky;
      top: 0;
      color: var(--muted);
      background: var(--surface-soft);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      z-index: 1;
    }
    tbody tr {
      transition: background .15s var(--ease);
    }
    tbody tr:hover { background: var(--surface-soft); }
    tr:last-child td { border-bottom: 0; }
    .primary-cell { display: grid; gap: 4px; }
    .primary-cell strong { font-size: 13px; font-weight: 600; }
    .primary-cell span { color: var(--muted); font-size: 12px; }
    code {
      font-family: 'JetBrains Mono', "SFMono-Regular", Consolas, monospace;
      font-size: 11.5px;
      color: var(--code-text);
      background: var(--code-bg);
      padding: 3px 7px;
      border-radius: 6px;
      word-break: break-all;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 24px;
      padding: 0 10px 0 8px;
      border-radius: 999px;
      font-size: 11.5px;
      font-weight: 600;
      letter-spacing: 0.01em;
      text-transform: capitalize;
      white-space: nowrap;
      transition: transform .15s var(--ease);
    }
    .pill::before {
      content: "";
      flex: 0 0 auto;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: currentColor;
    }
    .pill.warn::before { animation: pulse 2.4s ease-in-out infinite; }
    .good { color: var(--good); background: var(--good-bg); box-shadow: inset 0 0 0 1px var(--good-ring); }
    .warn { color: var(--warn); background: var(--warn-bg); box-shadow: inset 0 0 0 1px var(--warn-ring); }
    .bad { color: var(--bad); background: var(--bad-bg); box-shadow: inset 0 0 0 1px var(--bad-ring); }
    .muted { color: var(--muted); background: var(--surface-soft); box-shadow: inset 0 0 0 1px var(--line); }
    .pill .pill-dot { display: none; }
    .callback-cell {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .callback-retry {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      width: auto;
      min-height: 26px;
      padding: 0 10px;
      font-size: 11px;
      font-weight: 600;
      border-radius: 7px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--text-soft);
      cursor: pointer;
      transition: all .15s var(--ease);
    }
    .callback-retry:hover {
      border-color: color-mix(in oklab, var(--primary) 40%, var(--line));
      color: var(--primary);
      background: color-mix(in oklab, var(--primary) 6%, var(--surface));
    }
    .callback-retry:active { transform: scale(.96); }
    .callback-retry:disabled { opacity: 0.55; cursor: not-allowed; }
    .empty {
      padding: 36px 26px;
      color: var(--muted);
      text-align: center;
      font-size: 13.5px;
    }
    .empty::before {
      content: "";
      display: block;
      width: 44px;
      height: 44px;
      margin: 0 auto 12px;
      border-radius: 50%;
      background: var(--surface-soft) center/22px 22px no-repeat;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 7h18M3 12h18M3 17h12'/%3E%3C/svg%3E");
      box-shadow: inset 0 0 0 1px var(--line);
    }
    .doc-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }
    .store-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(360px, 440px);
      gap: 18px;
      align-items: start;
    }
    .store-list { display: grid; gap: 10px; }
    .store-item {
      display: grid;
      gap: 12px;
      padding: 16px;
      border: 1px solid var(--line-soft);
      border-radius: var(--radius);
      background: var(--surface-soft);
      transition: border-color .2s var(--ease), background .2s var(--ease), transform .2s var(--ease);
    }
    .store-item:hover {
      border-color: color-mix(in oklab, var(--primary) 30%, var(--line));
      background: color-mix(in oklab, var(--primary) 4%, var(--surface));
    }
    .store-item-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .store-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .store-actions button {
      width: auto;
      min-height: 34px;
      padding: 0 12px;
      font-size: 12px;
    }
    .danger-button {
      width: auto;
      border: 1px solid color-mix(in oklab, var(--bad) 40%, var(--line));
      background: var(--surface);
      color: var(--bad);
    }
    .danger-button:hover {
      background: var(--bad-bg);
      border-color: var(--bad);
    }
    .field-row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .doc-card {
      min-width: 0;
      padding: 18px;
      border: 1px solid var(--line-soft);
      border-radius: var(--radius);
      background: var(--surface-soft);
      transition: border-color .25s var(--ease), transform .25s var(--ease);
    }
    .doc-card:hover {
      border-color: color-mix(in oklab, var(--primary) 30%, var(--line));
    }
    .doc-card h3 {
      margin: 0 0 8px;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: -0.005em;
    }
    .doc-card p {
      margin: 0 0 12px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.55;
    }
    .doc-list {
      display: grid;
      gap: 10px;
      margin: 0;
      padding: 0;
      list-style: none;
      color: var(--text-soft);
      font-size: 13px;
    }
    pre {
      margin: 0;
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: var(--radius-sm);
      background: var(--pre-bg);
      color: var(--pre-text);
      padding: 14px 16px;
      font-family: 'JetBrains Mono', "SFMono-Regular", Consolas, monospace;
      font-size: 12px;
      line-height: 1.65;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.04);
    }
    pre::-webkit-scrollbar { height: 6px; width: 6px; }
    pre::-webkit-scrollbar-thumb { background: rgba(255,255,255,.10); border-radius: 99px; }
    form { display: grid; gap: 14px; }
    label {
      display: grid;
      gap: 7px;
      color: var(--text-soft);
      font-size: 12.5px;
      font-weight: 600;
    }
    input, select, textarea, button {
      width: 100%;
      min-height: 42px;
      border: 1px solid var(--line);
      border-radius: 10px;
      font: inherit;
    }
    input, select, textarea {
      padding: 10px 12px;
      background: var(--surface);
      color: var(--text);
      outline: none;
      transition: border-color .15s var(--ease), box-shadow .15s var(--ease), background .15s var(--ease);
    }
    input::placeholder, textarea::placeholder { color: var(--muted); opacity: .8; }
    input[readonly] {
      background: var(--surface-soft);
      color: var(--muted);
    }
    input:focus, select:focus, textarea:focus {
      border-color: var(--primary);
      box-shadow: var(--ring);
    }
    textarea {
      min-height: 132px;
      resize: vertical;
      font-family: 'JetBrains Mono', "SFMono-Regular", Consolas, monospace;
      font-size: 12px;
      line-height: 1.55;
    }
    button {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
      border: none;
      background: var(--primary-grad);
      background-size: 180% 180%;
      color: white;
      font-weight: 600;
      font-size: 13.5px;
      letter-spacing: 0.005em;
      box-shadow: var(--primary-glow);
      transition: transform .15s var(--ease), box-shadow .2s var(--ease), background-position .4s var(--ease);
    }
    button:hover {
      background-position: 100% 0;
      box-shadow: 0 10px 26px -8px rgba(99,102,241,.65);
    }
    button:active { transform: translateY(1px) scale(.99); }
    button:focus-visible { outline: none; box-shadow: var(--primary-glow), var(--ring); }
    .button-secondary {
      width: auto;
      min-height: 38px;
      padding: 0 14px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--surface);
      color: var(--text-soft);
      box-shadow: var(--shadow-sm);
      font-weight: 600;
    }
    .button-secondary:hover {
      background: var(--surface-soft);
      color: var(--text);
      border-color: color-mix(in oklab, var(--primary) 35%, var(--line));
      box-shadow: var(--shadow-sm);
    }
    .message {
      min-height: 20px;
      color: var(--muted);
      font-size: 13px;
    }
    .wa-qr {
      display: none;
      width: 100%;
      max-width: 280px;
      aspect-ratio: 1;
      margin: 18px auto 16px;
      justify-self: center;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: #fff;
      padding: 12px;
      box-shadow: var(--shadow);
    }
    .wa-actions {
      justify-content: center;
      margin-top: 2px;
    }
    .pagination {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      padding: 14px 18px;
      border-top: 1px solid var(--line-soft);
    }
    .pagination button {
      width: auto;
      min-height: 34px;
      padding: 0 14px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--text-soft);
      font-size: 12.5px;
      font-weight: 600;
      box-shadow: var(--shadow-sm);
    }
    .pagination button:hover {
      background: var(--surface-soft);
      color: var(--text);
      border-color: color-mix(in oklab, var(--primary) 35%, var(--line));
    }
    .pagination button:disabled {
      cursor: not-allowed;
      opacity: .45;
    }
    .pagination span {
      color: var(--muted);
      font-size: 12.5px;
      font-weight: 600;
    }
    .section-anchor { scroll-margin-top: 92px; }
    .section-anchor[hidden], .stack[hidden], .panel-grid[hidden] {
      display: none !important;
    }
    .panel-grid.single { grid-template-columns: minmax(0, 1fr); }
    @media (max-width: 1100px) {
      .app { grid-template-columns: 1fr; }
      .sidebar {
        position: fixed;
        inset: 0 auto 0 0;
        z-index: 9;
        width: min(280px, calc(100vw - 64px));
        height: 100vh;
        padding: 22px 14px;
        transform: translateX(-105%);
        transition: transform .25s var(--ease);
        box-shadow: 24px 0 60px -20px rgba(0,0,0,.45);
      }
      body.sidebar-open .sidebar { transform: translateX(0); }
      .nav-label { display: block; }
      .nav { display: grid; min-width: 0; }
      .mobile-menu-button { display: inline-flex; align-items: center; justify-content: center; }
      .topbar::before { display: none; }
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .panel-grid { grid-template-columns: 1fr; }
      .doc-grid { grid-template-columns: 1fr; }
      .store-layout { grid-template-columns: 1fr; }
      main.content { padding: 26px 22px 48px; }
    }
    @media (max-width: 720px) {
      .sidebar { width: min(260px, calc(100vw - 56px)); }
      .topbar { padding: 14px 16px; }
      main.content { padding: 18px 14px 36px; }
      .metrics { grid-template-columns: 1fr; gap: 12px; }
      .panel-header { align-items: flex-start; flex-direction: column; }
      .panel-body { padding: 16px; }
      .topbar-actions { margin-left: auto; gap: 6px; }
      .time-chip { display: none; }
      .page-heading h1 { font-size: 22px; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: .001ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: .001ms !important;
      }
    }
  </style>
  <script>
    (function () {
      try {
        var t = localStorage.getItem("gateway.theme");
        if (!t) t = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", t);
      } catch (_) {}
    })();
  </script>
</head>
<body>
  <div class="app">
    <div class="mobile-backdrop" data-sidebar-close></div>
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">Q</div>
        <div>
          <strong>QRIS Gateway</strong>
          <span>Private payment ops</span>
        </div>
      </div>
      <div>
        <nav class="nav">
          <a class="active" href="#overview">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
            Overview
          </a>
          <a href="#payments">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
            Daftar Transaksi
          </a>
          <a href="#koneksi">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10 13a5 5 0 0 0 7.1 0l2.8-2.8a5 5 0 0 0-7.1-7.1L11 4.9"/><path d="M14 11a5 5 0 0 0-7.1 0l-2.8 2.8a5 5 0 0 0 7.1 7.1L13 19.1"/></svg>
            Koneksi
          </a>
          <a href="#android">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>
            Android Logs
          </a>
          <a href="#whatsapp">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 20l1.2-5.4A8.5 8.5 0 1 1 21 11.5Z"/><path d="M9 9.5c.2 3 2.2 5 5.2 5.5l1.3-1.3-2-.9-.8.8c-1-.5-1.8-1.3-2.3-2.3l.8-.8-.9-2L9 9.5Z"/></svg>
            Logs WA
          </a>
          <a href="#callbacks">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>
            Webhooks
          </a>
          <a href="#konfigurasi">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.3.25.66.4 1.1.4H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51.6Z"/></svg>
            Konfigurasi
          </a>
        </nav>
      </div>
      <div class="sidebar-foot">
        <div>QRIS Gateway &middot; v1.0</div>
        <div style="margin-top:4px">Private payment ops</div>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <button class="mobile-menu-button" type="button" data-sidebar-toggle aria-label="Open menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
        <div class="topbar-actions">
          <div class="time-chip">${escapeHtml(formatWibDateTime())}</div>
          <button class="icon-button" type="button" data-theme-toggle aria-label="Toggle theme">
            <svg class="theme-icon-light" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
            <svg class="theme-icon-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" style="display:none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          </button>
          <form method="post" action="/logout">
            <button class="button-secondary" type="submit">Logout</button>
          </form>
        </div>
      </header>

      <main class="content">
        <div class="page-heading">
          <h1 id="page-title">Hi, Alvian</h1>
          <p id="page-subtitle">Monitor transaksi QRIS, notifikasi Android, dan callback store.</p>
        </div>
        <section id="overview" class="section-anchor">
          <div class="metrics">
            <div class="metric">
              <div class="metric-head">
                <span>Total Payment</span>
                <span class="metric-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg></span>
              </div>
              <strong>${db.payments.length}</strong>
              <small>${pending.length} pending, ${expired.length} expired</small>
            </div>
            <div class="metric">
              <div class="metric-head">
                <span>Revenue Paid</span>
                <span class="metric-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/></svg></span>
              </div>
              <strong>${money(revenue)}</strong>
              <small>${paid.length} transaksi sukses</small>
            </div>
            <div class="metric">
              <div class="metric-head">
                <span>Success Rate</span>
                <span class="metric-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m4 13 4 4L20 5"/></svg></span>
              </div>
              <strong>${successRate}%</strong>
              <small>Berdasarkan semua payment tersimpan</small>
            </div>
            <div class="metric">
              <div class="metric-head">
                <span>Notification Logs</span>
                <span class="metric-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7"/><path d="M10 21h4"/></svg></span>
              </div>
              <strong>${db.notifications.length}</strong>
              <small>${whatsappNotifications.length} WA, ${androidNotifications.length} Android</small>
            </div>
          </div>

          <section class="panel" style="margin-top:18px">
            <div class="table-wrap">
              ${overviewPayments.length ? `<table>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Payment</th>
                    <th>Amount</th>
                    <th>Customer</th>
                    <th>Created</th>
                    <th>Expires</th>
                    <th>Callback</th>
                  </tr>
                </thead>
                <tbody>
                  ${overviewPayments.map((payment) => `
                    <tr>
                      <td><span class="pill ${statusClass(payment.status)}">${escapeHtml(payment.status)}</span></td>
                      <td>
                        <div class="primary-cell">
                          <strong>${escapeHtml(payment.external_id)}</strong>
                          <span><code>${escapeHtml(payment.id)}</code></span>
                        </div>
                      </td>
                      <td><strong>${money(payment.amount)}</strong></td>
                      <td>${escapeHtml(payment.customer_name || "-")}</td>
                      <td>${formatDate(payment.created_at)}</td>
                      <td>${formatDate(payment.expires_at)}</td>
                      <td>${callbackCell(payment)}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>` : `<div class="empty">Belum ada payment.</div>`}
            </div>
          </section>
        </section>

        <div class="panel-grid">
          <div class="stack">
            <section id="payments" class="panel section-anchor">
              <div class="table-wrap">
                ${payments.length ? `<table>
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Payment</th>
                      <th>Amount</th>
                      <th>Customer</th>
                      <th>Created</th>
                      <th>Expires</th>
                      <th>Callback</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${payments.map((payment, index) => `
                      <tr data-payment-row data-row-index="${index}">
                        <td><span class="pill ${statusClass(payment.status)}">${escapeHtml(payment.status)}</span></td>
                        <td>
                          <div class="primary-cell">
                            <strong>${escapeHtml(payment.external_id)}</strong>
                            <span><code>${escapeHtml(payment.id)}</code></span>
                          </div>
                        </td>
                        <td><strong>${money(payment.amount)}</strong></td>
                        <td>${escapeHtml(payment.customer_name || "-")}</td>
                        <td>${formatDate(payment.created_at)}</td>
                        <td>${formatDate(payment.expires_at)}</td>
                        <td>${callbackCell(payment)}</td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
                <div class="pagination" data-payment-pagination>
                  <button type="button" data-payment-prev>Previous</button>
                  <span data-payment-page>Page 1 / 1</span>
                  <button type="button" data-payment-next>Next</button>
                </div>` : `<div class="empty">Belum ada payment.</div>`}
              </div>
            </section>

            <section id="android" class="panel section-anchor">
              <div class="table-wrap">
                ${androidNotifications.length ? `<table>
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Amount</th>
                      <th>Package</th>
                      <th>Title</th>
                      <th>Text</th>
                      <th>Matched Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${androidNotifications.map((item, index) => `
                      <tr data-android-row data-row-index="${index}">
                        <td><span class="pill ${statusClass(item.status)}">${escapeHtml(item.status)}</span></td>
                        <td>${item.parsed_amount ? money(item.parsed_amount) : "-"}</td>
                        <td>${escapeHtml(item.package_name || "-")}</td>
                        <td>${escapeHtml(item.title || "-")}</td>
                        <td>${escapeHtml(item.text || "-")}</td>
                        <td>${item.matched_payment_id ? `<code>${escapeHtml(item.matched_payment_id)}</code>` : "-"}</td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
                <div class="pagination" data-android-pagination>
                  <button type="button" data-android-prev>Previous</button>
                  <span data-android-page>Page 1 / 1</span>
                  <button type="button" data-android-next>Next</button>
                </div>` : `<div class="empty">Belum ada notifikasi Android.</div>`}
              </div>
            </section>

            <section id="whatsapp" class="panel section-anchor">
              <div class="table-wrap">
                ${whatsappNotifications.length ? `<table>
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Amount</th>
                      <th>Chat</th>
                      <th>Message</th>
                      <th>Matched Payment</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${whatsappNotifications.map((item, index) => `
                      <tr data-wa-row data-row-index="${index}">
                        <td><span class="pill ${statusClass(item.status)}">${escapeHtml(item.status)}</span></td>
                        <td>${item.parsed_amount ? money(item.parsed_amount) : "-"}</td>
                        <td>${escapeHtml(item.title || "-")}</td>
                        <td>${escapeHtml(item.text || item.big_text || "-")}</td>
                        <td>${item.matched_payment_id ? `<code>${escapeHtml(item.matched_payment_id)}</code>` : "-"}</td>
                        <td>${formatDate(item.received_at || item.created_at)}</td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
                <div class="pagination" data-wa-pagination>
                  <button type="button" data-wa-prev>Previous</button>
                  <span data-wa-page>Page 1 / 1</span>
                  <button type="button" data-wa-next>Next</button>
                </div>` : `<div class="empty">Belum ada pesan WhatsApp yang cocok format pembayaran.</div>`}
              </div>
            </section>

            <section id="callbacks" class="panel section-anchor">
              <div class="table-wrap">
                ${callbacks.length ? `<table>
                  <thead>
                    <tr>
                      <th>Result</th>
                      <th>Payment</th>
                      <th>Status Code</th>
                      <th>URL</th>
                      <th>Error</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${callbacks.map((item) => `
                      <tr>
                        <td><span class="pill ${item.success ? "good" : "bad"}">${item.success ? "success" : "failed"}</span></td>
                        <td><code>${escapeHtml(item.payment_id)}</code></td>
                        <td>${item.status_code || "-"}</td>
                        <td>${escapeHtml(item.url)}</td>
                        <td>${escapeHtml(item.error || "-")}</td>
                        <td>${formatDate(item.created_at)}</td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>` : `<div class="empty">Belum ada callback.</div>`}
              </div>
            </section>
          </div>

          <aside class="stack">
            <section id="stores" class="panel section-anchor">
              <div class="panel-body">
                <div class="store-layout">
                  <div class="store-list">
                    ${stores.length ? stores.map((store) => {
                      const apiKey = db.apiKeys.find((key) => key.store_id === store.id);
                      const paymentCount = db.payments.filter((payment) => payment.store_id === store.id).length;
                      return `<div class="store-item">
                        <div class="store-item-header">
                          <div class="primary-cell">
                            <strong>${escapeHtml(store.name)}</strong>
                            <span><code>${escapeHtml(store.id)}</code></span>
                          </div>
                          <span class="pill ${store.static_qris ? "good" : "warn"}">${store.static_qris ? "QRIS set" : "No QRIS"}</span>
                        </div>
                        <div class="doc-list">
                          <span>API Key: <code>${escapeHtml(apiKey?.key || "-")}</code></span>
                          <span>Webhook Secret: <code>${escapeHtml(store.webhook_secret || "-")}</code></span>
                          <span>${paymentCount} payment tersimpan</span>
                        </div>
                        <div class="store-actions">
                          <button class="button-secondary" type="button" data-edit-store="${escapeHtml(store.id)}">Edit</button>
                          <button class="danger-button" type="button" data-delete-store="${escapeHtml(store.id)}">Delete</button>
                        </div>
                      </div>`;
                    }).join("") : `<div class="empty">Belum ada store.</div>`}
                  </div>

                  <div class="stack">
                    <form id="store-form">
                      <input type="hidden" name="store_id" value="">
                      <label>Store Name
                        <input name="name" placeholder="Store" required>
                      </label>
                      <button type="submit">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>
                        Save Store
                      </button>
                      <button class="button-secondary" id="store-reset" type="button">New Store</button>
                      <div class="message" id="store-message"></div>
                    </form>
                  </div>
                </div>
              </div>
            </section>
          </aside>
        </div>

        <section id="koneksi" class="panel section-anchor">
          <div class="panel-body">
            <div class="doc-grid">
              <div class="doc-card">
                <h3>Koneksi WhatsApp</h3>
                <div class="message" data-wa-status>WhatsApp belum dicek.</div>
                <img class="wa-qr" data-wa-qr alt="WhatsApp QR">
                <div class="store-actions wa-actions">
                  <button class="button-secondary" type="button" data-wa-refresh>Refresh QR</button>
                  <button class="danger-button" type="button" data-wa-disconnect>Disconnect</button>
                </div>
              </div>
              ${stores.length ? stores.map((store) => {
                return `<div class="doc-card">
                  <form data-qris-form="${escapeHtml(store.id)}">
                    <label>Upload QRIS Image
                      <input data-qris-upload="${escapeHtml(store.id)}" type="file" accept="image/*">
                    </label>
                    <label>Static QRIS String
                      <textarea name="static_qris" data-qris-text="${escapeHtml(store.id)}" placeholder="000201010211...">${escapeHtml(store.static_qris || "")}</textarea>
                    </label>
                    <button type="submit">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>
                      Save QRIS
                    </button>
                    <div class="message" data-qris-message="${escapeHtml(store.id)}"></div>
                  </form>
                </div>`;
              }).join("") : `<div class="empty">Belum ada store.</div>`}
            </div>
          </div>
        </section>

        <section id="konfigurasi" class="panel section-anchor">
          <div class="panel-body">
            <div class="doc-grid">
              <div class="doc-card">
                <h3>Wajib Partner Setting</h3>
                <p>Partner wajib menyimpan credential dan endpoint ini di backend mereka.</p>
                <ul class="doc-list">
                  <li>Base URL: <code>${escapeHtml(baseUrl)}</code></li>
                  <li>Merchant ID: <code>${escapeHtml(firstStore.id || "VER-XXXXX")}</code></li>
                  <li>API Key: <code>${escapeHtml(firstApiKey.key || "API_KEY_STORE")}</code></li>
                  <li>Webhook Secret: <code>${escapeHtml(firstStore.webhook_secret || "WEBHOOK_SECRET")}</code></li>
                  <li>Callback URL: endpoint HTTPS partner yang menerima update status payment.</li>
                </ul>
              </div>
              <div class="doc-card">
                <h3>Header Request</h3>
                <p>Semua request dari partner ke gateway wajib memakai API key aktif dan merchant ID yang cocok.</p>
                <pre>Authorization: Bearer ${escapeHtml(firstApiKey.key || "API_KEY_STORE")}
X-Merchant-ID: ${escapeHtml(firstStore.id || "VER-XXXXX")}
Content-Type: application/json</pre>
              </div>
              <div class="doc-card">
                <h3>Create Payment dari Store</h3>
                <p>Endpoint utama yang dipanggil aplikasi store ketika customer checkout.</p>
                <pre>POST /api/payments
Authorization: Bearer ${escapeHtml(firstApiKey.key || "API_KEY_STORE")}
X-Merchant-ID: ${escapeHtml(firstStore.id || "VER-XXXXX")}
Content-Type: application/json

{
  "external_id": "ORDER-1001",
  "amount": 50000,
  "customer_name": "Customer",
  "callback_url": "https://store-kamu.com/api/payment-callback",
  "expires_in": 900
}</pre>
              </div>
              <div class="doc-card">
                <h3>Response Payment</h3>
                <p>Simpan <code>payment_id</code> dan tampilkan QR ke customer dari <code>qr_image_url</code> atau <code>qr_string</code>.</p>
                <pre>{
  "payment_id": "AL-XXXXXXX",
  "external_id": "ORDER-1001",
  "amount": 50000,
  "status": "pending",
  "qr_string": "000201010212...",
  "qr_image_url": "${escapeHtml(baseUrl)}/api/payments/AL-XXXXXXX/qr",
  "expired_at": "2026-05-04T13:15:00.000Z"
}</pre>
              </div>
              <div class="doc-card">
                <h3>Check Status Payment</h3>
                <p>Partner bisa polling status sebagai fallback jika callback belum diterima.</p>
                <pre>GET /api/payments/AL-XXXXXXX
Authorization: Bearer ${escapeHtml(firstApiKey.key || "API_KEY_STORE")}
X-Merchant-ID: ${escapeHtml(firstStore.id || "VER-XXXXX")}</pre>
              </div>
              <div class="doc-card">
                <h3>Callback ke Store</h3>
                <p>Gateway mengirim callback saat payment valid. Verifikasi header signature dengan webhook secret.</p>
                <pre>Header:
X-Gateway-Signature: HMAC_SHA256(raw_body, webhook_secret)

Body:
{
  "payment_id": "AL-XXXXXXX",
  "external_id": "ORDER-1001",
  "amount": 50000,
  "status": "paid",
  "paid_at": "2026-05-04T13:20:00.000Z"
}</pre>
              </div>
              <div class="doc-card">
                <h3>Contoh Verifikasi Callback Node.js</h3>
                <p>Pastikan verifikasi memakai raw body, bukan object JSON yang sudah berubah urutan formatnya.</p>
                <pre>import crypto from "node:crypto";

const signature = req.headers["x-gateway-signature"];
const expected = crypto
  .createHmac("sha256", "WEBHOOK_SECRET")
  .update(rawBody)
  .digest("hex");

if (signature !== expected) {
  throw new Error("Invalid callback signature");
}</pre>
              </div>
              <div class="doc-card">
                <h3>Aturan Integrasi</h3>
                <p>Partner cukup membuat order, menampilkan QRIS, dan menerima callback.</p>
                <ul class="doc-list">
                  <li><code>external_id</code> harus unik per order aktif.</li>
                  <li><code>amount</code> wajib integer rupiah tanpa titik/koma.</li>
                  <li><code>X-Merchant-ID</code> wajib dikirim dan harus cocok dengan API key.</li>
                  <li><code>callback_url</code> harus bisa menerima request POST JSON.</li>
                  <li>Status sukses partner hanya boleh dari callback valid atau polling status <code>paid</code>.</li>
                  <li>Verifikasi <code>X-Gateway-Signature</code> memakai raw body dan webhook secret.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  </div>

  <script>
    const themeKey = "gateway.theme";
    const themeToggle = document.querySelector("[data-theme-toggle]");
    const themeIconLight = themeToggle?.querySelector(".theme-icon-light");
    const themeIconDark = themeToggle?.querySelector(".theme-icon-dark");
    function applyTheme(theme) {
      const t = theme === "dark" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", t);
      if (themeIconLight && themeIconDark) {
        themeIconLight.style.display = t === "dark" ? "none" : "";
        themeIconDark.style.display = t === "dark" ? "" : "none";
      }
    }
    applyTheme(localStorage.getItem(themeKey) || document.documentElement.getAttribute("data-theme") || "light");
    themeToggle?.addEventListener("click", () => {
      const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      localStorage.setItem(themeKey, next);
      applyTheme(next);
    });

    const tabLinks = Array.from(document.querySelectorAll('.nav a[href^="#"]'));
    const sidebarToggle = document.querySelector("[data-sidebar-toggle]");
    const sidebarClosers = document.querySelectorAll("[data-sidebar-close]");
    const topbarTitle = document.getElementById("page-title");
    const topbarSubtitle = document.getElementById("page-subtitle");
    const overviewSection = document.getElementById("overview");
    const configSection = document.getElementById("konfigurasi");
    const connectionSection = document.getElementById("koneksi");
    const panelGrid = document.querySelector(".panel-grid");
    const leftStack = panelGrid?.querySelector(".stack");
    const rightStack = panelGrid?.querySelector("aside.stack");
    const panelSections = Array.from(panelGrid?.querySelectorAll(".section-anchor") || []);
    const activeTabStorageKey = "gateway.activeTab";
    const tabCopy = {
      overview: ["Hi, Alvian", "Ringkasan performa payment gateway kamu."],
      payments: ["Daftar Transaksi", "Daftar invoice QRIS terbaru yang dibuat dari aplikasi store."],
      koneksi: ["Koneksi", "API key, webhook secret, dan merchant ID untuk aplikasi store."],
      android: ["Android Logs", "Pantau notifikasi Android dan hasil validasinya."],
      whatsapp: ["Logs WA", "Pantau pesan WhatsApp BRI-NOTIF dan hasil pencocokan nominal."],
      callbacks: ["Webhooks", "Riwayat callback yang dikirim ke aplikasi store."],
      konfigurasi: ["Konfigurasi", "Panduan koneksi aplikasi store ke payment gateway ini."],
    };

    function activateTab(tabName, updateUrl = true) {
      const tab = document.getElementById(tabName) ? tabName : "overview";
      const isOverview = tab === "overview";
      const isConfig = tab === "konfigurasi";
      const isConnection = tab === "koneksi";

      overviewSection.hidden = !isOverview;
      configSection.hidden = !isConfig;
      connectionSection.hidden = !isConnection;
      panelGrid.hidden = isOverview || isConfig || isConnection;
      panelGrid.classList.toggle("single", !isOverview && !isConfig);

      panelSections.forEach((section) => {
        section.hidden = section.id !== tab;
      });

      if (leftStack) leftStack.hidden = false;
      if (rightStack) rightStack.hidden = true;

      tabLinks.forEach((link) => {
        link.classList.toggle("active", link.getAttribute("href") === "#" + tab);
      });

      const copy = tabCopy[tab] || tabCopy.overview;
      topbarTitle.textContent = copy[0];
      topbarSubtitle.textContent = copy[1];

      if (updateUrl) {
        localStorage.setItem(activeTabStorageKey, tab);
      }
    }

    tabLinks.forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const tab = link.getAttribute("href").slice(1);
        activateTab(tab);
        if (tab === "koneksi") ensureWaConnection();
        document.body.classList.remove("sidebar-open");
      });
    });

    sidebarToggle?.addEventListener("click", () => {
      document.body.classList.toggle("sidebar-open");
    });
    sidebarClosers.forEach((element) => {
      element.addEventListener("click", () => document.body.classList.remove("sidebar-open"));
    });
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") document.body.classList.remove("sidebar-open");
    });

    activateTab(localStorage.getItem(activeTabStorageKey) || "overview", false);

    const paymentRows = Array.from(document.querySelectorAll("[data-payment-row]"));
    const paymentPrev = document.querySelector("[data-payment-prev]");
    const paymentNext = document.querySelector("[data-payment-next]");
    const paymentPage = document.querySelector("[data-payment-page]");
    const rowsPerPage = 10;
    let currentPaymentPage = 1;

    function renderPaymentPage() {
      if (!paymentRows.length) return;
      const totalPages = Math.max(1, Math.ceil(paymentRows.length / rowsPerPage));
      currentPaymentPage = Math.min(Math.max(currentPaymentPage, 1), totalPages);
      const start = (currentPaymentPage - 1) * rowsPerPage;
      const end = start + rowsPerPage;

      paymentRows.forEach((row, index) => {
        row.hidden = index < start || index >= end;
      });

      paymentPage.textContent = "Page " + currentPaymentPage + " / " + totalPages;
      paymentPrev.disabled = currentPaymentPage <= 1;
      paymentNext.disabled = currentPaymentPage >= totalPages;
    }

    paymentPrev?.addEventListener("click", () => {
      currentPaymentPage -= 1;
      renderPaymentPage();
    });
    paymentNext?.addEventListener("click", () => {
      currentPaymentPage += 1;
      renderPaymentPage();
    });
    renderPaymentPage();

    const androidRows = Array.from(document.querySelectorAll("[data-android-row]"));
    const androidPrev = document.querySelector("[data-android-prev]");
    const androidNext = document.querySelector("[data-android-next]");
    const androidPage = document.querySelector("[data-android-page]");
    let currentAndroidPage = 1;

    function renderAndroidPage() {
      if (!androidRows.length) return;
      const totalPages = Math.max(1, Math.ceil(androidRows.length / rowsPerPage));
      currentAndroidPage = Math.min(Math.max(currentAndroidPage, 1), totalPages);
      const start = (currentAndroidPage - 1) * rowsPerPage;
      const end = start + rowsPerPage;

      androidRows.forEach((row, index) => {
        row.hidden = index < start || index >= end;
      });

      androidPage.textContent = "Page " + currentAndroidPage + " / " + totalPages;
      androidPrev.disabled = currentAndroidPage <= 1;
      androidNext.disabled = currentAndroidPage >= totalPages;
    }

    androidPrev?.addEventListener("click", () => {
      currentAndroidPage -= 1;
      renderAndroidPage();
    });
    androidNext?.addEventListener("click", () => {
      currentAndroidPage += 1;
      renderAndroidPage();
    });
    renderAndroidPage();

    const waRows = Array.from(document.querySelectorAll("[data-wa-row]"));
    const waPrev = document.querySelector("[data-wa-prev]");
    const waNext = document.querySelector("[data-wa-next]");
    const waPage = document.querySelector("[data-wa-page]");
    let currentWaPage = 1;

    function renderWaPage() {
      if (!waRows.length) return;
      const totalPages = Math.max(1, Math.ceil(waRows.length / rowsPerPage));
      currentWaPage = Math.min(Math.max(currentWaPage, 1), totalPages);
      const start = (currentWaPage - 1) * rowsPerPage;
      const end = start + rowsPerPage;

      waRows.forEach((row, index) => {
        row.hidden = index < start || index >= end;
      });

      waPage.textContent = "Page " + currentWaPage + " / " + totalPages;
      waPrev.disabled = currentWaPage <= 1;
      waNext.disabled = currentWaPage >= totalPages;
    }

    waPrev?.addEventListener("click", () => {
      currentWaPage -= 1;
      renderWaPage();
    });
    waNext?.addEventListener("click", () => {
      currentWaPage += 1;
      renderWaPage();
    });
    renderWaPage();

    const waStatus = document.querySelector("[data-wa-status]");
    const waQr = document.querySelector("[data-wa-qr]");
    const waRefresh = document.querySelector("[data-wa-refresh]");
    const waDisconnect = document.querySelector("[data-wa-disconnect]");
    let waPollTimer = null;

    function stopWaPolling() {
      if (!waPollTimer) return;
      clearInterval(waPollTimer);
      waPollTimer = null;
    }

    function startWaPolling() {
      if (waPollTimer) return;
      waPollTimer = setInterval(() => fetchWaStatus("/api/admin/wa/status", "GET", { silent: true }), 2000);
    }

    function renderWaStatus(data) {
      if (!waStatus) return;
      const status = data.status || "unknown";
      const detail = data.error || data.last_error || data.jid || data.last_message_at || "";
      waStatus.textContent = "Status: " + status + (detail ? " - " + detail : "");

      if (data.qr) {
        const encoded = encodeURIComponent(data.qr);
        if (waQr) {
          waQr.src = "https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=" + encoded;
          waQr.style.display = "block";
        }
      } else {
        if (waQr) {
          waQr.removeAttribute("src");
          waQr.style.display = "none";
        }
      }

      if (["connecting", "reconnecting", "qr"].includes(status)) {
        startWaPolling();
      } else {
        stopWaPolling();
      }
    }

    async function fetchWaStatus(path = "/api/admin/wa/status", method = "GET", options = {}) {
      if (waStatus && !options.silent) waStatus.textContent = "Menghubungi WhatsApp service...";
      const response = await fetch(path, {
        method,
        cache: "no-store",
        headers: { "Accept": "application/json" },
      });
      const data = await response.json();
      renderWaStatus(data);
      return data;
    }

    async function ensureWaConnection() {
      const data = await fetchWaStatus();
      if (["disconnected", "logged_out", "error"].includes(data.status)) {
        await fetchWaStatus("/api/admin/wa/connect", "POST");
        startWaPolling();
        return;
      }

      if (["connecting", "reconnecting", "qr"].includes(data.status)) {
        startWaPolling();
      }
    }

    async function refreshWaConnection() {
      if (waStatus) waStatus.textContent = "Membuat QR WhatsApp baru...";
      stopWaPolling();
      await fetchWaStatus("/api/admin/wa/disconnect", "POST");
      await fetchWaStatus("/api/admin/wa/connect", "POST");
      startWaPolling();
    }

    waRefresh?.addEventListener("click", refreshWaConnection);
    waDisconnect?.addEventListener("click", async () => {
      stopWaPolling();
      await fetchWaStatus("/api/admin/wa/disconnect", "POST");
    });
    if (waStatus) fetchWaStatus();
    if ((localStorage.getItem(activeTabStorageKey) || "overview") === "koneksi") {
      ensureWaConnection();
    }

    const stores = ${JSON.stringify(stores.map((store) => ({
      id: store.id,
      name: store.name || "",
      webhook_secret: store.webhook_secret || "",
      static_qris: store.static_qris || "",
    })))};

    const storeForm = document.getElementById("store-form");
    const storeMessage = document.getElementById("store-message");

    function fillStoreForm(store = null) {
      if (!storeForm) return;
      storeForm.elements.store_id.value = store?.id || "";
      storeForm.elements.name.value = store?.name || "";
      storeMessage.textContent = store ? "Editing " + store.name : "Creating new store";
    }

    document.querySelectorAll("[data-edit-store]").forEach((button) => {
      button.addEventListener("click", () => {
        const store = stores.find((item) => item.id === button.dataset.editStore);
        fillStoreForm(store);
      });
    });

    document.querySelectorAll("[data-delete-store]").forEach((button) => {
      button.addEventListener("click", async () => {
        const store = stores.find((item) => item.id === button.dataset.deleteStore);
        if (!store || !confirm("Hapus store " + store.name + "?")) return;

        const response = await fetch("/api/admin/stores/" + encodeURIComponent(store.id), {
          method: "DELETE",
        });
        const data = await response.json();
        if (!response.ok) {
          alert(data.error || "Failed to delete store");
          return;
        }
        window.location.reload();
      });
    });

    document.getElementById("store-reset")?.addEventListener("click", () => fillStoreForm(null));

    document.querySelectorAll("[data-retry-callback]").forEach((button) => {
      button.addEventListener("click", async () => {
        const paymentId = button.dataset.retryCallback;
        const original = button.textContent;
        button.disabled = true;
        button.textContent = "Retrying...";
        try {
          const response = await fetch("/api/admin/payments/" + encodeURIComponent(paymentId) + "/retry-callback", {
            method: "POST",
          });
          const data = await response.json();
          if (!response.ok) {
            alert(data.error || "Failed to retry callback");
            button.disabled = false;
            button.textContent = original;
            return;
          }
          window.location.reload();
        } catch (error) {
          alert("Failed to retry callback: " + error.message);
          button.disabled = false;
          button.textContent = original;
        }
      });
    });

    function loadJsQr() {
      if (window.jsQR) return Promise.resolve(window.jsQR);

      return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
        script.async = true;
        script.onload = () => resolve(window.jsQR);
        script.onerror = () => reject(new Error("Gagal memuat QR decoder fallback"));
        document.head.appendChild(script);
      });
    }

    async function decodeQrWithCanvas(file) {
      const jsQR = await loadJsQr();
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;

      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(imageData.data, imageData.width, imageData.height);
      return result?.data || "";
    }

    async function decodeQrImage(file) {
      if ("BarcodeDetector" in window) {
        try {
          const detector = new BarcodeDetector({ formats: ["qr_code"] });
          const bitmap = await createImageBitmap(file);
          const codes = await detector.detect(bitmap);
          const qrisString = codes[0]?.rawValue || "";
          if (qrisString) return qrisString;
        } catch {
          // Fall back to jsQR below.
        }
      }

      return decodeQrWithCanvas(file);
    }

    document.querySelectorAll("[data-qris-upload]").forEach((input) => {
      input.addEventListener("change", async () => {
        const storeId = input.dataset.qrisUpload;
        const file = input.files?.[0];
        const textArea = document.querySelector('[data-qris-text="' + storeId + '"]');
        const message = document.querySelector('[data-qris-message="' + storeId + '"]');
        if (!file || !textArea || !message) return;
        message.textContent = "Reading QR image...";

        try {
          const qrisString = await decodeQrImage(file);
          if (!qrisString) {
            message.textContent = "QR tidak terbaca. Coba gambar yang lebih jelas atau paste manual.";
            return;
          }

          textArea.value = qrisString;
          message.textContent = "QRIS string berhasil dibaca dari gambar.";
        } catch (error) {
          message.textContent = "Gagal membaca QR image: " + error.message;
        }
      });
    });

    document.querySelectorAll("[data-qris-form]").forEach((formElement) => {
      formElement.addEventListener("submit", async (event) => {
        event.preventDefault();
        const storeId = formElement.dataset.qrisForm;
        const message = document.querySelector('[data-qris-message="' + storeId + '"]');
        const form = new FormData(formElement);
        const payload = {
          static_qris: form.get("static_qris"),
        };

        if (message) message.textContent = "Saving QRIS...";
        const response = await fetch("/api/admin/stores/" + encodeURIComponent(storeId) + "/qris", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) {
          if (message) message.textContent = data.error || "Failed to save QRIS";
          return;
        }

        if (message) message.textContent = "QRIS saved";
        setTimeout(() => window.location.reload(), 800);
      });
    });

    storeForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const storeId = form.get("store_id");
      const payload = {
        name: form.get("name"),
      };

      storeMessage.textContent = "Saving...";

      const isEdit = Boolean(storeId);
      const response = await fetch(isEdit ? "/api/admin/stores/" + encodeURIComponent(storeId) : "/api/admin/stores", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        storeMessage.textContent = data.error || "Failed";
        return;
      }

      storeMessage.textContent = "Saved";
      setTimeout(() => window.location.reload(), 800);
    });
  </script>
</body>
</html>`;
}
