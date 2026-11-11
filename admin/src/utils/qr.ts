// Minimal self-contained ISO 18004 QR Code matrix & SVG generator (Byte mode, ECC Level M)
// Keeps otpauth:// TOTP enrollment 100% local in the browser without external network calls.

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    const root = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

function rsRemainder(data: number[], ecLen: number): number[] {
  const gen = rsGeneratorPoly(ecLen);
  const res = new Array<number>(data.length + ecLen).fill(0);
  for (let i = 0; i < data.length; i++) res[i] = data[i];
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        res[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return res.slice(data.length);
}

type VersionSpec = {
  version: number;
  size: number;
  totalDataBytes: number;
  ecPerBlock: number;
  g1Blocks: number;
  g1Data: number;
  g2Blocks: number;
  g2Data: number;
  alignment: number[];
};

// Versions 1..9 at Error Correction Level M (byte count fits in 8 bits up to 180 bytes)
const ECC_M_VERSIONS: VersionSpec[] = [
  { version: 1, size: 21, totalDataBytes: 16, ecPerBlock: 10, g1Blocks: 1, g1Data: 16, g2Blocks: 0, g2Data: 0, alignment: [] },
  { version: 2, size: 25, totalDataBytes: 28, ecPerBlock: 16, g1Blocks: 1, g1Data: 28, g2Blocks: 0, g2Data: 0, alignment: [6, 18] },
  { version: 3, size: 29, totalDataBytes: 44, ecPerBlock: 26, g1Blocks: 1, g1Data: 44, g2Blocks: 0, g2Data: 0, alignment: [6, 22] },
  { version: 4, size: 33, totalDataBytes: 64, ecPerBlock: 18, g1Blocks: 2, g1Data: 32, g2Blocks: 0, g2Data: 0, alignment: [6, 26] },
  { version: 5, size: 37, totalDataBytes: 86, ecPerBlock: 24, g1Blocks: 2, g1Data: 43, g2Blocks: 0, g2Data: 0, alignment: [6, 30] },
  { version: 6, size: 41, totalDataBytes: 108, ecPerBlock: 16, g1Blocks: 4, g1Data: 27, g2Blocks: 0, g2Data: 0, alignment: [6, 34] },
  { version: 7, size: 45, totalDataBytes: 124, ecPerBlock: 18, g1Blocks: 4, g1Data: 31, g2Blocks: 0, g2Data: 0, alignment: [6, 22, 38] },
  { version: 8, size: 49, totalDataBytes: 154, ecPerBlock: 22, g1Blocks: 2, g1Data: 38, g2Blocks: 2, g2Data: 39, alignment: [6, 24, 42] },
  { version: 9, size: 53, totalDataBytes: 182, ecPerBlock: 22, g1Blocks: 3, g1Data: 36, g2Blocks: 2, g2Data: 37, alignment: [6, 26, 46] },
];

const VERSION_BCH_INFOS: Record<number, number> = {
  7: 0x07c94,
  8: 0x085bc,
  9: 0x09a99,
};

function computeFormatBits(mask: number): number {
  // ECC level M = 00 -> 5-bit data = mask (0..7)
  const data = mask & 0x7;
  let d = data << 10;
  for (let i = 4; i >= 0; i--) {
    if ((d >>> (i + 10)) & 1) {
      d ^= 0x537 << i;
    }
  }
  return ((data << 10) | d) ^ 0x5412;
}

export function generateQrSvgMarkup(text: string): string {
  const payload = new TextEncoder().encode(text);
  const spec = ECC_M_VERSIONS.find((v) => payload.length + 2 <= v.totalDataBytes);
  if (!spec) {
    return "";
  }

  // Encode byte stream: mode(0100), len(8 bits), data, terminator, pad bytes
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  pushBits(0b0100, 4);
  pushBits(payload.length, 8);
  for (const b of payload) pushBits(b, 8);
  const maxBits = spec.totalDataBytes * 8;
  const term = Math.min(4, maxBits - bits.length);
  for (let i = 0; i < term; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const dataBytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    dataBytes.push(b);
  }
  const padBytes = [0xec, 0x11];
  for (let p = 0; dataBytes.length < spec.totalDataBytes; p++) {
    dataBytes.push(padBytes[p % 2]);
  }

  // Split into RS blocks and interleave
  const blocks: number[][] = [];
  const eccBlocks: number[][] = [];
  let offset = 0;
  for (let i = 0; i < spec.g1Blocks; i++) {
    const slice = dataBytes.slice(offset, offset + spec.g1Data);
    blocks.push(slice);
    eccBlocks.push(rsRemainder(slice, spec.ecPerBlock));
    offset += spec.g1Data;
  }
  for (let i = 0; i < spec.g2Blocks; i++) {
    const slice = dataBytes.slice(offset, offset + spec.g2Data);
    blocks.push(slice);
    eccBlocks.push(rsRemainder(slice, spec.ecPerBlock));
    offset += spec.g2Data;
  }

  const finalBytes: number[] = [];
  const maxDataLen = Math.max(spec.g1Data, spec.g2Data);
  for (let c = 0; c < maxDataLen; c++) {
    for (const b of blocks) if (c < b.length) finalBytes.push(b[c]);
  }
  for (let c = 0; c < spec.ecPerBlock; c++) {
    for (const ec of eccBlocks) finalBytes.push(ec[c]);
  }

  const finalBits: number[] = [];
  for (const b of finalBytes) {
    for (let i = 7; i >= 0; i--) finalBits.push((b >>> i) & 1);
  }
  // Remainder zero bits (V2..V6 have 7 remainder bits; V7..V9 have 0; padded grid ignores harmlessly if placed carefully)
  for (let i = 0; i < 8; i++) finalBits.push(0);

  const n = spec.size;
  const grid = Array.from({ length: n }, () => new Int8Array(n));
  const reserved = Array.from({ length: n }, () => new Uint8Array(n));

  const setFixed = (r: number, c: number, dark: boolean) => {
    if (r >= 0 && r < n && c >= 0 && c < n) {
      grid[r][c] = dark ? 1 : 0;
      reserved[r][c] = 1;
    }
  };

  const placeFinder = (row: number, col: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || r >= n || c < 0 || c >= n) continue;
        const inOuter = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        const onBorder = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        setFixed(r, c, onBorder && (inOuter || inInner));
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, n - 7);
  placeFinder(n - 7, 0);

  for (const ar of spec.alignment) {
    for (const ac of spec.alignment) {
      if (reserved[ar][ac]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dark =
            Math.max(Math.abs(dr), Math.abs(dc)) === 2 || (dr === 0 && dc === 0);
          setFixed(ar + dr, ac + dc, dark);
        }
      }
    }
  }

  for (let i = 8; i < n - 8; i++) {
    if (!reserved[6][i]) setFixed(6, i, i % 2 === 0);
    if (!reserved[i][6]) setFixed(i, 6, i % 2 === 0);
  }

  // Dark module & reserve format info areas
  setFixed(n - 8, 8, true);
  for (let i = 0; i < 9; i++) {
    if (!reserved[8][i]) reserved[8][i] = 1;
    if (!reserved[i][8]) reserved[i][8] = 1;
  }
  for (let i = n - 8; i < n; i++) {
    reserved[8][i] = 1;
    reserved[i][8] = 1;
  }

  if (spec.version >= 7 && VERSION_BCH_INFOS[spec.version]) {
    const vBits = VERSION_BCH_INFOS[spec.version];
    for (let i = 0; i < 18; i++) {
      const bit = Boolean((vBits >>> i) & 1);
      const a = Math.floor(i / 3);
      const b = i % 3;
      setFixed(a, n - 11 + b, bit);
      setFixed(n - 11 + b, a, bit);
    }
  }

  // Place data bits in zig-zag order
  let bitIdx = 0;
  let up = true;
  for (let col = n - 1; col >= 1; col -= 2) {
    if (col === 6) col--;
    for (let step = 0; step < n; step++) {
      const r = up ? n - 1 - step : step;
      for (let dc = 0; dc <= 1; dc++) {
        const c = col - dc;
        if (!reserved[r][c]) {
          const bit = bitIdx < finalBits.length ? finalBits[bitIdx++] : 0;
          grid[r][c] = bit;
        }
      }
    }
    up = !up;
  }

  // Apply Mask Pattern 2 ((c % 3) === 0) and write format bits
  const maskId = 2;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!reserved[r][c] && c % 3 === 0) {
        grid[r][c] ^= 1;
      }
    }
  }

  const fmt = computeFormatBits(maskId);
  for (let i = 0; i < 15; i++) {
    const bit = ((fmt >>> i) & 1) === 1;
    // Vertical
    if (i < 6) grid[i][8] = bit ? 1 : 0;
    else if (i < 8) grid[i + 1][8] = bit ? 1 : 0;
    else grid[n - 15 + i][8] = bit ? 1 : 0;
    // Horizontal
    if (i < 8) grid[8][n - 1 - i] = bit ? 1 : 0;
    else if (i < 9) grid[8][15 - i] = bit ? 1 : 0;
    else grid[8][15 - i - 1] = bit ? 1 : 0;
  }

  const rects: string[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (grid[r][c] === 1) {
        rects.push(`<rect x="${c + 2}" y="${r + 2}" width="1" height="1"/>`);
      }
    }
  }
  const viewSize = n + 4;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" width="200" height="200" role="img" aria-label="Authenticator QR Code"><rect width="100%" height="100%" fill="#ffffff"/><g fill="#1c1512">${rects.join("")}</g></svg>`;
}

