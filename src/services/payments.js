import { config } from "../config.js";
import { readDb, updateDb } from "../storage.js";
import { convertQRIS, parseQRIS, validateQRIS } from "../qris/index.js";
import { randomId } from "../utils/security.js";
import { sendPaymentCallback } from "./callbacks.js";

const paymentIdAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generatePaymentId(existingPayments) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let suffix = "";
    for (let i = 0; i < 7; i += 1) {
      suffix += paymentIdAlphabet[Math.floor(Math.random() * paymentIdAlphabet.length)];
    }

    const id = `AL-${suffix}`;
    if (!existingPayments.some((payment) => payment.id === id)) return id;
  }

  throw Object.assign(new Error("Failed to generate unique payment ID"), {
    statusCode: 500,
  });
}

function normalizeAmount(value) {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw Object.assign(new Error("amount must be a positive integer"), {
      statusCode: 422,
    });
  }
  return amount;
}

export function createPayment(store, input) {
  const amount = normalizeAmount(input.amount);
  const staticQris = input.static_qris || store.static_qris || config.defaultStaticQris;

  if (!staticQris) {
    throw Object.assign(
      new Error("Static QRIS is not configured for this store"),
      { statusCode: 422 },
    );
  }

  const validation = validateQRIS(staticQris);
  if (!validation.valid) {
    throw Object.assign(new Error("Static QRIS is invalid"), {
      statusCode: 422,
      details: validation.errors,
    });
  }

  const qrString = convertQRIS(staticQris, {
    amount,
    fee: input.fee || null,
  });
  const qrisInfo = parseQRIS(qrString);
  const now = new Date();
  const expiresIn = Number(input.expires_in || 900);
  const expiredAt = new Date(now.getTime() + expiresIn * 1000);

  const db = readDb();
  const payment = {
    id: generatePaymentId(db.payments),
    store_id: store.id,
    external_id: String(input.external_id || randomId("ext")),
    amount,
    customer_name: input.customer_name || "",
    callback_url: input.callback_url || "",
    status: "pending",
    qr_string: qrString,
    qris_info: qrisInfo,
    expires_at: expiredAt.toISOString(),
    paid_at: null,
    matched_notification_id: null,
    callback_status: "pending",
    callback_last_error: null,
    callback_attempts: 0,
    callback_next_retry_at: null,
    callback_last_attempt_at: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  updateDb((db) => {
    const duplicate = db.payments.find(
      (item) =>
        item.store_id === store.id &&
        item.external_id === payment.external_id &&
        item.status !== "expired",
    );
    if (duplicate) {
      throw Object.assign(new Error("external_id already exists"), {
        statusCode: 409,
      });
    }
    db.payments.unshift(payment);
  });

  return payment;
}

export function listPayments(storeId = null) {
  const db = readDb();
  return db.payments.filter((payment) => !storeId || payment.store_id === storeId);
}

export function getPayment(paymentId, storeId = null) {
  const db = readDb();
  return db.payments.find(
    (payment) => payment.id === paymentId && (!storeId || payment.store_id === storeId),
  );
}

export function expireOldPayments() {
  const now = Date.now();

  return updateDb((db) => {
    let count = 0;
    for (const payment of db.payments) {
      if (payment.status === "pending" && Date.parse(payment.expires_at) <= now) {
        payment.status = "expired";
        payment.callback_status = "expired";
        payment.callback_last_error = "Payment expired before callback";
        payment.updated_at = new Date().toISOString();
        count += 1;
      }
    }
    return count;
  });
}

export async function markPaymentPaid(paymentId, notificationId) {
  let paidPayment = null;
  let store = null;

  updateDb((db) => {
    const payment = db.payments.find((item) => item.id === paymentId);
    if (!payment || payment.status !== "pending") return;

    const now = new Date().toISOString();
    payment.status = "paid";
    payment.paid_at = now;
    payment.updated_at = now;
    payment.matched_notification_id = notificationId;
    paidPayment = { ...payment };
    store = db.stores.find((item) => item.id === payment.store_id) || null;
  });

  if (paidPayment && store) {
    await sendPaymentCallback(paidPayment, store);
  }

  return paidPayment;
}
