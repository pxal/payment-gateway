import { config } from "../config.js";
import { updateDb } from "../storage.js";
import { hmacSha256, randomId } from "../utils/security.js";

export async function sendPaymentCallback(payment, store) {
  if (!payment.callback_url) {
    return { skipped: true, reason: "No callback_url" };
  }

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

  let log;
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
    log = {
      id: randomId("cb"),
      payment_id: payment.id,
      url: payment.callback_url,
      status_code: response.status,
      success: response.ok,
      response_body: responseText.slice(0, 1000),
      error: null,
      created_at: startedAt,
    };
  } catch (error) {
    log = {
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

  updateDb((db) => {
    db.callbacks.unshift(log);
    const storedPayment = db.payments.find((item) => item.id === payment.id);
    if (storedPayment) {
      storedPayment.callback_status = log.success ? "sent" : "failed";
      storedPayment.callback_last_error = log.error;
      storedPayment.updated_at = new Date().toISOString();
    }
  });

  return log;
}
