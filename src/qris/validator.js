import { calculateCRC16 } from "./crc16.js";
import { parseTLV } from "./parser.js";

export function validateQRIS(qrisString) {
  const errors = [];
  const str = String(qrisString || "").trim();

  if (!str) return { valid: false, errors: ["QRIS string is empty"] };
  if (!str.startsWith("000201")) {
    errors.push('QRIS must start with Payload Format Indicator "000201"');
  }
  if (str.length < 20) errors.push("QRIS string is too short");

  if (str.length >= 8) {
    const dataWithoutCRC = str.substring(0, str.length - 4);
    const declaredCRC = str.substring(str.length - 4).toUpperCase();
    const calculatedCRC = calculateCRC16(dataWithoutCRC);
    if (declaredCRC !== calculatedCRC) {
      errors.push(`CRC mismatch: expected ${calculatedCRC}, got ${declaredCRC}`);
    }
  }

  const elements = parseTLV(str);
  const tags = new Set(elements.map((element) => element.tag));

  for (const tag of ["00", "01", "52", "53", "58", "59", "60", "63"]) {
    if (!tags.has(tag)) errors.push(`Missing required tag ${tag}`);
  }

  const method = elements.find((element) => element.tag === "01");
  if (method && !["11", "12"].includes(method.value)) {
    errors.push(`Invalid Point of Initiation Method: ${method.value}`);
  }

  const hasMerchant = elements.some((element) => {
    const tag = Number.parseInt(element.tag, 10);
    return tag >= 26 && tag <= 51;
  });
  if (!hasMerchant) errors.push("No Merchant Account Information found");

  return { valid: errors.length === 0, errors };
}
