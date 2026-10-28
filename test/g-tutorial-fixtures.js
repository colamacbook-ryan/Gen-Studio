// © 2026 Gen Labs — All rights reserved.
// Gói U — dữ liệu mẫu dùng chung cho test bài hướng dẫn (không phải file test). Bài tutorial nhỏ nhất hợp lệ: 1 màn DSL, 1 beat screen, 1 bước bấm.
'use strict';
const { lessonBody } = require('./a-helpers');

const MINI_MOCK = { w: 1280, h: 800, theme: 'console-dark', root: { type: 'window', children: [
  { type: 'sidebar', title: 'Gen-Studio', items: [{ id: 'nav_home', label: 'Tổng quan' }, { id: 'nav_channels', label: 'Kênh' }], active: 0 },
  { type: 'col', gap: 16, children: [
    { type: 'topbar', title: 'Kênh mới', children: [{ type: 'button', id: 'btn_ok', label: 'Lưu', variant: 'primary' }] },
    { type: 'input', id: 'in_name', label: 'Tên kênh', placeholder: 'VD: Lớp AI' },
    { type: 'toggle', id: 'tg_on', label: 'Bật lịch' }] }] } };
const MINI_SCREENS = [{ id: 'SC-1', source: { mock: MINI_MOCK }, chrome: 'browser', url_label: 'localhost:7490' }];
// tutorial luôn cần ảnh bìa khi gói T bật (server/ops/thumb.js, CNS-123) — 2 phương án tối thiểu
const MINI_THUMB = { variants: [
  { template: 'big-visual', headline: 'Tạo kênh trong 1 phút', highlight: 'kênh', kicker: 'HƯỚNG DẪN', face: { owner: true, mood: 'excited' }, visual: { beat: 0 } },
  { template: 'host-shock-left', headline: 'Bấm Lưu là xong', highlight: 'Lưu', face: { owner: true, mood: 'shock' }, visual: { beat: 0 } },
] };
// lessonBody (2 câu, 2 người nói) ⇒ host 'none' (PiP chỉ nhận 1 người nói)
const tutorialBody = (b, extra = {}) => lessonBody(b, Object.assign({
  kind: 'tutorial', host: { mode: 'none' }, screens: MINI_SCREENS, thumbnail: MINI_THUMB,
  beats: [{ block: 'screen', anchor: { line: 0, word: 'các' }, params: { screen: 'SC-1' } }, { block: 'cursor', anchor: { line: 1, word: 'học' }, params: { action: 'click', target: 'btn_ok' } }],
}, extra));

module.exports = { MINI_MOCK, MINI_SCREENS, MINI_THUMB, tutorialBody };
