// © 2026 Gen Labs — All rights reserved.
// ULID đơn điệu (monotonic) không phụ thuộc thư viện ngoài.
'use strict';
const crypto = require('node:crypto');

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let lastTime = -1;
let lastRand = null; // mảng 16 giá trị 5 bit

function randomChars() {
  const b = crypto.randomBytes(16);
  const out = new Array(16);
  for (let i = 0; i < 16; i++) out[i] = b[i] & 31;
  return out;
}

function ulid(now = Date.now()) {
  if (now <= lastTime && lastRand) {
    // cùng ms (hoặc đồng hồ lùi): tăng phần ngẫu nhiên để giữ thứ tự
    now = lastTime;
    for (let i = 15; i >= 0; i--) {
      if (lastRand[i] < 31) { lastRand[i]++; break; }
      lastRand[i] = 0;
    }
  } else {
    lastTime = now;
    lastRand = randomChars();
  }
  let t = '';
  let n = now;
  for (let i = 0; i < 10; i++) { t = ALPHABET[n % 32] + t; n = Math.floor(n / 32); }
  return t + lastRand.map((v) => ALPHABET[v]).join('');
}

module.exports = { ulid };
