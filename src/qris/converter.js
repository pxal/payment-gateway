import { calculateCRC16 } from "./crc16.js";
import { parseTLV } from "./parser.js";

function buildTLVString(elements) {
  return elements
    .map((element) => {
      const value = element.children ? buildTLVString(element.children) : element.value;
      const length = value.length.toString().padStart(2, "0");
      return `${element.tag}${length}${value}`;
    })
    .join("");
}

function makeTLV(tag, value, name = "") {
  return { tag, name, length: value.length, value };
}

export function convertQRIS(qrisString, options) {
  const amount = Number(options.amount);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Amount must be a positive integer");
  }

  const elements = parseTLV(qrisString.trim());
  const result = [];
  const managedTags = new Set(["54", "55", "56", "57", "63"]);
  let amountInserted = false;

  for (const element of elements) {
    if (managedTags.has(element.tag)) continue;

    if (element.tag === "01") {
      result.push(makeTLV("01", "12", "Point of Initiation Method"));
      continue;
    }

    if (element.tag === "58" && !amountInserted) {
      result.push(makeTLV("54", String(amount), "Transaction Amount"));

      if (options.fee?.type === "fixed") {
        result.push(makeTLV("55", "02", "Tip or Convenience Indicator"));
        result.push(makeTLV("56", String(options.fee.value), "Fixed Fee"));
      }

      if (options.fee?.type === "percentage") {
        result.push(makeTLV("55", "03", "Tip or Convenience Indicator"));
        result.push(makeTLV("57", String(options.fee.value), "Percentage Fee"));
      }

      amountInserted = true;
    }

    result.push(element);
  }

  if (!amountInserted) {
    throw new Error("Invalid QRIS: country tag 58 was not found");
  }

  const withoutCRC = buildTLVString(result);
  const crcInput = `${withoutCRC}6304`;
  return `${crcInput}${calculateCRC16(crcInput)}`;
}
