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
// Xuất `data/kit-status.json` (mã ô → {asset_id, state, checks_level}) — tính TỪ `v_kit_coverage` (migrations/0011,
// MỘT công thức «ô đạt», cortex CNS-M1-09), đọc bởi `deploy/gcp/tickets-sheet.py sync` (gói F, xem docs/IMPORT.md).
// Gói C.2 (nợ review C + cortex CNS-M1-07/18): KHÔNG tự gán `assets.quality='A'` từ khai báo của Muse (hạng tự
// khai vào `asset_submissions.quality_claimed`, Ryan đặt `assets.quality` khi duyệt/chứng nhận) · ghi `asset_rights`
// (asset.attest_import) cho mọi asset nhập kho · magic bytes cho audio/video (server/checks/magic.js) trước khi
// tạo asset · SVG bên thứ ba bị `svgOk` từ chối ⇒ `report.skipped` (không phải lỗi) · `--dry-run` không đọc hết
// file · `--only`/`--source` thiếu giá trị ⇒ usage, exit 2.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const configMod = require('../server/config.js');
const dbm = require('../server/db.js');
const eventsMod = require('../server/events.js');
const { createWriter } = require('../server/write.js');
const kitMap = require('../server/kit-map.js');
const magicMod = require('../server/checks/magic.js');

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
const EXT_RECOGNIZED = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.wav', '.mp3', '.ogg', '.mp4', '.webm']);
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

// sniffKindMime(ext) — kind/mime KỲ VỌNG theo đuôi file; với audio/video, nội dung thật được xác nhận riêng
// bằng magic bytes (verifyAudioVideoMagic) TRƯỚC khi tạo asset — đuôi file không đáng tin (Muse có thể gõ sai).
function sniffKindMime(ext) {
  if (ext === '.svg') return { kind: 'svg', mime: 'image/svg+xml' };
  if (EXT_IMAGE.has(ext)) return { kind: 'image', mime: MIME_OF_EXT[ext] };
  if (ext === '.wav' || ext === '.mp3' || ext === '.ogg') return { kind: 'audio', mime: { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' }[ext] };
  if (ext === '.mp4' || ext === '.webm') return { kind: 'video', mime: ext === '.mp4' ? 'video/mp4' : 'video/webm' };
  return { kind: null, mime: null };
}

// Magic bytes cho audio/video (DB-GK-0.1 §7; cortex bổ sung cổng C.2 mục 3): `server/write.js` (asset.put lõi)
// CHỈ kiểm nội dung thật của svg/image/cover/logo — audio/video đi thẳng, không bọc gì (bài học L-101: kiểm
// magic bytes, không tự bọc). Tái dùng `server/checks/magic.js` (gói E) — MỘT nguồn sniff cho cả máy kiểm Bộ
// Neo lẫn nhập kho. → null (khớp) hoặc chuỗi lý do lỗi.
function verifyAudioVideoMagic(bytes, declaredMime) {
  const sn = magicMod.sniff(bytes, declaredMime);
  if (sn.ok) return null;
  return `magic bytes không khớp (phát hiện ${sn.detected || 'không rõ'}${sn.declared ? ', khai ' + sn.declared : ''})`;
}

class Report {
  constructor() {
    this.bySlotGroup = {};       // group_code -> Set(code có hàng)
    this.unmapped = [];          // {source, file, reason}
    this.skipped = [];           // {source, file, reason} — KHÔNG phải lỗi (vd SVG bên thứ ba bị svgOk từ chối)
    this.deduped = 0;
    this.createdAssets = 0;
    this.metaChanged = 0;
    this.rightsAttested = 0;
    this.submissions = { created: 0, deduped: 0, approved: 0, review: 0, pending: 0 };
    this.checks = { run: 0, errors: 0 };
    this.approvedWithMFail = []; // [{mr, file, kit_slot, failed:[criterion]}] — "approved" nhưng còn tiêu chí M fail
    this.errors = [];
    // review opus PR #38 mục 1/3 [chặn/major]: lỗi CẤU HÌNH (đường dẫn sai, --source rỗng bất thường…) — KHÁC lỗi
    // từng file (file hỏng, magic bytes sai…). `--allow-errors` chỉ được bỏ qua lỗi từng file; lỗi cấu hình luôn
    // thoát khác 0 để `|| alert.sh` của systemd timer bắt được, không bị `--allow-errors` của cron làm im lặng.
    this.configErrors = [];
  }
}

// SVG bên thứ ba bị `write()` từ chối ở asset.put (svgOk — thành phần không được phép: script, animate, use,
// style, thực thể…) — đây KHÔNG phải lỗi nhập kho (nguồn ngoài, không sửa được), ghi report.skipped kèm lý do,
// không chặn exit code (review C.2 mục 3).
function isSvgRejected(e) { return e && e.code === 'invalid' && /SVG chứa thành phần không được phép/.test(e.message || ''); }

// basis attest (DB-GK-0.1 §8): Gen-Labs-proprietary/Veo-Output/Google-Gemini-Output → own_product; còn lại (Meta-Muse-Output
// và mọi license ngoài) → licensed.
function basisOfSourceKind(sourceKind) { return sourceKind === 'in-house' ? 'own_product' : 'licensed'; }

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
    const { kind, mime } = sniffKindMime(ext);
    if (!kind) { report.unmapped.push({ source: `inbox/${dirName}`, file: f.name, reason: `kind không hỗ trợ (${ext})` }); continue; }

    const map = kitMap.mapFile({ mrId, filename: f.name });
    if (map.code) markHasAsset(groups, slotsById, map.code, report);
    else report.unmapped.push({ source: `inbox/${dirName}`, file: f.name, reason: map.reason });
    if (dryRun) continue; // --dry-run: chỉ cần tên file để ánh xạ — KHÔNG đọc nội dung (review C.2 mục 3).

    let bytes;
    try { bytes = fs.readFileSync(filePath); } catch (e) { report.errors.push(`${dirName}/${f.name}: ${e.message}`); continue; }

    if (kind === 'audio' || kind === 'video') {
      const reason = verifyAudioVideoMagic(bytes, mime);
      if (reason) { report.errors.push(`${dirName}/${f.name}: ${reason}`); continue; }
    }

    // review mục 2: LUÔN asset.put + asset.meta dù không ánh xạ được ô (chỉ bỏ submission.import nếu vậy) —
    // nhập kho vẫn phải thấy được file trong DB để Ryan/Gen gắn ô tay sau này, không mất hẳn.
    let asset;
    try {
      asset = write(SYS_ACTOR, 'asset.put', { kind, bytes, mime, source: 'upload', meta: { import: { mr: mrId, file: f.name } } });
      if (asset.deduped) report.deduped++; else report.createdAssets++;

      // C.2 (cortex CNS-M1-07): KHÔNG gán `quality` ở đây — hạng tự khai của Muse (meta.quality) chỉ vào
      // `asset_submissions.quality_claimed` (dưới), Ryan đặt `assets.quality` khi duyệt/chứng nhận.
      const metaRes = write(CLI_ACTOR, 'asset.meta', {
        asset: asset.display_id, kit_slot: map.code || undefined,
        source_kind: 'muse', redistribution: 'in-product-only', commercial_ok: 1,
      });
      if (metaRes.changed) report.metaChanged++;
    } catch (e) {
      if (isSvgRejected(e)) { report.skipped.push({ source: `inbox/${dirName}`, file: f.name, reason: e.message }); continue; }
      report.errors.push(`${dirName}/${f.name}: ${e.message}`); continue;
    }

    // review opus PR #38 mục 7 [minor]: TÁCH try riêng cho attest_import — trước đây lỗi ở attest (vd hiếm gặp
    // "chưa có owner") làm MẤT CẢ asset.put/asset.meta ĐÃ THÀNH CÔNG ở trên (catch chung `continue` bỏ luôn
    // submission.import + máy kiểm bên dưới). Attest hỏng vẫn ghi lỗi, nhưng asset + lần nộp + máy kiểm vẫn tiếp tục.
    try {
      const attestRes = write(CLI_ACTOR, 'asset.attest_import', {
        asset: asset.display_id, basis: 'licensed', note: `Meta-Muse-Output · ${mrId} · chờ điều khoản Meta`,
      });
      if (!attestRes.deduped) report.rightsAttested++;
    } catch (e) { report.errors.push(`asset_rights ${dirName}/${f.name}: ${e.message}`); }

    if (!map.code) continue; // không có ô ⇒ không có lần nộp/máy kiểm (chỉ asset ở trên)

    let sub;
    try {
      // Luôn tạo ở 'submitted' trước (idempotent theo asset+ô) — record_checks chỉ ghi được khi còn 'submitted'
      // (review mục 4); "approved" (nếu quyết định vậy) áp SAU, bằng submission.set_state bên dưới.
      sub = write(CLI_ACTOR, 'submission.import', { asset: asset.display_id, kit_slot: map.code, state: 'submitted', quality_claimed: meta.quality === 'B' ? 'B' : 'A' });
    } catch (e) { report.errors.push(`${dirName}/${f.name}: ${e.message}`); continue; }
    if (sub.deduped) { report.submissions.deduped++; continue; }
    report.submissions.created++;

    // C.2 (Gen, bổ sung mục 3): LUÔN chạy máy kiểm, kể cả thư mục tự dựng (--source chưa có meta.json) — trước
    // đây bỏ qua máy kiểm cho nhánh Drive khiến "chưa kiểm"/"kiểm đạt" trông giống nhau (cortex CNS-M1-10).
    // Không gán quality='A' dù qua máy kiểm (điều đó là của Ryan — xem ghi chú ở asset.meta trên).
    let mFails = [];
    try {
      const checksMod = require('../server/checks/index.js');
      const toDb = require('../server/checks/to-db.js');
      const r = await checksMod.runChecks(filePath, map.code, {});
      const results = toDb.toDbResults(r);
      write(SYS_ACTOR, 'submission.record_checks', { submission: sub.display_id, run_id: `import-${mrId}-${f.name}`, results });
      report.checks.run++;
      mFails = results.filter((x) => x.severity === 'M' && x.level === 'fail').map((x) => x.criterion);
    } catch (e) { report.checks.errors++; report.errors.push(`checks ${dirName}/${f.name}: ${e.message}`); }

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

    let bytes;
    try { bytes = fs.readFileSync(filePath); } catch (e2) { report.errors.push(`catalog ${e.id}: ${e2.message}`); continue; }
    const mimeOfExt = MIME_OF_EXT[ext] || null;
    if (kind === 'audio' || kind === 'video') {
      const reason = verifyAudioVideoMagic(bytes, mimeOfExt);
      if (reason) { report.errors.push(`catalog ${e.id}: ${reason}`); continue; }
    }

    let asset, sourceKind;
    try {
      asset = write(SYS_ACTOR, 'asset.put', { kind, bytes, mime: mimeOfExt, source: 'upload', meta: { import: { catalog_id: e.id } } });
      if (asset.deduped) report.deduped++; else report.createdAssets++;

      sourceKind = sourceKindOfLicense(e.license);
      const metaRes = write(CLI_ACTOR, 'asset.meta', {
        asset: asset.display_id, kit_slot: map.code || undefined,
        source_kind: sourceKind, redistribution: e.redistribution === 'free' ? 'ok' : e.redistribution,
        quality: e.quality, commercial_ok: e.commercial_ok ? 1 : 0, subject: subjectFromTags(e.tags),
      });
      if (metaRes.changed) report.metaChanged++;
    } catch (err) {
      if (isSvgRejected(err)) { report.skipped.push({ source: 'catalog', file: e.id, reason: err.message }); continue; }
      report.errors.push(`catalog ${e.id}: ${err.message}`); continue;
    }

    // review opus PR #38 mục 7 [minor]: tách try riêng cho attest (xem ghi chú ở importInboxFolder) — lỗi attest
    // không được xoá mất asset.put/asset.meta đã ghi thành công.
    try {
      // C.2 (cortex CNS-M1-18): catalog.json là dữ liệu đã duyệt sẵn (license/source_url có kiểm) — attest
      // thẳng theo license đã khai (DB-GK-0.1 §8), khác nhánh Muse (meta.json tự khai, "chờ điều khoản Meta").
      const attestRes = write(CLI_ACTOR, 'asset.attest_import', {
        asset: asset.display_id, basis: basisOfSourceKind(sourceKind), note: `${e.license || '?'} · ${e.source_url || e.source || e.id}`,
      });
      if (!attestRes.deduped) report.rightsAttested++;
    } catch (err) { report.errors.push(`asset_rights catalog ${e.id}: ${err.message}`); }
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
  const inboxRootExists = fs.existsSync(inboxRoot);
  const inboxDirs = inboxRootExists
    ? fs.readdirSync(inboxRoot, { withFileTypes: true }).filter((d) => d.isDirectory() && /^MR-\d{3}/.test(d.name)).map((d) => d.name).filter((n) => !only || n.startsWith(only))
    : [];
  // review opus PR #38 mục 1 [chặn]: --source trỏ sai thư mục (vd thiếu `03_Hoan-thanh/`) quét ra 0 thư mục MR
  // và trước đây thoát êm mã 0 — timer gs-import im lặng không nhập gì suốt. 0 thư mục ⇒ lỗi thật (report.errors),
  // không phải "rỗng hợp lệ"; chỉ áp khi dùng `--source` (thư mục `library/inbox/` mặc định có thể rỗng hợp lệ).
  if (source && inboxDirs.length === 0) {
    report.configErrors.push(`--source ${source}: không thấy thư mục MR-xxx nào${inboxRootExists ? '' : ' (đường dẫn không tồn tại)'} — kiểm đường dẫn (hàng Drive nằm ở <thư mục>/03_Hoan-thanh/<MR>/, không phải thẳng ở gốc).`);
  }
  for (const d of inboxDirs) await importInboxFolder(write, inboxRoot, d, slotsById, groups, report, { dryRun });
  if (!only && !source) await importCatalog(write, libDir, slotsById, groups, report, { dryRun });

  if (!dryRun && db) {
    // C.2 (DB-GK-0.1 §13, cortex CNS-M1-09): MỘT công thức «ô đạt» — đọc thẳng `v_kit_coverage` (migrations/0011),
    // không tự tính lại (trước đây ưu tiên lần nộp 'approved' bất kỳ, không phải định nghĩa ô đạt của STANDARD §5).
    const rows = db.all('SELECT code, asset_id, checks_level, state, competing FROM v_kit_coverage WHERE workspace_id=?', db.ws);
    const status = {};
    for (const r of rows) status[r.code] = r.asset_id ? { asset_id: r.asset_id, state: r.state, checks_level: r.checks_level || null } : null;
    report.kitStatus = { generated_at: new Date().toISOString(), slots: status };
    // review opus PR #38 mục 6 [major]: ô "đạt" nhưng còn lần nộp MỞ (đường B, Muse qua MCP) đang chờ xem xét —
    // state ưu tiên "đạt" che mất việc này; báo riêng để Ryan không tưởng nhầm đã xong hẳn.
    report.coveredWithCompeting = rows.filter((r) => r.state === 'đạt' && r.competing > 0).map((r) => ({ code: r.code, competing: r.competing }));
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
  console.log(`Quyền dùng (asset_rights): ${report.rightsAttested} attest mới.`);
  console.log(`Lần nộp: ${report.submissions.created} mới (approved=${report.submissions.approved}, review=${report.submissions.review}, pending=${report.submissions.pending}), ${report.submissions.deduped} trùng bỏ qua.`);
  console.log(`Máy kiểm (gói E): ${report.checks.run} lần chạy, ${report.checks.errors} lỗi.`);
  console.log(`File không ánh xạ được: ${report.unmapped.length}`);
  for (const u of report.unmapped) console.log(`  - [${u.source}] ${u.file}: ${u.reason}`);
  if (report.skipped.length) {
    console.log(`Bỏ qua (không phải lỗi, vd SVG bên thứ ba bị svgOk từ chối): ${report.skipped.length}`);
    for (const s of report.skipped) console.log(`  - [${s.source}] ${s.file}: ${s.reason}`);
  }
  if (report.approvedWithMFail.length) {
    console.log(`\nCẢNH BÁO: ${report.approvedWithMFail.length} ô "approved" theo quyết định Ryan nhưng MÁY KIỂM còn tiêu chí M fail — KHO CHƯA CERTIFY ĐƯỢC cho tới khi làm lại/miễn tiêu chí:`);
    for (const w of report.approvedWithMFail) console.log(`  - ${w.mr}/${w.file} (${w.kit_slot}): ${w.failed.join(', ')}`);
  }
  if (report.coveredWithCompeting && report.coveredWithCompeting.length) {
    console.log(`\nLƯU Ý: ${report.coveredWithCompeting.length} ô đã "đạt" nhưng còn lần nộp MỞ (đường MCP) đang chờ xem xét — không tự ẩn, Ryan xem ở A4:`);
    for (const w of report.coveredWithCompeting) console.log(`  - ${w.code}: ${w.competing} lần nộp đang mở`);
  }
  if (report.errors.length) { console.log(`Lỗi (${report.errors.length}):`); for (const e of report.errors) console.log(`  - ${e}`); }
  if (report.configErrors.length) {
    console.log(`\n✗ LỖI CẤU HÌNH (${report.configErrors.length}) — KHÔNG bỏ qua được bằng --allow-errors:`);
    for (const e of report.configErrors) console.log(`  - ${e}`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const allowErrors = argv.includes('--allow-errors');
  // C.2 (review nợ, mục 3): cờ thiếu giá trị (cuối argv, hoặc giá trị kế tiếp lại là một cờ khác) ⇒ usage, exit 2
  // (quy ước Unix: 2 = lỗi cách dùng, khác exit 1 = lỗi khi chạy thật).
  const usage = (msg) => {
    console.error(`✗ ${msg}`);
    console.error('Dùng: genstudio import [--dry-run] [--only MR-xxx] [--source <dir>] [--allow-errors]');
    process.exit(2);
  };
  const onlyIdx = argv.indexOf('--only');
  let only = null;
  if (onlyIdx >= 0) {
    only = argv[onlyIdx + 1];
    if (!only || only.startsWith('--')) usage('--only cần kèm giá trị (vd --only MR-044).');
  }
  const sourceIdx = argv.indexOf('--source');
  let source = null;
  if (sourceIdx >= 0) {
    const raw = argv[sourceIdx + 1];
    if (!raw || raw.startsWith('--')) usage('--source cần kèm đường dẫn thư mục.');
    source = path.resolve(raw);
  }

  const config = configMod.load();
  const db = dbm.open(config.dataDir, { masterKey: config.masterKey });
  const write = createWriter(db, { events: eventsMod.create() });
  try {
    const report = await runImport({ write, db, dryRun, only, source });
    printReport(report, { dryRun });
    if (!dryRun && report.kitStatus) {
      const statusPath = path.join(config.dataDir, 'kit-status.json');
      fs.writeFileSync(statusPath, JSON.stringify(report.kitStatus, null, 2));
      console.log(`Đã ghi ${statusPath} (deploy/gcp/tickets-sheet.py sync đọc qua env GS_KIT_STATUS — xem docs/IMPORT.md).`);
    }
    // review mục 3: có lỗi thật (file hỏng, ghi DB lỗi…) ⇒ exit khác 0 để CI/script gọi biết mà dừng lại,
    // trừ khi --allow-errors (đã xem báo cáo, chấp nhận chạy tiếp, vd lỗi SVG bên thứ ba đã biết trước).
    if (report.errors.length && !allowErrors) {
      console.error(`\n✗ Có ${report.errors.length} lỗi — dừng với exit 1 (dùng --allow-errors để bỏ qua).`);
      process.exitCode = 1;
    }
    // review opus PR #38 mục 1/3: lỗi cấu hình (vd --source trỏ sai đường dẫn, quét ra 0 thư mục MR) luôn thoát
    // khác 0, KỂ CẢ có --allow-errors — đây không phải lỗi "từng file" được phép bỏ qua để cron chạy tiếp.
    if (report.configErrors.length) process.exitCode = 1;
  } finally { db.close(); }
}

if (require.main === module) main().catch((e) => { console.error('Nhập kho thất bại:', e.message, e.detail || ''); process.exit(1); });
module.exports = { main, runImport, printReport, kindOfCatalogType, sourceKindOfLicense };
