import { config } from "../config.js";
import { readDb, updateDb } from "../storage.js";
import { hmacSha256, randomId } from "../utils/security.js";

const RETRY_DELAYS_MS = [
  30 * 1000,
  60 * 1000,
  5 * 60 * 1000,
  15 * 60 * 1000,
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
];

export const MAX_CALLBACK_ATTEMPTS = RETRY_DELAYS_MS.length;

function callbackHttpError(response, responseText) {
  if (response.ok) return null;
  const body = responseText.trim().slice(0, 300);
  return body ? `HTTP ${response.status}: ${body}` : `HTTP ${response.status}: ${response.statusText}`;
}

function nextRetryAt(attempts) {
  if (attempts >= RETRY_DELAYS_MS.length) return null;
  return new Date(Date.now() + RETRY_DELAYS_MS[attempts]).toISOString();
}

async function performCallback(payment, store) {
  const payload = {
    payment_id: payment.id,
    external_id: payment.external_id,
    amount: payment.amount,
    status: payment.status,
    paid_at: payment.paid_at,
  };
  const body = JSON.stringify(payload);
  const signature = hmacSha256(body, store.webhook_secret);
  const startedAt = new Date().toISOString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.callbackTimeoutMs);

  try {
    const response = await fetch(payment.callback_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Signature": signature,
      },
      body,
      signal: controller.signal,
    });

    const responseText = await response.text();
    const errorText = callbackHttpError(response, responseText);
    return {
      id: randomId("cb"),
      payment_id: payment.id,
      url: payment.callback_url,
      status_code: response.status,
      success: response.ok,
      response_body: responseText.slice(0, 1000),
      error: errorText,
      created_at: startedAt,
    };
  } catch (error) {
    return {
      id: randomId("cb"),
      payment_id: payment.id,
      url: payment.callback_url,
      status_code: null,
      success: false,
      response_body: "",
      error: error.name === "AbortError" ? "Callback timeout" : error.message,
      created_at: startedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function persistCallbackResult(paymentId, log) {
  updateDb((db) => {
    db.callbacks.unshift(log);
    const storedPayment = db.payments.find((item) => item.id === paymentId);
    if (!storedPayment) return;

    const attempts = (storedPayment.callback_attempts || 0) + 1;
    storedPayment.callback_attempts = attempts;
    storedPayment.callback_last_attempt_at = log.created_at;
    storedPayment.callback_last_error = log.error;
    storedPayment.updated_at = new Date().toISOString();

    if (log.success) {
      storedPayment.callback_status = "sent";
      storedPayment.callback_next_retry_at = null;
      return;
    }

    if (attempts >= MAX_CALLBACK_ATTEMPTS) {
      storedPayment.callback_status = "exhausted";
      storedPayment.callback_next_retry_at = null;
      return;
    }

    storedPayment.callback_status = "failed";
    storedPayment.callback_next_retry_at = nextRetryAt(attempts);
  });
}

export async function sendPaymentCallback(payment, store) {
  if (!payment.callback_url) {
    updateDb((db) => {
      const stored = db.payments.find((item) => item.id === payment.id);
      if (!stored) return;
      stored.callback_status = "skipped";
      stored.callback_next_retry_at = null;
      stored.updated_at = new Date().toISOString();
    });
    return { skipped: true, reason: "No callback_url" };
  }

  const log = await performCallback(payment, store);
  persistCallbackResult(payment.id, log);
  return log;
}

export async function runDueCallbacks() {
  const now = Date.now();
  const db = readDb();
  const due = db.payments.filter(
    (payment) =>
      payment.status === "paid" &&
      payment.callback_status === "failed" &&
      payment.callback_url &&
      payment.callback_next_retry_at &&
      Date.parse(payment.callback_next_retry_at) <= now,
  );

  if (!due.length) return { processed: 0 };

  const storesById = new Map(db.stores.map((store) => [store.id, store]));
  let processed = 0;

  for (const payment of due) {
    const store = storesById.get(payment.store_id);
    if (!store) continue;

    const log = await performCallback(payment, store);
    persistCallbackResult(payment.id, log);
    processed += 1;
  }

  return { processed };
}

export async function retryPaymentCallback(paymentId) {
  const db = readDb();
  const payment = db.payments.find((item) => item.id === paymentId);
  if (!payment) {
    return { ok: false, error: "Payment not found", statusCode: 404 };
  }
  if (payment.status !== "paid") {
    return { ok: false, error: "Payment is not paid", statusCode: 422 };
  }
  if (!payment.callback_url) {
    return { ok: false, error: "Payment has no callback_url", statusCode: 422 };
  }

  const store = db.stores.find((item) => item.id === payment.store_id);
  if (!store) {
    return { ok: false, error: "Store not found", statusCode: 404 };
  }

  const log = await performCallback(payment, store);
  persistCallbackResult(payment.id, log);
  return { ok: true, log };
}

let pollerHandle = null;

export function startCallbackRetryPoller(intervalMs = 15000) {
  if (pollerHandle) return pollerHandle;

  let running = false;
  pollerHandle = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await runDueCallbacks();
    } catch (error) {
      console.error(`[callback-retry] poll failed: ${error.message}`);
    } finally {
      running = false;
    }
  }, intervalMs);

  pollerHandle.unref?.();
  return pollerHandle;
}

export function stopCallbackRetryPoller() {
  if (!pollerHandle) return;
  clearInterval(pollerHandle);
  pollerHandle = null;
}
