export interface ZipEntryInput {
  name: string;
  data: Uint8Array | string;
  modifiedAt?: Date;
}

interface PreparedZipEntry {
  nameBytes: Uint8Array;
  data: Uint8Array;
  crc32: number;
  modifiedDate: number;
  modifiedTime: number;
}

const textEncoder = new TextEncoder();

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      if ((value & 1) === 1) {
        value = 0xedb88320 ^ (value >>> 1);
      } else {
        value >>>= 1;
      }
    }
    table[index] = value >>> 0;
  }

  return table;
})();

function toBytes(value: Uint8Array | string): Uint8Array {
  if (typeof value === 'string') {
    return textEncoder.encode(value);
  }

  return value;
}

function toDosDate(value: Date): number {
  const year = Math.max(1980, value.getFullYear());
  const month = value.getMonth() + 1;
  const day = value.getDate();
  return ((year - 1980) << 9) | (month << 5) | day;
}

function toDosTime(value: Date): number {
  const hours = value.getHours();
  const minutes = value.getMinutes();
  const seconds = Math.floor(value.getSeconds() / 2);
  return (hours << 11) | (minutes << 5) | seconds;
}

function mergeUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return merged;
}

export function crc32(bytes: Uint8Array): number {
  let checksum = 0xffffffff;

  for (const byte of bytes) {
    const lookupIndex = (checksum ^ byte) & 0xff;
    checksum = (checksum >>> 8) ^ CRC32_TABLE[lookupIndex];
  }

  return (checksum ^ 0xffffffff) >>> 0;
}

function prepareZipEntries(entries: ZipEntryInput[]): PreparedZipEntry[] {
  return entries.map((entry) => {
    const safeName = entry.name.replace(/^\/+/, '');
    const nameBytes = textEncoder.encode(safeName);
    const data = toBytes(entry.data);
    const modifiedAt = entry.modifiedAt ?? new Date();
    return {
      nameBytes,
      data,
      crc32: crc32(data),
      modifiedDate: toDosDate(modifiedAt),
      modifiedTime: toDosTime(modifiedAt),
    };
  });
}

export function createZipArchive(entries: ZipEntryInput[]): Uint8Array {
  const preparedEntries = prepareZipEntries(entries);
  const outputChunks: Uint8Array[] = [];
  const centralDirectoryChunks: Uint8Array[] = [];

  let offset = 0;

  for (const entry of preparedEntries) {
    const localHeader = new Uint8Array(30 + entry.nameBytes.length);
    const localView = new DataView(localHeader.buffer);

    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, entry.modifiedTime, true);
    localView.setUint16(12, entry.modifiedDate, true);
    localView.setUint32(14, entry.crc32, true);
    localView.setUint32(18, entry.data.length, true);
    localView.setUint32(22, entry.data.length, true);
    localView.setUint16(26, entry.nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(entry.nameBytes, 30);

    outputChunks.push(localHeader, entry.data);

    const centralHeader = new Uint8Array(46 + entry.nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);

    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, entry.modifiedTime, true);
    centralView.setUint16(14, entry.modifiedDate, true);
    centralView.setUint32(16, entry.crc32, true);
    centralView.setUint32(20, entry.data.length, true);
    centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, entry.nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(entry.nameBytes, 46);

    centralDirectoryChunks.push(centralHeader);

    offset += localHeader.length + entry.data.length;
  }

  const centralDirectory = mergeUint8Arrays(centralDirectoryChunks);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);

  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, preparedEntries.length, true);
  eocdView.setUint16(10, preparedEntries.length, true);
  eocdView.setUint32(12, centralDirectory.length, true);
  eocdView.setUint32(16, offset, true);
  eocdView.setUint16(20, 0, true);

  outputChunks.push(centralDirectory, eocd);
  return mergeUint8Arrays(outputChunks);
}
