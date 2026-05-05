import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env");

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

export const config = {
  port: Number(process.env.PORT || 3000),
  baseUrl: process.env.BASE_URL || "http://localhost:3000",
  adminToken: process.env.ADMIN_TOKEN || "change-this-admin-token",
  androidSharedSecret:
    process.env.ANDROID_SHARED_SECRET || "change-this-android-secret",
  defaultStaticQris: process.env.DEFAULT_STATIC_QRIS || "",
  callbackTimeoutMs: Number(process.env.CALLBACK_TIMEOUT_MS || 8000),
};
