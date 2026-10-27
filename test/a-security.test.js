// © 2026 Gen Labs — All rights reserved.
// Test hồi quy bảo mật gói A: lọc SVG theo danh sách cho phép, kiểm nội dung asset, quyền sở hữu lệnh sản xuất khi nộp bài.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { tmpDb, basics, lessonBody, agent } = require('./a-helpers');

const rejects = (fn, code) => assert.throws(fn, (e) => e.name === 'WriteError' && e.code === code);
const svg = (body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${body}</svg>`);

test('SVG: hình tĩnh hợp lệ được nhận', () => {
  const t = tmpDb();
  const b = basics(t.write, t.db);
  const r = t.write(b.o, 'asset.put', { kind: 'svg', mime: 'image/svg+xml',
    bytes: svg('<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/><text x="1" y="5">Hà Nội &amp; Huế</text>') });
  assert.equal(r.kind, 'svg');
  t.clean();
});

test('SVG: mọi biến thể nguy hiểm bị từ chối', () => {
  const t = tmpDb();
  const b = basics(t.write, t.db);
  const bad = [
    '<script>alert(1)</script>',
    '<rect onload="alert(1)"/>',
    '<a href="https://x"><rect/></a>',
    '<use href="#x"/>',
    '<animate attributeName="href" to="javascript:alert(1)"/>',
    '<set attributeName="onclick" to="alert(1)"/>',
    '<style>rect{fill:url(https://x/y)}</style>',
    '<foreignObject><div>x</div></foreignObject>',
    '<rect fill="url(https://evil/x)"/>',
    '<rect fill="&#106;avascript"/>',
    '<image href="data:image/png;base64,AAAA"/>',
  ];
  for (const body of bad) rejects(() => t.write(b.o, 'asset.put', { kind: 'svg', mime: 'image/svg+xml', bytes: svg(body) }), 'invalid');
  rejects(() => t.write(b.o, 'asset.put', { kind: 'svg', bytes: Buffer.from('<!DOCTYPE svg [<!ENTITY x "y">]><svg/>') }), 'invalid');
  t.clean();
});

test('asset: SVG giả làm ảnh, mime lệch nội dung, SVG rỗng nội dung đều bị từ chối', () => {
  const t = tmpDb();
  const b = basics(t.write, t.db);
  const evil = svg('<script>alert(1)</script>');
  rejects(() => t.write(b.o, 'asset.put', { kind: 'image', mime: 'image/svg+xml', bytes: evil }), 'invalid');
  rejects(() => t.write(b.o, 'asset.put', { kind: 'image', mime: 'image/png', bytes: evil }), 'invalid');
  rejects(() => t.write(b.o, 'asset.put', { kind: 'svg', mime: 'image/svg+xml', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]) }), 'invalid');
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
  rejects(() => t.write(b.o, 'asset.put', { kind: 'image', mime: 'image/jpeg', bytes: png }), 'invalid');
  const ok = t.write(b.o, 'asset.put', { kind: 'image', mime: 'image/png', bytes: png });
  assert.equal(ok.mime, 'image/png');
  t.clean();
});

test('lesson.submit: agent không nộp vào lệnh giao cho agent khác, lệnh của kênh khác hoặc bài khác', () => {
  const t = tmpDb();
  const b = basics(t.write, t.db);
  const a1 = t.write(b.o, 'agent.create', { name: 'A1', scopes: ['read', 'compose', 'run'] }).agent;
  const a2 = t.write(b.o, 'agent.create', { name: 'A2', scopes: ['read', 'compose', 'run'] }).agent;
  const wo = t.write(b.o, 'work_order.create', { channel: b.ch.display_id, kind: 'manual', agent: a1.display_id });
  rejects(() => t.write(agent(['read', 'compose', 'run'], a2.display_id), 'lesson.submit', lessonBody(b, { work_order: wo.display_id })), 'forbidden');
  // lệnh của kênh khác
  const ch2 = t.write(b.o, 'channel.create', { name: 'K2', data: {} });
  const wo2 = t.write(b.o, 'work_order.create', { channel: ch2.display_id, kind: 'manual' });
  rejects(() => t.write(agent(['read', 'compose', 'run'], a1.display_id), 'lesson.submit', lessonBody(b, { work_order: wo2.display_id })), 'invalid');
  // đúng agent, đúng kênh → được
  const r = t.write(agent(['read', 'compose', 'run'], a1.display_id), 'lesson.submit', lessonBody(b, { work_order: wo.display_id }));
  assert.ok(r.lesson.display_id.startsWith('LS-'));
  t.clean();
});
