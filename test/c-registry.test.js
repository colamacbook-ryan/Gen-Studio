// © 2026 Gen Labs — All rights reserved.
// Gói C — kiểm sổ khối hình: 9 khối MVP, validate đúng/sai.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const reg = require('../render/blocks/registry');
const { LONG_BLOCKS } = require('./k-blocks-list');

test('registry có đủ 9 khối MVP kèm schema', () => {
  const names = reg.list().map(b => b.name);
  assert.deepStrictEqual(names.sort(), ['concept-chip', 'end-card', 'illustration', 'lesson-map', 'prob-card', 'stamp', 'takeaway', 'title', 'token-row'].concat(LONG_BLOCKS).sort());
  reg.list().forEach(b => { assert.ok(b.version >= 1); assert.strictEqual(b.schema.type, 'object'); });
});

test('validate: tham số đúng', () => {
  const ok = [
    ['title', { text: 'Vì sao A.I. sai?', highlight: ['A.I.'] }],
    ['concept-chip', { text: 'LLM', sub: 'mô hình' }],
    ['token-row', { tokens: ['Thủ đô', 'của'], next: 'next token prediction' }],
    ['prob-card', { prompt: 'Thủ đô là', options: [['Hà Nội', 92], ['Huế', 4]], pick: 0, chip: '✓' }],
    ['stamp', { text: 'HALLUCINATION', sub: 'ảo giác' }],
    ['takeaway', { kind: 'eq', text: 'Đoán ≠ Biết' }],
    ['takeaway', { kind: 'habit', text: 'Kiểm chứng lại', sub: 'Thói quen' }],
    ['lesson-map', {}],
    ['end-card', { title: 'Lớp AI', sub: 'Bài 01', next: 'Bài sau' }],
    ['illustration', { asset: '/data/media/abc', caption: 'Hình', fit: 'contain' }]
  ];
  ok.forEach(([n, p]) => { const r = reg.validate(n, p); assert.ok(r.ok, n + ': ' + r.errors.join(';')); });
});

test('validate: tham số sai trả lỗi tiếng Việt', () => {
  const bad = [
    ['title', {}], ['title', { text: 5 }], ['title', { text: 'x'.repeat(81) }], ['title', { text: 'a', lạ: 1 }],
    ['token-row', { tokens: [] }],
    ['prob-card', { prompt: 'a', options: [['x', 50]], pick: 0 }],                      // < 2 lựa chọn
    ['prob-card', { prompt: 'a', options: [['x', 80], ['y', 60]], pick: 0 }],           // tổng > 100
    ['prob-card', { prompt: 'a', options: [['x', 50], ['y', 20]], pick: 2 }],           // pick ngoài khoảng
    ['prob-card', { prompt: 'a', options: [['x', 'năm'], ['y', 20]], pick: 0 }],
    ['takeaway', { kind: 'lạ', text: 'a' }],
    ['illustration', { asset: '' }],
    ['lesson-map', { x: 1 }],
    ['nope', {}]
  ];
  bad.forEach(([n, p]) => { const r = reg.validate(n, p); assert.strictEqual(r.ok, false, n + ' ' + JSON.stringify(p)); assert.ok(r.errors.length && r.errors.every(e => typeof e === 'string')); });
});

test('mọi khối khai báo footprint và sfx hợp lệ', () => {
  reg.names().forEach(n => {
    const d = reg.get(n), fp = d.footprint('16:9');
    assert.ok(fp.w >= 0 && fp.h >= 0, n);
    reg.sfxOf(n, { kind: 'habit' }, false).concat(reg.sfxOf(n, {}, true)).forEach(s => { assert.ok(['in', 'peak'].includes(s.at)); assert.ok(s.name); });
  });
});
