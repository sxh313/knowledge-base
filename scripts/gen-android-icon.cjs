// 生成安卓应用图标:从 build/icon.png 缩放生成各密度 ic_launcher 图标
// 用法: node scripts/gen-android-icon.cjs
// 输出到 android/app/src/main/res/mipmap-*/
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'build', 'icon.png');

// 读取 PNG 并解码为 RGBA(支持我们生成的非压缩/简单 PNG)
function decodePNG(filePath) {
  const buf = fs.readFileSync(filePath);
  let pos = 8; // 跳过签名
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  let idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    }
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (bpp === undefined) throw new Error('Unsupported color type ' + colorType);
  const stride = width * bpp;
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1) + 1;
    const filter = raw[rowStart - 1];
    const row = raw.subarray(rowStart, rowStart + stride);
    // 简化:假设 filter 为 0(None),我们生成的 PNG 就是如此
    for (let x = 0; x < width; x++) {
      const si = x * bpp;
      const di = (y * width + x) * 4;
      if (colorType === 6) { // RGBA
        pixels[di] = row[si];
        pixels[di + 1] = row[si + 1];
        pixels[di + 2] = row[si + 2];
        pixels[di + 3] = row[si + 3];
      } else if (colorType === 2) { // RGB
        pixels[di] = row[si];
        pixels[di + 1] = row[si + 1];
        pixels[di + 2] = row[si + 2];
        pixels[di + 3] = 255;
      } else if (colorType === 4) { // LA
        pixels[di] = row[si];
        pixels[di + 1] = row[si];
        pixels[di + 2] = row[si];
        pixels[di + 3] = row[si + 1];
      }
    }
  }
  return { width, height, pixels };
}

// 简单双线性缩放
function resize(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  const sx = sw / dw, sy = sh / dh;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const srcX = x * sx, srcY = y * sy;
      const x0 = Math.min(Math.floor(srcX), sw - 1);
      const y0 = Math.min(Math.floor(srcY), sh - 1);
      const x1 = Math.min(x0 + 1, sw - 1);
      const y1 = Math.min(y0 + 1, sh - 1);
      const fx = srcX - x0, fy = srcY - y0;
      const o = (y * dw + x) * 4;
      for (let c = 0; c < 4; c++) {
        const v00 = src[(y0 * sw + x0) * 4 + c];
        const v01 = src[(y0 * sw + x1) * 4 + c];
        const v10 = src[(y1 * sw + x0) * 4 + c];
        const v11 = src[(y1 * sw + x1) * 4 + c];
        const top = v00 * (1 - fx) + v01 * fx;
        const bot = v10 * (1 - fx) + v11 * fx;
        out[o + c] = Math.round(top * (1 - fy) + bot * fy);
      }
    }
  }
  return out;
}

// 编码 PNG
function encodePNG(width, height, rgba) {
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (b) => {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const tb = Buffer.from(type, 'ascii');
    const cb = Buffer.alloc(4); cb.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
    return Buffer.concat([len, tb, data, cb]);
  };
  // 简化:用 filter 0 逐行
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function main() {
  const { width, height, pixels } = decodePNG(SRC);
  console.log(`源图标 ${width}x${height}`);

  // 各密度目标尺寸(launcher icon)
  const sizes = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
  };

  const resDir = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
  for (const [dir, size] of Object.entries(sizes)) {
    const outDir = path.join(resDir, dir);
    if (!fs.existsSync(outDir)) continue;
    const resized = resize(pixels, width, height, size, size);
    const png = encodePNG(size, size, resized);
    // ic_launcher.png 和 ic_launcher_round.png
    fs.writeFileSync(path.join(outDir, 'ic_launcher.png'), png);
    fs.writeFileSync(path.join(outDir, 'ic_launcher_round.png'), png);
    // foreground(自适应图标前景,留白裁切)
    const fgSize = Math.round(size * 0.66);
    const fg = resize(pixels, width, height, fgSize, fgSize);
    const fgCanvas = Buffer.alloc(size * size * 4);
    const off = Math.round((size - fgSize) / 2);
    for (let y = 0; y < fgSize; y++) {
      fg.copy(fgCanvas, (y + off) * size * 4 + off * 4, y * fgSize * 4, (y + 1) * fgSize * 4);
    }
    fs.writeFileSync(path.join(outDir, 'ic_launcher_foreground.png'), encodePNG(size, size, fgCanvas));
    console.log(`✅ 生成 ${dir} (${size}x${size})`);
  }

  // 更新自适应图标背景为深蓝
  const bgXml = path.join(resDir, 'values', 'ic_launcher_background.xml');
  fs.writeFileSync(bgXml, `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#1E4FD8</color>
    <color name="ic_launcher_background2">#2E7CF6</color>
</resources>
`);
  console.log('✅ 已更新自适应图标背景为宝蓝色');
}

main();