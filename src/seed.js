import { readDb, writeDb } from "./storage.js";
import { createApiKey, createWebhookSecret, randomId } from "./utils/security.js";

const db = readDb();
const now = new Date().toISOString();

if (!db.stores.some((store) => store.id === "store_demo")) {
  db.stores.push({
    id: "store_demo",
    name: "Demo Store",
    webhook_secret: createWebhookSecret(),
    static_qris: "",
    created_at: now,
  });
}

if (!db.apiKeys.some((key) => key.store_id === "store_demo")) {
  db.apiKeys.push({
    id: randomId("key"),
    store_id: "store_demo",
    key: createApiKey(),
    name: "Demo API Key",
    active: true,
    created_at: now,
  });
}

writeDb(db);

console.log("Seed complete.");
console.log("Open dashboard to see generated API key and webhook secret.");
