// © 2026 Gen Labs — All rights reserved.
// Gói U — video hướng dẫn / trailer có con trỏ giả lập (SPEC-0.2.0 §6, §10). Mọi ghi đi qua write() (kiểm lược đồ → quyền → ghi → audit).
//   • lessonExt 'tutorial': cột kind/variant/screens/host/music, kinds ['tutorial'] — bỏ đăng ký module này ⇒ `tutorial` biến mất (điều kiện cắt F4 §13.4).
//     validate: DSL màn giả lập (danh sách đóng, chỉ chữ), đích/che/khung thiết bị của ảnh chụp, asset AS-… có thật, host/nhạc, trailer 30–60 s,
//     dựng plan KHÔ với thời lượng ước theo chữ + G-CURSOR khô (C1–C9) để agent sửa trước khi nộp.
//   • hook plan.input: AS-… của màn/ảnh trong DSL/nhạc → đường dẫn trong kho (render.js chỉ đọc trong assetRoot); plan.after: nhạc chưa xác nhận quyền ⇒ rights_missing.
//   • cổng G-CURSOR (media/gates/cursor.js) qua write.ext.gates.
//   • op asset.attest / asset.revoke_attest — CHỈ owner trên phiên UI (ownerUi, ConfirmModal ở L5); agent/CLI/Trợ lý/owner qua HTTP không có lối (§10, CNS-092/125).
'use strict';
const tutorial = require('../../render/engine/tutorial.js');
const mockUi = require('../../render/blocks/mock-ui.js');
const { gateCursor, checkPlan } = require('../../media/gates/cursor.js');
const { PlanError } = require('../../render/engine/plan-error.js');

const VARIANTS = ['full', 'trailer'];
const HOST_MODES = ['pip', 'none'];
const CHROMES = ['browser', 'desktop', 'none'];
const BASIS = ['own_product', 'licensed', 'owner_responsibility'];   // owner_upload chỉ tự ghi khi owner tải lên qua UI
const SCREEN_KEYS = ['id', 'source', 'size', 'view_h', 'chrome', 'url_label', 'targets', 'redact'];
const TRAILER_MS = [30000, 60000];
const AS_RE = /^AS-\d+$/, SC_RE = /^[A-Za-z0-9_-]{1,24}$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const numIn = (v, a, b) => typeof v === 'number' && Number.isFinite(v) && v >= a && v <= b;

const SCHEMA = { properties: {
  kind: { type: 'string', enum: ['lesson', 'tutorial'], description: 'Loại bài: tutorial = video hướng dẫn dùng ứng dụng (màn hình + con trỏ).' },
  variant: { type: 'string', enum: VARIANTS, description: 'tutorial: full (mặc định) | trailer (30–60 s, nhịp nhanh, nhạc nền tuỳ chọn, thẻ kết CTA).' },
  screens: { type: 'array', description: 'tutorial: ≤ 12 màn [{id, source:{mock:{w,h,theme,root}} | {asset:"AS-…"}, size?, chrome?, url_label?, targets?, redact?}]. Ưu tiên mock (DSL, xem get_capabilities.tutorial.dsl).' },
  host: { type: 'object', description: 'tutorial: {cast:"CM-…", mode:"pip"|"none"} — mặc định pip (1 người nói).' },
  music: { type: 'object', description: 'trailer: {asset:"AS-…" (audio, owner phải xác nhận quyền), gain_db?: -40..0 (mặc định -18), duck_db?: -30..0 (mặc định -10)}.' },
} };

function register(op, ctx) {
  const { db, err, ext, rights, need } = ctx;
  const assetOf = (ref) => (typeof ref === 'string' && AS_RE.test(ref) ? db.get('SELECT * FROM assets WHERE workspace_id=? AND display_id=?', db.ws, ref) : null);

  // ---------- kiểm bài hướng dẫn ----------
  function validate(lv) {
    const E = [], add = (path, text) => E.push({ path, text });
    const v = lv.values, kind = lv.kind;
    if (kind !== 'tutorial') {
      for (const col of ['variant', 'screens', 'host', 'music']) if (v[col] !== null && v[col] !== undefined) add(col, `"${col}" chỉ dùng cho bài loại tutorial (gửi null để bỏ).`);
      return E;
    }
    if (v.variant !== null && v.variant !== undefined && !VARIANTS.includes(v.variant)) add('variant', 'variant phải là full hoặc trailer.');
    // màn hình
    const screens = v.screens;
    if (!Array.isArray(screens) || !screens.length) add('screens', 'Bài hướng dẫn cần ít nhất một màn hình (screens).');
    else if (screens.length > tutorial.LIMITS.screens) add('screens', `Tối đa ${tutorial.LIMITS.screens} màn hình mỗi bài.`);
    else {
      const seen = new Set();
      screens.forEach((sc, i) => {
        const P = `screens[${i}]`;
        if (!isObj(sc)) return add(P, 'Màn phải là đối tượng.');
        Object.keys(sc).forEach((k) => { if (!SCREEN_KEYS.includes(k)) add(`${P}.${k}`, 'Thuộc tính không có trong lược đồ màn hình.'); });
        if (typeof sc.id !== 'string' || !SC_RE.test(sc.id)) add(`${P}.id`, 'id màn dạng chữ/số/-/_ (vd SC-1).');
        else if (seen.has(sc.id)) add(`${P}.id`, `id ${sc.id} bị trùng.`); else seen.add(sc.id);
        if (sc.chrome !== undefined && !CHROMES.includes(sc.chrome)) add(`${P}.chrome`, 'chrome phải là browser | desktop | none.');
        if (sc.url_label !== undefined && (typeof sc.url_label !== 'string' || sc.url_label.length > 60)) add(`${P}.url_label`, 'url_label là chữ ≤ 60 ký tự (chỉ là nhãn, không phải link).');
        const src = sc.source;
        if (!isObj(src) || (src.mock === undefined) === (src.asset === undefined) || Object.keys(src).length !== 1) return add(`${P}.source`, 'source phải có đúng một trong {mock} (DSL giả lập) hoặc {asset:"AS-…"} (ảnh chụp).');
        if (src.mock !== undefined) {
          mockUi.validate(src.mock, { assetOk: (a) => AS_RE.test(a) }).forEach((e) => add(`${P}.source.${e.split(':')[0]}`, e.slice(e.indexOf(':') + 1).trim()));
          tutorial.walkMock(src.mock && src.mock.root, (n) => {
            if (n.type !== 'image' || typeof n.asset !== 'string') return;
            const a = assetOf(n.asset);
            if (!a || !a.media_present) add(`${P}.source.mock`, `Ảnh ${n.asset} trong DSL không có trong xưởng (upload_asset trước).`);
            else if (!['image', 'svg'].includes(a.kind)) add(`${P}.source.mock`, `Asset ${n.asset} không phải ảnh.`);
          });
          if (sc.size !== undefined || sc.targets !== undefined || sc.redact !== undefined || sc.view_h !== undefined) add(P, 'Màn giả lập tự có kích thước và đích (mọi phần tử có id); không khai size/targets/redact/view_h.');
          return;
        }
        const a = assetOf(src.asset);
        if (!a || !a.media_present) add(`${P}.source.asset`, 'Ảnh chụp phải là mã AS-… của asset có thật (upload_asset).');
        else if (!['image', 'svg'].includes(a.kind)) add(`${P}.source.asset`, `Asset ${src.asset} không phải ảnh.`);
        const sz = sc.size;
        if (!Array.isArray(sz) || sz.length !== 2 || !Number.isInteger(sz[0]) || !Number.isInteger(sz[1]) || sz[0] < 320 || sz[1] < 240 || sz[0] > 3840 || sz[1] > 2400) add(`${P}.size`, 'size = [w,h] px nguồn, 320×240 … 3840×2400.');
        const W = Array.isArray(sz) ? sz[0] : 0, H = Array.isArray(sz) ? sz[1] : 0;
        const box = (b, p) => {
          if (!isObj(b) || !numIn(b.x, 0, W) || !numIn(b.y, 0, H) || !numIn(b.w, 4, W) || !numIn(b.h, 4, H) || b.x + b.w > W + 0.5 || b.y + b.h > H + 0.5) add(p, 'Hộp {x,y,w,h} phải nằm trong ảnh (px nguồn).');
        };
        if (sc.targets !== undefined) {
          if (!isObj(sc.targets) || Object.keys(sc.targets).length > 64) add(`${P}.targets`, 'targets là đối tượng {tên: {x,y,w,h,label?}} ≤ 64 đích.');
          else Object.entries(sc.targets).forEach(([k, b]) => {
            if (!/^[a-z][a-z0-9_]{0,31}$/.test(k)) add(`${P}.targets.${k}`, 'Tên đích dạng chữ thường/số/_.');
            box(b, `${P}.targets.${k}`);
            if (isObj(b)) Object.keys(b).forEach((q) => { if (!['x', 'y', 'w', 'h', 'label', 'kind', 'draggable'].includes(q)) add(`${P}.targets.${k}.${q}`, 'Thuộc tính lạ.'); });
            if (isObj(b) && b.label !== undefined && (typeof b.label !== 'string' || b.label.length > 60)) add(`${P}.targets.${k}.label`, 'label ≤ 60 ký tự.');
          });
        }
        if (sc.redact !== undefined) {
          if (!Array.isArray(sc.redact) || sc.redact.length > 32) add(`${P}.redact`, 'redact là danh sách ≤ 32 hộp che.');
          else sc.redact.forEach((r, j) => { box(r, `${P}.redact[${j}]`); if (isObj(r) && r.style !== undefined && !['solid', 'mosaic'].includes(r.style)) add(`${P}.redact[${j}].style`, 'style: solid | mosaic.'); });
        }
        if (sc.view_h !== undefined && !(Number.isInteger(sc.view_h) && sc.view_h >= 240 && sc.view_h <= H)) add(`${P}.view_h`, 'view_h (chiều cao vùng nhìn để cuộn) là số nguyên 240…size[1].');
      });
    }
    // host
    if (v.host !== null && v.host !== undefined) {
      const h = v.host;
      if (!isObj(h)) add('host', 'host phải là {cast, mode}.');
      else {
        Object.keys(h).forEach((k) => { if (!['cast', 'mode'].includes(k)) add(`host.${k}`, 'Thuộc tính lạ.'); });
        if (h.mode !== undefined && !HOST_MODES.includes(h.mode)) add('host.mode', h.mode === 'intro_outro' ? 'host.mode "intro_outro" chưa hỗ trợ ở bản này (dùng pip hoặc none).' : 'host.mode phải là pip | none.');
        if (h.cast !== undefined) {
          const m = typeof h.cast === 'string' ? db.get('SELECT channel_id FROM cast_members WHERE workspace_id=? AND (display_id=? OR id=?) AND deleted_at IS NULL', db.ws, h.cast, h.cast) : null;
          if (!m || m.channel_id !== lv.channel.id) add('host.cast', 'host.cast phải là nhân vật (CM-…) của kênh.');
          else if (!(lv.lines || []).some((l) => l && l.who === h.cast)) add('host.cast', 'host.cast phải là người nói trong bài.');
        }
      }
    }
    // nhạc (trailer)
    if (v.music !== null && v.music !== undefined) {
      const m = v.music;
      if (!isObj(m)) add('music', 'music phải là {asset, gain_db?, duck_db?}.');
      else {
        Object.keys(m).forEach((k) => { if (!['asset', 'gain_db', 'duck_db'].includes(k)) add(`music.${k}`, 'Thuộc tính lạ.'); });
        const a = assetOf(m.asset);
        if (!a || !a.media_present || !rights.isAudio(a)) add('music.asset', 'Nhạc nền phải là mã AS-… của asset âm thanh có thật.');
        if (m.gain_db !== undefined && !numIn(m.gain_db, -40, 0)) add('music.gain_db', 'gain_db trong −40…0.');
        if (m.duck_db !== undefined && !numIn(m.duck_db, -30, 0)) add('music.duck_db', 'duck_db trong −30…0.');
      }
    }
    if (E.length) return E;
    // dựng plan KHÔ (thời lượng ước theo chữ) + G-CURSOR khô C1–C9 (checkPlan thuần, đồng bộ)
    const dry = dryPlan(lv);
    if (dry.error) { add('beats', dry.error); return E; }
    const plan = dry.plan;
    if (plan.variant === 'trailer' && (plan.duration_ms < TRAILER_MS[0] || plan.duration_ms > TRAILER_MS[1])) add('trailer_length', `Trailer ước ${(plan.duration_ms / 1000).toFixed(1)} s, phải trong 30–60 s.`);
    checkPlan(plan).V.slice(0, 12).forEach((x) => add('G-CURSOR.' + x.check + (x.beat && !/-dry-/.test(x.beat) ? '.' + x.beat : ''), x.text + ' (ước theo chữ, chưa có giọng thật)'));
    return E;
  }
  // dựng plan với thời lượng ước theo chữ; neo theo chỉ số/ID câu của payload
  function dryPlan(lv) {
    const ids = (lv.lines || []).map((l, i) => (l && typeof l.id === 'string' ? l.id : `LN-dry-${i}`));
    const lines = (lv.lines || []).map((l, i) => ({ id: ids[i], who: l.who, say: l.say }));
    const beats = (lv.beats || []).map((b, i) => {
      const a = b.anchor || {}, line = typeof a.line === 'number' ? ids[a.line] : a.line;
      return { id: b.id || `BT-dry-${i + 1}`, block: b.block, params: b.params, anchor: Object.assign({}, a, { line }) };
    });
    const cast = {}; lines.forEach((l) => { cast[l.who] = { name: l.who }; });
    try {
      const plan = tutorial.buildTutorialPlan({ lesson: { title: lv.payload.title, lines, beats, kind: 'tutorial', variant: lv.values.variant || 'full', host: lv.values.host || null, screens: lv.values.screens }, clips: {}, cast, kind: 'tutorial', variant: lv.values.variant || 'full' });
      return { plan };
    } catch (e) {
      if (e && e.name === 'PlanError') return { error: `${e.text_human} (${e.code})` };
      throw e;
    }
  }

  ext.lessonExt.register({
    name: 'tutorial', columns: ['kind', 'variant', 'screens', 'host', 'music'], kinds: ['tutorial'], schema: SCHEMA,
    validate: (lv) => validate(lv),
  });

  // ---------- pipeline ----------
  const pathOf = (ref) => { const a = assetOf(ref); return a && a.media_present ? a.path : null; };
  ext.hooks.on('plan.input', ({ input }) => {
    if (input.kind !== 'tutorial' || !input.lesson) return;
    const L = input.lesson;
    if (Array.isArray(L.screens)) {
      L.screens = JSON.parse(JSON.stringify(L.screens));
      L.screens.forEach((sc) => {
        if (sc.source && typeof sc.source.asset === 'string') { const p = pathOf(sc.source.asset); if (!p) throw new PlanError('asset_invalid', `Màn ${sc.id}: không còn tệp của ${sc.source.asset}.`, { screen: sc.id }); sc.source.asset = p; }
        if (sc.source && sc.source.mock) tutorial.walkMock(sc.source.mock.root, (n) => { if (n.type === 'image' && AS_RE.test(n.asset || '')) { const p = pathOf(n.asset); if (!p) throw new PlanError('asset_invalid', `Màn ${sc.id}: không còn tệp của ${n.asset}.`, { screen: sc.id }); n.asset = p; } });
      });
    }
    if (L.music && typeof L.music.asset === 'string' && AS_RE.test(L.music.asset)) {
      const a = assetOf(L.music.asset);
      L.music = Object.assign({}, L.music, { asset: a ? a.path : L.music.asset, ref: L.music.asset });
    }
  });
  ext.hooks.on('plan.after', ({ plan }) => {
    if (plan.kind !== 'tutorial' || !plan.music) return;
    const miss = rights.missing(db, [plan.music.asset]);
    if (miss.length) throw new PlanError('rights_missing', `Nhạc nền ${miss.join(', ')} chưa được chủ xưởng xác nhận quyền sử dụng nên chưa dựng được.`, { assets: miss });
  });
  ext.gates.register('G-CURSOR', async ({ plan, mp4Path, ffmpegPath }) => gateCursor({ plan, mp4Path, ffmpegPath }));

  // ---------- quyền dùng asset: chỉ owner trên phiên UI ----------
  op('asset.attest', 'ownerUi', (c) => {
    const p = c.p || {};
    const a = need('assets', p.asset, 'asset');
    if (a.source === 'system' || !(rights.isRaster(a) || rights.isAudio(a))) throw err('invalid', 'Chỉ ảnh raster (PNG/JPEG/WebP/GIF) hoặc âm thanh mới cần xác nhận quyền; SVG và asset hệ thống không cần.', { asset: a.display_id });
    if (!BASIS.includes(p.basis)) throw err('invalid', 'Cơ sở quyền phải là own_product (ứng dụng của chính bạn) | licensed (có giấy phép) | owner_responsibility (tự chịu trách nhiệm).', { basis: p.basis === undefined ? null : p.basis });
    const raster = rights.isRaster(a);
    if (raster && p.pii_redacted !== true) throw err('invalid', 'Hãy che email, khoá, tên người trên ảnh rồi tick "Tôi đã che thông tin cá nhân".', { asset: a.display_id });
    if (p.note !== undefined && p.note !== null && (typeof p.note !== 'string' || p.note.length > 500)) throw err('invalid', 'Ghi chú tối đa 500 ký tự.', null);
    const before = rights.statusOf(db, a);
    db.insertRow('asset_rights', { asset_id: a.id, action: 'attest', basis: p.basis, pii_redacted: p.pii_redacted === true ? 1 : 0, note: p.note || null, by: c.a.id, at: db.now() });
    return { result: { asset: a.display_id, rights: 'attested', basis: p.basis }, entity: ['asset', a.display_id], before: { rights: before }, after: { rights: 'attested', basis: p.basis, pii_redacted: p.pii_redacted === true } };
  });
  op('asset.revoke_attest', 'ownerUi', (c) => {
    const p = c.p || {};
    const a = need('assets', p.asset, 'asset');
    const before = rights.statusOf(db, a);
    if (before !== 'attested') throw err('conflict', 'Asset này chưa có xác nhận quyền để thu hồi.', { asset: a.display_id, rights: before });
    if (p.note !== undefined && p.note !== null && (typeof p.note !== 'string' || p.note.length > 500)) throw err('invalid', 'Ghi chú tối đa 500 ký tự.', null);
    db.insertRow('asset_rights', { asset_id: a.id, action: 'revoke', basis: null, pii_redacted: 0, note: p.note || null, by: c.a.id, at: db.now() });
    const after = rights.statusOf(db, a);
    return { result: { asset: a.display_id, rights: after }, entity: ['asset', a.display_id], before: { rights: before }, after: { rights: after } };
  });
}

module.exports = { register, OWNER: 'U', SCHEMA, BASIS };
