import { updateDb } from "../storage.js";
import { randomId } from "../utils/security.js";
import { expireOldPayments, markPaymentPaid } from "./payments.js";

function parseIndonesianAmount(text) {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const patterns = [
    /nominal\s*:\s*(?:rp\.?\s*)?([0-9][0-9.,]*)/i,
    /jumlah\s*:\s*(?:rp\.?\s*)?([0-9][0-9.,]*)/i,
    /amount\s*:\s*(?:rp\.?\s*)?([0-9][0-9.,]*)/i,
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

function isSameNotification(left, right) {
  return (
    left.package_name === right.package_name &&
    left.title === right.title &&
    left.text === right.text &&
    left.big_text === right.big_text
  );
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
    source: input.source || "android",
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
  let duplicateNotification = null;

  updateDb((db) => {
    duplicateNotification = db.notifications.find((item) => {
      const createdAt = Date.parse(item.created_at || item.received_at || "");
      return (
        isSameNotification(item, notification) &&
        Number.isFinite(createdAt) &&
        Date.now() - createdAt < 5 * 60 * 1000
      );
    });

    if (duplicateNotification) {
      notification.id = duplicateNotification.id;
      notification.status = "duplicate";
      notification.matched_payment_id = duplicateNotification.matched_payment_id || null;
      return;
    }

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
  if (matchedPayment && !duplicateNotification) {
    paidPayment = await markPaymentPaid(matchedPayment.id, notification.id);
  }

  return { notification, payment: paidPayment, duplicate: Boolean(duplicateNotification) };
}

export async function recordWhatsAppMessage(input) {
  return recordAndroidNotification({
    source: "whatsapp",
    package_name: "com.whatsapp",
    title: firstString(input.chat_name, input.chatName, input.sender, input.from, "WhatsApp"),
    text: firstString(input.text, input.message, input.body),
    big_text: firstString(input.big_text, input.bigText, input.caption),
    received_at: input.received_at || input.receivedAt || new Date().toISOString(),
  });
}
