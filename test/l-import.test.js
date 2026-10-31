// © 2026 Gen Labs — All rights reserved.
// Gói C (0.3.0) — `cli/import-kit.js` + `server/ops/import.js` + `server/kit-map.js`: nhập kho hàng hiện có vào
// 457 ô Bộ Neo. Dựng một `library/` giả nhỏ (5 file: 3 ánh xạ được tạo asset mới, 1 trùng hash (dedup, không tạo
// asset mới), 1 không ánh xạ được) rồi chạy `runImport`.
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
  // variant-b (mới), variant-c (CÙNG byte với variant-a ⇒ trùng hash, dedup) + 1 file tên lạ (không ánh xạ).
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

test('runImport: 5 file (3 ánh xạ+tạo mới, 1 trùng hash, 1 không ánh xạ) → số liệu đúng; MR-044 approved; ryan.* không bao giờ public_ok', async () => {
  const t = tmpDb();
  const libDir = buildFixtureLib();
  try {
    const report = await runImport({ write: t.write, db: t.db, libDir });

    // 3 file tạo asset mới (variant-a, variant-b, ryan-3d-grey-tee); variant-c trùng hash với variant-a (dedup).
    assert.equal(report.createdAssets, 3);
    assert.equal(report.deduped, 1);
    assert.equal(report.unmapped.length, 1);
    assert.equal(report.unmapped[0].file, 'random-thing.png');

    // nhi.id.01 có 2 asset (variant-a, variant-b) — ô "có hàng" đếm 1 lần.
    assert.ok(report.bySlotGroup['NB-01'].has('nhi.id.01'));
    assert.ok(report.bySlotGroup['NB-03'].has('ryan.id.01'));

    // 3 lần nộp mới (variant-a, variant-b, ryan) đều "approved" (MR-044/MR-052); variant-c trùng hash
    // ⇒ dedup slot.assign/submission.import (cùng asset_id + kit_slot với variant-a) ⇒ submissions.deduped.
    assert.equal(report.submissions.created, 3);
    assert.equal(report.submissions.approved, 3);
    assert.equal(report.submissions.deduped, 1);

    const subs = t.db.all("SELECT * FROM asset_submissions WHERE kit_slot='nhi.id.01'");
    assert.equal(subs.length, 2); // variant-a + variant-b (variant-c dedup, không tạo thêm hàng)
    for (const s of subs) assert.equal(s.state, 'approved');

    // ryan.* không bao giờ public_ok (CHECK ck_public_ok + không op nào ở gói C set public_ok=1)
    const ryanAsset = t.db.get("SELECT * FROM assets WHERE kit_slot='ryan.id.01'");
    assert.equal(ryanAsset.subject, 'ryan');
    assert.equal(ryanAsset.public_ok, 0);
    assert.throws(() => t.db.run('UPDATE assets SET public_ok=1 WHERE id=?', ryanAsset.id), /CHECK/i);

    // chạy lại = 0 thay đổi (idempotent: asset.put dedup theo sha256, asset.meta/submission.import tự so khớp).
    const report2 = await runImport({ write: t.write, db: t.db, libDir });
    assert.equal(report2.createdAssets, 0);
    assert.equal(report2.deduped, 4); // 4 file đã ánh xạ (a, b, c trùng hash với a, ryan) đều trùng hash lần 2
    assert.equal(report2.metaChanged, 0);
    assert.equal(report2.submissions.created, 0);
    assert.equal(report2.submissions.deduped, 4);
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

test('kit-map.mapFile: mẫu <subject>-NN-slug.ext (vd nhi-21-sulking.png) ⇒ nhi.expr.21 khi ô tồn tại', () => {
  const { mapFile } = require('../server/kit-map.js');
  const r = mapFile({ mrId: null, filename: 'nhi-21-sulking.png' });
  assert.equal(r.code, 'nhi.expr.21');
  const miss = mapFile({ mrId: null, filename: 'khong-ro-999-x.png' });
  assert.equal(miss.code, null);
});
