#!/usr/bin/env node
// © 2026 Gen Labs — All rights reserved.
// Gói C (0.3.0) — `genstudio import [--dry-run] [--only MR-xxx]`: quét `library/catalog.json` + `library/inbox/`,
// ánh xạ file → mã ô (server/kit-map.js), tạo asset (asset.put — hash sha256 chống trùng), gắn ô + phân loại
// (asset.meta), tạo lần nộp theo quyết định (submission.import), chạy máy kiểm nếu có (server/checks, gói E).
// Quyết định (HANDOFF-LOCAL.md §4 mục C, Ryan 31/10): MR-044/046/052 → approved · MR-047 → review (submitted +
// đề xuất SG- cho Ryan) · còn lại (có hàng, chưa Ryan quyết) → submitted (chờ kiểm).
// Xuất `data/kit-status.json` (mã ô → {asset_id, state, verdict}) cho `deploy/gcp/tickets-sheet.py sync` đọc.
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

const CLI_ACTOR = { type: 'cli', entry: 'cli' };     // ownerOrCli: kit.sync, asset.meta, submission.import
const SYS_ACTOR = { type: 'system', entry: 'cli' };  // composeOrSystem (asset.put) + review (submission.record_checks)

const EXT_IMAGE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
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

function sniffMimeKind(buf, ext) {
  if (ext === '.svg') return { kind: 'svg', mime: 'image/svg+xml' };
  return { kind: EXT_IMAGE.has(ext) ? 'image' : null, mime: MIME_OF_EXT[ext] };
}

class Report {
  constructor() {
    this.bySlotGroup = {}; // group_code -> Set(code có hàng)
    this.unmapped = [];    // {source, file, reason}
    this.deduped = 0;
    this.createdAssets = 0;
    this.metaChanged = 0;
    this.submissions = { created: 0, deduped: 0, approved: 0, review: 0, pending: 0 };
    this.checks = { run: 0, errors: 0 };
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

async function importInboxFolder(write, libDir, dirName, slotsById, groups, report, { dryRun }) {
  const mrId = (dirName.match(/^(MR-\d{3})/) || [])[1];
  const dir = path.join(libDir, 'inbox', dirName);
  const meta = readMeta(dir);
  if (!meta) { report.errors.push(`${dirName}: không đọc được meta.json`); return; }
  const verdict = DECISIONS[mrId] || 'pending';
  for (const f of meta.files || []) {
    const filePath = path.join(dir, f.name);
    if (!fs.existsSync(filePath)) { report.errors.push(`${dirName}/${f.name}: file không tồn tại`); continue; }
    const map = kitMap.mapFile({ mrId, filename: f.name });
    if (!map.code) { report.unmapped.push({ source: `inbox/${dirName}`, file: f.name, reason: map.reason }); continue; }
    const ext = path.extname(f.name).toLowerCase();
    const { kind, mime } = sniffMimeKind(fs.readFileSync(filePath).subarray(0, 32), ext);
    if (!kind) { report.unmapped.push({ source: `inbox/${dirName}`, file: f.name, reason: `kind không hỗ trợ (${ext})` }); continue; }
    markHasAsset(groups, slotsById, map.code, report);
    if (dryRun) continue;

    let asset, sub;
    try {
      const bytes = fs.readFileSync(filePath);
      asset = write(SYS_ACTOR, 'asset.put', { kind, bytes, mime, source: 'upload', meta: { import: { mr: mrId, file: f.name } } });
      if (asset.deduped) report.deduped++; else report.createdAssets++;

      const metaRes = write(CLI_ACTOR, 'asset.meta', {
        asset: asset.display_id, kit_slot: map.code,
        source_kind: 'muse', redistribution: 'in-product-only', quality: meta.quality === 'B' ? 'B' : 'A', commercial_ok: 1,
      });
      if (metaRes.changed) report.metaChanged++;

      const state = verdict === 'approved' ? 'approved' : 'submitted';
      sub = write(CLI_ACTOR, 'submission.import', {
        asset: asset.display_id, kit_slot: map.code, state,
        decision_kind: verdict === 'approved' ? 'owner' : null,
        decided_actor: verdict === 'approved' ? 'ryan' : null,
        decision_reason: verdict === 'approved' ? `Nhập kho 0.3.0-C: ${mrId} đã duyệt (HANDOFF-LOCAL.md §4 mục C, Ryan 31/10).` : null,
      });
      if (sub.deduped) report.submissions.deduped++;
      else {
        report.submissions.created++;
        report.submissions[verdict === 'approved' ? 'approved' : verdict === 'review' ? 'review' : 'pending']++;
        if (verdict === 'review') {
          write(SYS_ACTOR, 'submission.propose', {
            submission: sub.display_id, verdict: 'approve',
            reason: `Nhập kho 0.3.0-C: ${mrId} ở trạng thái "review" (HANDOFF-LOCAL.md §4 mục C) — chờ Ryan xác nhận.`,
          });
        }
      }
    } catch (e) { report.errors.push(`${dirName}/${f.name}: ${e.message}`); continue; }

    // Gói E (nếu có server/checks) — chỉ chạy khi vừa tạo lần nộp mới, tránh ghi kiểm trùng mỗi lần import lại.
    if (!sub.deduped) {
      try {
        const checksMod = require('../server/checks/index.js');
        const r = await checksMod.runChecks(filePath, map.code, {});
        const results = r.checks.map((ck) => ({
          criterion: ck.code, level: ck.pass === true ? 'ok' : ck.pass === false ? 'fail' : 'warn',
          measured: ck.measured, detail: ck.note_vi,
        }));
        // Gắn vào ASSET (không phải submission): record_checks chặn ghi khi submission không còn "submitted"
        // (vd. đã approved) — asset không có hạn chế đó, và `kit.certify` đọc kiểm theo asset.
        write(SYS_ACTOR, 'submission.record_checks', { asset: asset.display_id, run_id: `import-${mrId}-${f.name}`, results });
        report.checks.run++;
      } catch (e) { report.checks.errors++; report.errors.push(`checks ${dirName}/${f.name}: ${e.message}`); }
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

// runImport({ write, db, libDir, dryRun, only }) → report. Dùng chung cho CLI (`main`) và test (`test/l-import.test.js`).
async function runImport({ write, db, libDir = LIB, dryRun = false, only = null } = {}) {
  write(CLI_ACTOR, 'kit.sync', {}); // 457 ô — cần tồn tại trước khi gắn (asset.meta kiểm slot tồn tại)
  const slotsRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed', 'kit-slots.json'), 'utf8')).slots;
  const slotsById = new Map(slotsRaw.map((s) => [s.code, s]));
  const groups = loadSlotGroups();
  const report = new Report();

  const inboxRoot = path.join(libDir, 'inbox');
  const inboxDirs = fs.existsSync(inboxRoot)
    ? fs.readdirSync(inboxRoot, { withFileTypes: true }).filter((d) => d.isDirectory() && /^MR-\d{3}/.test(d.name)).map((d) => d.name).filter((n) => !only || n.startsWith(only))
    : [];
  for (const d of inboxDirs) await importInboxFolder(write, libDir, d, slotsById, groups, report, { dryRun });
  if (!only) await importCatalog(write, libDir, slotsById, groups, report, { dryRun });

  if (!dryRun && db) {
    const status = {};
    for (const s of slotsRaw) {
      const row = db.get('SELECT a.id, a.display_id, asub.state, asub.checks_level FROM assets a LEFT JOIN asset_submissions asub ON asub.asset_id=a.id AND asub.kit_slot=a.kit_slot WHERE a.kit_slot=? ORDER BY a.created_at DESC LIMIT 1', s.code);
      status[s.code] = row ? { asset_id: row.display_id, state: row.state || null, checks_level: row.checks_level || null } : null;
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
  if (report.errors.length) { console.log(`Lỗi (${report.errors.length}):`); for (const e of report.errors) console.log(`  - ${e}`); }
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const onlyIdx = argv.indexOf('--only');
  const only = onlyIdx >= 0 ? argv[onlyIdx + 1] : null;

  const config = configMod.load();
  const db = dbm.open(config.dataDir, { masterKey: config.masterKey });
  const write = createWriter(db, { events: eventsMod.create() });
  try {
    const report = await runImport({ write, db, dryRun, only });
    printReport(report, { dryRun });
    if (!dryRun && report.kitStatus) {
      const statusPath = path.join(config.dataDir, 'kit-status.json');
      fs.writeFileSync(statusPath, JSON.stringify(report.kitStatus, null, 2));
      console.log(`Đã ghi ${statusPath} (đọc bởi deploy/gcp/tickets-sheet.py sync).`);
    }
  } finally { db.close(); }
}

if (require.main === module) main().catch((e) => { console.error('Nhập kho thất bại:', e.message, e.detail || ''); process.exit(1); });
module.exports = { main, runImport, printReport, kindOfCatalogType, sourceKindOfLicense };
