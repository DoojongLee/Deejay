'use strict';

// 의존성 없이 간단한 캘린더 아이콘 PNG 를 생성합니다 (트레이/앱 아이콘용).
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const SIZE = 64;

// --- CRC32 ---
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- 아이콘 그리기 ---
const px = Buffer.alloc(SIZE * SIZE * 4); // 투명 배경

function set(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
}

function roundedRect(x0, y0, x1, y1, radius, fn) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      // 모서리 둥글게
      let inside = true;
      const corners = [
        [x0 + radius, y0 + radius],
        [x1 - 1 - radius, y0 + radius],
        [x0 + radius, y1 - 1 - radius],
        [x1 - 1 - radius, y1 - 1 - radius],
      ];
      if (x < x0 + radius && y < y0 + radius) inside = dist(x, y, corners[0]) <= radius;
      else if (x > x1 - 1 - radius && y < y0 + radius) inside = dist(x, y, corners[1]) <= radius;
      else if (x < x0 + radius && y > y1 - 1 - radius) inside = dist(x, y, corners[2]) <= radius;
      else if (x > x1 - 1 - radius && y > y1 - 1 - radius) inside = dist(x, y, corners[3]) <= radius;
      if (inside) fn(x, y);
    }
  }
}
function dist(x, y, c) {
  return Math.sqrt((x - c[0]) ** 2 + (y - c[1]) ** 2);
}

// 흰 카드 본체
roundedRect(8, 12, 56, 56, 6, (x, y) => set(x, y, 255, 255, 255, 255));
// 상단 파란 머리띠 (Google 블루)
roundedRect(8, 12, 56, 26, 6, (x, y) => set(x, y, 66, 133, 244, 255));
// 머리띠 아래쪽 각지게 보정
for (let y = 20; y < 26; y++) for (let x = 8; x < 56; x++) set(x, y, 66, 133, 244, 255);
// 고리 두 개
for (let y = 6; y < 18; y++) {
  for (let x = 18; x < 23; x++) set(x, y, 90, 90, 90, 255);
  for (let x = 41; x < 46; x++) set(x, y, 90, 90, 90, 255);
}
// 날짜 숫자 느낌의 점 (가운데 큰 점)
roundedRect(26, 34, 38, 46, 5, (x, y) => set(x, y, 66, 133, 244, 255));

const out = encodePNG(SIZE, SIZE, px);
const dir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'icon.png'), out);
console.log('icon.png generated (' + out.length + ' bytes)');
