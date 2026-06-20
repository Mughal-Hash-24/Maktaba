// scripts/utils/binary-packer.ts
import { writeFile } from 'node:fs/promises';
import type { SectionChunk } from '../types.js';

/**
 * Converts a JS number (float32) into a uint16 representing an IEEE 754 half-precision float (float16).
 */
export function float32ToFloat16(val: number): number {
  const floatView = new Float32Array(1);
  const int32View = new Int32Array(floatView.buffer);

  floatView[0] = val;
  const f = int32View[0];

  const sign = (f >> 16) & 0x8000;
  let exponent = ((f >> 23) & 0xff) - 127;
  let mantissa = f & 0x007fffff;

  if (exponent <= -15) {
    // Underflow / Subnormal
    if (exponent < -24) {
      return sign; // returns signed zero
    }
    mantissa = (mantissa | 0x00800000) >> (-1 - exponent);
    return sign | mantissa;
  } else if (exponent >= 16) {
    // Overflow / NaN / Infinity
    return sign | 0x7c00 | (mantissa ? 1 : 0);
  } else {
    exponent = (exponent + 15) << 10;
    mantissa = mantissa >> 13;
    return sign | exponent | mantissa;
  }
}

/**
 * Unpacks a uint16 representing a float16 into a standard JS number.
 */
export function float16ToFloat32(h: number): number {
  const s = (h & 0x8000) >> 15;
  const e = (h & 0x7c00) >> 10;
  const m = h & 0x03ff;

  if (e === 0) {
    if (m === 0) {
      return s ? -0.0 : 0.0;
    }
    return (s ? -1 : 1) * Math.pow(2, -14) * (m / 1024);
  } else if (e === 31) {
    return m ? NaN : (s ? -Infinity : Infinity);
  }

  return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + m / 1024);
}

interface EmbedSectionMeta {
  sectionId: string;
  noteSlug: string;
  breadcrumb: string;
}

export async function packEmbeddings(
  sections: SectionChunk[],
  vectors: number[][],
  outputPath: string
): Promise<void> {
  const sectionCount = sections.length;
  if (sectionCount === 0) {
    throw new Error('Cannot pack empty section list');
  }

  const vectorDim = vectors[0].length; // should be 768

  // 1. Build Header: 8 bytes
  const header = Buffer.alloc(8);
  header.write('MKTB', 0, 'ascii'); // Magic bytes
  header.writeUInt16LE(1, 4);        // Version = 1
  header.writeUInt16LE(sectionCount, 6); // Section count

  // 2. Build Section Metadata Block
  const metaBuffers: Buffer[] = [];
  for (const sec of sections) {
    const meta: EmbedSectionMeta = {
      sectionId: sec.sectionId,
      noteSlug: sec.noteSlug,
      breadcrumb: sec.breadcrumb,
    };
    const jsonStr = JSON.stringify(meta);
    metaBuffers.push(Buffer.from(jsonStr, 'utf-8'));
    metaBuffers.push(Buffer.from([0])); // null byte separator
  }
  metaBuffers.push(Buffer.from([0])); // double null byte terminator
  const metadataBlock = Buffer.concat(metaBuffers);

  // 3. Build Vector Block
  const vectorBlock = Buffer.alloc(sectionCount * vectorDim * 2);
  let offset = 0;
  for (const vector of vectors) {
    for (const val of vector) {
      const f16 = float32ToFloat16(val);
      vectorBlock.writeUInt16LE(f16, offset);
      offset += 2;
    }
  }

  // Combine all buffers
  const finalFileBuffer = Buffer.concat([header, metadataBlock, vectorBlock]);
  await writeFile(outputPath, finalFileBuffer);
}
