export interface ParsedZipEntry {
  name: string;
  data: Uint8Array;
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function parseStoredZipEntries(archive: Uint8Array): ParsedZipEntry[] {
  const entries: ParsedZipEntry[] = [];
  let offset = 0;

  while (offset + 30 <= archive.length) {
    const view = new DataView(archive.buffer, archive.byteOffset + offset);
    const signature = view.getUint32(0, true);

    if (signature === 0x02014b50 || signature === 0x06054b50) {
      break;
    }

    if (signature !== 0x04034b50) {
      throw new Error(`ZIP invalido: firma local inesperada en offset ${offset}.`);
    }

    const compressionMethod = view.getUint16(8, true);
    if (compressionMethod !== 0) {
      throw new Error(`ZIP invalido: solo se soportan entradas store, no metodo ${compressionMethod}.`);
    }

    const compressedSize = view.getUint32(18, true);
    const fileNameLength = view.getUint16(26, true);
    const extraFieldLength = view.getUint16(28, true);
    const nameOffset = offset + 30;
    const dataOffset = nameOffset + fileNameLength + extraFieldLength;
    const dataEnd = dataOffset + compressedSize;

    if (dataEnd > archive.length) {
      throw new Error('ZIP invalido: una entrada excede el tamano del archivo.');
    }

    const name = decodeUtf8(archive.slice(nameOffset, nameOffset + fileNameLength));
    const data = archive.slice(dataOffset, dataEnd);
    entries.push({ name, data });

    offset = dataEnd;
  }

  return entries;
}

export function extractZipEntryText(archive: Uint8Array, entryName: string): string | null {
  const entry = parseStoredZipEntries(archive).find((item) => item.name === entryName);
  if (!entry) {
    return null;
  }

  return decodeUtf8(entry.data);
}
