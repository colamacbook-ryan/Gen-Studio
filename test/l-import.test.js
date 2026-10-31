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
const { tmpDb } = require('./a-helpers');
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
  const t = tmpDb();
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

    // kit-status.json: ô có hàng ⇒ ưu tiên lần nộp approved, lọc đúng workspace_id (review mục 6).
    assert.ok(report.kitStatus);
    assert.equal(report.kitStatus.slots['nhi.id.01'].state, 'approved');
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
  const t = tmpDb();
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
  const t = tmpDb();
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

test('runImport (dry-run) trên library/ thật của repo: ≥ 15 ô đã ánh xạ được (sau khi thêm override MR-045/053)', async () => {
  const t = tmpDb();
  try {
    const report = await runImport({ write: t.write, db: t.db, dryRun: true }); // libDir mặc định = library/ thật
    let totalHas = 0;
    for (const codes of Object.values(report.bySlotGroup)) totalHas += codes.size;
    assert.ok(totalHas >= 15, `kỳ vọng ≥ 15 ô có hàng trên library/ thật, đo được ${totalHas}`);
    assert.ok(report.bySlotGroup['NB-01'].has('nhi.id.02')); // MR-045
    assert.ok(report.bySlotGroup['NB-03'].has('ryan.id.05')); // MR-053
  } finally { t.clean(); }
});

test('runImport --source <dir>: nguồn ngoài library/ (vd Drive) chứa thẳng MR-xxx-*/, không có meta.json ⇒ tự dựng danh sách file, bỏ qua máy kiểm, không gọi catalog.json', async () => {
  const t = tmpDb();
  const src = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-import-drive-'));
  try {
    fs.mkdirSync(path.join(src, 'MR-063-nhi-bieu-cam-v2'), { recursive: true });
    fs.writeFileSync(path.join(src, 'MR-063-nhi-bieu-cam-v2/nhi-07-laughing.png'), png(0x07));
    // không có meta.json ở đây — mô phỏng hàng về từ Drive chưa đóng gói đúng MUSE.md §4

    const report = await runImport({ write: t.write, db: t.db, source: src });
    assert.deepEqual(report.errors, []);
    assert.equal(report.createdAssets, 1);
    assert.ok(report.bySlotGroup['NB-01'].has('nhi.expr.07'));
    assert.equal(report.checks.run, 0); // synthesizeMeta ⇒ bỏ qua máy kiểm (thiếu self_check/role đáng tin)
    assert.equal(report.submissions.pending, 1); // MR-063 chưa có trong DECISIONS ⇒ 'pending' (submitted)
  } finally { t.clean(); fs.rmSync(src, { recursive: true, force: true }); }
});
