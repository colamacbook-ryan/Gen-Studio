// © 2026 Gen Labs — All rights reserved.
// Sổ móc mở rộng của máy chủ (SPEC-0.2.0 §2.4): mỗi gói W1 đăng ký từ `server/ops/<gói>.js` → `register(op, ctx)` qua `ctx.ext`, KHÔNG sửa lõi.
// createExt() → { lessonExt, channelDefaults, suggestionApply, gates, hooks }. Mỗi bộ ghi một writer (write.ext) nên test cô lập được.
'use strict';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
function deepMerge(base, over) {
  if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = isObj(base[k]) && isObj(over[k]) ? deepMerge(base[k], over[k]) : over[k];
  return out;
}

// Cột của lesson_versions mà gói W1 sở hữu (0003). Gửi cột này khi chưa có phần mở rộng nào đăng ký ⇒ lỗi rõ (tính năng chưa bật / F4 bị cắt, §13.4).
const EXT_COLUMNS = ['variant', 'thumbnail', 'screens', 'host', 'music'];

function createExt() {
  // ---- lessonExt: phần mở rộng lược đồ bài (T: thumbnail · U: kind/variant/screens/host/music) ----
  // register({ name, columns:[cột lesson_versions], kinds?:[loại bài mới nhận], schema?:{properties:{…}}  // gộp vào inputSchema validate/submit/update_lesson
  //            validate?(lv, ctx) → [{path,text}] | [chuỗi] })
  //   lv  = { kind, values:{[cột]: giá trị đã gộp (payload hoặc kế thừa version trước)}, payload, lines, beats, channel, channelData, prev, isNew }
  //   ctx = { db, err, byRef, nonEmpty, ext }
  const exts = [];
  const lessonExt = {
    register(def) {
      if (!def || !def.name) throw new Error('lessonExt.register cần name');
      if (exts.some((e) => e.name === def.name)) throw new Error('lessonExt trùng tên: ' + def.name);
      const e = { name: def.name, columns: (def.columns || []).filter((c) => c !== 'kind'), kinds: def.kinds || [], schema: def.schema || null, validate: def.validate || null,
        ownsKind: (def.columns || []).includes('kind') };
      for (const c of e.columns) if (exts.some((x) => x.columns.includes(c))) throw new Error('lessonExt: cột ' + c + ' đã có chủ');
      exts.push(e);
      return e;
    },
    list: () => exts.slice(),
    // loại bài nhận được: 'lesson' luôn có; loại khác chỉ khi có phần mở rộng khai báo (cắt F4 ⇒ bỏ đăng ký ⇒ tutorial biến mất)
    kinds: () => ['lesson', ...new Set(exts.flatMap((e) => e.kinds).filter((k) => k !== 'lesson'))],
    columns: () => exts.flatMap((e) => e.columns),
    // cột không ai sở hữu nhưng thuộc danh sách 0003 ⇒ "chưa được bật"
    unowned: () => EXT_COLUMNS.filter((c) => !exts.some((e) => e.columns.includes(c))),
    // gộp properties của mọi ext cho inputSchema tool bài học
    schemaProps: () => exts.reduce((acc, e) => Object.assign(acc, (e.schema && e.schema.properties) || {}), {}),
  };

  // ---- channelDefaults: mặc định phía server cho kênh MỚI tạo (T: policy.thumbnail_required=true; B: preset brand) ----
  // register(fn({ p, actor, db }) → object|null): kết quả gộp sâu DƯỚI data người gọi gửi (người gọi thắng). Chạy sau kiểm trường chính sách nên agent vẫn không tự đặt được.
  const defaults = [];
  const channelDefaults = {
    register(fn) { if (typeof fn !== 'function') throw new Error('channelDefaults.register cần hàm'); defaults.push(fn); },
    list: () => defaults.slice(),
    apply(ctx, data) {
      let base = {};
      for (const fn of defaults) base = deepMerge(base, fn(ctx) || {});
      return deepMerge(base, data || {});
    },
  };

  // ---- suggestionApply: áp dụng SG- theo loại (B: channel_brand) ----
  // register(targetKind, { validate?(c, p) → throw nếu sai (khi suggestion.create), apply(c, sg) → object|undefined (gộp vào audit.after) })  — apply chạy TRONG tx của suggestion.apply
  const sgHandlers = new Map();
  const suggestionApply = {
    register(kind, h) {
      if (!kind || !h || typeof h.apply !== 'function') throw new Error('suggestionApply.register(kind, {apply})');
      if (sgHandlers.has(kind)) throw new Error('suggestionApply trùng loại: ' + kind);
      sgHandlers.set(kind, h);
    },
    get: (kind) => sgHandlers.get(kind) || null,
    kinds: () => [...sgHandlers.keys()],
  };

  // ---- gates: cài đặt cổng ngoài 8 cổng R3 (T: G-THUMB · U: G-CURSOR) ----
  // register(id, async fn({ ctx, db, B, plan, render, rendered, tmp, run, mp4Path, mixPath, ffmpegPath }) → {gate:id, result:'pass'|'fail'|'unknown', measure})
  // Cổng nằm trong GATES áp cho bài mà chưa có cài đặt ⇒ 'unknown' ⇒ chặn (INT-08: không bao giờ cho qua ngầm).
  const gateImpls = new Map();
  const gates = {
    register(id, fn) { if (typeof fn !== 'function') throw new Error('gates.register(id, fn)'); if (gateImpls.has(id)) throw new Error('gates trùng: ' + id); gateImpls.set(id, fn); },
    get: (id) => gateImpls.get(id) || null,
    ids: () => [...gateImpls.keys()],
  };

  // ---- hooks: điểm móc pipeline. on(name, fn) · run(name, arg) (tuần tự, có thể async; trả mảng kết quả) ----
  //   plan.input   ({B, input, ctx})   trước buildPlan: sửa `input` (thêm kind/variant/screens/host/brand…)
  //   plan.after   ({B, plan, ctx})    sau buildPlan, trước kiểm quyền asset: sửa `plan` (T: plan.thumbs = resolveThumbs(...); B/U/T: đẩy plan.assetRefs)
  //   export.after ({ctx, render, actor, entry, dir, files})  sau khi xuất gói (O: ops.publish tự đánh dấu "đã đăng" khi owner xuất)
  const HOOKS = ['plan.input', 'plan.after', 'export.after'];
  const handlers = new Map(HOOKS.map((n) => [n, []]));
  const hooks = {
    names: () => HOOKS.slice(),
    on(name, fn) {
      if (!handlers.has(name)) throw new Error('hook không tồn tại: ' + name + ' (có: ' + HOOKS.join(', ') + ')');
      if (typeof fn !== 'function') throw new Error('hook cần hàm');
      handlers.get(name).push(fn);
    },
    count: (name) => (handlers.get(name) || []).length,
    run(name, arg) {
      const out = [];
      for (const fn of handlers.get(name) || []) out.push(fn(arg));
      return out;
    },
    async runAsync(name, arg) {
      const out = [];
      for (const fn of handlers.get(name) || []) out.push(await fn(arg));
      return out;
    },
  };
  return { lessonExt, channelDefaults, suggestionApply, gates, hooks };
}

module.exports = { createExt, deepMerge, EXT_COLUMNS };
