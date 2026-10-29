// © 2026 Gen Labs — All rights reserved.
// Kiểm công thức nhân vật phía SERVER (SPEC-0.2.0 §3.4, §3.5, §3.9; gói V). Thuần Node, không DOM, không phụ thuộc npm.
//   loadEngine({root?}) → { GC, ... } : nạp engine Gen-Chibi (vendor/gen-chibi) vào `node:vm`, có cache. Cắm được: truyền root khác (vd checkout Gen-Chibi 0.26.0) —
//     mọi API mới của engine (registerDataPack, partAdvice…) chỉ dùng khi có (feature-detect), không gắn cứng phiên bản.
//   validateRecipe(data, { library, brand, poses, siblings, channelName, strict, root, allowLegacy, shipped, voices }) → { ok, errors:[{path, code, text_human}], warnings:[{path, code, text_human}], gates, mode }
//     mode do SERVER quyết qua cờ (mặc định TẮT, không đọc từ dữ liệu khách): 'v2' (mặc định — lược đồ §3.5 đầy đủ + cổng engine) · 'legacy' (persona chuỗi / voice {role, ai}; chỉ khi opts.allowLegacy)
//           · 'light' (giữ chỗ vô hại: không linh kiện/trang bị/màu/tính cách — không dựng được, không chốt được; chỉ khi opts.allowLight). Agent: luôn v2.
//     strict:true (candidate / cast.approve): chỉ 'v2' qua; legacy và light bị từ chối.
//     shipped:true: công thức chính là cast mặc định đóng gói (miễn đối chiếu với chính nó và tên kênh).
//   siblings: [{ ref, name, data }] — nhân vật KHÁC cùng kênh (luật cứng §3.4.1: không chung dấu `identity.must`, không chung giọng, không đeo cùng linh kiện nhận diện).
//   Công thức v2 còn so với cast mặc định Anh Gen / Bé Hỏi dù kênh không có họ (F1-5).
'use strict';
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VENDOR = path.join(__dirname, '..', '..', 'vendor', 'gen-chibi');
const ENGINE_FILES = ['engine/core.js', 'engine/i18n.js', 'kinds/character/gen.core.js', 'kinds/khung/gen.khung.js', 'engine/choreo.js', 'kinds/character/gen.choreo.js'];
const PACK_ID = 'local.my';
const MAX_BYTES = 64 * 1024;

// ---- enum đóng của "kinh thánh tính cách" (§3.5) ----
const ENUMS = {
  role: ['host_lead', 'host_co', 'learner', 'expert'],
  energy: ['calm', 'warm', 'energetic', 'hyper'],
  temperament: ['earnest', 'tsundere', 'deadpan', 'curious'],
  laugh: ['giggle', 'haha', 'smirk'],
  gagTrigger: ['on_wrong_answer', 'on_term_first_use', 'on_end_card', 'once_per_lesson'],   // + on_partner_mood:<mood>
  dynamic: ['straight_man_funny_man', 'mentor_student', 'rivals', 'siblings'],
  catchphraseUse: ['intro_or_turn', 'intro', 'turn', 'end', 'any'],
  voiceProvider: ['gemini', 'offline'],   // offline = sidecar giọng trên máy (gói L); tên giọng kiểm theo danh sách quét lúc chạy (opts.voices)
};
const TOP_V2 = ['id', 'name', 'role', 'persona', 'catchphrase', 'running_gag', 'dynamic', 'look', 'identity', 'expressions', 'voice', 'variant', 'lines', 'kind', 'version'];
const TOP_LEGACY = TOP_V2.concat(['project', 'status']);
const LOOK_KEYS = ['eyes', 'brows', 'parts', 'params', 'palette', 'equip'];
const SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/;
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const BRAND_REF = /^brand:([A-Za-z][A-Za-z0-9]{0,23})$/;
const REF = /^[A-Za-z0-9][A-Za-z0-9._\/-]{0,63}$/;
const TOKEN = /^[A-Za-z][A-Za-z0-9]{0,23}$/;
const MUST = /^[a-z][A-Za-z0-9]{1,15}:[A-Za-z0-9][A-Za-z0-9._\/-]{0,63}$/;
const VOICE_NAME = /^[A-Za-z][A-Za-z0-9_-]{1,39}$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const shortId = (r) => String(r || '').split('/').pop();
const norm = (s) => String(s === undefined || s === null ? '' : s).trim().toLowerCase();

// ---------------------------------------------------------------- engine trong node:vm ----------------------------------------------------------------
const engines = new Map();   // key `${root}|${libHash}` → { GC, root, lib }
const ENGINE_CACHE_MAX = 4;
function runEngine(root) {
  const ctx = { console, Math, JSON, Date }; ctx.window = ctx; vm.createContext(ctx);
  for (const f of ENGINE_FILES) {
    const file = path.join(root, f);
    if (!fs.existsSync(file)) throw new Error(`Thiếu tệp engine Gen-Chibi: ${file}`);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  }
  if (!ctx.GenChibi) throw new Error('Engine Gen-Chibi nạp xong nhưng không có GenChibi.');
  return ctx.GenChibi;
}
const libHashOf = new WeakMap();
function libraryHash(lib) {
  if (!lib) return 'none';
  if (typeof lib.hash === 'string' && lib.hash) return lib.hash;
  if (libHashOf.has(lib)) return libHashOf.get(lib);
  const h = crypto.createHash('sha256').update(JSON.stringify([lib.parts || [], lib.pack || null])).digest('hex').slice(0, 16);
  libHashOf.set(lib, h); return h;
}
// Đăng ký thư viện linh kiện dùng chung y như trang sân khấu (pack local.my + registerDataPart). Trả danh sách lỗi (không ném): thư viện hỏng ⇒ báo ở kết quả kiểm.
function registerLibrary(GC, lib) {
  const errs = [];
  if (!GC.PACKS[PACK_ID]) GC.pack({ id: PACK_ID, name: 'Của tôi', owner: 'Gen Labs', group: 'mine', visibility: 'private', license: '© 2026 Gen Labs' }, function () {});
  for (const p of (lib && lib.parts) || []) {
    const r = GC.registerDataPart(PACK_ID, p);
    if (r && r.errors && r.errors.length) errs.push(`linh kiện ${p && p.id}: ${r.errors.join('; ')}`);
  }
  // Gen-Chibi ≥ 0.26: gói dữ liệu đầy đủ (đầu, mắt, động tác, đạo cụ, hoạt động…) — chỉ khi engine có hàm, thiếu hàm mà thư viện đòi ⇒ báo rõ
  // lib.pack (một gói) hoặc lib.packs [{ json, outline }] — dạng render/cast/index.js library() trả (props.json + pack KOL của GS_KOL_PACK)
  const packs = ((lib && lib.packs) || []).map(x => x && x.json).concat(lib && lib.pack ? [lib.pack] : []).filter(Boolean);
  if (packs.length && typeof GC.registerDataPack !== 'function') errs.push('thư viện có gói dữ liệu (pack) nhưng engine hiện tại chưa hỗ trợ registerDataPack (cần Gen-Chibi ≥ 0.26).');
  else for (const pk of packs) { const r = GC.registerDataPack(pk); if (r.errors && r.errors.length) errs.push(`gói dữ liệu ${pk.id || ''}: ` + r.errors.join('; ')); }
  return errs;
}
function loadEngine(opts) {
  const o = opts || {}, root = path.resolve(o.root || VENDOR), key = root + '|' + libraryHash(o.library);
  let e = engines.get(key);
  if (!e) {
    const GC = runEngine(root);
    e = { GC, root, libErrors: o.library ? registerLibrary(GC, o.library) : [], version: GC.version };
    if (engines.size >= ENGINE_CACHE_MAX) engines.delete(engines.keys().next().value);
    engines.set(key, e);
  }
  return e;
}

// ---------------------------------------------------------------- tiện ích ----------------------------------------------------------------
// Thay `brand:<token>` trong look.palette bằng HEX của brand (§3.5). Trả { data (bản sao), errors:[{path,token}] }. Không có brand ⇒ dùng màu giữ chỗ trung tính (chỉ để dựng thử).
function resolveRecipe(data, brand) {
  const out = JSON.parse(JSON.stringify(data)), missing = [], tokens = (brand && brand.tokens) || null;
  const pal = out.look && out.look.palette;
  if (isObj(pal)) for (const k of Object.keys(pal)) {
    const m = typeof pal[k] === 'string' && BRAND_REF.exec(pal[k]);
    if (!m) continue;
    const hex = tokens && tokens[m[1]];
    if (typeof hex === 'string' && HEX.test(hex)) pal[k] = hex;
    else if (tokens) missing.push({ path: `look.palette.${k}`, token: m[1] });
    else pal[k] = '#808080';
  }
  return { data: out, missing };
}
function* strings(v, p, depth) {
  if (typeof v === 'string') { yield [p, v]; return; }
  if (depth > 8) return;
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) yield* strings(v[i], `${p}[${i}]`, depth + 1); }
  else if (isObj(v)) for (const k of Object.keys(v)) yield* strings(v[k], p ? `${p}.${k}` : k, depth + 1);
}
const depthOf = (v, d = 0) => (d > 8 ? d : Array.isArray(v) ? Math.max(d, ...v.map((x) => depthOf(x, d + 1))) : isObj(v) ? Math.max(d, ...Object.values(v).map((x) => depthOf(x, d + 1))) : d);
const voiceOf = (d) => { const v = d && d.voice; return norm(typeof v === 'string' ? v : v && (v.voice || v.ai)); };
const mustOf = (d) => (d && d.identity && Array.isArray(d.identity.must) ? d.identity.must.filter((x) => typeof x === 'string').map((m) => { const i = m.indexOf(':'); return i < 0 ? '' : m.slice(0, i) + ':' + shortId(m.slice(i + 1)); }).filter(Boolean) : []);
const hatOf = (d) => norm(d && d.look && d.look.palette && d.look.palette.hat);

// ---------------------------------------------------------------- kiểm lược đồ ----------------------------------------------------------------
function checkSchema(d, mode, GC, add, warn) {
  const keys = mode === 'v2' ? TOP_V2 : TOP_LEGACY;
  for (const k of Object.keys(d)) {
    if (k === 'status') {
      // CNS-102: trạng thái nằm ở cột cast_members.status, không nằm trong công thức. Cast mặc định 0.1.x có "draft" cũ — chỉ chấp nhận đúng giá trị đó ở chế độ legacy/light.
      if (mode === 'v2' || d.status !== 'draft') add('status', 'forbidden_field', 'Trạng thái nhân vật không nằm trong công thức. Dùng cast.save (nháp/ứng viên) hoặc chủ xưởng bấm "Chốt dùng" (cast.approve) — agent không tự chốt được.');
      else warn('status', 'legacy_status', 'Công thức cũ còn trường "status": "draft" — nên bỏ (trạng thái nằm ở cột riêng).');
    } else if (mode !== 'light' && !keys.includes(k)) add(k, 'unknown_field', `Trường "${k}" không thuộc lược đồ công thức nhân vật.`);
  }
  if (d.id !== undefined && !SLUG.test(String(d.id))) add('id', 'bad_id', 'id nhân vật chỉ gồm chữ thường, số, gạch nối (2–40 ký tự).');
  if (d.name !== undefined && (typeof d.name !== 'string' || !d.name.trim() || d.name.length > 60)) add('name', 'bad_name', 'Tên nhân vật phải là chuỗi 1–60 ký tự.');
  if (d.role !== undefined && (typeof d.role !== 'string' || d.role.length > 80)) add('role', 'bad_role', 'Vai (role) phải là chuỗi ≤ 80 ký tự.');
  if (d.variant !== undefined && !(typeof d.variant === 'string' && /^[A-Za-z0-9._-]{1,24}$/.test(d.variant))) add('variant', 'bad_variant', 'variant phải là chuỗi ngắn (chữ, số, . _ -).');
  if (mode === 'v2') {
    for (const k of ['id', 'name', 'persona', 'look', 'identity', 'voice']) if (d[k] === undefined) add(k, 'missing_field', `Công thức thiếu trường bắt buộc "${k}".`);
    for (const k of ['catchphrase', 'running_gag', 'dynamic']) if (d[k] === undefined) warn(k, 'missing_bible', `Thiếu "${k}" trong kinh thánh tính cách — nhân vật sẽ ít cá tính hơn.`);
  }

  // persona (§3.5)
  if (mode === 'v2' && isObj(d.persona)) {
    const p = d.persona, enumOf = { role: ENUMS.role, energy: ENUMS.energy, temperament: ENUMS.temperament, laugh: ENUMS.laugh };
    for (const k of Object.keys(p)) if (![...Object.keys(enumOf), 'tic'].includes(k)) add(`persona.${k}`, 'unknown_field', `persona không có trường "${k}".`);
    for (const [k, list] of Object.entries(enumOf)) {
      if (p[k] === undefined) add(`persona.${k}`, 'missing_field', `persona thiếu "${k}" (${list.join(' | ')}).`);
      else if (!list.includes(p[k])) add(`persona.${k}`, 'bad_enum', `persona.${k} = "${String(p[k]).slice(0, 30)}" không hợp lệ; chọn một trong: ${list.join(', ')}.`);
    }
    if (p.tic === undefined) add('persona.tic', 'missing_field', 'persona thiếu "tic" (tên một động tác của engine, vd chinHand).');
    else if (!own(GC.LIB.motions, p.tic)) add('persona.tic', 'bad_enum', `persona.tic = "${String(p.tic).slice(0, 30)}" không phải động tác của engine.`);
  } else if (d.persona !== undefined && mode !== 'legacy' && !isObj(d.persona)) add('persona', 'bad_persona', 'persona phải là object {role, energy, temperament, laugh, tic}.');

  if (d.catchphrase !== undefined) {
    const c = d.catchphrase;
    if (!isObj(c) || typeof c.vi !== 'string' || !c.vi.trim() || c.vi.length > 120) add('catchphrase', 'bad_catchphrase', 'catchphrase phải là {vi: chuỗi 1–120 ký tự, use}.');
    else if (c.use !== undefined && !ENUMS.catchphraseUse.includes(c.use)) add('catchphrase.use', 'bad_enum', `catchphrase.use không hợp lệ; chọn: ${ENUMS.catchphraseUse.join(', ')}.`);
  }
  if (d.running_gag !== undefined) {
    const g = d.running_gag, W = 'running_gag';
    if (!isObj(g)) add(W, 'bad_gag', 'running_gag phải là object.');
    else {
      for (const k of Object.keys(g)) if (!['id', 'text', 'trigger', 'motion', 'fx', 'prop', 'max_per_min'].includes(k)) add(`${W}.${k}`, 'unknown_field', `running_gag không có trường "${k}".`);
      if (!SLUG.test(String(g.id || ''))) add(`${W}.id`, 'bad_id', 'running_gag.id chỉ gồm chữ thường, số, gạch nối.');
      if (typeof g.text !== 'string' || !g.text.trim() || g.text.length > 140) add(`${W}.text`, 'bad_gag', 'running_gag.text phải là chuỗi 1–140 ký tự.');
      const trig = String(g.trigger || '');
      if (!(ENUMS.gagTrigger.includes(trig) || /^on_partner_mood:[a-z]{2,16}$/.test(trig))) add(`${W}.trigger`, 'bad_enum', `running_gag.trigger không hợp lệ; chọn: on_partner_mood:<mood>, ${ENUMS.gagTrigger.join(', ')}.`);
      if (!own(GC.LIB.motions, String(g.motion))) add(`${W}.motion`, 'bad_enum', 'running_gag.motion phải là tên một động tác của engine.');
      if (g.fx !== undefined && g.fx !== null && !own(GC.LIB.fx, String(g.fx))) add(`${W}.fx`, 'bad_enum', 'running_gag.fx phải là tên một hiệu ứng của engine (hoặc null).');
      if (g.prop !== undefined && g.prop !== null && !(typeof g.prop === 'string' && SLUG.test(g.prop))) add(`${W}.prop`, 'bad_gag', 'running_gag.prop phải là id đạo cụ (hoặc null).');
      if (!Number.isInteger(g.max_per_min) || g.max_per_min < 1 || g.max_per_min > 6) add(`${W}.max_per_min`, 'bad_gag', 'running_gag.max_per_min phải là số nguyên 1–6 (tránh gag lặp gây nhàm).');
    }
  }
  if (d.dynamic !== undefined) {
    const y = d.dynamic;
    if (!isObj(y) || !SLUG.test(String(y.with || '')) || !ENUMS.dynamic.includes(y.type)) add('dynamic', 'bad_dynamic', `dynamic phải là {with: id nhân vật kia, type: ${ENUMS.dynamic.join(' | ')}}.`);
    else if (d.id !== undefined && y.with === d.id) add('dynamic.with', 'bad_dynamic', 'dynamic.with không được trỏ vào chính nhân vật này.');
  }

  // voice (§3.5): v2 {provider, model, voice, style?}; legacy {role, ai}; light chấp nhận cả hai
  if (d.voice !== undefined) {
    const v = d.voice;
    if (typeof v === 'string') { if (!VOICE_NAME.test(v)) add('voice', 'bad_voice', 'Tên giọng không hợp lệ.'); }
    else if (!isObj(v)) add('voice', 'bad_voice', 'voice phải là {provider, model, voice}.');
    else if (v.provider !== undefined || mode === 'v2') {
      for (const k of Object.keys(v)) if (!['provider', 'model', 'voice', 'style'].includes(k)) add(`voice.${k}`, 'unknown_field', `voice không có trường "${k}".`);
      if (!ENUMS.voiceProvider.includes(v.provider)) add('voice.provider', 'bad_enum', `voice.provider không hợp lệ; chọn: ${ENUMS.voiceProvider.join(', ')}.`);
      if (v.model !== null && v.model !== undefined && (typeof v.model !== 'string' || v.model.length > 80)) add('voice.model', 'bad_voice', 'voice.model là chuỗi hoặc null (null = model TTS của kênh).');
      if (!VOICE_NAME.test(String(v.voice || ''))) add('voice.voice', 'bad_voice', 'voice.voice phải là tên một giọng (vd Orus, Zephyr).');
      if (v.style !== undefined && (typeof v.style !== 'string' || v.style.length > 160)) add('voice.style', 'bad_voice', 'voice.style là chuỗi ≤ 160 ký tự.');
    } else if (v.ai !== undefined && !VOICE_NAME.test(String(v.ai))) add('voice.ai', 'bad_voice', 'Tên giọng không hợp lệ.');
  }

  // identity
  if (d.identity !== undefined) {
    const i = d.identity;
    if (!isObj(i)) add('identity', 'bad_identity', 'identity phải là {p1, must, source}.');
    else {
      if (!Array.isArray(i.must) || !i.must.every((m) => typeof m === 'string' && MUST.test(m))) add('identity.must', 'bad_identity', 'identity.must phải là mảng chuỗi dạng "slot:id" (vd hair:khoa-toc).');
      else {
        const min = mode === 'v2' ? 2 : 1;
        if (mode !== 'light' && i.must.length < min) add('identity.must', 'identity_must_min', `identity.must cần ≥ ${min} dấu nhận diện (đang có ${i.must.length}).`);
        if (new Set(i.must).size !== i.must.length) add('identity.must', 'bad_identity', 'identity.must có dấu nhận diện lặp.');
        if (mode === 'legacy' && i.must.length < 2) warn('identity.must', 'legacy_must', 'Công thức cũ chỉ có 1 dấu nhận diện; công thức mới cần ≥ 2.');
      }
      for (const k of ['p1', 'source']) if (i[k] !== undefined && (typeof i[k] !== 'string' || i[k].length > 160)) add(`identity.${k}`, 'bad_identity', `identity.${k} là chuỗi ≤ 160 ký tự.`);
    }
  }

  // look
  const look = d.look;
  if (look !== undefined) {
    if (!isObj(look)) add('look', 'bad_look', 'look phải là object.');
    else {
      if (mode !== 'light') for (const k of Object.keys(look)) if (!LOOK_KEYS.includes(k) && !(mode === 'legacy' && k === 'archetype')) add(`look.${k}`, 'unknown_field', `look không có trường "${k}".`);
      if (look.parts !== undefined) {
        if (!isObj(look.parts)) add('look.parts', 'bad_look', 'look.parts phải là object {slot: linh kiện}.');
        else for (const [slot, ref] of Object.entries(look.parts)) {
          if (!own(GC.LIB.slots, slot)) add(`look.parts.${slot}`, 'unknown_part', `Slot "${slot}" không có trong engine.`);
          else if (typeof ref !== 'string' || !REF.test(ref)) add(`look.parts.${slot}`, 'bad_look', 'Tham chiếu linh kiện không hợp lệ.');
        }
      }
      if (look.equip !== undefined) {
        if (!isObj(look.equip)) add('look.equip', 'bad_look', 'look.equip phải là object {slot: trang bị}.');
        else for (const [slot, ref] of Object.entries(look.equip)) {
          if (!own(GC.LIB.slots, slot)) add(`look.equip.${slot}`, 'unknown_part', `Slot "${slot}" không có trong engine.`);
          else if (typeof ref !== 'string' || !REF.test(ref)) add(`look.equip.${slot}`, 'bad_look', 'Tham chiếu trang bị không hợp lệ.');
        }
      }
      for (const k of ['eyes', 'brows']) if (look[k] !== undefined && !(typeof look[k] === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,23}$/.test(look[k]))) add(`look.${k}`, 'bad_look', `look.${k} phải là tên kiểu (vd round, normal).`);
      if (look.params !== undefined) {
        if (!isObj(look.params)) add('look.params', 'bad_look', 'look.params phải là object.');
        else for (const [slot, ps] of Object.entries(look.params)) {
          if (!isObj(ps)) { add(`look.params.${slot}`, 'bad_look', 'Tham số của một bộ phận phải là object {tên: số}.'); continue; }
          for (const [k, n] of Object.entries(ps)) if (!finite(n)) add(`look.params.${slot}.${k}`, 'bad_look', `Tham số ${slot}.${k} phải là số hữu hạn.`);
        }
      }
      if (look.palette !== undefined) {
        if (!isObj(look.palette)) add('look.palette', 'bad_look', 'look.palette phải là object {token: màu}.');
        else for (const [k, c] of Object.entries(look.palette)) {
          if (!TOKEN.test(k)) add(`look.palette.${k}`, 'bad_palette', `Tên token màu "${k.slice(0, 30)}" không hợp lệ.`);
          else if (typeof c !== 'string' || !(HEX.test(c) || BRAND_REF.test(c))) add(`look.palette.${k}`, 'bad_palette', `Màu "${String(c).slice(0, 30)}" không hợp lệ: chỉ nhận mã HEX (#RRGGBB) hoặc brand:<token>.`);
        }
      }
    }
  }

  // expressions: ghi đè theo state của engine
  if (d.expressions !== undefined) {
    if (!isObj(d.expressions)) add('expressions', 'bad_expression', 'expressions phải là object {state: ghi đè}.');
    else for (const [sid, ov] of Object.entries(d.expressions)) {
      const W = `expressions.${sid}`;
      if (!own(GC.LIB.states, sid)) { add(W, 'bad_expression', `"${sid.slice(0, 30)}" không phải trạng thái của engine.`); continue; }
      if (!isObj(ov)) { add(W, 'bad_expression', 'Ghi đè phải là object.'); continue; }
      const tables = { eyes: GC.LIB.eyePoses, brows: GC.LIB.browPoses, mouth: GC.LIB.mouths, motion: GC.LIB.motions };
      for (const k of Object.keys(ov)) {
        if (own(tables, k)) { if (!own(tables[k], String(ov[k]))) add(`${W}.${k}`, 'bad_expression', `${k} "${String(ov[k]).slice(0, 30)}" không có trong engine.`); }
        else if (['fx', 'fxAdd', 'fxRemove'].includes(k)) { if (!Array.isArray(ov[k]) || !ov[k].every((f) => own(GC.LIB.fx, String(f)))) add(`${W}.${k}`, 'bad_expression', `${k} phải là mảng tên hiệu ứng có trong engine.`); }
        else add(`${W}.${k}`, 'unknown_field', `Ghi đè không có trường "${k}".`);
      }
    }
  }
}

// ---------------------------------------------------------------- luật cứng: không trùng cast cũ (§3.4.1) ----------------------------------------------------------------
// voice.provider='offline': tên giọng phải có trong danh sách quét lúc chạy (STD-10) — opts.voices = { offline: [id…] } do server đọc từ providers.scan.
// Chưa quét (không có danh sách) ⇒ chỉ cảnh báo, không chặn.
function checkVoiceScan(d, o, add, warn) {
  const v = d && d.voice;
  if (!isObj(v) || v.provider !== 'offline' || !VOICE_NAME.test(String(v.voice || ''))) return;
  const list = o.voices && Array.isArray(o.voices.offline) ? o.voices.offline : null;
  if (!list || !list.length) { warn('voice.voice', 'voice_unscanned', 'Chưa quét được danh sách giọng offline — chưa kiểm được tên giọng. Chủ xưởng bấm Quét lại ở màn Nhà cung cấp.'); return; }
  if (!list.includes(v.voice)) add('voice.voice', 'unknown_voice', `Giọng offline "${v.voice}" không có trong danh sách quét (${list.slice(0, 8).join(', ')}${list.length > 8 ? '…' : ''}).`);
}

function checkCollisions(d, mode, others, add, eff, effEquip, rawParts) {
  const myVoice = voiceOf(d), myMust = mustOf(d), myHat = hatOf(d);
  for (const o of others) {
    const od = o.data || {}, who = `${o.name || o.ref || 'nhân vật khác'}`;
    if (myVoice && myVoice === voiceOf(od)) add('voice.voice', 'voice_collision', `Giọng "${myVoice}" đã là giọng của ${who}. Mỗi nhân vật cần một giọng riêng (không dùng chung với Anh Gen / Bé Hỏi hay nhân vật khác trong kênh).`);
    const omust = mustOf(od);
    for (const m of myMust) if (omust.includes(m)) add('identity.must', 'identity_collision', `Dấu nhận diện "${m}" trùng với ${who}. Hai nhân vật không được chung dấu nhận diện.`);
    // đeo đúng linh kiện nhận diện của người khác (vd kính của Anh Gen) dù không khai vào must
    for (const m of omust) {
      const i = m.indexOf(':'), slot = m.slice(0, i), id = m.slice(i + 1);
      if (slot !== 'eyes' && ((eff[slot] && eff[slot] === id) || (eff['equip:' + slot] && eff['equip:' + slot] === id) || (effEquip[slot] && effEquip[slot] === id) || (rawParts[slot] && rawParts[slot] === id))) add(`look.${effEquip[slot] ? 'equip' : 'parts'}.${slot}`, 'trait_collision', `Linh kiện "${id}" (${slot}) là dấu nhận diện của ${who} — nhân vật này không được đeo/dùng nó (vd KOL không đeo kính của Anh Gen).`);
    }
    const oh = hatOf(od);
    if (myHat && oh && myHat === oh) add('look.palette.hat', 'hat_collision', `Màu mũ ${myHat} trùng với ${who} (vd Bé Hỏi đội mũ vàng). Chọn màu mũ khác.`);
  }
}

// ---------------------------------------------------------------- hàm chính ----------------------------------------------------------------
function validateRecipe(data, opts) {
  const o = opts || {}, errors = [], warnings = [];
  const add = (p, code, text) => errors.push({ path: p, code, text_human: text });
  const warn = (p, code, text) => warnings.push({ path: p, code, text_human: text });
  const done = (extra) => Object.assign({ ok: errors.length === 0, errors, warnings, gates: [], mode: null }, extra);
  if (!isObj(data)) { add('', 'bad_recipe', 'Công thức nhân vật phải là một object JSON.'); return done(); }
  const bytes = Buffer.byteLength(JSON.stringify(data));
  if (bytes > MAX_BYTES) { add('', 'too_large', `Công thức quá lớn (${bytes} byte, tối đa ${MAX_BYTES}).`); return done(); }
  if (depthOf(data) > 8) { add('', 'too_deep', 'Công thức lồng quá sâu (tối đa 8 cấp).'); return done(); }
  for (const [p, s] of strings(data, '', 0)) if (/[<>]/.test(s)) add(p, 'markup', 'Không được chứa mã đánh dấu (ký tự < hoặc >) trong công thức nhân vật.');
  if (errors.length) return done();

  // Chế độ do SERVER quyết, không do dữ liệu khách chọn: v2 là mặc định; legacy chỉ khi server cho phép (o.allowLegacy: cast mặc định đóng gói, hoặc bản đã lưu vốn đã là legacy);
  // light = bản giữ chỗ VÔ HẠI (không linh kiện/trang bị/màu/tính cách ⇒ không dựng được gì, không chốt được) — mọi trường khác ⇒ v2.
  const lookObj = isObj(data.look) ? data.look : {};
  const hasLook = (isObj(lookObj.parts) && Object.keys(lookObj.parts).length > 0) || (isObj(lookObj.equip) && Object.keys(lookObj.equip).length > 0);
  const legacyShaped = typeof data.persona === 'string' || (isObj(data.voice) && data.voice.provider === undefined && (data.voice.ai !== undefined || data.voice.role !== undefined));
  const slotBoth = isObj(lookObj.parts) && isObj(lookObj.equip) ? Object.keys(lookObj.equip).filter((k) => own(lookObj.parts, k)) : [];
  const inert = !hasLook && Object.keys(data).every((k) => ['look', 'voice', 'name', 'role', 'id', 'variant'].includes(k)) && Object.keys(lookObj).every((k) => k === 'archetype' || k === 'v');
  const mode = isObj(data.persona) ? 'v2' : legacyShaped && o.allowLegacy === true ? 'legacy' : inert && o.allowLight === true ? 'light' : 'v2';
  if (mode === 'legacy') warn('', 'legacy_schema', 'Công thức theo lược đồ cũ (persona là chuỗi, voice {role, ai}). Vẫn dùng được; nhân vật mới nên theo lược đồ §3.5.');
  if (o.strict && mode !== 'v2') add('look.parts', 'recipe_incomplete', mode === 'light' ? 'Công thức chưa có linh kiện (look.parts) — chưa thể chốt dùng.' : 'Công thức theo lược đồ cũ — cần chuyển sang lược đồ §3.5 (persona là object, voice {provider, model, voice}) mới chốt dùng được.');

  let eng;
  try { eng = loadEngine({ root: o.root, library: o.library }); } catch (e) { add('', 'engine_unavailable', 'Không nạp được engine Gen-Chibi để kiểm công thức: ' + e.message); return done(); }
  const GC = eng.GC;
  for (const t of eng.libErrors) warn('', 'library', 'Thư viện linh kiện: ' + t);

  checkSchema(data, mode, GC, add, warn);
  checkVoiceScan(data, o, add, warn);
  for (const k of slotBoth) add(`look.equip.${k}`, 'slot_conflict', `Slot "${k}" khai ở cả look.parts và look.equip — chỉ được khai một nơi.`);
  if (mode === 'v2' && !hasLook) add('look.parts', 'missing_field', 'Công thức cần ít nhất một linh kiện (look.parts) hoặc trang bị (look.equip).');
  // không tên kênh trong công thức (CNS-096)
  const cn = norm(o.channelName);
  if (!o.shipped && cn.length >= 3) for (const [p, s] of strings(data, '', 0)) if (norm(s).includes(cn)) add(p, 'channel_name', `Công thức không được chứa tên kênh ("${o.channelName}") — nhân vật dùng được ở nhiều kênh.`);

  // so với nhân vật khác cùng kênh; v2 so thêm với cast mặc định (Anh Gen, Bé Hỏi)
  const others = (o.siblings || []).filter((s) => s && isObj(s.data));
  for (const s of others) if (data.id !== undefined && s.data.id === data.id) add('id', 'duplicate_id', `id "${data.id}" đã dùng cho ${s.name || s.ref} trong cùng kênh.`);
  const pool = others.slice();
  {
    let defaults = [];
    try { defaults = require('./index').defaults(); } catch (e) { add('', 'defaults_unavailable', 'Không đọc được cast mặc định để đối chiếu: ' + e.message); }
    const list = defaults && defaults.cast ? Object.values(defaults.cast) : [];
    for (const r of list) if (!o.shipped) pool.push({ ref: r.id, name: r.name, data: r });
  }
  // phần tử hiệu lực theo slot: trang bị (equip) thắng linh kiện (parts); equip trỏ item thì lấy linh kiện của item (engine ≥ 0.2x có getItem), không có thì dùng chính mã tham chiếu
  const eff = {}, effEquip = {};
  if (isObj(lookObj.parts)) for (const [slot, ref] of Object.entries(lookObj.parts)) if (typeof ref === 'string') eff[slot] = shortId(ref);
  if (isObj(lookObj.equip)) for (const [slot, ref] of Object.entries(lookObj.equip)) if (typeof ref === 'string') {
    let it = null; try { it = typeof GC.getItem === 'function' ? GC.getItem(ref, PACK_ID) : null; } catch (e) { it = null; }
    effEquip[slot] = shortId(ref); eff['equip:' + slot] = shortId(it && it.equip && it.equip.part ? it.equip.part : ref); if (!eff[slot]) eff[slot] = eff['equip:' + slot];
  }
  const rawParts = {}; if (isObj(lookObj.parts)) for (const [slot, ref] of Object.entries(lookObj.parts)) if (typeof ref === 'string') rawParts[slot] = shortId(ref);
  checkCollisions(data, mode, pool, add, eff, effEquip, rawParts);

  // ---- cổng engine: chỉ khi công thức có linh kiện thật ----
  let gates = [];
  if (hasLook && isObj(data.look)) {   // có parts hoặc equip ⇒ cổng engine chạy
    const R = resolveRecipe(data, o.brand);
    for (const m of R.missing) add(m.path, 'brand_token', `Token màu brand "${m.token}" không có trong nhận diện của kênh.`);
    if (!errors.length) {
      const a = R.data; a.id = '__validate__'; a.kind = 'character'; a.version = 1; a.status = mode === 'v2' ? 'published' : 'draft'; a.expressions = a.expressions || {}; a.lines = a.lines || {};
      const key = PACK_ID + '/' + a.id;
      try {
        GC.registerAsset(PACK_ID, a);
        gates = GC.gate(GC.ASSETS[key], { poses: o.poses !== false });
        for (const g of GC.blockingGates(gates, a.status)) {
          const txt = `${g.label || g.id}: ${g.detail || 'không đạt'}`;
          if (g.id === 'parts') add('look', 'unknown_part', `Linh kiện/kiểu không có trong thư viện — ${txt}`);
          else if (g.id === 'params') add('look.params', 'param_out_of_range', `Tham số ngoài khoảng cho phép — ${txt}`);
          else if (g.id === 'identity') add('identity.must', 'identity_missing', `Dấu nhận diện bắt buộc chưa đúng công thức — ${txt}`);
          else if (g.id === 'states' || g.id === 'motion' || g.id === 'poses') add('expressions', 'gate_' + g.id, `Engine không dựng được nhân vật — ${txt}`);
          else add('', 'gate_' + g.id, `Cổng kiểm engine không đạt — ${txt}`);
        }
        // hướng nhìn (luật cứng §3.4.2): engine 0.25 chỉ báo thông tin ("thiếu: …"); công thức v2 phải đủ trước/q45/q90/q135/q180, công thức cũ chỉ bị cảnh báo
        const v8 = gates.find((g) => g.id === 'views8');
        if (v8 && (v8.ok === false || v8.detailId === 'thiếu: {list}' || /^thiếu|^missing/i.test(v8.detail || ''))) {
          const t = `Linh kiện thiếu hướng nhìn thật (cần trước, q45, q90, q135, q180): ${v8.detail}`;
          if (mode === 'v2') add('look.parts', 'views_missing', t); else warn('look.parts', 'views_missing', t);
        }
        // lời khuyên của engine cho các linh kiện dữ liệu mà công thức dùng (không chặn)
        if (typeof GC.checkDataPart === 'function' && typeof GC.partAdvice === 'function' && o.library && Array.isArray(o.library.parts)) {
          const used = new Set(Object.values((a.look && a.look.parts) || {}).map(shortId));
          for (const def of o.library.parts) if (def && used.has(def.id)) {
            const c = GC.checkDataPart(def);
            if (c.def) for (const w of GC.partAdvice(c.def)) warn(`look.parts.${def.slot}`, 'part_advice', `Linh kiện ${def.id}: ${w}`);
          }
        }
      } catch (e) {
        add('', 'engine_error', 'Engine không dựng được công thức này: ' + e.message);
      } finally {
        delete GC.ASSETS[key];
        const i = GC.ASSET_ORDER.indexOf(key); if (i >= 0) GC.ASSET_ORDER.splice(i, 1);
      }
    }
  }
  return done({ gates: gates.map((g) => ({ id: g.id, ok: !!g.ok, info: !!g.info, label: g.label, detail: g.detail || '' })), mode });
}

// Số lần một bài dùng catchphrase của nhân vật (SPEC §3.5: cảnh báo > 2 lần). lines: [{say}]; trả { count, warn }
function catchphraseUses(lines, data) {
  const c = data && data.catchphrase && data.catchphrase.vi;
  if (!c) return { count: 0, warn: false };
  const key = norm(c).replace(/[.,;:!?"'“”‘’()…]/g, '');
  const count = (lines || []).filter((l) => norm(l && l.say).replace(/[.,;:!?"'“”‘’()…]/g, '').includes(key)).length;
  return { count, warn: count > 2 };
}

const isLegacyShaped = (d) => isObj(d) && (typeof d.persona === 'string' || (isObj(d.voice) && d.voice.provider === undefined && (d.voice.ai !== undefined || d.voice.role !== undefined)));

module.exports = { isLegacyShaped, validateRecipe, resolveRecipe, loadEngine, catchphraseUses, ENUMS, PACK_ID };
