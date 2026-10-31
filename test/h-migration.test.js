// © 2026 Gen Labs — All rights reserved.
// Gói P0a — migration 0003_v020.sql (SPEC-0.2.0 §9): DB mới, nâng DB 0001+0002 có dữ liệu, trigger tr_render_outputs_once (CNS-119), tr_render_awaiting_once, asset_rights chỉ-thêm.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const dbm = require('../server/db');
const state = require('../server/state');
const { tmpDb, basics, lessonBody } = require('./a-helpers');

const MIG = path.join(__dirname, '..', 'migrations');
const names = (db, type) => db.all(`SELECT name FROM sqlite_master WHERE type='${type}'`).map(r => r.name);
const cols = (db, t) => db.all(`PRAGMA table_info(${t})`).map(c => c.name);

// mọi thứ 0003 phải để lại, dù DB mới hay nâng cấp
function assertV020Schema(db) {
  assert.deepEqual(db.all('SELECT version FROM schema_migrations ORDER BY version').map(r => r.version), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const c of ['kind', 'variant', 'thumbnail', 'screens', 'host', 'music']) assert.ok(cols(db, 'lesson_versions').includes(c), 'lesson_versions.' + c);
  for (const c of ['thumbnail_pick', 'thumbnail_picked_by', 'thumbnail_picked_at', 'exported_at', 'published_at', 'published_by', 'published_source', 'awaiting_review_at']) assert.ok(cols(db, 'renders').includes(c), 'renders.' + c);
  for (const c of ['status', 'approved_version', 'approved_by', 'approved_at']) assert.ok(cols(db, 'cast_members').includes(c), 'cast_members.' + c);
  assert.deepEqual(cols(db, 'asset_rights'), ['id', 'asset_id', 'workspace_id', 'action', 'basis', 'pii_redacted', 'note', 'by', 'at']);
  const trg = names(db, 'trigger');
  for (const t of ['tr_render_outputs_once', 'tr_render_awaiting_once', 'tr_lv_immutable', 'tr_gate_immutable', 'tr_gate_nodelete', 'tr_asset_rights_noupdate', 'tr_asset_rights_nodelete']) assert.ok(trg.includes(t), t);
  const idx = names(db, 'index');
  for (const i of ['ix_runs_kind_state', 'ix_renders_published', 'ix_renders_awaiting_at', 'ix_reviews_created', 'ix_gate_subject', 'ix_gate_subject_result', 'ix_cast_status', 'ix_assets_created', 'ix_asset_rights_asset']) assert.ok(idx.includes(i), i);
  // CNS-090: không CHECK trên tên cổng và loại bài; vẫn CHECK result + subject_kind
  const gsql = db.get("SELECT sql FROM sqlite_master WHERE name='gate_results'").sql;
  assert.ok(!/gate TEXT NOT NULL CHECK/.test(gsql) && /result TEXT NOT NULL CHECK/.test(gsql) && /subject_kind TEXT NOT NULL CHECK/.test(gsql));
  assert.ok(!/kind TEXT NOT NULL DEFAULT 'lesson' CHECK/.test(db.get("SELECT sql FROM sqlite_master WHERE name='lesson_versions'").sql));
  assert.equal(db.get('PRAGMA foreign_keys').foreign_keys, 1, 'FK bật lại');
  assert.equal(db.all('PRAGMA foreign_key_check').length, 0);
}

test('0003 trên DB mới: đủ cột, trigger, index; chạy lại không làm gì', () => {
  const t = tmpDb();
  try {
    assertV020Schema(t.db);
    assert.equal(dbm.migrate(t.db).length, 0);
    // gate mới ghi được, result sai vẫn bị chặn
    const b = basics(t.write, t.db), r = t.write(b.o, 'lesson.submit', lessonBody(b));
    const g = (gate, result) => t.db.run(`INSERT INTO gate_results(id,workspace_id,display_id,subject_kind,subject_id,gate,result,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`,
      crypto.randomUUID(), t.db.ws, 'GR-' + crypto.randomUUID().slice(0, 6), 'render', r.render.id, gate, result, '2026-01-01', '2026-01-01');
    g('G-THUMB', 'pass'); g('G-CURSOR', 'unknown'); g('G-TUỲ-Ý', 'fail');
    assert.throws(() => g('G-WAV', 'xyz'), /CHECK/);
    // lesson_versions.kind: mặc định 'lesson', bất biến, không CHECK
    const lv = t.db.get('SELECT * FROM lesson_versions LIMIT 1');
    assert.equal(lv.kind, 'lesson');
    for (const c of ['kind', 'variant', 'thumbnail', 'screens', 'host', 'music']) assert.throws(() => t.db.run(`UPDATE lesson_versions SET ${c}='x' WHERE id=?`, lv.id), /bất biến/, c);
    // cast_members mặc định draft, CHECK status
    const cm = t.db.get('SELECT * FROM cast_members LIMIT 1');
    assert.equal(cm.status, 'draft');
    assert.throws(() => t.db.run("UPDATE cast_members SET status='zzz' WHERE id=?", cm.id), /CHECK/);
    t.db.run("UPDATE cast_members SET status='approved', approved_version=1 WHERE id=?", cm.id);
  } finally { t.clean(); }
});

test('0003: tr_render_outputs_once — gộp dần outputs trong pipeline được; sau awaiting_review thì khoá (CNS-119)', () => {
  const t = tmpDb();
  try {
    const b = basics(t.write, t.db), r = t.write(b.o, 'lesson.submit', lessonBody(b)), id = r.render.id;
    for (const s of ['voicing', 'judging', 'aligning', 'rendering', 'mixing']) state.transitionRender(t.db, id, s);
    state.transitionRender(t.db, id, 'gating', { outputs: { mp4: 'AS-1' } });
    t.db.run("UPDATE renders SET outputs='{\"mp4\":\"AS-1\",\"x\":1}' WHERE id=?", id);   // vẫn trong pipeline ⇒ UPDATE trực tiếp cũng được
    state.transitionRender(t.db, id, 'awaiting_review', { outputs: { thumbs: ['AS-9'] } });   // gating thêm được outputs.thumbs
    assert.deepEqual(t.db.json(t.db.get('SELECT * FROM renders WHERE id=?', id)).outputs.thumbs, ['AS-9']);
    assert.equal(t.db.json(t.db.get('SELECT * FROM renders WHERE id=?', id)).outputs.mp4, 'AS-1', 'gộp, không ghi đè');
    assert.throws(() => t.db.run("UPDATE renders SET outputs='{}' WHERE id=?", id), /outputs bất biến/);
    assert.throws(() => state.transitionRender(t.db, id, 'superseded', { outputs: { more: 1 } }), /outputs bất biến/);
    // cột khác (state, các cột mới) vẫn đổi được; ghi cùng giá trị outputs không lỗi
    t.db.run("UPDATE renders SET published_at='2026-02-01', published_by='u', published_source='export', exported_at='2026-02-01' WHERE id=?", id);
    t.db.run('UPDATE renders SET outputs=outputs WHERE id=?', id);
    assert.throws(() => t.db.run("UPDATE renders SET published_source='lạ' WHERE id=?", id), /CHECK/);
    state.transitionRender(t.db, id, 'superseded');
    assert.throws(() => t.db.run("UPDATE renders SET outputs=NULL WHERE id=?", id), /outputs bất biến/, 'cả superseded cũng khoá');
  } finally { t.clean(); }
});

test('0003: awaiting_review_at ghi một lần; asset_rights chỉ thêm hàng', () => {
  const t = tmpDb();
  try {
    const b = basics(t.write, t.db), r = t.write(b.o, 'lesson.submit', lessonBody(b)), id = r.render.id;
    t.db.run("UPDATE renders SET awaiting_review_at='2026-03-01T00:00:00.000Z' WHERE id=?", id);   // NULL → giá trị: được
    t.db.run("UPDATE renders SET awaiting_review_at='2026-03-01T00:00:00.000Z' WHERE id=?", id);   // cùng giá trị: được
    assert.throws(() => t.db.run("UPDATE renders SET awaiting_review_at='2026-04-01T00:00:00.000Z' WHERE id=?", id), /một lần/);
    assert.throws(() => t.db.run('UPDATE renders SET awaiting_review_at=NULL WHERE id=?', id), /một lần/);
    const asset = t.write(b.o, 'asset.put', { kind: 'svg', bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), mime: 'image/svg+xml', meta: {}, source: 'upload' });
    const ins = (action, basis) => t.db.run('INSERT INTO asset_rights(id,asset_id,workspace_id,action,basis,pii_redacted,by,at) VALUES(?,?,?,?,?,?,?,?)', crypto.randomUUID(), asset.id, t.db.ws, action, basis, 1, b.o.id, '2026-03-01');
    ins('attest', 'owner_upload'); ins('revoke', null);
    assert.throws(() => ins('xin', null), /CHECK/); assert.throws(() => ins('attest', 'tuỳ_ý'), /CHECK/);
    assert.throws(() => t.db.run("UPDATE asset_rights SET note='x'"), /chỉ thêm/);
    assert.throws(() => t.db.run('DELETE FROM asset_rights'), /chỉ thêm/);
    assert.equal(t.db.get('SELECT COUNT(*) n FROM asset_rights').n, 2);
  } finally { t.clean(); }
});

test('0003 nâng cấp DB 0001+0002 có dữ liệu: giữ hàng, backfill awaiting_review_at, cast → draft, gate cũ còn nguyên', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-mig3-')), key = crypto.randomBytes(32).toString('hex');
  try {
    const raw = new DatabaseSync(path.join(dir, 'studio.db'));
    raw.exec('PRAGMA foreign_keys=ON');
    raw.exec(fs.readFileSync(path.join(MIG, '0001_init.sql'), 'utf8'));
    raw.exec('PRAGMA foreign_keys=OFF');
    raw.exec(fs.readFileSync(path.join(MIG, '0002_agent_auth.sql'), 'utf8'));
    raw.exec('PRAGMA foreign_keys=ON');
    raw.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
    raw.exec("INSERT INTO schema_migrations VALUES(1,'2026-01-01T00:00:00.000Z'),(2,'2026-01-02T00:00:00.000Z')");
    const T = "'2026-01-03T00:00:00.000Z'";
    raw.exec(`
      INSERT INTO workspaces(id,name,locale,timezone,created_at,updated_at) VALUES('w','W','vi','UTC',${T},${T});
      INSERT INTO users(id,workspace_id,display_id,username,display_name,password_hash,role,created_at,updated_at) VALUES('u','w','US-0001','o','O','x','owner',${T},${T});
      INSERT INTO channels(id,workspace_id,display_id,name,created_at,updated_at) VALUES('c','w','CH-0001','K',${T},${T});
      INSERT INTO cast_members(id,workspace_id,display_id,channel_id,name,created_at,updated_at) VALUES('cm1','w','CM-0001','c','A',${T},${T}),('cm2','w','CM-0002','c','B',${T},${T});
      INSERT INTO lessons(id,workspace_id,display_id,channel_id,title,created_at,updated_at) VALUES('ls','w','LS-0001','c','Bài',${T},${T});
      INSERT INTO lesson_versions(id,workspace_id,lesson_id,version,created_at,updated_at) VALUES('lv','w','ls',1,${T},${T});
      INSERT INTO renders(id,workspace_id,display_id,lesson_version_id,state,state_changed_at,outputs,created_at,updated_at) VALUES
        ('r1','w','RD-0001','lv','awaiting_review',${T},'{"mp4":"AS-1"}',${T},${T}),
        ('r2','w','RD-0002','lv','queued',${T},NULL,${T},${T}),
        ('r3','w','RD-0003','lv','approved',${T},'{"mp4":"AS-2"}',${T},${T});
      INSERT INTO gate_results(id,workspace_id,display_id,subject_kind,subject_id,gate,result,measure,created_at,updated_at) VALUES
        ('g1','w','GR-0001','render','r1','G-WAV','pass','{"a":1}',${T},${T}), ('g2','w','GR-0002','render','r1','G-MUX','fail',NULL,${T},${T});
      INSERT INTO audit_log(id,workspace_id,display_id,ts,actor,entry,action,entity_type,entity_id) VALUES
        ('a1','w','AU-0001','2026-02-01T10:00:00.000Z','system','system','render.awaiting_review','render','RD-0001'),
        ('a2','w','AU-0002','2026-02-05T10:00:00.000Z','system','system','render.awaiting_review','render','RD-0001'),
        ('a3','w','AU-0003','2026-02-09T10:00:00.000Z','system','system','render.awaiting_review','render','RD-0003');
      INSERT INTO assets(id,workspace_id,display_id,kind,sha256,path,bytes,created_at,updated_at) VALUES('as','w','AS-0001','svg','abc','p',1,${T},${T});`);
    raw.close();

    const db = dbm.open(dir, { masterKey: key });
    assertV020Schema(db);
    // backup trước migrate (DATABASE §2)
    assert.ok(fs.readdirSync(path.join(dir, 'backups')).some(f => /^pre-migrate-\d+\.db$/.test(f)));
    // dữ liệu còn nguyên
    assert.equal(db.get('SELECT COUNT(*) n FROM renders').n, 3);
    assert.deepEqual(db.all('SELECT id, gate, result, measure FROM gate_results ORDER BY id').map(r => [r.id, r.gate, r.result, r.measure]), [['g1', 'G-WAV', 'pass', '{"a":1}'], ['g2', 'G-MUX', 'fail', null]]);
    assert.throws(() => db.run("UPDATE gate_results SET result='pass' WHERE id='g2'"), /bất biến/, 'trigger gate_results được tạo lại');
    assert.throws(() => db.run("DELETE FROM gate_results WHERE id='g1'"), /không xoá/);
    assert.deepEqual(db.all('SELECT status FROM cast_members').map(r => r.status), ['draft', 'draft']);
    assert.equal(db.get("SELECT kind FROM lesson_versions WHERE id='lv'").kind, 'lesson');
    assert.equal(db.get("SELECT thumbnail FROM lesson_versions WHERE id='lv'").thumbnail, null, 'bài cũ không có thumbnail');
    // backfill: lần ĐẦU vào awaiting_review theo audit; render chưa từng có ⇒ NULL
    const at = Object.fromEntries(db.all('SELECT id, awaiting_review_at a FROM renders').map(r => [r.id, r.a]));
    assert.deepEqual(at, { r1: '2026-02-01T10:00:00.000Z', r2: null, r3: '2026-02-09T10:00:00.000Z' });
    // trigger outputs: r1 (awaiting) và r3 (approved) khoá; r2 (queued) mở
    assert.throws(() => db.run("UPDATE renders SET outputs='{}' WHERE id='r1'"), /outputs bất biến/);
    assert.throws(() => db.run("UPDATE renders SET outputs='{}' WHERE id='r3'"), /outputs bất biến/);
    db.run("UPDATE renders SET outputs='{\"a\":1}' WHERE id='r2'");
    assert.throws(() => db.run("UPDATE renders SET awaiting_review_at='2027-01-01' WHERE id='r1'"), /một lần/);
    // asset cũ không có hàng quyền (chưa attest ≠ bị chặn: luật áp theo created_at ≥ applied_at, thuộc P0b)
    assert.equal(db.get("SELECT COUNT(*) n FROM asset_rights WHERE asset_id='as'").n, 0);
    assert.equal(dbm.migrate(db).length, 0, 'chạy lại không làm gì');
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- Gói 0.3.0-A — 0006_kit_library.sql + 0007_kit_fetch_log.sql (DB-GK-0.1 §4.1/§4.7/§4.8/§13, §12) ----
test('0006/0007 trên DB mới: đủ bảng/cột/trigger/index; chạy lại không làm gì', () => {
  const t = tmpDb();
  try {
    assert.deepEqual(t.db.all('SELECT version FROM schema_migrations ORDER BY version').map(r => r.version), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const c of ['source_kind', 'redistribution', 'quality', 'commercial_ok', 'subject', 'kit_slot', 'public_ok']) assert.ok(cols(t.db, 'assets').includes(c), 'assets.' + c);
    for (const tb of ['kit_slots', 'asset_submissions', 'asset_checks', 'kit_certs', 'asset_fetch_log']) assert.ok(names(t.db, 'table').includes(tb), tb);
    const trg = names(t.db, 'trigger');
    for (const x of ['tr_assets_immutable', 'tr_assets_ryan_lock', 'tr_kit_slots_immutable', 'tr_kit_slots_nodelete',
      'tr_checks_noupdate', 'tr_checks_nodelete', 'tr_kit_certs_noupdate', 'tr_kit_certs_nodelete', 'tr_fetch_log_noupdate', 'tr_fetch_log_nodelete_recent']) assert.ok(trg.includes(x), x);
    assert.equal(t.db.get('PRAGMA foreign_keys').foreign_keys, 1, 'FK bật lại');
    assert.equal(t.db.all('PRAGMA foreign_key_check').length, 0);
    assert.equal(dbm.migrate(t.db).length, 0, 'chạy lại không làm gì');
  } finally { t.clean(); }
});

test('0006: CHECK ck_public_ok — chân dung Ryan không bao giờ public_ok=1; redistribution ngoài tập bị từ chối', () => {
  const t = tmpDb();
  try {
    const o = t.write({ type: 'user', id: 'u0', role: 'owner', entry: 'ui' }, 'asset.put', { kind: 'svg', bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), mime: 'image/svg+xml', meta: {}, source: 'upload' });
    // hàng hợp lệ: bật public_ok=1 phải được (test cả chiều thành công, không chỉ chiều chặn)
    t.db.run("UPDATE assets SET source_kind='muse', redistribution='ok', quality='A', commercial_ok=1 WHERE id=?", o.id);
    t.db.run("UPDATE assets SET public_ok=1 WHERE id=?", o.id);
    assert.equal(t.db.get('SELECT public_ok FROM assets WHERE id=?', o.id).public_ok, 1);
    // subject='ryan' + public_ok=1 ⇒ CHECK chặn
    assert.throws(() => t.db.run("UPDATE assets SET subject='ryan' WHERE id=?", o.id), /CHECK/);
    t.db.run("UPDATE assets SET public_ok=0 WHERE id=?", o.id);
    t.db.run("UPDATE assets SET subject='ryan' WHERE id=?", o.id);
    assert.throws(() => t.db.run("UPDATE assets SET public_ok=1 WHERE id=?", o.id), /CHECK/, 'chân dung Ryan không bao giờ public_ok=1');
    // trigger tr_assets_ryan_lock: không đổi subject khỏi 'ryan' một khi đã gắn (dùng lại hàng này — không cần clear subject nữa)
    assert.throws(() => t.db.run("UPDATE assets SET subject='nhi' WHERE id=?", o.id), /chân dung Ryan/);
    t.db.run("UPDATE assets SET subject='ryan' WHERE id=?", o.id); // cùng giá trị: được

    // kit_slot dạng ryan.* cũng chặn public_ok=1 dù subject khác 'ryan' (hàng khác, chưa gắn subject)
    const o2 = t.write({ type: 'user', id: 'u0', role: 'owner', entry: 'ui' }, 'asset.put', { kind: 'svg', bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>'), mime: 'image/svg+xml', meta: {}, source: 'upload' });
    t.db.run("UPDATE assets SET source_kind='muse', redistribution='ok', quality='A', commercial_ok=1 WHERE id=?", o2.id);
    t.db.run("INSERT INTO kit_slots(code, workspace_id, group_code, title_vi, title_en) VALUES('ryan.id.01', ?, 'NB-03', 'x', 'y')", t.db.ws);
    t.db.run("UPDATE assets SET kit_slot='ryan.id.01' WHERE id=?", o2.id);
    assert.throws(() => t.db.run("UPDATE assets SET public_ok=1 WHERE id=?", o2.id), /CHECK/);
    // redistribution ngoài tập enum
    assert.throws(() => t.db.run("UPDATE assets SET redistribution='free' WHERE id=?", o2.id), /CHECK/);
  } finally { t.clean(); }
});

test('0006 nâng cấp DB 0005 có dữ liệu: giữ asset cũ, backfill source_kind, CHECK/trigger mới hoạt động', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-mig6-')), key = crypto.randomBytes(32).toString('hex');
  try {
    const raw = new DatabaseSync(path.join(dir, 'studio.db'));
    raw.exec('PRAGMA foreign_keys=ON');
    for (const f of ['0001_init.sql', '0002_agent_auth.sql', '0003_v020.sql', '0004_cast_origin.sql', '0005_aspect.sql']) {
      const sql = fs.readFileSync(path.join(MIG, f), 'utf8');
      const fkOff = /^--\s*fk-off\s*$/m.test(sql.split('\n', 3).join('\n'));
      if (fkOff) raw.exec('PRAGMA foreign_keys=OFF');
      raw.exec(sql);
      if (fkOff) raw.exec('PRAGMA foreign_keys=ON');
    }
    raw.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
    raw.exec("INSERT INTO schema_migrations VALUES(1,'2026-01-01'),(2,'2026-01-01'),(3,'2026-01-01'),(4,'2026-01-01'),(5,'2026-01-01')");
    const T = "'2026-01-03T00:00:00.000Z'";
    raw.exec(`
      INSERT INTO workspaces(id,name,locale,timezone,created_at,updated_at) VALUES('w','W','vi','UTC',${T},${T});
      INSERT INTO assets(id,workspace_id,display_id,kind,sha256,path,bytes,source,created_at,updated_at) VALUES
        ('as1','w','AS-0001','svg','abc','p',1,'upload',${T},${T}),
        ('as2','w','AS-0002','manifest','def','p2',1,'system',${T},${T});`);
    raw.close();

    const db = dbm.open(dir, { masterKey: key });
    assert.deepEqual(db.all('SELECT version FROM schema_migrations ORDER BY version').map(r => r.version), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.ok(fs.readdirSync(path.join(dir, 'backups')).some(f => /^pre-migrate-\d+\.db$/.test(f)));
    assert.equal(db.get('SELECT COUNT(*) n FROM assets').n, 2, 'hàng cũ còn nguyên');
    const byId = Object.fromEntries(db.all('SELECT id, source_kind, public_ok FROM assets').map(r => [r.id, r]));
    assert.equal(byId.as1.source_kind, 'external', 'upload → external (mặc định, owner sửa sau)');
    assert.equal(byId.as2.source_kind, 'in-house', 'system → in-house');
    assert.equal(byId.as1.public_ok, 0);
    assert.throws(() => db.run("UPDATE assets SET kind='image' WHERE id='as1'"), /bất biến/, 'trigger bất biến cũ còn hiệu lực');
    assert.equal(db.all('PRAGMA foreign_key_check').length, 0);
    assert.equal(dbm.migrate(db).length, 0);
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- Gói 0.3.0-B — 0009_kit_checks_pending.sql (review Gen PR #36 mục 1: KHÔNG sửa 0006 đã chạy ở prod) ----
test("0009 nâng cấp DB đã chạy 0006/0007/0008 (CHECK level cũ, không 'pending'): giữ hàng cũ, dựng lại CHECK có 'pending', trigger/index còn nguyên", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-mig9-')), key = crypto.randomBytes(32).toString('hex');
  try {
    const raw = new DatabaseSync(path.join(dir, 'studio.db'));
    raw.exec('PRAGMA foreign_keys=ON');
    for (const f of ['0001_init.sql', '0002_agent_auth.sql', '0003_v020.sql', '0004_cast_origin.sql', '0005_aspect.sql', '0006_kit_library.sql', '0007_kit_fetch_log.sql', '0008_kit_mcp.sql']) {
      const sql = fs.readFileSync(path.join(MIG, f), 'utf8');
      const fkOff = /^--\s*fk-off\s*$/m.test(sql.split('\n', 3).join('\n'));
      if (fkOff) raw.exec('PRAGMA foreign_keys=OFF');
      raw.exec(sql);
      if (fkOff) raw.exec('PRAGMA foreign_keys=ON');
    }
    raw.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
    raw.exec("INSERT INTO schema_migrations VALUES(1,'2026-01-01'),(2,'2026-01-01'),(3,'2026-01-01'),(4,'2026-01-01'),(5,'2026-01-01'),(6,'2026-01-01'),(7,'2026-01-01'),(8,'2026-01-01')");
    const T = "'2026-01-03T00:00:00.000Z'";
    raw.exec(`
      INSERT INTO workspaces(id,name,locale,timezone,created_at,updated_at) VALUES('w','W','vi','UTC',${T},${T});
      INSERT INTO assets(id,workspace_id,display_id,kind,sha256,path,bytes,source,created_at,updated_at) VALUES('as1','w','AS-0001','svg','abc','p',1,'upload',${T},${T});
      INSERT INTO asset_checks(id,workspace_id,run_id,asset_id,criterion,kit_ver,level,checker,created_at) VALUES('ck1','w','r1','as1','CH-01','KIT-v1','ok','system',${T});`);
    raw.close();

    const db = dbm.open(dir, { masterKey: key });
    assert.deepEqual(db.all('SELECT version FROM schema_migrations ORDER BY version').map(r => r.version), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(db.get('SELECT COUNT(*) n FROM asset_checks').n, 1, 'hàng cũ còn nguyên qua rebuild');
    assert.equal(db.get("SELECT level FROM asset_checks WHERE id='ck1'").level, 'ok');
    // CHECK mới nhận 'pending' (trước 0009 sẽ bị CHECK chặn)
    db.run("INSERT INTO asset_checks(id,workspace_id,run_id,asset_id,criterion,kit_ver,level,checker,created_at) VALUES('ck2','w','r2','as1','CH-04','KIT-v1','pending','system','2026-01-03T00:00:00.000Z')");
    assert.equal(db.get("SELECT level FROM asset_checks WHERE id='ck2'").level, 'pending');
    assert.throws(() => db.run("INSERT INTO asset_checks(id,workspace_id,run_id,asset_id,criterion,kit_ver,level,checker,created_at) VALUES('ckx','w','r3','as1','CH-05','KIT-v1','bogus','system','2026-01-03T00:00:00.000Z')"), /CHECK/, 'level ngoài tập vẫn bị chặn');
    // trigger chỉ-thêm còn nguyên
    assert.throws(() => db.run("UPDATE asset_checks SET level='fail' WHERE id='ck1'"), /chỉ thêm/);
    assert.throws(() => db.run("DELETE FROM asset_checks WHERE id='ck1'"), /chỉ thêm/);
    // index còn nguyên
    assert.ok(names(db, 'index').includes('ix_checks_sub'));
    assert.ok(names(db, 'index').includes('ix_checks_asset'));
    assert.equal(db.all('PRAGMA foreign_key_check').length, 0);
    assert.equal(dbm.migrate(db).length, 0, 'chạy lại migrator: không còn gì để áp');
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
