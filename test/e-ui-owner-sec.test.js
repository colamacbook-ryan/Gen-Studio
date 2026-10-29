// © 2026 Gen Labs — All rights reserved.
// Review bảo mật server/routes/studio-owner.js (UI-INT): mọi route cần phiên; route ghi chỉ phiên UI của chủ xưởng + CSRF + Origin cùng gốc;
// test âm: agent Bearer (token THẬT, scope đủ) · không phiên · Origin lạ / thiếu Origin. Ghi đi qua write() với actor của phiên (audit_log).
// Bảng nhân vật: w ngoài biên / version sai ⇒ 400; INT-09: trang sân khấu không hardcode tên owner.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { bootDemo, request } = require('./e-ui-w2-helpers.js');

const WRITES = [
  ['POST', '/api/suggestions/SG-0001/apply', {}],
  ['POST', '/api/renders/RN-0001/thumbnail', { variant: 0 }],
  ['POST', '/api/renders/RN-0001/published', { published: true }],
  ['POST', '/api/cast/CM-0001/approve', {}],
  ['POST', '/api/cast/CM-0001/retire', {}],
  ['POST', '/api/cast/CM-0001/voice', { provider: 'gemini', voice: 'Puck' }],
];
const READS = ['/api/channels/CH-0001/brand', '/api/renders/RN-0001/room', '/api/lessons/LS-0001/ext', '/api/cast/CM-0001', '/api/cast/CM-0001/sheet?w=640'];

test('studio-owner: agent Bearer (token thật) · không phiên · Origin lạ ⇒ bị chặn trước khi chạm write(); không ghi audit', async () => {
  const t = await bootDemo();
  try {
    const owner = t.ownerActor();
    const { token } = t.write(owner, 'agent.create', { name: 'Agent thử bảo mật', scopes: ['read', 'compose', 'run'] });
    assert.match(token, /^gst_/);
    const audit0 = t.db.get('SELECT COUNT(*) AS n FROM audit_log').n;
    for (const [method, p, body] of WRITES) {
      // 1) agent Bearer, không phiên ⇒ 403 (route ui)
      const ag = await request(t.base, method, p, { body, token, origin: t.base });
      assert.equal(ag.status, 403, `${p} agent: ${ag.text}`);
      assert.equal(ag.json.error.code, 'forbidden');
      // agent Bearer kèm CSRF đoán + Origin đúng vẫn không thay được phiên
      assert.equal((await request(t.base, method, p, { body, token, origin: t.base, csrf: 'x' })).status, 403, p);
      // 2) không phiên, không token ⇒ 401
      const anon = await request(t.base, method, p, { body, origin: t.base });
      assert.equal(anon.status, 401, `${p} không phiên: ${anon.text}`);
      // 3) phiên owner + CSRF đúng nhưng Origin lạ ⇒ 403; thiếu Origin ⇒ 403 (strictOrigin)
      const evil = await request(t.base, method, p, { body, cookie: t.sess.cookie, csrf: t.sess.csrf, origin: 'http://evil.example' });
      assert.equal(evil.status, 403, `${p} Origin lạ: ${evil.text}`);
      const noOrigin = await request(t.base, method, p, { body, cookie: t.sess.cookie, csrf: t.sess.csrf });
      assert.equal(noOrigin.status, 403, `${p} thiếu Origin: ${noOrigin.text}`);
      // phiên đúng + Origin đúng nhưng thiếu CSRF ⇒ 403
      assert.equal((await request(t.base, method, p, { body, cookie: t.sess.cookie, origin: t.base })).status, 403, `${p} thiếu CSRF`);
    }
    assert.equal(t.db.get('SELECT COUNT(*) AS n FROM audit_log').n, audit0, 'không yêu cầu bị chặn nào ghi được audit');
    // route đọc: không phiên ⇒ 401; agent Bearer ⇒ 401 (chỉ phiên UI đọc màn hình)
    for (const p of READS) {
      assert.equal((await request(t.base, 'GET', p, {})).status, 401, p);
      assert.equal((await request(t.base, 'GET', p, { token })).status, 401, p + ' (Bearer)');
    }
  } finally { await t.clean(); }
});

test('studio-owner: ghi hợp lệ đi qua write() với actor của phiên (audit_log ghi đúng user, entry ui)', async () => {
  const t = await bootDemo();
  try {
    const owner = t.ownerActor();
    const r = await t.api('POST', '/api/cast/CM-0002/retire', {});
    assert.equal(r.status, 200, r.text);
    const a = t.db.get("SELECT actor, entry FROM audit_log WHERE action='cast.retire' ORDER BY rowid DESC LIMIT 1");
    assert.ok(a, 'có dòng audit cast.retire');
    assert.equal(a.entry, 'ui');
    assert.ok(String(a.actor).includes(owner.id), 'actor = user của phiên: ' + JSON.stringify(a));
  } finally { await t.clean(); }
});

test('studio-owner: bảng nhân vật — w ngoài biên / version sai ⇒ 400, nhân vật/version không có ⇒ 404', async () => {
  const t = await bootDemo();
  try {
    for (const q of ['w=10', 'w=5000', 'w=abc', 'w=640&version=0', 'w=640&version=1.5', 'w=640&version=-2']) {
      const r = await t.api('GET', '/api/cast/CM-0001/sheet?' + q);
      assert.equal(r.status, 400, q + ': ' + r.text);
    }
    assert.equal((await t.api('GET', '/api/cast/CM-0001/sheet?w=640&version=999')).status, 404);
    assert.equal((await t.api('GET', '/api/cast/CM-9999/sheet?w=640')).status, 404);
    const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'studio-owner.js'), 'utf8');
    assert.match(src, /sheetLimiter\.hit\('sheet:' \+ c\.sess\.tokenHash/, 'hạn tần suất dựng mới theo phiên');
    assert.match(src, /Math\.round\(w0 \/ 160\) \* 160/, 'w lượng tử hoá ⇒ cache không bị phá bằng w lẻ');
  } finally { await t.clean(); }
});

test('INT-09: trang sân khấu / bảng nhân vật không hardcode tên owner', () => {
  const dir = path.join(__dirname, '..', 'render', 'stage');
  for (const f of fs.readdirSync(dir).filter((x) => /\.(js|html)$/.test(x))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(!/Ryan/i.test(src), f + ' còn tên owner');
  }
});
