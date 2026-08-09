// 生成真正的 PNG 图标(512x512),用于 Electron 打包
// 纯 Node 实现:用 zlib 手写 PNG。图标为「蓝色书本」风格:
// 圆形深蓝紫渐变底 + 中央白色书本(含书脊与文字行)
// 用带符号距离函数(SDF)实现抗锯齿,边缘更平滑
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const SIZE = 512;

// 平滑步进:在边缘 a~b 之间做线性抗锯齿
function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// 生成 RGBA 像素
function draw(size) {
  const data = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const r = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const px = x + 0.5, py = y + 0.5;

      // 圆形裁剪(带 1px 抗锯齿)
      const d = Math.sqrt((px - c) * (px - c) + (py - c) * (py - c));
      const circleAlpha = 1 - smoothstep(r - 1, r + 1, d);
      if (circleAlpha <= 0) { data[idx + 3] = 0; continue; }

      // 归一化坐标
      const nd = d / r; // 0中心 → 1边缘
      const ny = y / size;

      // ─── 背景:深蓝紫渐变(上浅下深) ───
      // 顶部 #233A8F → 底部 #1A1A3E,带轻微径向提亮增加立体感
      const t = ny; // 0顶部 → 1底部
      let br = Math.round(58 + (26 - 58) * t);
      let bgc = Math.round(62 + (34 - 62) * t);
      let bb = Math.round(120 + (70 - 120) * t);
      // 中心轻微提亮
      const glow = 1 - nd;
      br = Math.round(br + 18 * glow);
      bgc = Math.round(bgc + 18 * glow);
      bb = Math.round(bb + 24 * glow);

      // ─── 中央白色书本 ───
      const bookLeft = c - size * 0.14;
      const bookRight = c + size * 0.14;
      const bookTop = c - size * 0.18;
      const bookBottom = c + size * 0.18;
      const spineX = c;

      const inSpine = Math.abs(px - spineX) < size * 0.016 && py > bookTop && py < bookBottom;
      const inLeft = px > bookLeft && px < spineX && py > bookTop && py < bookBottom;
      const inRight = px > spineX && px < bookRight && py > bookTop && py < bookBottom;

      const lineY = (n) => bookTop + size * 0.024 + n * size * 0.044;
      const inTextLine = (ly, lx1, lx2) => py > ly - size * 0.006 && py < ly + size * 0.006 && px > lx1 && px < lx2;

      if (inSpine) { br = 255; bgc = 255; bb = 255; }
      else if (inLeft) {
        br = 255; bgc = 255; bb = 255;
        for (let n = 0; n < 3; n++) {
          if (inTextLine(lineY(n), bookLeft + size * 0.028, bookLeft + size * 0.12)) { br = 58; bgc = 62; bb = 120; }
        }
      } else if (inRight) {
        br = 255; bgc = 255; bb = 255;
        for (let n = 0; n < 3; n++) {
          if (inTextLine(lineY(n + 1), spineX + size * 0.028, spineX + size * 0.12)) { br = 58; bgc = 62; bb = 120; }
        }
      }

      data[idx] = Math.min(255, Math.round(br));
      data[idx + 1] = Math.min(255, Math.round(bgc));
      data[idx + 2] = Math.min(255, Math.round(bb));
      data[idx + 3] = Math.round(255 * circleAlpha);
    }
  }
  return data;
}

// 生成 PNG 文件
function writePNG(filePath, width, height, rgba) {
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  };

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // 每行前加 filter byte(0 = None)
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw);

  const png = Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(filePath, png);
  console.log(`已生成 ${filePath} (${png.length} 字节)`);
}

const outDir = path.join(__dirname, '..', 'build');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const rgba512 = draw(512);
writePNG(path.join(outDir, 'icon.png'), 512, 512, rgba512);
// 生成 192 版本(给 PWA,替代损坏的 public/icons)
const rgba192 = draw(192);
writePNG(path.join(__dirname, '..', 'public', 'icons', 'icon-192x192.png'), 192, 192, rgba192);
writePNG(path.join(__dirname, '..', 'public', 'icons', 'icon-512x512.png'), 512, 512, rgba512);