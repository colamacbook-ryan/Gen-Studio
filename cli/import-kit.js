#!/usr/bin/env node
// © 2026 Gen Labs — All rights reserved.
// Gói C (0.3.0) — `genstudio import [--dry-run] [--only MR-xxx] [--source <dir>] [--allow-errors]`: quét
// `library/catalog.json` + `library/inbox/` (hoặc `--source <dir>` chứa trực tiếp các thư mục MR-xxx-*, vd
// hàng Muse về từ Drive trên VPS: /opt/gen-studio/data/inbox/drive/03_Hoan-thanh/<MR>/<file>), ánh xạ file →
// mã ô (server/kit-map.js), tạo asset LUÔN (asset.put — hash sha256 chống trùng, kể cả file không ánh xạ được
// ô, review PR #35 mục 2), gắn ô + phân loại (asset.meta), tạo lần nộp theo quyết định (submission.import +
// submission.set_state — ghi kiểm TRƯỚC khi nâng trạng thái "approved", review mục 4), chạy máy kiểm nếu có
// (server/checks, gói E, qua adapter server/checks/to-db.js).
// Quyết định (HANDOFF-LOCAL.md §4 mục C, Ryan 31/10): MR-044/046/052 → approved · MR-047 → review (submitted +
// đề xuất SG- cho Ryan) · còn lại (có hàng, chưa Ryan quyết) → submitted (chờ kiểm). "approved" vẫn giữ nguyên
// theo quyết định Ryan dù máy kiểm còn tiêu chí M fail — ghi rõ trong decision_reason + in CẢNH BÁO cuối lệnh
// (review mục 5): kho CHƯA certify được cho tới khi làm lại/miễn tiêu chí.
// Xuất `data/kit-status.json` (mã ô → {asset_id, state, checks_level}) — CHƯA nối với `deploy/gcp/tickets-sheet.py
// sync` (TODO gói F/Sheet, xem docs/IMPORT.md).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const configMod = require('../server/config.js');
const dbm = require('../server/db.js');
const eventsMod = require('../server/events.js');
const { createWriter } = require('../server/write.js');
const kitMap = require('../server/kit-map.js');

const ROOT = path.join(__dirname, '..');
const LIB = path.join(ROOT, 'library');

// Quyết định Ryan 31/10 (HANDOFF-LOCAL.md §4 mục C) — mọi MR khác có hàng trong inbox mà chưa quyết ⇒ 'pending' (submitted, chờ kiểm).
const DECISIONS = {
  'MR-044': 'approved',
  'MR-046': 'approved',
  'MR-052': 'approved',
  'MR-047': 'review',
};

const CLI_ACTOR = { type: 'cli', entry: 'cli' };     // ownerOrCli: kit.sync, asset.meta, submission.import, submission.set_state
const SYS_ACTOR = { type: 'system', entry: 'cli' };  // composeOrSystem (asset.put) + review (submission.record_checks, submission.propose)

const EXT_IMAGE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const EXT_RECOGNIZED = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.wav', '.mp3', '.mp4']);
const MIME_OF_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' };

// type (catalog.schema.json) → kind (assets.kind). Loại không có kind phù hợp trong gói C (icon-set/font/lottie/
// motion-template — tập nhiều tệp hoặc cần kind chưa có trong ASSET_KINDS) ⇒ null, báo "bỏ qua".
function kindOfCatalogType(type, ext) {
  if (type === 'character-still' || type === 'illustration' || type === 'background') {
    return ext === '.svg' ? 'svg' : (EXT_IMAGE.has(ext) ? 'image' : null);
  }
  if (type === 'character-clip' || type === 'broll') return 'video';
  if (type === 'sfx' || type === 'music') return 'audio';
  return null; // icon-set, font, lottie, motion-template: tập nhiều tệp hoặc kind chưa hỗ trợ ở gói C
}

// license (catalog.schema.json whitelist) → source_kind (assets.source_kind), theo DB-GK-0.1 §8.
function sourceKindOfLicense(license) {
  if (['Gen-Labs-proprietary', 'Veo-Output', 'Google-Gemini-Output'].includes(license)) return 'in-house';
  if (license === 'Meta-Muse-Output') return 'muse';
  return 'external';
}

function subjectFromTags(tags) {
  const t = new Set(tags || []);
  if (t.has('nhi')) return 'nhi';
  if (t.has('vy')) return 'vy';
  if (t.has('ryan')) return 'ryan';
  return undefined;
}

// sniffKindMime(head12, ext) — chỉ cần vài byte đầu (đã đọc sẵn cùng lượt đọc file, không đọc lại — review mục 10).
function sniffKindMime(ext) {
  if (ext === '.svg') return { kind: 'svg', mime: 'image/svg+xml' };
  if (EXT_IMAGE.has(ext)) return { kind: 'image', mime: MIME_OF_EXT[ext] };
  if (ext === '.wav' || ext === '.mp3') return { kind: 'audio', mime: ext === '.wav' ? 'audio/wav' : 'audio/mpeg' };
  if (ext === '.mp4') return { kind: 'video', mime: 'video/mp4' };
  return { kind: null, mime: null };
}

class Report {
  constructor() {
    this.bySlotGroup = {};       // group_code -> Set(code có hàng)
    this.unmapped = [];          // {source, file, reason}
    this.deduped = 0;
    this.createdAssets = 0;
    this.metaChanged = 0;
    this.submissions = { created: 0, deduped: 0, approved: 0, review: 0, pending: 0 };
    this.checks = { run: 0, errors: 0 };
    this.approvedWithMFail = []; // [{mr, file, kit_slot, failed:[criterion]}] — "approved" nhưng còn tiêu chí M fail
    this.errors = [];
  }
}

function loadSlotGroups() {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed', 'kit-slots.json'), 'utf8'));
  const groups = {};
  for (const s of data.slots) (groups[s.group_code] ||= { total: 0, codes: new Set() }).total++;
  return groups;
}

function markHasAsset(groups, slotsById, code, report) {
  const slot = slotsById.get(code);
  if (!slot) return;
  (report.bySlotGroup[slot.group_code] ||= new Set()).add(code);
}

function readMeta(dir) {
  const f = path.join(dir, 'meta.json');
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}

// synthesizeMeta(dir) — khi không có meta.json (vd thư mục nguồn Drive `--source`, chưa chắc có meta.json):
// liệt kê file có đuôi nhận diện được, coi mỗi file là "main", quality A (không có thông tin khác để suy ra).
function synthesizeMeta(dir) {
  let names;
  try { names = fs.readdirSync(dir); } catch { return null; }
  const files = names.filter((n) => EXT_RECOGNIZED.has(path.extname(n).toLowerCase())).map((n) => ({ name: n, role: 'main' }));
  if (!files.length) return null;
  return { quality: 'A', files, synthesized: true };
}

async function importInboxFolder(write, inboxRoot, dirName, slotsById, groups, report, { dryRun }) {
  const mrId = (dirName.match(/^(MR-\d{3})/) || [])[1];
  const dir = path.join(inboxRoot, dirName);
  const meta = readMeta(dir) || synthesizeMeta(dir);
  if (!meta) { report.errors.push(`${dirName}: không đọc được meta.json và không tự dựng được danh sách file`); return; }
  const verdict = DECISIONS[mrId] || 'pending';

  for (const f of meta.files || []) {
    const filePath = path.join(dir, f.name);
    const ext = path.extname(f.name).toLowerCase();
    let bytes;
    try { bytes = fs.readFileSync(filePath); } catch (e) { report.errors.push(`${dirName}/${f.name}: ${e.message}`); continue; }
    const { kind, mime } = sniffKindMime(ext);
    if (!kind) { report.unmapped.push({ source: `inbox/${dirName}`, file: f.name, reason: `kind không hỗ trợ (${ext})` }); continue; }

    const map = kitMap.mapFile({ mrId, filename: f.name });
    if (map.code) markHasAsset(groups, slotsById, map.code, report);
    else report.unmapped.push({ source: `inbox/${dirName}`, file: f.name, reason: map.reason });
    if (dryRun) continue;

    // review mục 2: LUÔN asset.put + asset.meta dù không ánh xạ được ô (chỉ bỏ submission.import nếu vậy) —
    // nhập kho vẫn phải thấy được file trong DB để Ryan/Gen gắn ô tay sau này, không mất hẳn.
    let asset;
    try {
      asset = write(SYS_ACTOR, 'asset.put', { kind, bytes, mime, source: 'upload', meta: { import: { mr: mrId, file: f.name } } });
      if (asset.deduped) report.deduped++; else report.createdAssets++;

      const metaRes = write(CLI_ACTOR, 'asset.meta', {
        asset: asset.display_id, kit_slot: map.code || undefined,
        source_kind: 'muse', redistribution: 'in-product-only', quality: meta.quality === 'B' ? 'B' : 'A', commercial_ok: 1,
      });
      if (metaRes.changed) report.metaChanged++;
    } catch (e) { report.errors.push(`${dirName}/${f.name}: ${e.message}`); continue; }

    if (!map.code) continue; // không có ô ⇒ không có lần nộp/máy kiểm (chỉ asset ở trên)

    let sub;
    try {
      // Luôn tạo ở 'submitted' trước (idempotent theo asset+ô) — record_checks chỉ ghi được khi còn 'submitted'
      // (review mục 4); "approved" (nếu quyết định vậy) áp SAU, bằng submission.set_state bên dưới.
      sub = write(CLI_ACTOR, 'submission.import', { asset: asset.display_id, kit_slot: map.code, state: 'submitted' });
    } catch (e) { report.errors.push(`${dirName}/${f.name}: ${e.message}`); continue; }
    if (sub.deduped) { report.submissions.deduped++; continue; }
    report.submissions.created++;

    let mFails = [];
    if (!meta.synthesized) { // thư mục tự dựng (--source chưa có meta.json) — bỏ qua máy kiểm, thiếu self_check/role đáng tin
      try {
        const checksMod = require('../server/checks/index.js');
        const toDb = require('../server/checks/to-db.js');
        const r = await checksMod.runChecks(filePath, map.code, {});
        const results = toDb.toDbResults(r);
        write(SYS_ACTOR, 'submission.record_checks', { submission: sub.display_id, run_id: `import-${mrId}-${f.name}`, results });
        report.checks.run++;
        mFails = results.filter((x) => x.severity === 'M' && x.level === 'fail').map((x) => x.criterion);
      } catch (e) { report.checks.errors++; report.errors.push(`checks ${dirName}/${f.name}: ${e.message}`); }
    }

    if (verdict === 'approved') {
      const reason = mFails.length
        ? `Nhập kho 0.3.0-C: ${mrId} đã duyệt (HANDOFF-LOCAL.md §4 mục C, Ryan 31/10) — CẢNH BÁO: còn ${mFails.length} tiêu chí M fail lúc nhập (${mFails.join(', ')}), CHƯA certify được.`
        : `Nhập kho 0.3.0-C: ${mrId} đã duyệt (HANDOFF-LOCAL.md §4 mục C, Ryan 31/10).`;
      write(CLI_ACTOR, 'submission.set_state', { submission: sub.display_id, state: 'approved', decision_kind: 'owner', decided_actor: 'ryan', decision_reason: reason });
      report.submissions.approved++;
      if (mFails.length) report.approvedWithMFail.push({ mr: mrId, file: f.name, kit_slot: map.code, failed: mFails });
    } else if (verdict === 'review') {
      report.submissions.review++;
      write(SYS_ACTOR, 'submission.propose', {
        submission: sub.display_id, verdict: 'approve',
        reason: `Nhập kho 0.3.0-C: ${mrId} ở trạng thái "review" (HANDOFF-LOCAL.md §4 mục C) — chờ Ryan xác nhận.`,
      });
    } else {
      report.submissions.pending++;
    }
  }
}

async function importCatalog(write, libDir, slotsById, groups, report, { dryRun }) {
  const catalogPath = path.join(libDir, 'catalog.json');
  if (!fs.existsSync(catalogPath)) return;
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  for (const e of catalog.entries || []) {
    if (e.stored !== 'git' || !e.path) { report.unmapped.push({ source: 'catalog', file: e.id, reason: `stored="${e.stored}" (không có tệp trong git) — bỏ qua theo DB-GK-0.1 §8` }); continue; }
    const ext = path.extname(e.path).toLowerCase();
    const kind = kindOfCatalogType(e.type, ext);
    if (!kind) { report.unmapped.push({ source: 'catalog', file: e.id, reason: `type="${e.type}" chưa có kind phù hợp trong gói C (tập nhiều tệp hoặc kind chưa hỗ trợ)` }); continue; }
    const filePath = path.join(libDir, e.path);
    if (!fs.existsSync(filePath)) { report.errors.push(`catalog ${e.id}: file không tồn tại (${e.path})`); continue; }
    const map = kitMap.mapFile({ mrId: null, filename: path.basename(e.path) });
    if (map.code) markHasAsset(groups, slotsById, map.code, report);
    else report.unmapped.push({ source: 'catalog', file: e.id, reason: map.reason });
    if (dryRun) continue;

    try {
      const bytes = fs.readFileSync(filePath);
      const mime = MIME_OF_EXT[ext] || null;
      const asset = write(SYS_ACTOR, 'asset.put', { kind, bytes, mime, source: 'upload', meta: { import: { catalog_id: e.id } } });
      if (asset.deduped) report.deduped++; else report.createdAssets++;

      const metaRes = write(CLI_ACTOR, 'asset.meta', {
        asset: asset.display_id, kit_slot: map.code || undefined,
        source_kind: sourceKindOfLicense(e.license), redistribution: e.redistribution === 'free' ? 'ok' : e.redistribution,
        quality: e.quality, commercial_ok: e.commercial_ok ? 1 : 0, subject: subjectFromTags(e.tags),
      });
      if (metaRes.changed) report.metaChanged++;
    } catch (err) { report.errors.push(`catalog ${e.id}: ${err.message}`); }
  }
}

// runImport({ write, db, libDir, dryRun, only, source }) → report. Dùng chung cho CLI (`main`) và test.
// `source`: thư mục chứa TRỰC TIẾP các MR-xxx-*/ (vd hàng Drive) thay cho `<libDir>/inbox/`; khi dùng, BỎ QUA
// catalog.json (nguồn ngoài không có catalog kèm theo).
async function runImport({ write, db, libDir = LIB, dryRun = false, only = null, source = null } = {}) {
  write(CLI_ACTOR, 'kit.sync', {}); // 457 ô — cần tồn tại trước khi gắn (asset.meta kiểm slot tồn tại)
  const slotsRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed', 'kit-slots.json'), 'utf8')).slots;
  const slotsById = new Map(slotsRaw.map((s) => [s.code, s]));
  const groups = loadSlotGroups();
  const report = new Report();

  const inboxRoot = source || path.join(libDir, 'inbox');
  const inboxDirs = fs.existsSync(inboxRoot)
    ? fs.readdirSync(inboxRoot, { withFileTypes: true }).filter((d) => d.isDirectory() && /^MR-\d{3}/.test(d.name)).map((d) => d.name).filter((n) => !only || n.startsWith(only))
    : [];
  for (const d of inboxDirs) await importInboxFolder(write, inboxRoot, d, slotsById, groups, report, { dryRun });
  if (!only && !source) await importCatalog(write, libDir, slotsById, groups, report, { dryRun });

  if (!dryRun && db) {
    const ws = db.ws;
    const status = {};
    for (const s of slotsRaw) {
      // review mục 6: lọc đúng workspace_id; ưu tiên lần nộp 'approved' gần nhất trước (không chỉ "mới nhất bất kỳ").
      const row = db.get(
        `SELECT a.display_id AS asset_display_id, asub.state, asub.checks_level
         FROM assets a LEFT JOIN asset_submissions asub ON asub.asset_id = a.id AND asub.kit_slot = a.kit_slot AND asub.workspace_id = a.workspace_id
         WHERE a.workspace_id = ? AND a.kit_slot = ?
         ORDER BY (asub.state = 'approved') DESC, a.created_at DESC, a.id DESC LIMIT 1`,
        ws, s.code);
      status[s.code] = row ? { asset_id: row.asset_display_id, state: row.state || null, checks_level: row.checks_level || null } : null;
    }
    report.kitStatus = { generated_at: new Date().toISOString(), slots: status };
  }
  report.groups = groups;
  return report;
}

function printReport(report, { dryRun } = {}) {
  console.log(`Nhập kho 0.3.0-C${dryRun ? ' (--dry-run, không ghi)' : ''}:`);
  let totalHas = 0, totalSlots = 0;
  for (const [g, info] of Object.entries(report.groups).sort()) {
    const has = (report.bySlotGroup[g] || new Set()).size;
    totalHas += has; totalSlots += info.total;
    console.log(`  ${g}: ${has}/${info.total} ô có hàng`);
  }
  console.log(`  TỔNG: ${totalHas}/${totalSlots} ô có hàng`);
  console.log(`Asset: ${report.createdAssets} mới, ${report.deduped} trùng bỏ qua (sha256).`);
  console.log(`Mô tả (asset.meta): ${report.metaChanged} thay đổi.`);
  console.log(`Lần nộp: ${report.submissions.created} mới (approved=${report.submissions.approved}, review=${report.submissions.review}, pending=${report.submissions.pending}), ${report.submissions.deduped} trùng bỏ qua.`);
  console.log(`Máy kiểm (gói E): ${report.checks.run} lần chạy, ${report.checks.errors} lỗi.`);
  console.log(`File không ánh xạ được: ${report.unmapped.length}`);
  for (const u of report.unmapped) console.log(`  - [${u.source}] ${u.file}: ${u.reason}`);
  if (report.approvedWithMFail.length) {
    console.log(`\nCẢNH BÁO: ${report.approvedWithMFail.length} ô "approved" theo quyết định Ryan nhưng MÁY KIỂM còn tiêu chí M fail — KHO CHƯA CERTIFY ĐƯỢC cho tới khi làm lại/miễn tiêu chí:`);
    for (const w of report.approvedWithMFail) console.log(`  - ${w.mr}/${w.file} (${w.kit_slot}): ${w.failed.join(', ')}`);
  }
  if (report.errors.length) { console.log(`Lỗi (${report.errors.length}):`); for (const e of report.errors) console.log(`  - ${e}`); }
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const allowErrors = argv.includes('--allow-errors');
  const onlyIdx = argv.indexOf('--only');
  const only = onlyIdx >= 0 ? argv[onlyIdx + 1] : null;
  const sourceIdx = argv.indexOf('--source');
  const source = sourceIdx >= 0 ? path.resolve(argv[sourceIdx + 1]) : null;

  const config = configMod.load();
  const db = dbm.open(config.dataDir, { masterKey: config.masterKey });
  const write = createWriter(db, { events: eventsMod.create() });
  try {
    const report = await runImport({ write, db, dryRun, only, source });
    printReport(report, { dryRun });
    if (!dryRun && report.kitStatus) {
      const statusPath = path.join(config.dataDir, 'kit-status.json');
      fs.writeFileSync(statusPath, JSON.stringify(report.kitStatus, null, 2));
      console.log(`Đã ghi ${statusPath} (chưa nối với deploy/gcp/tickets-sheet.py sync — xem docs/IMPORT.md).`);
    }
    // review mục 3: có lỗi thật (file hỏng, ghi DB lỗi…) ⇒ exit khác 0 để CI/script gọi biết mà dừng lại,
    // trừ khi --allow-errors (đã xem báo cáo, chấp nhận chạy tiếp, vd lỗi SVG bên thứ ba đã biết trước).
    if (report.errors.length && !allowErrors) {
      console.error(`\n✗ Có ${report.errors.length} lỗi — dừng với exit 1 (dùng --allow-errors để bỏ qua).`);
      process.exitCode = 1;
    }
  } finally { db.close(); }
}

if (require.main === module) main().catch((e) => { console.error('Nhập kho thất bại:', e.message, e.detail || ''); process.exit(1); });
module.exports = { main, runImport, printReport, kindOfCatalogType, sourceKindOfLicense };
