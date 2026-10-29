// © 2026 Gen Labs — All rights reserved.
// Gói K — khối clip dài trên sân khấu Chromium thật (render.openStage, CDP): mỗi bài mẫu của tools/blocks-preview.js dựng không lỗi console,
// TẤT ĐỊNH khi tua (DOM ở mốc A trước = sau khi tua tới C rồi lùi về A), pip-swap lái nhân vật (clip-path tròn) rồi trả lại sân khấu,
// và 9:16 giữ chữ ≥ min_font_px của tỉ lệ (đo bằng window.__measure như cổng G-SAFE S4).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const chromium = require('../render/chromium');
const { openStage } = require('../render/render');
const { buildPlan } = require('../render/engine/timeline');
const aspects = require('../render/aspects');
const { DEMOS, clipsOf } = require('../tools/blocks-preview');
const { LONG_BLOCKS_916 } = require('./k-blocks-list');

const SKIP = chromium.find() ? false : 'không có Chromium';
const planOf = (d, aspect) => buildPlan({ lesson: { title: 'K', lines: d.lines, beats: d.beats }, clips: clipsOf(d.lines), aspect, fps: 30 });
const mainOf = (plan, d) => plan.beats.find((b) => b.id === (d.main || d.beats[0].id));

test('16:9: mọi bài mẫu dựng không lỗi, tua tới/lui ra DOM y hệt', { skip: SKIP, timeout: 240000 }, async () => {
  const errors = [], st = await openStage({ width: 1920, height: 1080, errors });
  try {
    for (const [name, d] of Object.entries(DEMOS)) {
      const plan = planOf(d, '16:9'), m = mainOf(plan, d), at = d.at.map((s) => Math.round(m.t_in + s * 1000));
      await st.ev('window.__load(' + JSON.stringify(Object.assign({}, plan, { assetData: {}, fontCss: '' })) + ')');
      // so phần ĐANG HIỆN (khối chưa tới giờ bị sân khấu ẩn bằng visibility — lesson-map tự thêm giữ thuộc tính cũ khi ẩn, không phải lỗi của khối)
      const html = async (t) => { await st.ev('window.__seek(' + t + ')'); return st.ev('(function(){var c=document.getElementById("stage").cloneNode(true);[].forEach.call(c.querySelectorAll("[style*=\\"visibility: hidden\\"]"),function(e){e.remove();});return c.outerHTML;})()'); };
      const a1 = await html(at[0]), b1 = await html(at[1]);
      await html(at[2]);
      assert.equal(await html(at[0]), a1, name + ': mốc A sau khi tua lui');
      assert.equal(await html(at[1]), b1, name + ': mốc B sau khi tua lui');
      if (name === 'pip-swap') {
        const p1 = plan.beats.find((b) => b.id === 'B1'), p2 = plan.beats.find((b) => b.id === 'B4');
        await st.ev('window.__seek(' + (p1.t_in + 900) + ')');
        assert.match(await st.ev('document.querySelector(".actor").style.clipPath'), /^circle\(/, 'PiP: nhân vật bị cắt tròn');
        await st.ev('window.__seek(' + (p2.t_in + 1500) + ')');
        assert.equal(await st.ev('document.querySelector(".actor").style.clipPath'), '', 'bung ra: bỏ cắt');
        await st.ev('window.__seek(' + (p1.t_in - 200) + ')');
        assert.equal(await st.ev('document.querySelector(".actor").style.clipPath'), '', 'trước khối: nhân vật như cũ');
      }
    }
  } finally { await st.close(); }
  assert.deepEqual(errors, []);
});

test('9:16: khối hỗ trợ dọc giữ chữ ≥ min_font_px (G-SAFE S4)', { skip: SKIP, timeout: 240000 }, async () => {
  const size = aspects.get('9:16').size, minPx = aspects.get('9:16').min_font_px, errors = [], st = await openStage({ width: size[0], height: size[1], errors });
  try {
    for (const [name, d] of Object.entries(DEMOS)) {
      if (!d.beats.every((b) => LONG_BLOCKS_916.includes(b.block) || ['title', 'concept-chip'].includes(b.block))) continue;
      const plan = planOf(d, '9:16'), m = mainOf(plan, d);
      await st.ev('window.__load(' + JSON.stringify(Object.assign({}, plan, { assetData: {}, fontCss: '' })) + ')');
      for (const s of d.at) {
        await st.ev('window.__seek(' + Math.round(m.t_in + s * 1000) + ')');
        const ms = await st.ev('window.__measure()');
        ms.els.filter((e) => e.role === 'block' && LONG_BLOCKS_916.includes(e.block) && typeof e.font_px_min === 'number')
          .forEach((e) => assert.ok(e.font_px_min >= minPx, `${name} ${e.block} t+${s}s: chữ ${e.font_px_min}px < ${minPx}px`));
      }
    }
  } finally { await st.close(); }
  assert.deepEqual(errors, []);
});
