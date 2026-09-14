/**
 * Minimal, dependency-free, store-only ZIP writer (architecture M2 §15 O7).
 *
 * Produces a valid ZIP archive with the "store" compression method (no deflate),
 * which is all the export bundle needs. Deterministic: a fixed DOS timestamp is
 * used, so identical inputs yield byte-identical archives.
 *
 * Server-only.
 */

/** One entry in the archive. */
export interface ZipEntry {
  /** POSIX-style relative path inside the archive. */
  path: string;
  content: string | Uint8Array;
}

// --- CRC-32 (IEEE 802.3) ---------------------------------------------------

let crcTableCache: Uint32Array | null = null;

function crcTable(): Uint32Array {
  if (crcTableCache) return crcTableCache;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  crcTableCache = table;
  return table;
}

/** Returns the unsigned 32-bit CRC-32 of the given bytes. */
export function crc32(bytes: Uint8Array): number {
  const table = crcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// --- Deterministic DOS timestamp ------------------------------------------

/** Fixed DOS date/time (2026-09-14 00:00:00) for byte-stable output. */
const DOS_TIME = 0;
const DOS_DATE = (((2026 - 1980) << 9) | (9 << 5) | 14) & 0xffff;

function toBytes(content: string | Uint8Array): Uint8Array {
  return typeof content === "string" ? Buffer.from(content, "utf8") : content;
}

/**
 * Builds a store-only ZIP archive from the given entries.
 * @returns the archive bytes.
 */
export function createZip(entries: ZipEntry[]): Uint8Array {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.path, "utf8");
    const data = Buffer.from(toBytes(entry.content));
    const crc = crc32(data);
    const size = data.length;

    // Local file header
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // general purpose flag: UTF-8 filename
    local.writeUInt16LE(0, 8); // method: store
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28); // extra length

    localChunks.push(local, nameBytes, data);

    // Central directory header
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8); // flags
    central.writeUInt16LE(0, 10); // method
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30); // extra length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42); // local header offset

    centralChunks.push(central, nameBytes);

    offset += local.length + nameBytes.length + data.length;
  }

  const centralSize = centralChunks.reduce((n, b) => n + b.length, 0);
  const centralOffset = offset;

  // End of central directory record
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central dir
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localChunks, ...centralChunks, eocd]);
}
