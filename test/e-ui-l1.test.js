// © 2026 Gen Labs — All rights reserved.
// Gói UI-L1 — màn Nhân vật: chuỗi vi/en, đọc lỗi validateRecipe, route GET /api/cast/:id (trạng thái suy ra, kiểm công thức, giọng quét),
// Chốt/Nghỉ chỉ owner trên phiên UI (agent token ⇒ 403), đổi giọng ⇒ version mới ⇒ "đã chốt · có thay đổi chờ chốt", bảng nhân vật qua route sheet.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { bootDemo, load, request, STUDIO } = require('./e-ui-w2-helpers.js');

test('L1 i18n: mọi khoá trạng thái/tab/giới tính động có đủ vi + en', async () => {
  const { MODULES } = await load('i18n/index.js');
  const { vi, en } = MODULES.cast;
  assert.deepEqual(Object.keys(vi).sort(), Object.keys(en).sort());
  for (const st of ['draft', 'candidate', 'approved', 'approved_pending', 'retired']) { assert.ok(vi['cast.st.' + st] && en['cast.st.' + st], st); assert.ok(vi['cast.note.' + st], 'note ' + st); }
  for (const k of ['sheet', 'voice', 'recipe', 'versions']) assert.ok(vi['cast.tab.' + k], k);
  for (const k of ['gemini', 'offline']) assert.ok(vi['cast.voice.' + k], k);
  assert.ok(vi['st.candidate'] && vi['st.retired'], 'ô lưới trạng thái nhân vật có chữ');
});

test('L1 detailErrors: đọc lại danh sách lỗi theo trường từ detail đã thành chuỗi; không có ⇒ null', async () => {
  const { detailErrors } = await load('views/cast.js');
  assert.deepEqual(detailErrors({ detail: JSON.stringify({ errors: [{ path: 'voice.voice', text_human: 'Giọng trùng' }] }) }), [{ path: 'voice.voice', text_human: 'Giọng trùng' }]);
  assert.equal(detailErrors({ detail: 'không phải JSON' }), null);
  assert.equal(detailErrors({ detail: { errors: 'x' } }), null);
  assert.equal(detailErrors(null), null);
});

test('L1 mã giao diện: không render object; Chốt dùng đi qua hộp xác nhận, Cho nghỉ là nút 2 bước; route cast.js là màn thật', () => {
  const src = fs.readFileSync(path.join(STUDIO, 'views', 'cast.js'), 'utf8');
  assert.match(src, /approveDialog\(m,/);
  assert.match(src, /confirmButton\(t\('cast\.retire'\)/);
  assert.ok(!/innerHTML/.test(src));
  assert.match(src, /\/api\/cast\/' \+ encodeURIComponent\(m\.display_id\) \+ '\/sheet/);
});

test('L1 HTTP: xem nhân vật, chốt (owner UI), đổi giọng ⇒ có thay đổi chờ chốt, cho nghỉ; token agent ⇒ 403; thiếu CSRF ⇒ 403', async () => {
  const t = await bootDemo();
  try {
    const r = await t.api('GET', '/api/cast/CM-0001');
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.member.display_id, 'CM-0001');
    assert.ok(['draft', 'candidate'].includes(r.json.member.status));
    assert.ok(r.json.validation && typeof r.json.validation.ok === 'boolean' && Array.isArray(r.json.validation.errors));
    assert.ok(r.json.voices && typeof r.json.voices === 'object');
    // agent (Bearer, không phiên) không chốt được
    const ag = await request(t.base, 'POST', '/api/cast/CM-0001/approve', { body: {}, token: 'gst_khong_hop_le', origin: t.base });
    assert.equal(ag.status, 403);
    const noCsrf = await request(t.base, 'POST', '/api/cast/CM-0001/approve', { body: {}, cookie: t.sess.cookie, origin: t.base });
    assert.equal(noCsrf.status, 403);
    // owner chốt: nếu công thức đạt ⇒ approved; nếu không ⇒ 400 kèm danh sách lỗi (UI hiện thân thiện)
    const ap = await t.api('POST', '/api/cast/CM-0001/approve', { version: r.json.member.current_version });
    if (r.json.validation.ok) {
      assert.equal(ap.status, 200, ap.text);
      const after = await t.api('GET', '/api/cast/CM-0001');
      assert.equal(after.json.member.status, 'approved');
      // đổi giọng ⇒ version mới; bản đã chốt giữ nguyên ⇒ trạng thái suy ra approved_pending
      const v = await t.api('POST', '/api/cast/CM-0001/voice', { provider: 'gemini', voice: 'Puck' });
      if (v.status === 200) {
        const x = await t.api('GET', '/api/cast/CM-0001');
        assert.equal(x.json.member.status, 'approved_pending');
        assert.equal(x.json.voice.voice, 'Puck');
        assert.equal(x.json.member.approved_version, r.json.member.current_version);
      } else assert.equal(v.status, 400, v.text);
    } else {
      assert.equal(ap.status, 400);
      assert.ok(Array.isArray(ap.json.error.detail.errors));
    }
    const bad = await t.api('POST', '/api/cast/CM-0001/voice', { provider: 'khac', voice: 'X' });
    assert.equal(bad.status, 400);
    const rt = await t.api('POST', '/api/cast/CM-0002/retire', {});
    assert.equal(rt.status, 200, rt.text);
    assert.equal((await t.api('GET', '/api/cast/CM-0002')).json.member.status, 'retired');
    assert.equal((await t.api('POST', '/api/cast/CM-0002/retire', {})).status, 409, 'nghỉ rồi ⇒ xung đột');
    const sheet = await t.api('GET', '/api/cast/CM-0001/sheet?w=10');
    assert.equal(sheet.status, 400, 'w ngoài biên');
    const nf = await t.api('GET', '/api/cast/CM-9999');
    assert.equal(nf.status, 404);
  } finally { await t.clean(); }
});
