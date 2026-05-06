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

function dayKey(date) {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function buildRevenueSeries(payments, days = 14) {
  const buckets = new Map();
  const now = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setUTCDate(now.getUTCDate() - i);
    buckets.set(dayKey(d), 0);
  }
  payments.forEach((p) => {
    if (p.status !== "paid") return;
    const ref = p.paid_at || p.created_at;
    if (!ref) return;
    const key = dayKey(ref);
    if (buckets.has(key)) buckets.set(key, buckets.get(key) + Number(p.amount || 0));
  });
  return Array.from(buckets.entries()).map(([key, value]) => ({ key, value }));
}

function buildPaymentsCountSeries(payments, days = 14) {
  const buckets = new Map();
  const now = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setUTCDate(now.getUTCDate() - i);
    buckets.set(dayKey(d), 0);
  }
  payments.forEach((p) => {
    const ref = p.created_at;
    if (!ref) return;
    const key = dayKey(ref);
    if (buckets.has(key)) buckets.set(key, buckets.get(key) + 1);
  });
  return Array.from(buckets.entries()).map(([key, value]) => ({ key, value }));
}

function trendPercent(series) {
  if (!series || series.length < 2) return 0;
  const half = Math.floor(series.length / 2);
  const prev = series.slice(0, half).reduce((a, b) => a + b.value, 0);
  const curr = series.slice(half).reduce((a, b) => a + b.value, 0);
  if (prev === 0 && curr === 0) return 0;
  if (prev === 0) return 100;
  return Math.round(((curr - prev) / prev) * 100);
}

function sparklineSvg(series, opts = {}) {
  const w = opts.width || 220;
  const h = opts.height || 56;
  const pad = 4;
  const values = series.map((p) => p.value);
  const max = Math.max(1, ...values);
  const stepX = (w - pad * 2) / Math.max(1, series.length - 1);
  const points = series.map((p, i) => {
    const x = pad + i * stepX;
    const y = h - pad - (p.value / max) * (h - pad * 2);
    return [x, y];
  });
  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${path} L${points[points.length - 1][0].toFixed(1)},${h - pad} L${points[0][0].toFixed(1)},${h - pad} Z`;
  const last = points[points.length - 1] || [pad, h - pad];
  const id = `sg${Math.random().toString(36).slice(2, 8)}`;
  return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="${id}-fill" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="currentColor" stop-opacity="0.32"/>
        <stop offset="100%" stop-color="currentColor" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#${id}-fill)" stroke="none"/>
    <path d="${path}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3" fill="currentColor"/>
  </svg>`;
}

function donutSvg(percent, opts = {}) {
  const size = opts.size || 132;
  const stroke = opts.stroke || 12;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = circ * (1 - clamped / 100);
  const id = `dn${Math.random().toString(36).slice(2, 8)}`;
  return `<svg class="donut" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="${id}-grad" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="#2563eb"/>
        <stop offset="50%" stop-color="#0ea5e9"/>
        <stop offset="100%" stop-color="#06b6d4"/>
      </linearGradient>
    </defs>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="currentColor" stroke-width="${stroke}" opacity="0.10"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#${id}-grad)" stroke-width="${stroke}"
      stroke-linecap="round"
      stroke-dasharray="${circ.toFixed(1)}"
      stroke-dashoffset="${offset.toFixed(1)}"
      transform="rotate(-90 ${cx} ${cy})"/>
  </svg>`;
}

function distributionBars(parts) {
  const total = parts.reduce((a, b) => a + b.value, 0) || 1;
  return `<div class="distribution-bar">
    ${parts.map((p) => `<span class="dist-seg ${p.tone}" style="--w:${((p.value / total) * 100).toFixed(2)}%" title="${escapeHtml(p.label)}: ${p.value}"></span>`).join("")}
  </div>
  <div class="distribution-legend">
    ${parts.map((p) => `<span class="dist-key"><i class="dist-dot ${p.tone}"></i>${escapeHtml(p.label)} <strong>${p.value}</strong></span>`).join("")}
  </div>`;
}

function buildActivityFeed(payments, notifications, callbacks, limit = 8) {
  const items = [];
  payments.slice(0, 30).forEach((p) => {
    if (p.paid_at) {
      items.push({
        type: "paid",
        time: p.paid_at,
        title: `Payment ${p.external_id} berhasil`,
        meta: `${money(p.amount)} \u2022 ${p.customer_name || "Customer"}`,
        tone: "good",
        icon: "check",
      });
    }
    if (p.status === "expired") {
      items.push({
        type: "expired",
        time: p.expires_at || p.updated_at || p.created_at,
        title: `Payment ${p.external_id} expired`,
        meta: money(p.amount),
        tone: "muted",
        icon: "clock",
      });
    } else if (p.status === "pending") {
      items.push({
        type: "pending",
        time: p.created_at,
        title: `Invoice ${p.external_id} dibuat`,
        meta: `${money(p.amount)} \u2022 menunggu pembayaran`,
        tone: "warn",
        icon: "plus",
      });
    }
  });
  callbacks.slice(0, 20).forEach((c) => {
    if (c.success) return;
    items.push({
      type: "callback-fail",
      time: c.created_at,
      title: `Callback gagal ke store`,
      meta: c.error || `HTTP ${c.status_code || "?"}`,
      tone: "bad",
      icon: "alert",
    });
  });
  notifications.slice(0, 20).forEach((n) => {
    if (n.status === "matched") return;
    items.push({
      type: "notif-unmatched",
      time: n.received_at || n.created_at,
      title: `Notifikasi tidak cocok`,
      meta: `${n.source === "whatsapp" ? "WA" : "Android"} \u2022 ${money(n.parsed_amount || 0)}`,
      tone: "muted",
      icon: "bell",
    });
  });
  items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  return items.slice(0, limit);
}

function activityIconSvg(name) {
  const paths = {
    check: '<path d="m4 13 4 4L20 5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    alert: '<path d="M12 9v4M12 17h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.41 0Z"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7"/><path d="M10 21h4"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.check}</svg>`;
}

function relativeTime(value) {
  if (!value) return "-";
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  if (diff < 60) return `${Math.max(1, Math.floor(diff))}d`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}j`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}h`;
  return formatDate(value);
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
  const failed = db.payments.filter((p) => p.status === "failed");
  const todayKey = dayKey(new Date());
  const revenueSeries = buildRevenueSeries(db.payments, 14);
  const paymentsCountSeries = buildPaymentsCountSeries(db.payments, 14);
  const todayRevenueEntry = revenueSeries.find((e) => e.key === todayKey);
  const todayRevenue = todayRevenueEntry ? todayRevenueEntry.value : 0;
  const todayPayments = paymentsCountSeries.find((e) => e.key === todayKey);
  const revenueTrend = trendPercent(revenueSeries);
  const paymentsTrend = trendPercent(paymentsCountSeries);
  const callbackFailedCount = db.payments.filter((p) => p.callback_status === "failed" || p.callback_status === "exhausted").length;
  const unmatchedNotifs = db.notifications.filter((n) => n.status !== "matched").length;
  const matchedNotifs = db.notifications.filter((n) => n.status === "matched").length;
  const activityFeed = buildActivityFeed(db.payments, db.notifications, db.callbacks, 8);
  const alertCount = (callbackFailedCount > 0 ? 1 : 0) + (unmatchedNotifs > 0 ? 1 : 0) + (pending.length > 0 ? 1 : 0);
  const distributionParts = [
    { label: "Paid", value: paid.length, tone: "good" },
    { label: "Pending", value: pending.length, tone: "warn" },
    { label: "Expired", value: expired.length, tone: "muted" },
    { label: "Failed", value: failed.length, tone: "bad" },
  ];

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
      --bg-grad: radial-gradient(1200px 600px at 10% -10%, rgba(37,99,235,.10), transparent 60%),
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
      --nav-pattern: radial-gradient(800px 400px at 0% 0%, rgba(37,99,235,.18), transparent 55%),
                     radial-gradient(600px 380px at 100% 100%, rgba(14,165,233,.12), transparent 55%);
      --nav-border: rgba(255,255,255,.06);
      --nav-text: #c7d0e2;
      --nav-text-soft: #8a93ab;
      --nav-active-bg: linear-gradient(135deg, rgba(37,99,235,.30), rgba(14,165,233,.18));
      --nav-active-border: rgba(255,255,255,.12);
      --primary: #2563eb;
      --primary-strong: #1d4ed8;
      --primary-grad: linear-gradient(135deg, #2563eb 0%, #0ea5e9 50%, #06b6d4 100%);
      --primary-glow: 0 6px 20px -6px rgba(37,99,235,.55);
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
      --code-bg: #eff6ff;
      --code-text: #1e40af;
      --pre-bg: linear-gradient(160deg, #0b1024 0%, #0f172a 100%);
      --pre-text: #e2e8f0;
      --shadow-sm: 0 1px 2px rgba(15,23,42,.04), 0 1px 1px rgba(15,23,42,.02);
      --shadow: 0 12px 28px -12px rgba(15,23,42,.12), 0 4px 10px -4px rgba(15,23,42,.06);
      --shadow-lg: 0 24px 60px -20px rgba(15,23,42,.18), 0 8px 18px -10px rgba(15,23,42,.08);
      --shadow-glow: 0 0 0 1px rgba(37,99,235,.18), 0 12px 30px -10px rgba(37,99,235,.30);
      --radius-sm: 8px;
      --radius: 12px;
      --radius-lg: 16px;
      --radius-xl: 20px;
      --ring: 0 0 0 4px rgba(37,99,235,.15);
      --ease: cubic-bezier(.4, 0, .2, 1);
    }
    :root[data-theme="dark"] {
      color-scheme: dark;
      --bg: #0a0e1a;
      --bg-grad: radial-gradient(1200px 600px at 10% -10%, rgba(37,99,235,.18), transparent 60%),
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
      --nav-active-bg: linear-gradient(135deg, rgba(37,99,235,.35), rgba(14,165,233,.22));
      --nav-active-border: rgba(255,255,255,.10);
      --primary: #60a5fa;
      --primary-strong: #2563eb;
      --primary-glow: 0 6px 22px -6px rgba(96,165,250,.55);
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
      --code-bg: rgba(37,99,235,.12);
      --code-text: #bfdbfe;
      --pre-bg: linear-gradient(160deg, #050816 0%, #0a0e1f 100%);
      --pre-text: #e2e8f0;
      --shadow-sm: 0 1px 2px rgba(0,0,0,.30), 0 1px 1px rgba(0,0,0,.20);
      --shadow: 0 12px 28px -12px rgba(0,0,0,.50), 0 4px 10px -4px rgba(0,0,0,.30);
      --shadow-lg: 0 24px 60px -20px rgba(0,0,0,.60), 0 8px 18px -10px rgba(0,0,0,.40);
      --shadow-glow: 0 0 0 1px rgba(96,165,250,.22), 0 12px 30px -10px rgba(96,165,250,.40);
      --ring: 0 0 0 4px rgba(96,165,250,.20);
    }
    * { box-sizing: border-box; }
    *::selection { background: rgba(37,99,235,.25); color: var(--text); }
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
      box-shadow: 0 8px 18px -6px rgba(37,99,235,.5), inset 0 1px 0 rgba(255,255,255,.20);
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
      background: linear-gradient(135deg, rgba(37,99,235,.0), rgba(37,99,235,.0));
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
      background: linear-gradient(135deg, rgba(37,99,235,.45), rgba(14,165,233,.30) 50%, rgba(37,99,235,0) 100%);
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
      box-shadow: 0 10px 26px -8px rgba(37,99,235,.65);
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

    /* ===== v2 redesign: topbar + hero + bento + timeline ===== */

    .sidebar { padding-top: 18px; padding-bottom: 14px; }
    .sidebar-scroll { display: flex; flex-direction: column; gap: 14px; min-height: 0; flex: 1; }
    .nav-section {
      padding: 16px 12px 4px;
      color: var(--nav-text-soft);
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: .14em;
      text-transform: uppercase;
      opacity: .8;
    }
    .nav-section:first-child { padding-top: 4px; }
    .nav a { padding-right: 10px; }
    .nav-badge {
      margin-left: auto;
      min-width: 22px;
      padding: 0 7px;
      height: 19px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 99px;
      background: rgba(255,255,255,.08);
      color: var(--nav-text);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .01em;
    }
    .nav-badge.alert {
      background: linear-gradient(135deg, #ef4444, #f97316);
      color: #fff;
      box-shadow: 0 0 0 2px rgba(239,68,68,.15);
    }
    .sidebar-foot { display: grid; gap: 4px; margin-top: auto; }
    .sidebar-foot-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11.5px;
    }
    .sidebar-foot-row.muted { color: var(--nav-text-soft); }
    .foot-tag {
      padding: 1px 8px;
      border-radius: 99px;
      background: rgba(255,255,255,.08);
      color: var(--nav-text);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .04em;
    }

    /* Topbar enhancements */
    .topbar { padding: 14px 28px; gap: 12px; }
    .topbar::before { content: none; }
    .topbar-search {
      position: relative;
      flex: 1 1 360px;
      max-width: 520px;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 14px;
      height: 42px;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: color-mix(in oklab, var(--surface) 92%, transparent);
      transition: border-color .18s var(--ease), box-shadow .18s var(--ease), background .18s var(--ease);
    }
    .topbar-search:focus-within {
      border-color: var(--primary);
      box-shadow: var(--ring);
      background: var(--surface);
    }
    .topbar-search svg {
      flex: 0 0 auto;
      width: 16px;
      height: 16px;
      color: var(--muted);
    }
    .topbar-search input {
      flex: 1;
      min-width: 0;
      border: none;
      background: transparent;
      color: var(--text);
      font: inherit;
      font-size: 13.5px;
      outline: none;
    }
    .topbar-search input::placeholder { color: var(--muted); }
    .topbar-search kbd {
      padding: 2px 7px;
      border-radius: 6px;
      border: 1px solid var(--line);
      background: var(--surface-soft);
      color: var(--muted);
      font: inherit;
      font-size: 11px;
      font-weight: 600;
    }
    .topbar-actions { gap: 10px; }
    .time-chip { padding: 0 12px; min-height: 42px; gap: 8px; font-size: 12px; }
    .time-chip::before { content: none; }
    .time-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--good);
      box-shadow: 0 0 0 4px var(--good-ring);
      animation: pulse 2.4s ease-in-out infinite;
    }
    .icon-button { width: 42px; min-height: 42px; }
    .notif-wrap, .user-wrap { position: relative; }
    .notif-button { position: relative; }
    .notif-dot {
      position: absolute;
      top: 4px;
      right: 5px;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 99px;
      background: linear-gradient(135deg, #ef4444, #f97316);
      color: #fff;
      font-size: 10.5px;
      font-weight: 700;
      box-shadow: 0 0 0 2px var(--surface);
    }
    .notif-pop, .user-pop {
      position: absolute;
      top: calc(100% + 10px);
      right: 0;
      min-width: 280px;
      padding: 8px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--surface-elev);
      box-shadow: var(--shadow-lg);
      z-index: 20;
      animation: popIn .18s var(--ease);
    }
    .user-pop { padding: 6px; min-width: 260px; }
    @keyframes popIn {
      from { opacity: 0; transform: translateY(-4px) scale(.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .notif-pop[hidden], .user-pop[hidden] { display: none; }
    .notif-pop-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px 8px;
    }
    .notif-pop-head strong { font-size: 13px; }
    .muted-text { color: var(--muted); font-size: 11.5px; }
    .notif-pop-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
    .notif-pop-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 10px;
      transition: background .15s var(--ease);
    }
    .notif-pop-item:hover { background: var(--surface-soft); }
    .notif-pop-item .dot {
      flex: 0 0 auto;
      width: 8px;
      height: 8px;
      margin-top: 6px;
      border-radius: 50%;
    }
    .notif-pop-item.warn .dot { background: var(--warn); box-shadow: 0 0 0 4px var(--warn-ring); }
    .notif-pop-item.bad .dot { background: var(--bad); box-shadow: 0 0 0 4px var(--bad-ring); }
    .notif-pop-item.muted .dot { background: var(--muted); box-shadow: 0 0 0 4px color-mix(in oklab, var(--muted) 18%, transparent); }
    .notif-pop-item div { display: grid; gap: 2px; min-width: 0; }
    .notif-pop-item strong { font-size: 12.5px; color: var(--text); font-weight: 600; }
    .notif-pop-item span { font-size: 11.5px; color: var(--muted); }
    .notif-pop-empty {
      padding: 20px 12px;
      text-align: center;
      color: var(--muted);
      font-size: 12.5px;
    }

    .user-pill {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 4px 10px 4px 4px;
      min-height: 42px;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--text);
      font: inherit;
      cursor: pointer;
      transition: background .15s var(--ease), border-color .15s var(--ease);
    }
    .user-pill:hover { background: var(--surface-soft); border-color: color-mix(in oklab, var(--primary) 30%, var(--line)); }
    .user-avatar {
      flex: 0 0 auto;
      width: 32px;
      height: 32px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: var(--primary-grad);
      color: #fff;
      font-size: 13px;
      font-weight: 800;
      line-height: 1;
      font-family: "Inter", system-ui, sans-serif;
      letter-spacing: 0;
      text-indent: 0;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.18);
      user-select: none;
    }
    .user-avatar.lg { width: 40px; height: 40px; font-size: 15px; border-radius: 50%; }
    .user-meta { display: grid; line-height: 1.25; text-align: left; min-width: 0; }
    .user-meta strong { font-size: 12.5px; font-weight: 700; }
    .user-meta span { font-size: 11px; color: var(--muted); }
    .user-pop-head {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 12px 12px;
      margin-bottom: 6px;
      border-radius: 10px;
      background: var(--surface-soft);
    }
    .user-pop-head > div { display: grid; min-width: 0; line-height: 1.25; }
    .user-pop-head > div strong { display: block; font-size: 13.5px; font-weight: 700; }
    .user-pop-head > div span {
      display: block;
      margin-top: 2px;
      font-size: 11.5px;
      color: var(--muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .button-ghost {
      width: 100%;
      display: inline-flex;
      align-items: center;
      justify-content: flex-start;
      gap: 10px;
      padding: 10px 12px;
      border: none;
      border-radius: 10px;
      background: transparent;
      color: var(--text);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background .15s var(--ease), color .15s var(--ease);
    }
    .button-ghost:hover { background: color-mix(in oklab, var(--bad) 10%, transparent); color: var(--bad); }
    .button-ghost svg { width: 16px; height: 16px; flex: 0 0 auto; }

    /* Hero card */
    .hero-card {
      position: relative;
      display: grid;
      grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
      gap: 36px;
      padding: 28px 32px;
      margin-bottom: 22px;
      border-radius: var(--radius-xl);
      background:
        linear-gradient(135deg, rgba(37,99,235,.08) 0%, rgba(14,165,233,.04) 100%),
        var(--surface);
      border: 1px solid var(--line);
      overflow: hidden;
      isolation: isolate;
      animation: fadeUp .4s var(--ease) both;
      box-shadow: var(--shadow);
    }
    .hero-card::before {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background:
        radial-gradient(600px 320px at 0% 0%, rgba(37,99,235,.18), transparent 60%),
        radial-gradient(500px 320px at 100% 100%, rgba(14,165,233,.12), transparent 60%);
      z-index: -1;
    }
    .hero-blob {
      position: absolute;
      border-radius: 50%;
      filter: blur(48px);
      opacity: .55;
      pointer-events: none;
      z-index: -1;
    }
    .hero-blob-a {
      width: 280px;
      height: 280px;
      top: -120px;
      right: -60px;
      background: radial-gradient(circle, rgba(14,165,233,.55), transparent 70%);
      animation: drift 14s ease-in-out infinite;
    }
    .hero-blob-b {
      width: 220px;
      height: 220px;
      bottom: -100px;
      left: 30%;
      background: radial-gradient(circle, rgba(6,182,212,.45), transparent 70%);
      animation: drift 18s ease-in-out infinite reverse;
    }
    @keyframes drift {
      0%,100% { transform: translate(0,0); }
      50% { transform: translate(30px, 20px); }
    }
    .hero-content { display: grid; gap: 14px; align-content: start; min-width: 0; }
    .hero-title {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--muted);
      letter-spacing: .01em;
    }
    .hero-amount {
      display: flex;
      align-items: baseline;
      gap: 14px;
      flex-wrap: wrap;
    }
    .hero-amount strong {
      font-size: 44px;
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.05;
      background: linear-gradient(180deg, var(--text), color-mix(in oklab, var(--text) 70%, var(--muted)));
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .trend-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 99px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .01em;
    }
    .trend-pill svg { width: 14px; height: 14px; }
    .trend-pill.sm { padding: 3px 8px; font-size: 11.5px; }
    .trend-pill.up { background: var(--good-bg); color: var(--good); box-shadow: inset 0 0 0 1px var(--good-ring); }
    .trend-pill.down { background: var(--bad-bg); color: var(--bad); box-shadow: inset 0 0 0 1px var(--bad-ring); }
    .hero-meta {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
      margin-top: 4px;
      padding-top: 14px;
      border-top: 1px solid var(--line-soft);
    }
    .hero-meta-item { display: grid; gap: 4px; min-width: 0; }
    .hero-meta-label {
      color: var(--muted);
      font-size: 11.5px;
      font-weight: 500;
    }
    .hero-meta-item strong {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--text);
    }
    .hero-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 6px;
    }
    .hero-cta {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      border-radius: 12px;
      background: var(--primary-grad);
      background-size: 180% 180%;
      color: #fff !important;
      font-weight: 600;
      font-size: 13px;
      text-decoration: none;
      box-shadow: var(--primary-glow);
      transition: background-position .35s var(--ease), transform .15s var(--ease), box-shadow .25s var(--ease);
    }
    .hero-cta:hover { background-position: 100% 0; transform: translateY(-1px); box-shadow: 0 12px 28px -8px rgba(37,99,235,.65); }
    .hero-cta:active { transform: translateY(0); }
    .hero-link {
      color: var(--primary);
      font-weight: 600;
      font-size: 13px;
      text-decoration: none;
    }
    .hero-link:hover { text-decoration: underline; }
    .hero-chart {
      align-self: end;
      display: grid;
      gap: 8px;
      color: var(--primary);
      min-width: 0;
    }
    .hero-chart-label {
      color: var(--muted);
      font-size: 11.5px;
      font-weight: 600;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    .hero-chart-svg { width: 100%; height: 96px; min-width: 0; }
    .hero-chart-svg svg { width: 100%; height: 100%; display: block; }

    /* Bento grid */
    .bento {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
      margin-bottom: 22px;
    }
    .bento-card {
      position: relative;
      padding: 18px 20px;
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      background: var(--surface);
      box-shadow: var(--shadow-sm);
      transition: transform .25s var(--ease), box-shadow .25s var(--ease), border-color .25s var(--ease);
      animation: fadeUp .4s var(--ease) both;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-width: 0;
    }
    .bento-card:nth-child(1) { animation-delay: .04s; }
    .bento-card:nth-child(2) { animation-delay: .08s; }
    .bento-card:nth-child(3) { animation-delay: .12s; }
    .bento-card:nth-child(4) { animation-delay: .16s; }
    .bento-card:nth-child(5) { animation-delay: .20s; }
    .bento-card:hover {
      border-color: color-mix(in oklab, var(--primary) 22%, var(--line));
      box-shadow: var(--shadow);
      transform: translateY(-1px);
    }
    .bento-card.span-2 { grid-column: span 2; }
    .bento-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
    }
    .bento-eyebrow {
      display: block;
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .08em;
    }
    .bento-head h3 { margin: 4px 0 0; font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
    .bento-icon {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: 10px;
      color: var(--primary);
      background: color-mix(in oklab, var(--primary) 12%, transparent);
      box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--primary) 22%, transparent);
    }
    .bento-icon svg { width: 18px; height: 18px; }
    .bento-link {
      color: var(--primary);
      font-size: 12px;
      font-weight: 600;
      text-decoration: none;
    }
    .bento-link:hover { text-decoration: underline; }
    .bento-stat {
      display: flex;
      align-items: baseline;
      gap: 10px;
    }
    .bento-stat strong {
      font-size: 30px;
      font-weight: 800;
      letter-spacing: -0.02em;
      line-height: 1;
      background: linear-gradient(180deg, var(--text), color-mix(in oklab, var(--text) 70%, var(--muted)));
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .bento-spark {
      width: 100%;
      height: 48px;
      min-width: 0;
      color: var(--primary);
    }
    .bento-spark.accent { color: var(--accent); }
    .bento-spark svg { width: 100%; height: 100%; display: block; }

    /* Distribution bar */
    .distribution-bar {
      display: flex;
      gap: 3px;
      height: 10px;
      border-radius: 99px;
      overflow: hidden;
      background: var(--surface-soft);
    }
    .dist-seg {
      width: var(--w);
      transition: width .4s var(--ease);
    }
    .dist-seg.good { background: linear-gradient(90deg, #10b981, #34d399); }
    .dist-seg.warn { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
    .dist-seg.bad { background: linear-gradient(90deg, #ef4444, #f87171); }
    .dist-seg.muted { background: linear-gradient(90deg, #94a3b8, #cbd5e1); }
    .distribution-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      font-size: 11.5px;
      color: var(--muted);
      margin-top: 2px;
    }
    .dist-key { display: inline-flex; align-items: center; gap: 6px; }
    .dist-key strong { color: var(--text); font-weight: 700; }
    .dist-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .dist-dot.good { background: #10b981; }
    .dist-dot.warn { background: #f59e0b; }
    .dist-dot.bad { background: #ef4444; }
    .dist-dot.muted { background: #94a3b8; }

    /* Donut */
    .donut-wrap {
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: 18px;
    }
    .donut-ring { position: relative; width: 132px; height: 132px; color: var(--primary); }
    .donut-ring svg { width: 100%; height: 100%; display: block; }
    .donut-center {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      text-align: center;
    }
    .donut-center strong {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.02em;
      line-height: 1;
      background: var(--primary-grad);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .donut-center small { font-size: 14px; font-weight: 700; color: var(--primary); }
    .donut-center span {
      display: block;
      margin-top: 4px;
      color: var(--muted);
      font-size: 11px;
      font-weight: 500;
    }
    .donut-legend {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 10px;
      font-size: 12.5px;
      color: var(--text-soft);
    }
    .donut-legend li {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .donut-legend strong { margin-left: auto; color: var(--text); font-weight: 700; }
    .donut-legend .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    .donut-legend .dot.good { background: var(--good); }
    .donut-legend .dot.warn { background: var(--warn); }
    .donut-legend .dot.muted { background: var(--muted); }
    .donut-legend .dot.bad { background: var(--bad); }

    /* Status list */
    .status-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    .status-list li {
      display: grid;
      grid-template-columns: 36px 1fr auto;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 12px;
      background: var(--surface-soft);
      border: 1px solid var(--line-soft);
    }
    .status-icon {
      width: 36px;
      height: 36px;
      display: grid;
      place-items: center;
      border-radius: 10px;
      background: var(--surface);
      color: var(--text-soft);
      box-shadow: inset 0 0 0 1px var(--line);
    }
    .status-icon svg { width: 18px; height: 18px; }
    .status-list li > div { display: grid; gap: 2px; min-width: 0; }
    .status-list strong { font-size: 12.5px; font-weight: 700; }
    .status-list span { font-size: 11.5px; color: var(--muted); }

    /* Quick actions */
    .quick-actions {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }
    .quick-action {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid var(--line);
      background: var(--surface-soft);
      color: var(--text);
      font-size: 12.5px;
      font-weight: 600;
      text-decoration: none;
      transition: transform .15s var(--ease), background .15s var(--ease), border-color .15s var(--ease), color .15s var(--ease);
    }
    .quick-action:hover {
      background: var(--surface);
      border-color: color-mix(in oklab, var(--primary) 30%, var(--line));
      color: var(--primary);
      transform: translateY(-1px);
    }
    .quick-action-icon {
      width: 30px;
      height: 30px;
      display: grid;
      place-items: center;
      border-radius: 8px;
      color: var(--primary);
      background: color-mix(in oklab, var(--primary) 12%, transparent);
    }
    .quick-action-icon svg { width: 16px; height: 16px; }

    /* Activity timeline */
    .timeline { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; position: relative; }
    .timeline::before {
      content: "";
      position: absolute;
      left: 17px;
      top: 14px;
      bottom: 14px;
      width: 2px;
      background: linear-gradient(180deg, var(--line), transparent);
    }
    .timeline-item {
      position: relative;
      display: grid;
      grid-template-columns: 36px 1fr auto;
      align-items: center;
      gap: 12px;
      padding: 8px 6px;
      border-radius: 10px;
      animation: fadeUp .4s var(--ease) both;
      animation-delay: calc(var(--i, 0) * 40ms);
    }
    .timeline-item:hover { background: var(--surface-soft); }
    .timeline-dot {
      position: relative;
      z-index: 1;
      width: 36px;
      height: 36px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      border: 2px solid var(--surface);
      box-shadow: 0 0 0 2px var(--line);
      background: var(--surface-soft);
      color: var(--text-soft);
    }
    .timeline-dot svg { width: 16px; height: 16px; }
    .timeline-item.good .timeline-dot { color: var(--good); background: var(--good-bg); box-shadow: 0 0 0 2px var(--good-ring); }
    .timeline-item.warn .timeline-dot { color: var(--warn); background: var(--warn-bg); box-shadow: 0 0 0 2px var(--warn-ring); }
    .timeline-item.bad .timeline-dot { color: var(--bad); background: var(--bad-bg); box-shadow: 0 0 0 2px var(--bad-ring); }
    .timeline-body { display: grid; gap: 2px; min-width: 0; }
    .timeline-body strong { font-size: 13px; font-weight: 600; color: var(--text); }
    .timeline-body span { font-size: 11.5px; color: var(--muted); }
    .timeline-time { color: var(--muted); font-size: 11.5px; font-variant-numeric: tabular-nums; }

    /* Empty state */
    .empty-state {
      display: grid;
      gap: 8px;
      justify-items: center;
      padding: 36px 20px;
      text-align: center;
    }
    .empty-illust {
      width: 72px;
      height: 72px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: color-mix(in oklab, var(--primary) 8%, var(--surface-soft));
      color: var(--primary);
      box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--primary) 18%, transparent);
    }
    .empty-illust svg { width: 36px; height: 36px; }
    .empty-state strong { font-size: 14px; font-weight: 700; }
    .empty-state span { color: var(--muted); font-size: 12.5px; max-width: 320px; line-height: 1.5; }

    /* Recent panel header */
    .recent-panel { padding: 0; }
    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 18px 22px 14px;
      border-bottom: 1px solid var(--line-soft);
    }
    .panel-eyebrow {
      display: block;
      color: var(--muted);
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .12em;
    }
    .panel-head h3 { margin: 4px 0 0; font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }

    .recent-panel tbody tr,
    [data-payment-row] {
      animation: fadeUp .35s var(--ease) both;
      animation-delay: calc(var(--i, 0) * 30ms);
    }

    /* Override old metric grid */
    .metrics { display: none; }

    /* Hide heading on overview (hero serves as heading) */
    body[data-tab="overview"] .page-heading { display: none; }
    .page-heading { animation: fadeUp .35s var(--ease) both; }

    /* ===== Responsive overrides for v2 ===== */
    @media (max-width: 1280px) {
      .bento { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .bento-card.span-2 { grid-column: span 2; }
      .hero-card { padding: 24px; }
    }
    @media (max-width: 1100px) {
      .topbar-search { display: none; }
      .hero-card { grid-template-columns: 1fr; padding: 22px; gap: 22px; }
      .hero-amount strong { font-size: 36px; }
      .user-meta { display: none; }
      .user-pill { padding: 4px; }
    }
    @media (max-width: 720px) {
      .topbar { padding: 12px 14px; }
      .icon-button { width: 38px; min-height: 38px; }
      .time-chip { display: none; }
      .topbar-actions { gap: 6px; }
      .hero-card { padding: 20px; gap: 18px; }
      .hero-amount strong { font-size: 30px; }
      .hero-meta { grid-template-columns: 1fr 1fr; }
      .bento { grid-template-columns: 1fr; gap: 12px; }
      .bento-card.span-2 { grid-column: span 1; }
      .donut-wrap { grid-template-columns: 1fr; justify-items: center; text-align: center; }
      .donut-legend { justify-content: center; }
      .quick-actions { grid-template-columns: 1fr 1fr; }
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
        </div>
      </div>
      <div class="sidebar-scroll">
        <nav class="nav">
          <div class="nav-section">Overview</div>
          <a class="active" href="#overview">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
            Dashboard
          </a>
          <a href="#payments">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
            Daftar Transaksi
            <span class="nav-badge">${db.payments.length}</span>
          </a>
          <div class="nav-section">Integrasi</div>
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
          <div class="nav-section">Operasi</div>
          <a href="#callbacks">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>
            Webhooks
            ${callbackFailedCount ? `<span class="nav-badge alert">${callbackFailedCount}</span>` : ""}
          </a>
          <a href="#konfigurasi">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.3.25.66.4 1.1.4H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51.6Z"/></svg>
            Konfigurasi
          </a>
        </nav>
      </div>
      <div class="sidebar-foot">
        <div class="sidebar-foot-row">
          <span class="foot-tag">v1.0</span>
          <span>QRIS Gateway</span>
        </div>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <button class="mobile-menu-button" type="button" data-sidebar-toggle aria-label="Open menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
        <div class="topbar-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input type="search" placeholder="Cari payment, customer, atau order id\u2026" data-global-search aria-label="Search">
          <kbd>/</kbd>
        </div>
        <div class="topbar-actions">
          <div class="time-chip">
            <span class="time-dot"></span>
            ${escapeHtml(formatWibDateTime())}
          </div>
          <button class="icon-button" type="button" data-theme-toggle aria-label="Toggle theme">
            <svg class="theme-icon-light" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
            <svg class="theme-icon-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" style="display:none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          </button>
          <div class="notif-wrap" data-notif-wrap>
            <button class="icon-button notif-button" type="button" data-notif-toggle aria-label="Notifications">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7"/><path d="M10 21h4"/></svg>
              ${alertCount ? `<span class="notif-dot">${alertCount}</span>` : ""}
            </button>
            <div class="notif-pop" data-notif-pop hidden>
              <div class="notif-pop-head">
                <strong>Notifications</strong>
                <span class="muted-text">${alertCount} active</span>
              </div>
              <ul class="notif-pop-list">
                ${pending.length ? `<li class="notif-pop-item warn"><span class="dot"></span><div><strong>${pending.length} pending</strong><span>Menunggu pembayaran customer</span></div></li>` : ""}
                ${callbackFailedCount ? `<li class="notif-pop-item bad"><span class="dot"></span><div><strong>${callbackFailedCount} callback gagal</strong><span>Webhook ke store butuh perhatian</span></div></li>` : ""}
                ${unmatchedNotifs ? `<li class="notif-pop-item muted"><span class="dot"></span><div><strong>${unmatchedNotifs} notif tidak cocok</strong><span>Nominal tidak match payment aktif</span></div></li>` : ""}
                ${!alertCount ? `<li class="notif-pop-empty">Semua aman \u2728</li>` : ""}
              </ul>
            </div>
          </div>
          <div class="user-wrap" data-user-wrap>
            <button class="user-pill" type="button" data-user-toggle>
              <span class="user-avatar">A</span>
              <span class="user-meta">
                <strong>Alvian</strong>
                <span>Admin</span>
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </button>
            <div class="user-pop" data-user-pop hidden>
              <div class="user-pop-head">
                <span class="user-avatar lg">A</span>
                <div>
                  <strong>Alvian</strong>
                  <span>${escapeHtml(firstStore.name || "Admin")}</span>
                </div>
              </div>
              <form method="post" action="/logout">
                <button class="button-ghost" type="submit">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>
                  Logout
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>

      <main class="content">
        <div class="page-heading">
          <h1 id="page-title">Hi, Alvian</h1>
          <p id="page-subtitle">Monitor transaksi QRIS, notifikasi Android, dan callback store.</p>
        </div>
        <section id="overview" class="section-anchor">
          <div class="hero-card">
            <div class="hero-blob hero-blob-a"></div>
            <div class="hero-blob hero-blob-b"></div>
            <div class="hero-content">
              <h2 class="hero-title">Revenue hari ini</h2>
              <div class="hero-amount">
                <strong>${money(todayRevenue)}</strong>
                <span class="trend-pill ${revenueTrend >= 0 ? "up" : "down"}">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${revenueTrend >= 0 ? '<path d="M7 17 17 7"/><path d="M9 7h8v8"/>' : '<path d="M7 7l10 10"/><path d="M17 9v8H9"/>'}</svg>
                  ${Math.abs(revenueTrend)}%
                </span>
              </div>
              <div class="hero-meta">
                <div class="hero-meta-item">
                  <span class="hero-meta-label">Transaksi sukses 14h</span>
                  <strong>${paid.length}</strong>
                </div>
                <div class="hero-meta-item">
                  <span class="hero-meta-label">Total revenue</span>
                  <strong>${money(revenue)}</strong>
                </div>
                <div class="hero-meta-item">
                  <span class="hero-meta-label">Success rate</span>
                  <strong>${successRate}%</strong>
                </div>
              </div>
              <div class="hero-actions">
                <a class="hero-cta" href="#payments" data-tab-link="payments">
                  Lihat semua transaksi
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
                </a>
                <a class="hero-link" href="#konfigurasi" data-tab-link="konfigurasi">Setup integrasi store</a>
              </div>
            </div>
            <div class="hero-chart">
              <div class="hero-chart-label">Revenue trend &middot; 14 hari</div>
              <div class="hero-chart-svg">${sparklineSvg(revenueSeries, { width: 360, height: 96 })}</div>
            </div>
          </div>

          <div class="bento">
            <article class="bento-card span-2">
              <header class="bento-head">
                <div>
                  <span class="bento-eyebrow">Payments</span>
                  <h3>Volume transaksi</h3>
                </div>
                <div class="bento-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
                </div>
              </header>
              <div class="bento-stat">
                <strong>${db.payments.length}</strong>
                <span class="trend-pill ${paymentsTrend >= 0 ? "up" : "down"} sm">
                  ${paymentsTrend >= 0 ? "+" : ""}${paymentsTrend}%
                </span>
              </div>
              ${distributionBars(distributionParts)}
              <div class="bento-spark accent">${sparklineSvg(paymentsCountSeries, { width: 360, height: 48 })}</div>
            </article>

            <article class="bento-card">
              <header class="bento-head">
                <div>
                  <span class="bento-eyebrow">Conversion</span>
                  <h3>Success rate</h3>
                </div>
              </header>
              <div class="donut-wrap">
                <div class="donut-ring">
                  ${donutSvg(successRate, { size: 132, stroke: 12 })}
                  <div class="donut-center">
                    <strong>${successRate}<small>%</small></strong>
                    <span>Paid / Total</span>
                  </div>
                </div>
                <ul class="donut-legend">
                  <li><i class="dot good"></i>Paid <strong>${paid.length}</strong></li>
                  <li><i class="dot warn"></i>Pending <strong>${pending.length}</strong></li>
                  <li><i class="dot muted"></i>Expired <strong>${expired.length}</strong></li>
                </ul>
              </div>
            </article>

            <article class="bento-card">
              <header class="bento-head">
                <div>
                  <span class="bento-eyebrow">System</span>
                  <h3>Status integrasi</h3>
                </div>
              </header>
              <ul class="status-list">
                <li>
                  <span class="status-icon" data-status-icon="wa"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 20l1.2-5.4A8.5 8.5 0 1 1 21 11.5Z"/></svg></span>
                  <div>
                    <strong>WhatsApp Listener</strong>
                    <span data-wa-status-text>Mengecek status\u2026</span>
                  </div>
                  <span class="pill muted" data-wa-status-pill>idle</span>
                </li>
                <li>
                  <span class="status-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg></span>
                  <div>
                    <strong>Android Listener</strong>
                    <span>${androidNotifications.length} notif diterima</span>
                  </div>
                  <span class="pill ${androidNotifications.length ? "good" : "muted"}">${androidNotifications.length ? "active" : "idle"}</span>
                </li>
                <li>
                  <span class="status-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg></span>
                  <div>
                    <strong>Callback Webhook</strong>
                    <span>${callbackFailedCount ? `${callbackFailedCount} retry pending` : "Semua sukses"}</span>
                  </div>
                  <span class="pill ${callbackFailedCount ? "bad" : "good"}">${callbackFailedCount ? "issues" : "healthy"}</span>
                </li>
              </ul>
            </article>

            <article class="bento-card span-2 activity">
              <header class="bento-head">
                <div>
                  <span class="bento-eyebrow">Activity</span>
                  <h3>Aktivitas terkini</h3>
                </div>
                <a class="bento-link" href="#payments" data-tab-link="payments">Lihat semua</a>
              </header>
              ${activityFeed.length ? `<ul class="timeline">
                ${activityFeed.map((item, idx) => `
                  <li class="timeline-item ${item.tone}" style="--i:${idx}">
                    <span class="timeline-dot">${activityIconSvg(item.icon)}</span>
                    <div class="timeline-body">
                      <strong>${escapeHtml(item.title)}</strong>
                      <span>${escapeHtml(item.meta)}</span>
                    </div>
                    <time class="timeline-time">${escapeHtml(relativeTime(item.time))}</time>
                  </li>
                `).join("")}
              </ul>` : `<div class="empty-state"><div class="empty-illust"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="32" cy="32" r="22" opacity=".3"/><path d="M22 32h20M32 22v20" opacity=".5"/></svg></div><strong>Belum ada aktivitas</strong><span>Buat payment dari aplikasi store untuk melihat alur live di sini.</span></div>`}
            </article>

            <article class="bento-card actions">
              <header class="bento-head">
                <div>
                  <span class="bento-eyebrow">Quick</span>
                  <h3>Aksi cepat</h3>
                </div>
              </header>
              <div class="quick-actions">
                <a class="quick-action" href="#payments" data-tab-link="payments">
                  <span class="quick-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg></span>
                  <span>Daftar Transaksi</span>
                </a>
                <a class="quick-action" href="#koneksi" data-tab-link="koneksi">
                  <span class="quick-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.1 0l2.8-2.8a5 5 0 0 0-7.1-7.1L11 4.9"/><path d="M14 11a5 5 0 0 0-7.1 0l-2.8 2.8a5 5 0 0 0 7.1 7.1L13 19.1"/></svg></span>
                  <span>Atur QRIS</span>
                </a>
                <a class="quick-action" href="#whatsapp" data-tab-link="whatsapp">
                  <span class="quick-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 20l1.2-5.4A8.5 8.5 0 1 1 21 11.5Z"/></svg></span>
                  <span>WA Logs</span>
                </a>
                <a class="quick-action" href="#callbacks" data-tab-link="callbacks">
                  <span class="quick-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg></span>
                  <span>Webhooks</span>
                </a>
                <a class="quick-action" href="#konfigurasi" data-tab-link="konfigurasi">
                  <span class="quick-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.3.25.66.4 1.1.4H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51.6Z"/></svg></span>
                  <span>API Docs</span>
                </a>
                <a class="quick-action" href="#android" data-tab-link="android">
                  <span class="quick-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg></span>
                  <span>Android Logs</span>
                </a>
              </div>
            </article>
          </div>

          <section class="panel recent-panel">
            <header class="panel-head">
              <div>
                <span class="panel-eyebrow">Latest</span>
                <h3>Payment terbaru</h3>
              </div>
              <a class="bento-link" href="#payments" data-tab-link="payments">Lihat semua \u2192</a>
            </header>
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
                  ${overviewPayments.map((payment, idx) => `
                    <tr style="--i:${idx}">
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
              </table>` : `<div class="empty-state"><div class="empty-illust"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="14" width="44" height="36" rx="4" opacity=".4"/><path d="M10 22h44" opacity=".6"/><path d="M22 32h12M22 38h20" opacity=".5"/></svg></div><strong>Belum ada payment</strong><span>Payment yang dibuat dari aplikasi store akan muncul di sini.</span></div>`}
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
                      <tr data-payment-row data-row-index="${index}" style="--i:${index % 10}">
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

      document.body.setAttribute("data-tab", tab);
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

    document.querySelectorAll("[data-tab-link]").forEach((el) => {
      el.addEventListener("click", (event) => {
        event.preventDefault();
        const tab = el.getAttribute("data-tab-link");
        activateTab(tab);
        if (tab === "koneksi") ensureWaConnection();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });

    sidebarToggle?.addEventListener("click", () => {
      document.body.classList.toggle("sidebar-open");
    });
    sidebarClosers.forEach((element) => {
      element.addEventListener("click", () => document.body.classList.remove("sidebar-open"));
    });

    function setupPopover(toggleSel, popSel, wrapSel) {
      const toggle = document.querySelector(toggleSel);
      const pop = document.querySelector(popSel);
      const wrap = document.querySelector(wrapSel);
      if (!toggle || !pop || !wrap) return null;
      function close() { pop.hidden = true; }
      function open() { pop.hidden = false; }
      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        if (pop.hidden) open(); else close();
      });
      document.addEventListener("click", (e) => {
        if (!wrap.contains(e.target)) close();
      });
      return { close };
    }
    const notifPop = setupPopover("[data-notif-toggle]", "[data-notif-pop]", "[data-notif-wrap]");
    const userPop = setupPopover("[data-user-toggle]", "[data-user-pop]", "[data-user-wrap]");

    const globalSearch = document.querySelector("[data-global-search]");
    const paymentRowsAll = () => Array.from(document.querySelectorAll("[data-payment-row]"));
    let searchActive = false;
    function applySearch(query) {
      const q = query.trim().toLowerCase();
      const rows = paymentRowsAll();
      if (!q) {
        searchActive = false;
        rows.forEach((row) => row.removeAttribute("data-search-hide"));
        if (typeof renderPaymentPage === "function") renderPaymentPage();
        return;
      }
      searchActive = true;
      rows.forEach((row) => {
        const text = row.textContent.toLowerCase();
        if (text.includes(q)) {
          row.removeAttribute("data-search-hide");
          row.hidden = false;
        } else {
          row.setAttribute("data-search-hide", "1");
          row.hidden = true;
        }
      });
    }
    globalSearch?.addEventListener("input", (e) => applySearch(e.target.value));
    globalSearch?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.target.value.trim()) activateTab("payments");
      }
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        document.body.classList.remove("sidebar-open");
        notifPop?.close();
        userPop?.close();
      }
      if (event.key === "/" && document.activeElement !== globalSearch) {
        const tag = document.activeElement?.tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA") {
          event.preventDefault();
          globalSearch?.focus();
        }
      }
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
      const status = data.status || "unknown";
      const detail = data.error || data.last_error || data.jid || data.last_message_at || "";
      const overviewText = document.querySelector("[data-wa-status-text]");
      const overviewPill = document.querySelector("[data-wa-status-pill]");
      if (overviewText) overviewText.textContent = detail || ("Status: " + status);
      if (overviewPill) {
        overviewPill.textContent = status;
        overviewPill.classList.remove("good", "warn", "bad", "muted");
        if (status === "connected" || status === "open") overviewPill.classList.add("good");
        else if (["connecting", "reconnecting", "qr"].includes(status)) overviewPill.classList.add("warn");
        else if (["error", "logged_out"].includes(status)) overviewPill.classList.add("bad");
        else overviewPill.classList.add("muted");
      }
      if (!waStatus) return;
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
