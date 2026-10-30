#!/usr/bin/env node
// Kiểm hàng Muse nộp trong library/inbox (Node thuần, không phụ thuộc npm).
// Dùng: node library/tools/check-inbox.mjs [MR-057 ...] | --all | --self-test
// Thoát 1 nếu có lỗi. ffprobe (nếu có) dùng để đo thời lượng/kích thước thật.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LIB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INBOX = path.join(LIB, 'inbox'), REQ = path.join(LIB, 'requests');
const MAX = 20 * 1024 * 1024;
const EXT = { image: ['.png', '.jpg', '.webp'], video: ['.mp4'], audio: ['.wav', '.mp3'] };
const NAME = /^[a-z0-9][a-z0-9-]*(-v[0-9]+)?\.(png|jpg|webp|mp4|wav|mp3)$/;
const REQUIRED = ['request', 'status', 'quality', 'files', 'tool', 'prompt_used', 'attempts', 'self_check', 'issues', 'license', 'created'];

let hasProbe = true;
try { execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }); } catch { hasProbe = false; }
const probe = f => {
  if (!hasProbe) return null;
  try {
    const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,codec_type,sample_rate', '-of', 'json', f]).toString());
    return j;
  } catch { return { broken: true }; }
};

function requestOf(id) {
  const f = fs.readdirSync(REQ).find(n => n.startsWith(id + '-') && n.endsWith('.md'));
  if (!f) return null;
  const t = fs.readFileSync(path.join(REQ, f), 'utf8');
  const fm = Object.fromEntries((t.match(/^---\n([\s\S]*?)\n---/)?.[1] || '').split('\n').map(l => l.split(/:\s*/, 2)).filter(a => a.length === 2));
  return { file: f, ...fm };
}

function check(id) {
  const errs = [], warns = [];
  const rq = requestOf(id);
  if (!rq) return { id, errs: [`không có phiếu ${id} trong library/requests`], warns };
  const out = (rq.output || '').replace(/^library\/inbox\//, '').replace(/\/$/, '');
  const dir = path.join(INBOX, out);
  if (!fs.existsSync(dir)) return { id, errs: [`thiếu thư mục nộp library/inbox/${out}/`], warns };
  let meta;
  try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')); }
  catch (e) { return { id, errs: [`meta.json thiếu hoặc sai JSON: ${e.message}`], warns }; }
  for (const k of REQUIRED) if (!(k in meta)) errs.push(`meta.json thiếu trường "${k}"`);
  if (meta.request !== id) errs.push(`meta.request = ${meta.request}, phải là ${id}`);
  if (meta.license !== 'Meta-Muse-Output') errs.push('license phải là "Meta-Muse-Output"');
  if (!['A', 'B'].includes(meta.quality)) errs.push('quality phải là A hoặc B');
  if (meta.quality === 'B' && !(meta.issues || []).length) errs.push('quality B phải ghi lý do trong issues');
  if (!Array.isArray(meta.files) || !meta.files.length) errs.push('files rỗng');
  if (!/status:\s*(review|in-progress)/.test(fs.readFileSync(path.join(REQ, rq.file), 'utf8'))) warns.push('phiếu chưa ở trạng thái review');
  const listed = new Set();
  for (const f of meta.files || []) {
    listed.add(f.name);
    const p = path.join(dir, f.name || '');
    if (!NAME.test(f.name || '')) errs.push(`tên file sai quy ước: ${f.name}`);
    if (!EXT[f.kind]) { errs.push(`${f.name}: kind "${f.kind}" không hợp lệ`); continue; }
    if (!EXT[f.kind].includes(path.extname(f.name).toLowerCase())) errs.push(`${f.name}: đuôi file không khớp kind ${f.kind}`);
    if (!fs.existsSync(p)) { errs.push(`thiếu file ${f.name}`); continue; }
    const size = fs.statSync(p).size;
    if (size > MAX) errs.push(`${f.name}: ${(size / 1048576).toFixed(1)} MB > 20 MB`);
    if (size === 0) errs.push(`${f.name}: file rỗng`);
    const pr = probe(p);
    if (pr?.broken) errs.push(`${f.name}: file hỏng, ffprobe không đọc được`);
    else if (pr) {
      const v = (pr.streams || []).find(s => s.codec_type === 'video');
      const a = (pr.streams || []).find(s => s.codec_type === 'audio');
      if (f.kind === 'audio' && !a) errs.push(`${f.name}: không có luồng âm thanh`);
      if (f.kind === 'video' && !v) errs.push(`${f.name}: không có luồng hình`);
      if (f.kind === 'video' && f.role === 'main' && kindOf(rq) === 'character-clip' && a) warns.push(`${f.name}: clip nhân vật nên KHÔNG có tiếng`);
      if (f.kind === 'audio' && a && Number(a.sample_rate) < 44100) errs.push(`${f.name}: sample rate ${a.sample_rate} < 44100`);
    }
  }
  for (const n of fs.readdirSync(dir)) if (n !== 'meta.json' && !listed.has(n)) warns.push(`file ${n} có trong thư mục nhưng không khai trong meta.files`);
  return { id, errs, warns };
}
const kindOf = rq => rq.kind;

const args = process.argv.slice(2);
if (args.includes('--self-test')) {
  const ok = fs.existsSync(REQ) && fs.existsSync(INBOX) && fs.readdirSync(REQ).some(n => /^MR-\d{3}-/.test(n));
  console.log(ok ? 'OK' : 'LỖI: không thấy library/requests hoặc library/inbox'); process.exit(ok ? 0 : 1);
}
let ids = args.filter(a => /^MR-\d{3}$/.test(a));
if (args.includes('--all') || !ids.length) ids = fs.readdirSync(INBOX).map(n => n.match(/^(MR-\d{3})-/)?.[1]).filter(Boolean);
if (!ids.length) { console.log('Inbox trống — không có gì để kiểm.'); process.exit(0); }
let bad = 0;
for (const id of [...new Set(ids)]) {
  const r = check(id);
  console.log(`${r.errs.length ? '✗' : '✓'} ${id}`);
  for (const e of r.errs) console.log(`    LỖI  ${e}`);
  for (const w of r.warns) console.log(`    lưu ý ${w}`);
  if (r.errs.length) bad++;
}
if (!hasProbe) console.log('(không có ffprobe — bỏ qua đo thời lượng/codec)');
process.exit(bad ? 1 : 0);
