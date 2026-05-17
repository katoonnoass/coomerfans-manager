import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const assetsDir = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

async function generateIcons() {
  const sizes = [256, 32, 16];

  for (const size of sizes) {
    const channels = 4;
    const pixels = Buffer.alloc(size * size * channels);
    const cx = (size - 1) / 2;
    const cy = (size - 1) / 2;
    const outerR = size / 2 - 1;
    const innerR = outerR * 0.85;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * channels;
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);

        if (dist <= outerR) {
          const t = x / (size - 1);
          const angle = Math.atan2(y - cy, x - cx);
          const pulse = Math.sin(angle * 3) * 0.3 + 0.7;

          if (dist <= innerR) {
            const rr = Math.round((12 + t * 10) * pulse);
            const gg = Math.round((5 + t * 8) * pulse);
            const bb = Math.round((15 + t * 10) * pulse);
            pixels[i] = Math.min(255, rr);
            pixels[i + 1] = Math.min(255, gg);
            pixels[i + 2] = Math.min(255, bb);
            pixels[i + 3] = 255;
          } else {
            const edgeT = (dist - innerR) / (outerR - innerR);
            const rr = Math.round((100 + t * 155));
            const gg = Math.round((20 + t * 235));
            const bb = 255;
            const alpha = Math.round(200 + edgeT * 55);
            pixels[i] = Math.min(255, rr);
            pixels[i + 1] = Math.min(255, gg);
            pixels[i + 2] = Math.min(255, bb);
            pixels[i + 3] = Math.min(255, alpha);
          }
        }
      }
    }

    const pngBuffer = await sharp(pixels, {
      raw: { width: size, height: size, channels },
    }).png().toBuffer();

    fs.writeFileSync(path.join(assetsDir, `tray-icon-${size}.png`), pngBuffer);
    console.log(`Generated tray-icon-${size}.png (${pngBuffer.length} bytes)`);
  }

  // Build ICO with 256, 32, 16
  const pngs = sizes.map((s) => fs.readFileSync(path.join(assetsDir, `tray-icon-${s}.png`)));

  const entries = sizes.length;
  const headerSize = 6;
  const entrySize = 16;
  let offset = headerSize + entries * entrySize;

  const offsets = sizes.map(() => { const o = offset; offset += pngs[sizes.indexOf(o)]?.length || 0; return o; });
  // Recalculate properly
  const realOffsets: number[] = [];
  let currentOffset = headerSize + entries * entrySize;
  for (let idx = 0; idx < entries; idx++) {
    realOffsets.push(currentOffset);
    currentOffset += pngs[idx].length;
  }

  const totalSize = currentOffset;
  const ico = Buffer.alloc(totalSize);
  ico.writeUInt16LE(0, 0);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(entries, 4);

  for (let idx = 0; idx < entries; idx++) {
    const s = sizes[idx];
    const entryBase = headerSize + idx * entrySize;
    const w = s >= 256 ? 0 : s;
    const h = s >= 256 ? 0 : s;
    ico.writeUInt8(w, entryBase);
    ico.writeUInt8(h, entryBase + 1);
    ico.writeUInt8(0, entryBase + 2);
    ico.writeUInt8(0, entryBase + 3);
    ico.writeUInt16LE(1, entryBase + 4);
    ico.writeUInt16LE(32, entryBase + 6);
    ico.writeUInt32LE(pngs[idx].length, entryBase + 8);
    ico.writeUInt32LE(realOffsets[idx], entryBase + 12);
  }

  for (let idx = 0; idx < entries; idx++) {
    pngs[idx].copy(ico, realOffsets[idx]);
  }

  const icoPath = path.join(assetsDir, 'icon.ico');
  fs.writeFileSync(icoPath, ico);
  console.log(`Generated icon.ico (${ico.length} bytes) with sizes: ${sizes.join(', ')}`);

  try {
    fs.copyFileSync(path.join(assetsDir, 'tray-icon-32.png'), path.join(assetsDir, 'tray-icon.png'));
  } catch {}

  console.log('All icons generated!');
}

generateIcons().catch(console.error);
