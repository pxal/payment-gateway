import { readDb, writeDb } from "./storage.js";
import { createApiKey, createMerchantId, createWebhookSecret, randomId } from "./utils/security.js";

const db = readDb();
const now = new Date().toISOString();

if (!db.stores.length) {
  const storeId = createMerchantId(db.stores);
  db.stores.push({
    id: storeId,
    name: "Demo Store",
    webhook_secret: createWebhookSecret(),
    static_qris: "",
    created_at: now,
  });

  db.apiKeys.push({
    id: randomId("key"),
    store_id: storeId,
    key: createApiKey(),
    name: "Demo API Key",
    active: true,
    created_at: now,
  });
}

writeDb(db);

console.log("Seed complete.");
console.log("Open dashboard to see generated API key and webhook secret.");
