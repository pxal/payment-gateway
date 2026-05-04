import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env");
const outputPath = path.join(
  root,
  "android-listener",
  "app",
  "src",
  "main",
  "java",
  "com",
  "alvian",
  "gatewaylistener",
  "AndroidDefaults.kt",
);

function readEnv(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const index = trimmed.indexOf("=");
    if (index === -1) continue;

    env[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }
  return env;
}

function kotlinString(value) {
  return JSON.stringify(String(value || ""));
}

const env = readEnv(envPath);
const baseUrl = env.BASE_URL || "http://localhost:1000";
const androidSecret = env.ANDROID_SHARED_SECRET || "change-this-android-secret";

const source = `package com.alvian.gatewaylistener

object AndroidDefaults {
    const val SERVER_URL = ${kotlinString(baseUrl)}
    const val ANDROID_SECRET = ${kotlinString(androidSecret)}
    const val ALLOWED_PACKAGES = "id.dana,ovo.id,com.gojek.gopay"
}
`;

fs.writeFileSync(outputPath, source);
console.log(`Android defaults synced from .env`);
console.log(`SERVER_URL=${baseUrl}`);
