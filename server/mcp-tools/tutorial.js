// © 2026 Gen Labs — All rights reserved.
// Gói U — MCP cho bài hướng dẫn (SPEC-0.2.0 §6.9). get_capabilities gộp khoá `tutorial` (DSL màn giả lập, khối, tên phím, giới hạn, luật trailer, ngưỡng G-CURSOR).
// Tool `preview_tutorial_frame` (compose): xem trước MỘT khung của bài hướng dẫn đã lưu ({lesson, version?, t_ms | beat}) ⇒ JPEG 960×540 qua renderStill mode 'frame'
// (thời lượng ước theo chữ khi chưa có giọng; giới hạn 10 ảnh/phút/agent). KHÔNG có tool xác nhận quyền asset (asset.attest chỉ owner + UI, §10).
'use strict';
const { kit } = require('./_kit.js');
const tutorial = require('../../render/engine/tutorial.js');
const mockUi = require('../../render/blocks/mock-ui.js');
const keystroke = require('../../render/blocks/keystroke.js');
const cursorBlock = require('../../render/blocks/cursor.js');
const { LIM } = require('../../media/gates/cursor.js');

const RATE_MAX = 10, RATE_WINDOW_MS = 60e3;
const AS_RE = /^AS-\d+$/;

function capabilities() {
  return {
    tutorial: {
      kind: 'tutorial', variants: ['full', 'trailer'], host_modes: ['pip', 'none'], chrome: ['browser', 'desktop', 'none'], themes: mockUi.THEMES.slice(),
      rule: 'Mỗi bước con trỏ là MỘT beat neo vào chữ; mốc neo = khoảnh khắc hành động (lúc bấm, lúc bắt đầu gõ/cuộn/kéo). Màn đổi bằng beat "screen". Ưu tiên màn giả lập (DSL) hơn ảnh chụp.',
      dsl: { types: mockUi.TYPES, root: 'window', limits: mockUi.LIMITS, id: '^[a-z][a-z0-9_]{0,31}$ — phần tử có id tự thành đích', text_only: true,
        props: { window: ['title', 'children'], sidebar: ['title', 'items', 'active'], topbar: ['title', 'children'], tabs: ['id', 'items', 'active'], row: ['children', 'gap', 'align'],
          col: ['children', 'gap', 'pad'], card: ['id', 'title', 'children', 'gap', 'draggable'], text: ['id', 'text', 'size', 'weight', 'tone'], button: ['id', 'label', 'variant'],
          input: ['id', 'label', 'placeholder', 'value'], textarea: ['id', 'label', 'placeholder', 'value'], table: ['id', 'columns', 'rows', 'row_ids'], list: ['id', 'items (chữ | {id,label,sub?,draggable?})'],
          badge: ['id', 'text', 'tone'], toggle: ['id', 'label', 'on'], image: ['id', 'asset (AS-…, owner xác nhận quyền nếu raster)', 'w', 'h', 'alt'] } },
      blocks: {
        screen: '{screen: "SC-1", transition?: fade|slide|cut}',
        cursor: '{action: ' + cursorBlock.schema.properties.action.enum.join('|') + ', target, to? (drag), text? ≤ 80 (type), dy? (scroll, px màn), cps? 8–20}',
        focus: '{target, zoom? 1–2.5, dim? 0–0.7, ring?, callout? ≤ 60, side? auto|top|bottom|left|right, hold_ms? 300–6000}',
        callout: '{target, text ≤ 60, side?}', keystroke: '{keys: 1–4 tên phím}',
      },
      keys: keystroke.KEYS,
      limits: { screens: tutorial.LIMITS.screens, steps: tutorial.LIMITS.steps, cps: [8, 20], zoom: [1, 2.5], callout_chars: 60, hold_ms: [300, 6000] },
      trailer: { length_s: [30, 60], max_gap_s: LIM.gapTrailer / 1000, beats_per_10s_min: 3, music: '{asset:"AS-…" (âm thanh, owner xác nhận quyền), gain_db?: -18, duck_db?: -10}', end_card: 'end-card {title: CTA ≤ 40, sub: url_label (chữ, không link)}' },
      gate: { id: 'G-CURSOR', checks: 'C1 đích tồn tại · C2 đích trong khung an toàn x 48–1872, y 48–880, không chạm PiP · C3 con trỏ trong đích lúc bấm/gõ · C4 không nhảy cóc (≤ 24 px/khung, ≤ 140 khi di/lia) · C5 dừng ≥ 120 ms trước khi bấm · C6 lệch neo ≤ 100 ms · C7 chú thích/vòng sáng trong khung an toàn · C8 phóng ảnh nguồn ≤ 1,5× · C9 ≤ 4 s (trailer 2 s) giữa hai sự kiện thật khi có giọng · C10 gợn sóng thấy trên MP4' },
    },
  };
}

function tools(ctx) {
  const { db, config, S, N, fail, need, ext } = kit(ctx);
  const hits = new Map();
  const limited = (id, now = Date.now()) => {
    const a = (hits.get(id) || []).filter((t) => now - t < RATE_WINDOW_MS);
    if (a.length >= RATE_MAX) { hits.set(id, a); return true; }
    a.push(now); hits.set(id, a); return false;
  };
  const pathOf = (ref) => { const a = AS_RE.test(ref || '') ? db.get('SELECT path, media_present FROM assets WHERE workspace_id=? AND display_id=?', db.ws, ref) : null; return a && a.media_present ? a.path : null; };
  return [
    { name: 'preview_tutorial_frame', scope: 'compose', description: 'Xem trước MỘT khung của bài hướng dẫn đã lưu (con trỏ, vùng phóng, chú thích) — JPEG 960×540. Chọn mốc bằng t_ms hoặc beat (BT-…, lấy đúng khoảnh khắc hành động). Thời lượng ước theo chữ nếu chưa có giọng. Giới hạn ' + RATE_MAX + ' ảnh/phút.',
      schema: { lesson: S, version: N, t_ms: N, beat: S }, required: ['lesson'], handler: async (a, c) => {
        if (!ext || !ext.lessonExt.kinds().includes('tutorial')) throw fail('invalid', 'Bản này chưa bật bài hướng dẫn (tutorial).');
        const l = need('lessons', a.lesson, 'bài học');
        const doc = require('../api.js').lessonDoc(db, l, a.version);
        if (doc.kind !== 'tutorial') throw fail('invalid', `Bài ${l.display_id} không phải bài hướng dẫn.`);
        if (limited(c.agent.id)) throw fail('rate_limited', `Xem trước quá nhiều (tối đa ${RATE_MAX}/phút). Thử lại sau ít phút.`);
        const screens = JSON.parse(JSON.stringify(doc.screens || []));
        screens.forEach((sc) => {
          if (sc.source && sc.source.asset) sc.source.asset = pathOf(sc.source.asset) || sc.source.asset;
          if (sc.source && sc.source.mock) tutorial.walkMock(sc.source.mock.root, (n) => { if (n.type === 'image') n.asset = pathOf(n.asset) || n.asset; });
        });
        const cast = {}; doc.lines.forEach((x) => { cast[x.who] = { name: x.who_name || x.who }; });
        let plan;
        try {
          plan = tutorial.buildTutorialPlan({ lesson: { title: l.title, lines: doc.lines.map((x) => ({ id: x.id, who: x.who, say: x.say })), beats: doc.beats.map((b) => ({ id: b.id, block: b.block, params: b.params, anchor: b.anchor })),
            kind: 'tutorial', variant: doc.variant || 'full', host: doc.host || null, screens }, clips: {}, cast, kind: 'tutorial', variant: doc.variant || 'full' });
        } catch (e) { if (e && e.name === 'PlanError') throw fail('invalid', e.text_human, { code: e.code }); throw e; }
        let t = Number.isFinite(a.t_ms) ? a.t_ms : 0;
        if (a.beat) { const b = plan.beats.find((x) => x.id === a.beat); if (!b) throw fail('not_found', `Không có beat ${a.beat} trong bài.`); t = b.t_in + (b.block === 'focus' ? 900 : 60); }
        t = Math.max(0, Math.min(plan.duration_ms - 1, t));
        // xem trước chỉ cần màn + con trỏ + lớp phủ: bỏ host PiP (công thức nhân vật thật nằm ở bản dựng)
        plan.cast = {}; plan.actors = [];
        const errors = [];
        plan.assetData = require('../../render/render.js').resolveAssets(plan, errors, config.dataDir, { ffmpegPath: config.ffmpegPath });
        const still = (ctx.deps && ctx.deps.still) || require('../../render/still.js');
        const r = await still.renderStill({ mode: 'frame', payload: { plan, t_ms: t }, size: [960, 540], format: 'jpeg', quality: 85, assetRoot: config.dataDir, ffmpegPath: config.ffmpegPath, chromiumPath: config.chromiumPath });
        const buf = r.buffer, errs = errors.concat(r.errors || []);
        return { text: `Khung ${l.display_id} lúc ${Math.round(t)} ms (960×540${errs.length ? ', ' + errs.length + ' lỗi' : ''}).`, data: { lesson: l.display_id, t_ms: Math.round(t), duration_ms: plan.duration_ms, errors: errs, bytes: buf.length },
          images: [{ data: buf.toString('base64'), mimeType: 'image/jpeg' }] };
      } },
  ];
}

module.exports = { tools, capabilities, RATE_MAX };
