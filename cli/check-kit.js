#!/usr/bin/env node
// © 2026 Gen Labs — All rights reserved.
// cli/check-kit.js — máy kiểm thường trực Bộ Neo (STANDARD-KIT-v1.md §7), chạy độc lập (không cần DB/server).
// Dùng: node cli/check-kit.js <file> --slot <mã ô> [--ref <file tham chiếu .expr.00>] [--mime <mime khai>] [--json]
//   genstudio check <file> --slot <mã ô>   (xem cli/genstudio)
'use strict';
const path = require('node:path');
const { runChecks } = require('../server/checks/index.js');

function args(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--slot') a.slot = argv[++i];
    else if (t === '--ref') a.ref = argv[++i];
    else if (t === '--mime') a.mime = argv[++i];
    else if (t === '--ffmpeg') a.ffmpeg = argv[++i];
    else if (t === '--ground-y') a.groundY = Number(argv[++i]);
    else if (t === '--json') a.json = true;
    else a._.push(t);
  }
  return a;
}

function printTable(result, file) {
  console.log(`\nMáy kiểm — ${path.basename(file)}  [nhóm ô: ${result.group}]`);
  for (const c of result.checks) {
    const mark = c.pass === null ? '…' : c.pass ? '✓' : '✗';
    console.log(`  ${mark} ${c.code.padEnd(8)} ${c.level.padEnd(2)} ${c.note_vi}`);
  }
  const vmark = result.verdict === 'pass' ? '✓ ĐẠT' : result.verdict === 'rework' ? '✗ LÀM LẠI' : '… CHỜ XÁC NHẬN';
  console.log(`\n${vmark} — ${result.summary_vi}\n`);
}

async function main() {
  const a = args(process.argv.slice(2));
  const file = a._[0];
  if (!file || !a.slot) {
    console.error('Dùng: node cli/check-kit.js <file> --slot <mã ô> [--ref <file>] [--mime <mime>] [--ground-y <n>] [--json]');
    process.exit(2);
  }
  const opts = {};
  if (a.ref) opts.referenceFile = a.ref;
  if (a.mime) opts.declaredMime = a.mime;
  if (a.ffmpeg) opts.ffmpegPath = a.ffmpeg;
  if (Number.isFinite(a.groundY)) opts.groundY = a.groundY;
  let result;
  try {
    result = await runChecks(file, a.slot, opts);
  } catch (e) {
    console.error('✗ Lỗi khi kiểm: ' + e.message);
    process.exit(1);
  }
  if (a.json) console.log(JSON.stringify(result, null, 2));
  else printTable(result, file);
  process.exit(result.verdict === 'rework' ? 1 : 0);
}

main();
