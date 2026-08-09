// 生成真正的 PNG 图标(512x512),用于 Electron 打包
// 纯 Node 实现:用 zlib 手写 PNG。图标为深蓝底 + 白色书本/知识图形
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const SIZE = 512;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2;

// 生成 RGBA 像素:深蓝渐变底 + 白色书本形状(支持任意尺寸,内部归一化坐标)
function draw(size) {
  const data = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const r = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      // 圆形裁剪
      const dx = x - c + 0.5;
      const dy = y - c + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const o = size * 0.008; // 抗锯齿边缘
      let alpha = 0;
      if (dist < r - o) alpha = 255;
      else if (dist < r) alpha = Math.round(((r - dist) / o) * 255);

      if (alpha === 0) { data[idx + 3] = 0; continue; }

      // 归一化坐标(0~1)
      const nx = x / size, ny = y / size;
      // 深蓝紫渐变背景
      const t = ny;
      const br = Math.round(26 + (88 - 26) * t);
      const bg = Math.round(34 + (28 - 34) * t);
      const bb = Math.round(70 + (110 - 70) * t);

      let cr = br, cg = bg, cb = bb;

      // 白色书本形状:中心区域,由两个"页面"组成(比例相对尺寸)
      const bookLeft = c - size * 0.14, bookRight = c + size * 0.14;
      const bookTop = c - size * 0.18, bookBottom = c + size * 0.18;
      const spineX = c;

      const inSpine = Math.abs(x - spineX) < size * 0.016 && y > bookTop && y < bookBottom;
      const inLeft = x > bookLeft && x < spineX && y > bookTop && y < bookBottom;
      const inRight = x > spineX && x < bookRight && y > bookTop && y < bookBottom;

      const lineY = (n) => bookTop + size * 0.024 + n * size * 0.044;
      const inTextLine = (ly, lx1, lx2) => y > ly - size * 0.006 && y < ly + size * 0.006 && x > lx1 && x < lx2;

      if (inSpine) { cr = 255; cg = 255; cb = 255; }
      else if (inLeft) {
        cr = 255; cg = 255; cb = 255;
        for (let n = 0; n < 3; n++) {
          if (inTextLine(lineY(n), bookLeft + size * 0.028, bookLeft + size * 0.12)) { cr = br; cg = bg; cb = bb; }
        }
      } else if (inRight) {
        cr = 255; cg = 255; cb = 255;
        for (let n = 0; n < 3; n++) {
          if (inTextLine(lineY(n + 1), spineX + size * 0.028, spineX + size * 0.12)) { cr = br; cg = bg; cb = bb; }
        }
      }

      data[idx] = cr;
      data[idx + 1] = cg;
      data[idx + 2] = cb;
      data[idx + 3] = alpha;
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