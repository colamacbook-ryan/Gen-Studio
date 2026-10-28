// © 2026 Gen Labs — All rights reserved.
// Cài thật (2026-10-28): nhà cung cấp tạo ở bước thiết lập không có model ⇒ gọi /models/null; thiếu giám khảo ⇒ bản dựng đầu bị chặn.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { tmpDb, basics } = require('./a-helpers.js');
const { pickProvider } = require('../server/pipeline.js');

function setup() {
  const t = tmpDb(); const b = basics(t.write, t.db);
  const add = (kind, scan) => {
    const pv = t.write(b.o, 'provider.save', { vendor: 'gemini', kind, key: 'k-thu' });
    if (scan) t.db.run('UPDATE providers SET scan=? WHERE display_id=?', JSON.stringify(scan), pv.display_id);
    return pv;
  };
  return { t, ctx: { db: t.db, config: {} }, add };
}
const SCAN = { models: [
  { kind: 'judge', model: 'gemini-2.5-flash', available: true }, { kind: 'judge', model: 'gemini-3.5-flash', available: true },
  { kind: 'tts', model: 'gemini-2.5-pro-preview-tts', available: true }, { kind: 'tts', model: 'gemini-3.8-flash-tts', available: true },
] };

test('model trống: chọn mục ưu tiên đầu tiên có trong kết quả quét (kể cả quét ở hàng khác cùng vendor)', () => {
  const { t, ctx, add } = setup();
  try {
    t.db.run('DELETE FROM providers');
    add('tts', SCAN); add('judge', null);
    assert.equal(pickProvider(ctx, 'tts').model, 'gemini-3.8-flash-tts', 'không chọn 2.5-pro-preview-tts (hạn mức 0)');
    assert.equal(pickProvider(ctx, 'judge').model, 'gemini-3.5-flash');
    assert.equal(pickProvider(ctx, 'tts').key, 'k-thu');
  } finally { t.clean(); }
});
test('chưa quét lần nào: dùng mục ưu tiên đầu; quét ra không có model nào của loại đó: chặn no_model', () => {
  const { t, ctx, add } = setup();
  try {
    t.db.run('DELETE FROM providers');
    add('tts', null);
    assert.equal(pickProvider(ctx, 'tts').model, 'gemini-3.1-flash-tts-preview');
    t.db.run('DELETE FROM providers');
    add('judge', { models: [{ kind: 'tts', model: 'x-tts', available: true }] });
    assert.throws(() => pickProvider(ctx, 'judge'), e => e.code === 'no_model');
  } finally { t.clean(); }
});
test('vendor chỉ nhận danh sách hỗ trợ (không nạp module theo chuỗi trong DB)', () => {
  const { t } = setup();
  try {
    const b = basics(t.write, t.db);
    for (const v of ['../../etc/passwd', 'openai', 'fake']) assert.throws(() => t.write(b.o, 'provider.save', { vendor: v, kind: 'tts', key: 'x' }), e => e.code === 'invalid', v);
  } finally { t.clean(); }
});
