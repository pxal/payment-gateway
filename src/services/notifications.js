import { updateDb } from "../storage.js";
import { randomId } from "../utils/security.js";
import { expireOldPayments, markPaymentPaid } from "./payments.js";

function parseIndonesianAmount(text) {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const patterns = [
    /rp\.?\s*([0-9][0-9.,]*)/i,
    /idr\s*([0-9][0-9.,]*)/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;

    const digits = match[1].replace(/[.,]/g, "");
    const amount = Number.parseInt(digits, 10);
    if (Number.isInteger(amount) && amount > 0) return amount;
  }

  return null;
}

function firstString(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function normalizeReceivedAt(input) {
  const value = input.received_at || input.receivedAt || input.post_time || input.postTime;
  if (!value) return new Date().toISOString();

  if (typeof value === "number") {
    return new Date(value).toISOString();
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
}

export async function recordAndroidNotification(input) {
  expireOldPayments();

  const title = firstString(input.title, input.app_name, input.appName);
  const bodyText = firstString(input.text, input.content, input.message, input.body);
  const bigText = firstString(input.big_text, input.bigText, input.extra_text, input.extraText);
  const packageName = firstString(input.package_name, input.packageName, input.pkg);
  const text = [title, bodyText, bigText].filter(Boolean).join(" ");
  const amount = Number(input.amount || parseIndonesianAmount(text));
  const notification = {
    id: randomId("ntf"),
    package_name: packageName,
    title,
    text: bodyText,
    big_text: bigText,
    parsed_amount: Number.isInteger(amount) && amount > 0 ? amount : null,
    received_at: normalizeReceivedAt(input),
    matched_payment_id: null,
    status: "unmatched",
    created_at: new Date().toISOString(),
  };

  let matchedPayment = null;

  updateDb((db) => {
    if (notification.parsed_amount) {
      matchedPayment = db.payments
        .filter(
          (payment) =>
            payment.status === "pending" &&
            payment.amount === notification.parsed_amount &&
            Date.parse(payment.expires_at) > Date.now(),
        )
        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0];

      if (matchedPayment) {
        notification.matched_payment_id = matchedPayment.id;
        notification.status = "matched";
      }
    }

    db.notifications.unshift(notification);
  });

  let paidPayment = null;
  if (matchedPayment) {
    paidPayment = await markPaymentPaid(matchedPayment.id, notification.id);
  }

  return { notification, payment: paidPayment };
}
