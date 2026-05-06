import { readDb } from "../storage.js";
import { timingSafeEqualString } from "../utils/security.js";

export function getBearerToken(req) {
  const header = req.headers.authorization || "";
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
}

export function authenticateStore(req) {
  const token = getBearerToken(req);
  if (!token) return null;

  const merchantId = String(req.headers["x-merchant-id"] || "").trim();
  if (!merchantId) {
    return { error: "Merchant ID is required" };
  }

  const db = readDb();
  const apiKey = db.apiKeys.find(
    (item) => item.active && timingSafeEqualString(item.key, token),
  );
  if (!apiKey) return null;

  const store = db.stores.find((item) => item.id === apiKey.store_id);
  if (!store) return null;
  if (!timingSafeEqualString(store.id, merchantId)) {
    return { error: "Invalid Merchant ID" };
  }

  return { store, apiKey };
}
