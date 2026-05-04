const TAG_NAMES = {
  "00": "Payload Format Indicator",
  "01": "Point of Initiation Method",
  "26": "Merchant Account Information",
  "27": "Merchant Account Information",
  "28": "Merchant Account Information",
  "29": "Merchant Account Information",
  "30": "Merchant Account Information",
  "31": "Merchant Account Information",
  "32": "Merchant Account Information",
  "33": "Merchant Account Information",
  "34": "Merchant Account Information",
  "35": "Merchant Account Information",
  "36": "Merchant Account Information",
  "37": "Merchant Account Information",
  "38": "Merchant Account Information",
  "39": "Merchant Account Information",
  "40": "Merchant Account Information",
  "41": "Merchant Account Information",
  "42": "Merchant Account Information",
  "43": "Merchant Account Information",
  "44": "Merchant Account Information",
  "45": "Merchant Account Information",
  "46": "Merchant Account Information",
  "47": "Merchant Account Information",
  "48": "Merchant Account Information",
  "49": "Merchant Account Information",
  "50": "Merchant Account Information",
  "51": "Merchant Account Information",
  "52": "Merchant Category Code",
  "53": "Transaction Currency",
  "54": "Transaction Amount",
  "55": "Tip or Convenience Indicator",
  "56": "Value of Convenience Fee Fixed",
  "57": "Value of Convenience Fee Percentage",
  "58": "Country Code",
  "59": "Merchant Name",
  "60": "Merchant City",
  "61": "Postal Code",
  "62": "Additional Data Field",
  "63": "CRC",
};

const NESTED_TAGS = new Set([
  ...Array.from({ length: 26 }, (_, i) => String(i + 26).padStart(2, "0")),
  "62",
]);

export function parseTLV(data) {
  const elements = [];
  let pos = 0;

  while (pos < data.length) {
    if (pos + 4 > data.length) break;

    const tag = data.substring(pos, pos + 2);
    const length = Number.parseInt(data.substring(pos + 2, pos + 4), 10);
    if (Number.isNaN(length) || pos + 4 + length > data.length) break;

    const value = data.substring(pos + 4, pos + 4 + length);
    const element = {
      tag,
      name: TAG_NAMES[tag] || `Unknown (${tag})`,
      length,
      value,
    };

    if (NESTED_TAGS.has(tag)) {
      element.children = parseTLV(value);
    }

    elements.push(element);
    pos += 4 + length;
  }

  return elements;
}

export function parseQRIS(qrisString) {
  const raw = parseTLV(qrisString.trim());
  const findTag = (tag) => raw.find((item) => item.tag === tag);
  const methodValue = findTag("01")?.value;

  return {
    version: findTag("00")?.value || "01",
    method: methodValue === "12" ? "dynamic" : "static",
    amount: findTag("54")?.value || null,
    currency: findTag("53")?.value || "360",
    countryCode: findTag("58")?.value || "ID",
    merchantName: findTag("59")?.value || "",
    merchantCity: findTag("60")?.value || "",
    crc: findTag("63")?.value || "",
    raw,
  };
}
