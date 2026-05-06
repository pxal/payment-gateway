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
    unmatched: "muted",
  }[status] || "muted";
}

function money(value) {
  return `Rp${Number(value || 0).toLocaleString("id-ID")}`;
}

function callbackLabel(payment) {
  if (payment.status === "paid") return payment.callback_status || "pending";
  if (payment.status === "expired") return "expired";
  return "-";
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
  <style>
    :root {
      color-scheme: light;
      --bg: #ffffff;
      --surface: #ffffff;
      --surface-soft: #f8fafc;
      --line: #d9e0ea;
      --line-soft: #edf1f6;
      --text: #141b2d;
      --muted: #667085;
      --nav: #0f3f8f;
      --nav-soft: #1557b0;
      --accent: #0f766e;
      --accent-strong: #0b5f59;
      --good: #147a3d;
      --warn: #a16207;
      --bad: #b42318;
      --shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      background: var(--bg);
    }
    .app {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 264px minmax(0, 1fr);
    }
    .sidebar {
      position: sticky;
      top: 0;
      height: 100vh;
      display: flex;
      flex-direction: column;
      gap: 24px;
      padding: 22px 16px;
      background: var(--nav);
      color: #fff;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 8px;
    }
    .brand-mark {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      border-radius: 8px;
      background: var(--accent);
      font-weight: 850;
    }
    .brand strong { display: block; font-size: 15px; }
    .brand span { display: block; margin-top: 2px; color: #a9b4c5; font-size: 12px; }
    .nav-label {
      padding: 0 10px;
      color: #8d99aa;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .nav {
      display: grid;
      gap: 6px;
    }
    .nav a {
      display: flex;
      align-items: center;
      gap: 10px;
      height: 42px;
      padding: 0 12px;
      border-radius: 8px;
      color: #d7deea;
      text-decoration: none;
      font-size: 14px;
      font-weight: 700;
    }
    .nav a:hover, .nav a.active {
      background: var(--nav-soft);
      color: #fff;
    }
    .nav svg {
      flex: 0 0 auto;
      width: 18px;
      height: 18px;
      stroke-width: 2;
    }
    .main {
      min-width: 0;
      display: grid;
      grid-template-rows: auto 1fr;
    }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 3;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 28px;
      border-bottom: 1px solid var(--line);
      background: rgba(255, 255, 255, .92);
      backdrop-filter: blur(14px);
    }
    .topbar::before {
      content: "";
      flex: 1;
    }
    .mobile-menu-button {
      display: none;
      width: 42px;
      min-height: 40px;
      padding: 0;
      border-color: var(--line);
      background: #fff;
      color: var(--text);
    }
    .mobile-menu-button:hover { background: var(--surface-soft); }
    .mobile-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 8;
      background: rgba(15, 23, 42, .42);
    }
    body.sidebar-open .mobile-backdrop { display: block; }
    .title-block h1 {
      margin: 0;
      font-size: 22px;
      line-height: 1.2;
    }
    .title-block p {
      margin: 4px 0 0;
      color: var(--muted);
      font-size: 13px;
    }
    .page-heading {
      margin-bottom: 18px;
    }
    .page-heading h1 {
      margin: 0;
      font-size: 24px;
      line-height: 1.2;
    }
    .page-heading p {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 14px;
    }
    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .time-chip {
      min-height: 36px;
      display: inline-flex;
      align-items: center;
      padding: 0 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
      color: var(--muted);
      font-size: 13px;
      font-weight: 650;
    }
    main.content {
      min-width: 0;
      width: 100%;
      max-width: 1480px;
      margin: 0 auto;
      padding: 32px 42px 56px;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
    }
    .metric {
      padding: 18px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
      box-shadow: var(--shadow);
    }
    .metric-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 750;
    }
    .metric-icon {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: 8px;
      color: var(--accent);
      background: #e6f4f1;
    }
    .metric-icon svg { width: 18px; height: 18px; }
    .metric strong {
      display: block;
      margin-top: 14px;
      font-size: 28px;
      line-height: 1.1;
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
      gap: 16px;
      margin-top: 18px;
      align-items: start;
    }
    .stack {
      display: grid;
      gap: 16px;
    }
    .panel {
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
      box-shadow: var(--shadow);
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 16px 18px;
      border-bottom: 1px solid var(--line-soft);
    }
    .panel-header h2 {
      margin: 0;
      font-size: 15px;
    }
    .panel-header p {
      margin: 4px 0 0;
      color: var(--muted);
      font-size: 12px;
    }
    .panel-body {
      padding: 18px;
    }
    .table-wrap { overflow-x: auto; }
    table {
      width: 100%;
      min-width: 920px;
      border-collapse: collapse;
    }
    th, td {
      padding: 12px 14px;
      border-bottom: 1px solid var(--line-soft);
      text-align: left;
      vertical-align: middle;
      font-size: 13px;
    }
    th {
      color: var(--muted);
      background: var(--surface-soft);
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
    }
    tr:last-child td { border-bottom: 0; }
    .primary-cell {
      display: grid;
      gap: 4px;
    }
    .primary-cell strong { font-size: 13px; }
    .primary-cell span { color: var(--muted); font-size: 12px; }
    code {
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 12px;
      color: #344054;
      background: #eef2f7;
      padding: 3px 5px;
      border-radius: 5px;
      word-break: break-all;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 24px;
      padding: 0 9px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 800;
      text-transform: capitalize;
      white-space: nowrap;
    }
    .good { color: var(--good); background: #e7f6ed; }
    .warn { color: var(--warn); background: #fff5d6; }
    .bad { color: var(--bad); background: #ffe8e4; }
    .muted { color: var(--muted); background: #edf1f6; }
    .empty {
      padding: 26px;
      color: var(--muted);
      text-align: center;
      font-size: 13px;
    }
    .doc-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }
    .store-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(360px, 440px);
      gap: 16px;
      align-items: start;
    }
    .store-list {
      display: grid;
      gap: 10px;
    }
    .store-item {
      display: grid;
      gap: 10px;
      padding: 14px;
      border: 1px solid var(--line-soft);
      border-radius: 8px;
      background: var(--surface-soft);
    }
    .store-item-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .store-actions {
      display: flex;
      gap: 8px;
    }
    .store-actions button {
      width: auto;
      min-height: 32px;
      padding: 0 10px;
      font-size: 12px;
    }
    .danger-button {
      border-color: #f3b3ad;
      background: #fff;
      color: var(--bad);
    }
    .danger-button:hover {
      background: #fff1ef;
    }
    .field-row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .doc-card {
      min-width: 0;
      padding: 16px;
      border: 1px solid var(--line-soft);
      border-radius: 8px;
      background: var(--surface-soft);
    }
    .doc-card h3 {
      margin: 0 0 8px;
      font-size: 14px;
    }
    .doc-card p {
      margin: 0 0 12px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.55;
    }
    .doc-list {
      display: grid;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
      color: #475467;
      font-size: 13px;
    }
    pre {
      margin: 0;
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #0f172a;
      color: #e5edf7;
      padding: 14px;
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 12px;
      line-height: 1.55;
    }
    form { display: grid; gap: 12px; }
    label {
      display: grid;
      gap: 7px;
      color: #475467;
      font-size: 13px;
      font-weight: 750;
    }
    input, select, textarea, button {
      width: 100%;
      min-height: 42px;
      border: 1px solid var(--line);
      border-radius: 7px;
      font: inherit;
    }
    input, select, textarea {
      padding: 9px 11px;
      background: #fff;
      color: var(--text);
      outline: none;
    }
    input[readonly] {
      background: #f3f6fa;
      color: var(--muted);
    }
    input:focus, select:focus, textarea:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(15, 118, 110, .12);
    }
    textarea {
      min-height: 132px;
      resize: vertical;
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 12px;
      line-height: 1.5;
    }
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
      border-color: var(--accent);
      background: var(--accent);
      color: white;
      font-weight: 800;
    }
    button:hover { background: var(--accent-strong); }
    .button-secondary {
      width: auto;
      min-height: 36px;
      padding: 0 12px;
      border-color: var(--line);
      background: #fff;
      color: var(--text);
    }
    .button-secondary:hover { background: var(--surface-soft); }
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
      border-radius: 8px;
      background: #fff;
      padding: 10px;
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
      padding: 14px;
      border-top: 1px solid var(--line-soft);
    }
    .pagination button {
      width: auto;
      min-height: 34px;
      padding: 0 12px;
      border-color: var(--line);
      background: #fff;
      color: var(--text);
      font-size: 13px;
    }
    .pagination button:hover { background: var(--surface-soft); }
    .pagination button:disabled {
      cursor: not-allowed;
      opacity: .5;
    }
    .pagination span {
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
    }
    .section-anchor { scroll-margin-top: 92px; }
    .section-anchor[hidden], .stack[hidden], .panel-grid[hidden] {
      display: none !important;
    }
    .panel-grid.single {
      grid-template-columns: minmax(0, 1fr);
    }
    @media (max-width: 1100px) {
      .app { grid-template-columns: 1fr; }
      .sidebar {
        position: fixed;
        inset: 0 auto 0 0;
        z-index: 9;
        width: min(264px, calc(100vw - 88px));
        height: 100vh;
        padding: 18px 12px;
        transform: translateX(-105%);
        transition: transform .22s ease;
        box-shadow: 20px 0 50px rgba(15, 23, 42, .28);
      }
      body.sidebar-open .sidebar { transform: translateX(0); }
      .nav-label { display: block; }
      .nav { display: grid; min-width: 0; }
      .mobile-menu-button { display: inline-flex; }
      .topbar::before { display: none; }
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .panel-grid { grid-template-columns: 1fr; }
      .doc-grid { grid-template-columns: 1fr; }
      .store-layout { grid-template-columns: 1fr; }
    }
    @media (max-width: 720px) {
      .sidebar { width: min(236px, calc(100vw - 72px)); }
      .topbar { align-items: center; flex-direction: row; padding: 16px; }
      main.content { padding: 20px 16px 36px; }
      .metrics { grid-template-columns: 1fr; }
      .panel-header { align-items: flex-start; flex-direction: column; }
      .topbar-actions { margin-left: auto; }
      .time-chip { display: none; }
    }
  </style>
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
    </aside>

    <div class="main">
      <header class="topbar">
        <button class="mobile-menu-button" type="button" data-sidebar-toggle aria-label="Open menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
        <div class="topbar-actions">
          <div class="time-chip">${escapeHtml(formatWibDateTime())}</div>
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
                      <td><span class="pill ${statusClass(callbackLabel(payment))}">${escapeHtml(callbackLabel(payment))}</span></td>
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
                        <td><span class="pill ${statusClass(callbackLabel(payment))}">${escapeHtml(callbackLabel(payment))}</span></td>
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
