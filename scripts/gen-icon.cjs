// 生成默认 PNG 图标(512x512),用于 Electron 打包。
// 项目当前使用 build/icon.png 中的自定义图片；除非显式要求，否则不要覆盖它。
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const canonicalIcon = path.join(__dirname, '..', 'build', 'icon.png');
if (fs.existsSync(canonicalIcon) && process.env.FORCE_DEFAULT_ICON !== '1') {
  console.log(`保留现有自定义图标: ${canonicalIcon}`);
  process.exit(0);
}

const SIZE = 512;

// 平滑步进:在边缘 a~b 之间做线性抗锯齿
function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// 圆角方形 SDF:返回带符号距离(负=内部)
function roundedRectSDF(px, py, cx, cy, hw, hh, rad) {
  const qx = Math.abs(px - cx) - (hw - rad);
  const qy = Math.abs(py - cy) - (hh - rad);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - rad;
}

// 生成 RGBA 像素
function draw(size) {
  const data = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const hw = size * 0.46;   // 半宽
  const hh = size * 0.46;   // 半高
  const rad = size * 0.22;  // 圆角半径

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const px = x + 0.5, py = y + 0.5;

      // 圆角方形裁剪(带抗锯齿)
      const dRect = roundedRectSDF(px, py, c, c, hw, hh, rad);
      const rectAlpha = 1 - smoothstep(-1, 1, dRect);
      if (rectAlpha <= 0) { data[idx + 3] = 0; continue; }

      // 归一化坐标
      const nd = Math.sqrt((px - c) * (px - c) + (py - c) * (py - c)) / c;
      const ny = y / size;

      // ─── 背景:明亮宝蓝色渐变(上亮下深) ───
      // 顶部 #2E7CF6 亮蓝 → 底部 #1E4FD8 宝蓝,带轻微径向提亮
      const t = ny; // 0顶部 → 1底部
      let br = Math.round(88 + (30 - 88) * t);
      let bgc = Math.round(140 + (70 - 140) * t);
      let bb = Math.round(246 + (216 - 246) * t);
      // 中心轻微提亮,更活泼
      const glow = 1 - nd;
      br = Math.round(br + 30 * glow);
      bgc = Math.round(bgc + 30 * glow);
      bb = Math.round(bb + 20 * glow);

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
          if (inTextLine(lineY(n), bookLeft + size * 0.028, bookLeft + size * 0.12)) { br = 46; bgc = 110; bb = 246; }
        }
      } else if (inRight) {
        br = 255; bgc = 255; bb = 255;
        for (let n = 0; n < 3; n++) {
          if (inTextLine(lineY(n + 1), spineX + size * 0.028, spineX + size * 0.12)) { br = 46; bgc = 110; bb = 246; }
        }
      }

      data[idx] = Math.min(255, Math.round(br));
      data[idx + 1] = Math.min(255, Math.round(bgc));
      data[idx + 2] = Math.min(255, Math.round(bb));
      data[idx + 3] = Math.round(255 * rectAlpha);
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
