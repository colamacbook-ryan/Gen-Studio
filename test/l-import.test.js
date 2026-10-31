// © 2026 Gen Labs — All rights reserved.
// Gói C (0.3.0) — `cli/import-kit.js` + `server/ops/import.js` + `server/kit-map.js`: nhập kho hàng hiện có vào
// 457 ô Bộ Neo. Dựng một `library/` giả nhỏ (5 file: 3 ánh xạ được + tạo asset mới, 1 trùng hash (dedup, không
// tạo asset mới), 1 không ánh xạ được — nhưng VẪN tạo asset, review PR #35 mục 2) rồi chạy `runImport`.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { tmpDb, owner } = require('./a-helpers');
const { runImport } = require('../cli/import-kit.js');

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = (fill, n = 16) => Buffer.concat([PNG_SIG, Buffer.alloc(n, fill)]);

function buildFixtureLib() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-import-lib-'));
  const mk = (rel) => fs.mkdirSync(path.join(dir, rel), { recursive: true });
  const write = (rel, buf) => fs.writeFileSync(path.join(dir, rel), buf);
  const writeJson = (rel, obj) => write(rel, Buffer.from(JSON.stringify(obj, null, 2)));

  // MR-044 (Nhi · thiết kế 3D gốc) — quyết định "approved" (brief 0.3.0-C). 3 file: variant-a (mới),
  // variant-b (mới), variant-c (CÙNG byte với variant-a ⇒ trùng hash, dedup) + 1 file tên lạ (không ánh xạ,
  // nhưng vẫn tạo asset — review PR #35 mục 2).
  mk('inbox/MR-044-nhi-3d-thiet-ke');
  const bytesA = png(0xa1), bytesB = png(0xb2), bytesD = png(0xd4);
  write('inbox/MR-044-nhi-3d-thiet-ke/nhi-3d-variant-a.png', bytesA);
  write('inbox/MR-044-nhi-3d-thiet-ke/nhi-3d-variant-b.png', bytesB);
  write('inbox/MR-044-nhi-3d-thiet-ke/nhi-3d-variant-c.png', bytesA); // trùng hash với variant-a
  write('inbox/MR-044-nhi-3d-thiet-ke/random-thing.png', bytesD);     // không khớp override/mẫu tên
  writeJson('inbox/MR-044-nhi-3d-thiet-ke/meta.json', {
    request: 'MR-044', status: 'submitted', quality: 'A',
    files: [
      { name: 'nhi-3d-variant-a.png', kind: 'image', role: 'main' },
      { name: 'nhi-3d-variant-b.png', kind: 'image', role: 'main' },
      { name: 'nhi-3d-variant-c.png', kind: 'image', role: 'main' },
      { name: 'random-thing.png', kind: 'image', role: 'main' },
    ],
    tool: 'test', prompt_used: 'đủ 10 ký tự', attempts: 1, self_check: {}, issues: [], license: 'Meta-Muse-Output', created: '2026-10-30',
  });

  // MR-052 (Ryan · toàn thân 3D) — quyết định "approved"; dùng để kiểm `ryan.*` không bao giờ public_ok.
  mk('inbox/MR-052-ryan-3d-toan-than');
  const bytesRyan = png(0x52);
  write('inbox/MR-052-ryan-3d-toan-than/ryan-3d-grey-tee.png', bytesRyan);
  writeJson('inbox/MR-052-ryan-3d-toan-than/meta.json', {
    request: 'MR-052', status: 'submitted', quality: 'A',
    files: [{ name: 'ryan-3d-grey-tee.png', kind: 'image', role: 'main' }],
    tool: 'test', prompt_used: 'đủ 10 ký tự', attempts: 1, self_check: {}, issues: [], license: 'Meta-Muse-Output', created: '2026-10-30',
  });

  return dir;
}

test('runImport: 5 file (4 tạo asset mới gồm cả không-ánh-xạ, 1 trùng hash, 1 không ánh xạ không có lần nộp) → số liệu đúng; MR-044 approved; ryan.* không bao giờ public_ok; không lỗi', async () => {
  const t = tmpDb(); owner(t.db);
  const libDir = buildFixtureLib();
  try {
    const report = await runImport({ write: t.write, db: t.db, libDir });

    assert.deepEqual(report.errors, []); // review mục 9: không có lỗi nào trên fixture hợp lệ

    // 4 file tạo asset mới: variant-a, variant-b, ryan-3d-grey-tee (có ô) + random-thing (KHÔNG có ô nhưng
    // vẫn asset.put — review mục 2); variant-c trùng hash với variant-a (dedup).
    assert.equal(report.createdAssets, 4);
    assert.equal(report.deduped, 1);
    assert.equal(report.unmapped.length, 1);
    assert.equal(report.unmapped[0].file, 'random-thing.png');

    // random-thing.png vẫn có mặt trong DB (asset tạo ra), chỉ không có kit_slot/lần nộp.
    const randomAsset = t.db.get("SELECT * FROM assets WHERE meta LIKE '%random-thing%'");
    assert.ok(randomAsset, 'random-thing.png phải được asset.put dù không ánh xạ được ô');
    assert.equal(randomAsset.kit_slot, null);
    assert.equal(t.db.get('SELECT COUNT(*) n FROM asset_submissions WHERE asset_id=?', randomAsset.id).n, 0);

    // nhi.id.01 có 2 asset (variant-a, variant-b) — ô "có hàng" đếm 1 lần.
    assert.ok(report.bySlotGroup['NB-01'].has('nhi.id.01'));
    assert.ok(report.bySlotGroup['NB-03'].has('ryan.id.01'));

    // 3 lần nộp mới (variant-a, variant-b, ryan) đều "approved" (MR-044/MR-052); variant-c trùng hash
    // ⇒ dedup submission.import (cùng asset_id + kit_slot với variant-a) ⇒ submissions.deduped.
    assert.equal(report.submissions.created, 3);
    assert.equal(report.submissions.approved, 3);
    assert.equal(report.submissions.deduped, 1);

    const subs = t.db.all("SELECT * FROM asset_submissions WHERE kit_slot='nhi.id.01'");
    assert.equal(subs.length, 2); // variant-a + variant-b (variant-c dedup, không tạo thêm hàng)
    for (const s of subs) assert.equal(s.state, 'approved');

    // review mục 4: checks_level trên submission phải CÓ GIÁ TRỊ (ghi khi còn 'submitted', trước khi nâng approved).
    for (const s of subs) assert.ok(['ok', 'warn', 'fail'].includes(s.checks_level), 'checks_level phải được ghi, không còn NULL');

    // ryan.* không bao giờ public_ok (CHECK ck_public_ok + không op nào ở gói C set public_ok=1)
    const ryanAsset = t.db.get("SELECT * FROM assets WHERE kit_slot='ryan.id.01'");
    assert.equal(ryanAsset.subject, 'ryan');
    assert.equal(ryanAsset.public_ok, 0);
    assert.throws(() => t.db.run('UPDATE assets SET public_ok=1 WHERE id=?', ryanAsset.id), /CHECK/i);

    // kit-status.json: MỘT công thức duy nhất — v_kit_coverage (migrations/0011, STANDARD-KIT-v1 §5). Nhập kho
    // (lần nộp "approved" theo quyết định Ryan 31/10) KHÔNG tự đủ điều kiện "đạt": quality vẫn null (Ryan đặt
    // khi duyệt/chứng nhận — CNS-M1-07) nên ô rơi về "thiếu" dù đã có asset gắn ô (view vẫn trỏ asset_id để
    // Ryan/Gen có đường vào xếp hạng + chứng nhận — asset_id chỉ mang tính tham khảo, KHÔNG quyết định state).
    assert.ok(report.kitStatus);
    assert.equal(report.kitStatus.slots['nhi.id.01'].state, 'thiếu');
    assert.ok(report.kitStatus.slots['nhi.id.01'].asset_id);
    assert.equal(report.kitStatus.slots['nhi.pose.01'], null); // ô chưa có hàng

    // chạy lại = 0 thay đổi (idempotent: asset.put dedup theo sha256, asset.meta/submission.import tự so khớp).
    const report2 = await runImport({ write: t.write, db: t.db, libDir });
    assert.deepEqual(report2.errors, []);
    assert.equal(report2.createdAssets, 0);
    assert.equal(report2.deduped, 5); // 5 file đã tạo asset lần 1 (a, b, c trùng hash với a, ryan, random-thing) đều trùng hash lần 2
    assert.equal(report2.metaChanged, 0);
    assert.equal(report2.submissions.created, 0);
    assert.equal(report2.submissions.deduped, 4); // 4 file có ô (a,b,c,ryan) đều gọi submission.import, đều dedup
  } finally { t.clean(); fs.rmSync(libDir, { recursive: true, force: true }); }
});

test('runImport: MR-047 → "review" (submitted + đề xuất SG- cho Ryan, không tự duyệt)', async () => {
  const t = tmpDb(); owner(t.db);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-import-lib2-'));
  try {
    fs.mkdirSync(path.join(dir, 'inbox/MR-047-vy-3d-xoay'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'inbox/MR-047-vy-3d-xoay/vy-3d-view-front.png'), png(0x47));
    fs.writeFileSync(path.join(dir, 'inbox/MR-047-vy-3d-xoay/meta.json'), JSON.stringify({
      request: 'MR-047', status: 'submitted', quality: 'A',
      files: [{ name: 'vy-3d-view-front.png', kind: 'image', role: 'main' }],
      tool: 'test', prompt_used: 'đủ 10 ký tự', attempts: 1, self_check: {}, issues: [], license: 'Meta-Muse-Output', created: '2026-10-30',
    }));

    const report = await runImport({ write: t.write, db: t.db, libDir: dir });
    assert.equal(report.submissions.review, 1);
    const sub = t.db.get("SELECT * FROM asset_submissions WHERE kit_slot='vy.id.02'");
    assert.equal(sub.state, 'submitted'); // "review" = chưa duyệt, vẫn chờ (không có submission.approve ở gói C)
    const sg = t.db.all("SELECT * FROM suggestions WHERE target_kind='submission_verdict'");
    assert.equal(sg.length, 1);
    assert.equal(sg[0].target_id, sub.display_id);
  } finally { t.clean(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('runImport: nhánh catalog.json — mục stored=git hợp lệ → asset mới + ô có hàng; mục stored=remote/type không hỗ trợ → unmapped, không lỗi', async () => {
  const t = tmpDb(); owner(t.db);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-import-catalog-'));
  try {
    fs.mkdirSync(path.join(dir, 'visual'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'visual/nhi-07-laughing.png'), png(0x07)); // khớp mẫu số → nhi.expr.07
    fs.writeFileSync(path.join(dir, 'visual/unrelated.jpg'), Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(8, 1)]));
    fs.writeFileSync(path.join(dir, 'catalog.json'), JSON.stringify({
      entries: [
        { id: 'char.nhi.laugh', type: 'character-still', title: 'Nhi cười', tags: ['nhi'], path: 'visual/nhi-07-laughing.png', stored: 'git',
          source: 'test', license: 'Meta-Muse-Output', commercial_ok: true, redistribution: 'free', quality: 'A', added: '2026-10-31', cost_usd: 0 },
        { id: 'illus.unrelated', type: 'illustration', title: 'Minh hoạ khác', tags: [], path: 'visual/unrelated.jpg', stored: 'git',
          source: 'test', license: 'CC0-1.0', commercial_ok: true, redistribution: 'free', quality: 'B', added: '2026-10-31', cost_usd: 0 },
        { id: 'font.skip', type: 'font', title: 'Font không hỗ trợ', tags: [], path: 'fonts/x.woff2', stored: 'git',
          source: 'test', license: 'OFL-1.1', commercial_ok: true, redistribution: 'free', quality: 'A', added: '2026-10-31', cost_usd: 0 },
        { id: 'remote.skip', type: 'music', title: 'Không có tệp trong git', tags: [], stored: 'remote', url: 'https://example.invalid/x.mp3',
          source: 'test', license: 'CC0-1.0', commercial_ok: true, redistribution: 'free', quality: 'A', added: '2026-10-31', cost_usd: 0 },
      ],
    }));

    const report = await runImport({ write: t.write, db: t.db, libDir: dir });
    assert.deepEqual(report.errors, []);
    assert.equal(report.createdAssets, 2); // char.nhi.laugh + illus.unrelated (font/remote bị bỏ qua, không tạo asset)
    assert.ok(report.bySlotGroup['NB-01'].has('nhi.expr.07'));
    const unmappedIds = report.unmapped.map((u) => u.file);
    assert.ok(unmappedIds.includes('illus.unrelated')); // tên file không khớp mẫu ánh xạ
    assert.ok(unmappedIds.includes('font.skip'));        // type không có kind phù hợp
    assert.ok(unmappedIds.includes('remote.skip'));      // stored=remote, không có tệp

    const nhiAsset = t.db.get("SELECT * FROM assets WHERE kit_slot='nhi.expr.07'");
    assert.equal(nhiAsset.source_kind, 'muse'); // Meta-Muse-Output → muse (DB-GK-0.1 §8)
    assert.equal(nhiAsset.redistribution, 'ok'); // 'free' → 'ok'
    assert.equal(nhiAsset.subject, 'nhi'); // suy từ tag
  } finally { t.clean(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('kit-map.mapFile: mẫu <subject>-NN-slug.ext (vd nhi-21-sulking.png) ⇒ nhi.expr.21 khi ô tồn tại; fx-NN-*/⟨subject⟩-00-base cố ý không gắn ô', () => {
  const { mapFile } = require('../server/kit-map.js');
  const r = mapFile({ mrId: null, filename: 'nhi-21-sulking.png' });
  assert.equal(r.code, 'nhi.expr.21');
  const miss = mapFile({ mrId: null, filename: 'khong-ro-999-x.png' });
  assert.equal(miss.code, null);
  const fx = mapFile({ mrId: null, filename: 'fx-01-sweat.png' });
  assert.equal(fx.code, 'fx.manpu.01');
  const base = mapFile({ mrId: null, filename: 'nhi-00-base.png' });
  assert.equal(base.code, null);
  assert.match(base.reason, /00-base/);
  // review mục 1: MR-045 (Nhi xoay) và MR-053 (Ryan xoay) override y hệt MR-047
  const front = mapFile({ mrId: 'MR-045', filename: 'nhi-3d-view-front.png' });
  assert.equal(front.code, 'nhi.id.02');
  const ryanBack = mapFile({ mrId: 'MR-053', filename: 'ryan-3d-view-back.png' });
  assert.equal(ryanBack.code, 'ryan.id.05');
  const sheet = mapFile({ mrId: 'MR-053', filename: 'ryan-3d-turnaround-sheet-3840x2160.png' });
  assert.equal(sheet.code, null);
});

// Gen (bổ sung cổng C.2, mục 1): docs/MUSE-CONNECT.md dặn Muse nộp `<mã ô>.<ext>` (vd `nhi.expr.08.png`) — MỘT
// quy ước; kit-map.js nhận cả dạng CHUẨN này và dạng CŨ `nhi-NN-slug.png` (giữ tương thích hàng đã nộp trước đó).
test('kit-map.mapFile: tên file CHUẨN = mã ô (docs/MUSE-CONNECT.md) được nhận trực tiếp, kể cả nhóm fx/audio nhiều đoạn', () => {
  const { mapFile } = require('../server/kit-map.js');
  assert.equal(mapFile({ mrId: null, filename: 'nhi.expr.08.png' }).code, 'nhi.expr.08');
  assert.equal(mapFile({ mrId: null, filename: 'fx.manpu.03.png' }).code, 'fx.manpu.03');
  assert.equal(mapFile({ mrId: null, filename: 'audio.sfx.pop.03.wav' }).code, 'audio.sfx.pop.03');
  // mã ô không tồn tại (dù đúng ngữ pháp) ⇒ vẫn unmapped, không khớp nhầm quy tắc nào khác.
  assert.equal(mapFile({ mrId: null, filename: 'nhi.expr.99.png' }).code, null);
  // dạng CŨ vẫn chạy song song (giữ tương thích).
  assert.equal(mapFile({ mrId: null, filename: 'nhi-08-laughing.png' }).code, 'nhi.expr.08');
});

test('runImport (dry-run) trên library/ thật của repo: ≥ 15 ô đã ánh xạ được (sau khi thêm override MR-045/053)', async () => {
  const t = tmpDb(); owner(t.db);
  try {
    const report = await runImport({ write: t.write, db: t.db, dryRun: true }); // libDir mặc định = library/ thật
    let totalHas = 0;
    for (const codes of Object.values(report.bySlotGroup)) totalHas += codes.size;
    assert.ok(totalHas >= 15, `kỳ vọng ≥ 15 ô có hàng trên library/ thật, đo được ${totalHas}`);
    assert.ok(report.bySlotGroup['NB-01'].has('nhi.id.02')); // MR-045
    assert.ok(report.bySlotGroup['NB-03'].has('ryan.id.05')); // MR-053
  } finally { t.clean(); }
});

test('runImport --source <dir>: nguồn ngoài library/ (vd Drive) chứa thẳng MR-xxx-*/, không có meta.json ⇒ tự dựng danh sách file, VẪN chạy máy kiểm (cortex CNS-M1-10/Gen bổ sung C.2 mục 3), không gọi catalog.json', async () => {
  const t = tmpDb(); owner(t.db);
  const src = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-import-drive-'));
  try {
    fs.mkdirSync(path.join(src, 'MR-063-nhi-bieu-cam-v2'), { recursive: true });
    fs.writeFileSync(path.join(src, 'MR-063-nhi-bieu-cam-v2/nhi-07-laughing.png'), png(0x07));
    // không có meta.json ở đây — mô phỏng hàng về từ Drive chưa đóng gói đúng MUSE.md §4

    const report = await runImport({ write: t.write, db: t.db, source: src });
    assert.deepEqual(report.errors, []);
    assert.equal(report.createdAssets, 1);
    assert.ok(report.bySlotGroup['NB-01'].has('nhi.expr.07'));
    assert.equal(report.checks.run, 1); // C.2: LUÔN chạy máy kiểm dù synthesizeMeta (không còn bỏ qua nhánh Drive)
    assert.equal(report.submissions.pending, 1); // MR-063 chưa có trong DECISIONS ⇒ 'pending' (submitted)
  } finally { t.clean(); fs.rmSync(src, { recursive: true, force: true }); }
});

const CLI_ACTOR = { type: 'cli', entry: 'cli' };
const SYS_ACTOR = { type: 'system', entry: 'cli' };

test('v_kit_coverage: "đạt" đúng 5 điều STANDARD-KIT-v1 §5 (quality A + asset_rights attested + kit_certs khớp major/subject_rev hiện hành); thiếu một điều thì không đạt', () => {
  const t = tmpDb(); const o = owner(t.db);
  try {
    t.write(CLI_ACTOR, 'kit.sync', {});
    const asset = t.write(o, 'asset.put', { kind: 'image', bytes: png(0x10), mime: 'image/png', source: 'upload' });
    t.write(CLI_ACTOR, 'asset.meta', { asset: asset.display_id, kit_slot: 'fx.manpu.01' });
    // chưa quality='A' ⇒ chưa đạt (điều 1)
    assert.equal(t.db.get("SELECT state FROM v_kit_coverage WHERE code='fx.manpu.01'").state, 'thiếu');

    t.write(CLI_ACTOR, 'asset.meta', { asset: asset.display_id, quality: 'A' });
    // có hạng A nhưng CHƯA attest asset_rights ⇒ vẫn chưa đạt (điều 2) — và chưa kit_certs nên vẫn "chờ duyệt", không "đạt"
    assert.equal(t.db.get("SELECT state FROM v_kit_coverage WHERE code='fx.manpu.01'").state, 'chờ duyệt');

    t.write(CLI_ACTOR, 'asset.attest_import', { asset: asset.display_id, basis: 'own_product', note: 'test' });
    assert.equal(t.db.get("SELECT state FROM v_kit_coverage WHERE code='fx.manpu.01'").state, 'chờ duyệt'); // vẫn chưa kit_certs (điều 3-4)

    const { requiredCriteria } = require('../server/kit-criteria.js');
    const required = requiredCriteria('fx.manpu.01');
    const results = required.m.map((criterion) => ({ criterion, level: 'ok', severity: 'M' }));
    t.write(SYS_ACTOR, 'submission.record_checks', { asset: asset.display_id, run_id: 'r1', results });
    t.write(o, 'kit.certify', { asset: asset.display_id, h_ticks: required.mh });

    const row = t.db.get("SELECT * FROM v_kit_coverage WHERE code='fx.manpu.01'");
    assert.equal(row.state, 'đạt');
    assert.equal(row.asset_id, asset.display_id);
  } finally { t.clean(); }
});

test('asset.attest_import: ghi asset_rights (CNS-M1-18) idempotent theo asset — chạy lại không ghi chồng hàng thứ hai', () => {
  const t = tmpDb(); owner(t.db);
  try {
    const asset = t.write(SYS_ACTOR, 'asset.put', { kind: 'image', bytes: png(0x11), mime: 'image/png', source: 'upload' });
    const r1 = t.write(CLI_ACTOR, 'asset.attest_import', { asset: asset.display_id, basis: 'licensed', note: 'Meta-Muse-Output · MR-999 · chờ điều khoản Meta' });
    assert.equal(r1.deduped, false);
    const r2 = t.write(CLI_ACTOR, 'asset.attest_import', { asset: asset.display_id, basis: 'licensed', note: 'lần hai' });
    assert.equal(r2.deduped, true);
    assert.equal(t.db.get('SELECT COUNT(*) n FROM asset_rights WHERE asset_id=?', asset.id).n, 1);
  } finally { t.clean(); }
});

test('nhập kho: SVG bên thứ ba bị svgOk từ chối ⇒ report.skipped (không phải lỗi) — exit 0, không vào report.errors', async () => {
  const t = tmpDb(); owner(t.db);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-import-svg-'));
  try {
    // <script> bị svgOk từ chối (server/write.js SVG_TAGS không có 'script').
    const badSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    fs.writeFileSync(path.join(dir, 'catalog.json'), JSON.stringify({
      entries: [{ id: 'ui.bad.svg', type: 'illustration', title: 'SVG xấu', tags: [], path: 'bad.svg', stored: 'git',
        source: 'test', license: 'CC0-1.0', commercial_ok: true, redistribution: 'free', quality: 'A', added: '2026-10-31', cost_usd: 0 }],
    }));
    fs.writeFileSync(path.join(dir, 'bad.svg'), badSvg);

    const report = await runImport({ write: t.write, db: t.db, libDir: dir });
    assert.deepEqual(report.errors, []); // KHÔNG phải lỗi — exit 0
    assert.equal(report.skipped.length, 1);
    assert.equal(report.skipped[0].file, 'ui.bad.svg');
    assert.match(report.skipped[0].reason, /SVG chứa thành phần không được phép/);
  } finally { t.clean(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('nhập kho: magic bytes audio/video sai nội dung (PNG đổi đuôi .wav) ⇒ báo lỗi TRƯỚC asset.put, không tạo asset giả', async () => {
  const t = tmpDb(); owner(t.db);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-import-magic-'));
  try {
    fs.mkdirSync(path.join(dir, 'inbox/MR-900-audio-gia'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'inbox/MR-900-audio-gia/audio.sfx.pop.01.wav'), png(0x22)); // PNG thật, đuôi .wav giả
    fs.writeFileSync(path.join(dir, 'inbox/MR-900-audio-gia/meta.json'), JSON.stringify({
      request: 'MR-900', status: 'submitted', quality: 'A',
      files: [{ name: 'audio.sfx.pop.01.wav', kind: 'audio', role: 'main' }],
      tool: 'test', prompt_used: 'đủ 10 ký tự', attempts: 1, self_check: {}, issues: [], license: 'Meta-Muse-Output', created: '2026-10-30',
    }));

    const report = await runImport({ write: t.write, db: t.db, libDir: dir });
    assert.equal(report.createdAssets, 0); // chặn TRƯỚC asset.put — không tạo asset giả danh audio
    assert.equal(report.errors.length, 1);
    assert.match(report.errors[0], /magic bytes không khớp/);
  } finally { t.clean(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('submission.import: chống đụng ô — ô đang bị MỘT AGENT MCP giữ claim sống (kit.claim) thì nhập kho (CLI) phải chờ, không chen vào', () => {
  const t = tmpDb(); owner(t.db);
  try {
    t.write(CLI_ACTOR, 'kit.sync', {});
    const ag = t.write(CLI_ACTOR, 'agent.create', { name: 'Muse test', scopes: ['assets.submit'] });
    const agentActor = { type: 'agent', id: ag.agent.id, scopes: ['assets.submit'], entry: 'mcp' };
    t.write(agentActor, 'kit.claim', { kit_slot: 'prop.tech.01' });

    const asset = t.write(SYS_ACTOR, 'asset.put', { kind: 'image', bytes: png(0x33), mime: 'image/png', source: 'upload' });
    assert.throws(() => t.write(CLI_ACTOR, 'submission.import', { asset: asset.display_id, kit_slot: 'prop.tech.01', state: 'submitted' }),
      /đang được agent.*giữ/);

    // ô KHÔNG bị claim (khác) thì nhập kho vẫn chạy bình thường.
    const ok = t.write(CLI_ACTOR, 'submission.import', { asset: asset.display_id, kit_slot: 'prop.tech.02', state: 'submitted' });
    assert.equal(ok.deduped, false);
  } finally { t.clean(); }
});

test('submission.set_state: chỉ sửa lần nộp do import tạo (agent_id IS NULL) và chỉ từ "submitted"', () => {
  const t = tmpDb(); owner(t.db);
  try {
    t.write(CLI_ACTOR, 'kit.sync', {});
    const asset = t.write(SYS_ACTOR, 'asset.put', { kind: 'image', bytes: png(0x44), mime: 'image/png', source: 'upload' });
    const sub = t.write(CLI_ACTOR, 'submission.import', { asset: asset.display_id, kit_slot: 'prop.tech.03', state: 'submitted' });
    t.write(CLI_ACTOR, 'submission.set_state', { submission: sub.display_id, state: 'approved', decision_kind: 'owner', decided_actor: 'ryan' });
    // đã rời "submitted" ⇒ set_state lần nữa bị chặn (chỉ đổi được TỪ submitted).
    assert.throws(() => t.write(CLI_ACTOR, 'submission.set_state', { submission: sub.display_id, state: 'rework', decision_reason: 'đủ 10 ký tự test' }),
      /chỉ đổi được từ "submitted"/);

    // lần nộp CÓ agent_id (tạo qua MCP — ngoài phạm vi submission.import) ⇒ set_state của import từ chối hoàn toàn,
    // kể cả khi còn "submitted" (dựng thẳng một hàng agent_id khác NULL để mô phỏng, không qua submission.import).
    const ag = t.write(CLI_ACTOR, 'agent.create', { name: 'Muse test 2', scopes: ['assets.submit'] });
    const mcpSub = t.db.insertRow('asset_submissions', {
      agent_id: ag.agent.id, kit_slot: 'prop.tech.04', asset_id: asset.id, previous_id: null, attempt: 1, state: 'submitted',
    }, { prefix: 'SB' });
    assert.throws(() => t.write(CLI_ACTOR, 'submission.set_state', { submission: mcpSub.display_id, state: 'rework', decision_reason: 'đủ 10 ký tự test' }),
      /do import tạo/);
  } finally { t.clean(); }
});
