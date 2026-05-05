export function calculateCRC16(str) {
  let crc = 0xffff;

  for (let i = 0; i < str.length; i += 1) {
    crc ^= str.charCodeAt(i) << 8;

    for (let j = 0; j < 8; j += 1) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }

  return (crc & 0xffff).toString(16).toUpperCase().padStart(4, "0");
}
