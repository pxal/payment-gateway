import crypto from "node:crypto";

export function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

export function hmacSha256(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function signValue(value, secret) {
  return `${value}.${hmacSha256(value, secret)}`;
}

export function verifySignedValue(signedValue, secret) {
  const [value, signature] = String(signedValue || "").split(".");
  if (!value || !signature) return null;

  const expected = hmacSha256(value, secret);
  if (!timingSafeEqualString(signature, expected)) return null;
  return value;
}

export function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function createApiKey() {
  return `gw_live_${crypto.randomBytes(48).toString("base64url")}`;
}

export function createWebhookSecret() {
  return `whsec_${crypto.randomBytes(48).toString("base64url")}`;
}
