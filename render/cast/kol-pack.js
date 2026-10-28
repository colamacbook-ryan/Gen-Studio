// © 2026 Gen Labs — All rights reserved.
// Pack KOL của chủ xưởng (SPEC-0.2.0 §3.7, CNS-124): tệp JSON thuần `gen-chibi.pack/1` (công thức + linh kiện chữ ký) nằm NGOÀI repo,
// nạp bằng GS_KOL_PACK=<đường dẫn> lúc khởi động, ĐỘC LẬP với GS_SEED_DEMO. Module này: nạp engine vendor vào node:vm, kiểm pack (checkDataPack + cổng engine
// + luật cứng §3.4), giữ pack đang nạp cho library(), seed nhân vật ở trạng thái `candidate` (không bao giờ `approved`) vào kênh đầu tiên nếu chưa có.
// Không phụ thuộc DOM hay npm.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const VENDOR = path.join(__dirname, '..', '..', 'vendor', 'gen-chibi');
const ENGINE_FILES = ['engine/core.js', 'engine/i18n.js', 'engine/voices.js', 'engine/sounds.js', 'engine/choreo.js',
  'kinds/character/gen.core.js', 'kinds/khung/gen.khung.js', 'kinds/character/gen.choreo.js'];
const MAX_BYTES = 2 * 1024 * 1024;
const RESERVED_PACKS = ['gen.core', 'gen.khung', 'gen.studio', 'local.my'];   // id pack có sẵn của engine/xưởng — pack của chủ xưởng không được trùng
const OUTLINE = { width: 3, sticker: true };   // hướng Y: viền ngoài + viền dán trắng nướng vào path (opts.outline của engine, không filter)
const ENUM = {
  role: ['host_lead', 'host_co', 'learner', 'expert'], energy: ['calm', 'warm', 'energetic', 'hyper'],
  temperament: ['earnest', 'tsundere', 'deadpan', 'curious'], laugh: ['giggle', 'haha', 'smirk']
};

// Nạp engine vendor vào một ngữ cảnh vm MỚI (mỗi lần kiểm một ngữ cảnh riêng: đăng ký thử không làm bẩn lần sau).
function loadEngine() {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  ENGINE_FILES.forEach(f => vm.runInContext(fs.readFileSync(path.join(VENDOR, f), 'utf8'), ctx, { filename: 'vendor/gen-chibi/' + f }));
  return ctx.window.GenChibi;
}
const e = (p, code, text_human) => ({ path: p, code, text_human });
const readJson = f => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));

// recipesOf(pack) → công thức cast_versions.data: tham chiếu linh kiện trần của pack thành `<pack.id>/<id>`; bỏ `status` (trạng thái ở cột cast_members.status)
function recipesOf(pack) {
  return (pack.assets || []).map(a => {
    const r = JSON.parse(JSON.stringify(a));
    delete r.pack; delete r.key; delete r.status; delete r.kind; delete r.version;
    if (r.look && r.look.parts) Object.keys(r.look.parts).forEach(s => { const v = String(r.look.parts[s]); if (!v.includes('/')) r.look.parts[s] = pack.id + '/' + v; });
    return r;
  });
}
// cast đã có trong xưởng: Anh Gen + Bé Hỏi + host mẫu (+ opts.existing: công thức khác cùng kênh)
function existingRecipes(opts) { return readJson('default-cast.json').concat(readJson('sample-hosts.json'), (opts && opts.existing) || []); }
const mustKeys = r => ((r.identity && r.identity.must) || []).map(String);
const voiceOf = r => r.voice && (r.voice.voice || r.voice.ai);

// checkPack(json, {existing?}) → { ok, errors:[{path, code, text_human}], warnings:[chuỗi], gates:{[id]:[hàng cổng]}, recipes, counts }
function checkPack(json, opts) {
  const errors = [], warnings = [], gates = {};
  const fail = () => ({ ok: false, errors, warnings, gates, recipes: [], counts: {} });
  if (!json || typeof json !== 'object' || Array.isArray(json)) { errors.push(e('pack', 'pack_invalid', 'Pack KOL phải là một object JSON.')); return fail(); }
  if (Buffer.byteLength(JSON.stringify(json)) > MAX_BYTES) { errors.push(e('pack', 'pack_too_big', 'Pack KOL lớn hơn 2 MB.')); return fail(); }
  if (json.format !== 'gen-chibi.pack/1') { errors.push(e('format', 'pack_invalid', 'Pack KOL cần format "gen-chibi.pack/1".')); return fail(); }
  if (RESERVED_PACKS.includes(json.id)) { errors.push(e('id', 'pack_id_taken', 'Mã pack "' + json.id + '" trùng pack có sẵn của engine/xưởng.')); return fail(); }
  const GC = loadEngine();
  const r = GC.registerDataPack(json);   // kiểm TRỌN gói trước; nhân vật phải qua gate() — lỗi ⇒ không đăng ký gì
  r.errors.forEach(t => errors.push(e('pack', 'pack_invalid', String(t))));
  r.warnings.forEach(t => warnings.push(String(t)));
  if (errors.length) return fail();
  const recipes = recipesOf(json), others = existingRecipes(opts), seen = new Set();
  const usedMust = new Map(), usedVoice = new Map();
  others.forEach(o => { mustKeys(o).forEach(k => usedMust.set(k, o.id)); if (voiceOf(o)) usedVoice.set(voiceOf(o), o.id); });
  recipes.forEach((rc, i) => {
    const at = 'assets[' + i + ']';
    if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(rc.id || '')) errors.push(e(at + '.id', 'cast_id_invalid', 'Mã nhân vật không hợp lệ: ' + rc.id));
    if (others.some(o => o.id === rc.id) || seen.has(rc.id)) errors.push(e(at + '.id', 'cast_id_taken', 'Mã nhân vật "' + rc.id + '" đã có trong xưởng.'));
    seen.add(rc.id);
    if ('status' in (json.assets[i] || {})) errors.push(e(at + '.status', 'forbidden_field', 'Công thức không có status (trạng thái nằm ở cột cast_members.status).'));
    const p = rc.persona;
    if (!p || typeof p !== 'object') errors.push(e(at + '.persona', 'persona_invalid', 'persona phải là object {role, energy, temperament, laugh, tic}.'));
    else {
      Object.keys(ENUM).forEach(k => { if (!ENUM[k].includes(p[k])) errors.push(e(at + '.persona.' + k, 'persona_invalid', 'persona.' + k + ' phải thuộc {' + ENUM[k].join(', ') + '}.')); });
      if (!GC.LIB.motions[p.tic]) errors.push(e(at + '.persona.tic', 'persona_invalid', 'persona.tic phải là một động tác của Gen-Chibi.'));
    }
    if (!rc.catchphrase || !rc.catchphrase.vi) errors.push(e(at + '.catchphrase', 'catchphrase_missing', 'Thiếu catchphrase.vi.'));
    if (!rc.running_gag || !rc.running_gag.id) errors.push(e(at + '.running_gag', 'running_gag_missing', 'Thiếu running_gag.'));
    if (!rc.dynamic || !rc.dynamic.type) errors.push(e(at + '.dynamic', 'dynamic_missing', 'Thiếu dynamic.'));
    if (!rc.voice || rc.voice.provider !== 'gemini' || !rc.voice.voice) errors.push(e(at + '.voice', 'voice_invalid', 'voice phải là {provider:"gemini", model, voice}.'));
    if (mustKeys(rc).length < 2) errors.push(e(at + '.identity.must', 'identity_must', 'identity.must cần ≥ 2 dấu nhận diện.'));
    mustKeys(rc).forEach(k => { const [slot, id] = k.split(':'); const ref = rc.look && rc.look.parts && rc.look.parts[slot]; if (!ref || String(ref).replace(/^.*\//, '') !== id) errors.push(e(at + '.identity.must', 'identity_must', 'Dấu nhận diện "' + k + '" không khớp linh kiện nào của nhân vật.')); });
    mustKeys(rc).forEach(k => { if (usedMust.has(k)) errors.push(e(at + '.identity.must', 'must_shared', 'Dấu nhận diện "' + k + '" trùng nhân vật ' + usedMust.get(k) + '.')); usedMust.set(k, rc.id); });
    if (voiceOf(rc) && usedVoice.has(voiceOf(rc))) errors.push(e(at + '.voice.voice', 'voice_shared', 'Giọng "' + voiceOf(rc) + '" trùng nhân vật ' + usedVoice.get(voiceOf(rc)) + '.'));
    if (voiceOf(rc)) usedVoice.set(voiceOf(rc), rc.id);
    // cổng engine với công thức ĐÃ gắn tiền tố (đúng dạng được lưu): 0 dòng chặn, identity + views8 ok, đủ 5 hướng
    const qid = json.id + '/' + (json.assets[i] && json.assets[i].id);
    const asset = GC.ASSETS[qid];
    if (!asset) { errors.push(e(at, 'gate_blocked', 'Nhân vật không đăng ký được.')); return; }
    const g = GC.gate(asset, { poses: true }); gates[rc.id] = g;
    GC.blockingGates(g).forEach(b => errors.push(e(at, 'gate_blocked', 'Cổng "' + b.id + '": ' + (b.detail || b.label))));
    const v8 = g.filter(x => x.id === 'views8')[0];
    if (!v8 || /thiếu/.test(v8.detail || '')) errors.push(e(at, 'views_missing', 'Thiếu hướng nhìn (cần front, q45, q90, q135, q180): ' + (v8 && v8.detail)));
  });
  return { ok: !errors.length, errors, warnings, gates, recipes, counts: r.counts };
}

let LOADED = null;
// load(file, opts) → { file, json, hash, outline, recipes, warnings }; sai ⇒ ném Error có mã `kol_pack_invalid` + .errors; không đọc được ⇒ `kol_pack_unreadable`
function load(file, opts) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (x) { throw Object.assign(new Error('GS_KOL_PACK: không đọc được ' + file + ' (' + x.code + ').'), { code: 'kol_pack_unreadable' }); }
  let json;
  try { json = JSON.parse(text); } catch (x) { throw Object.assign(new Error('GS_KOL_PACK: ' + file + ' không phải JSON hợp lệ.'), { code: 'kol_pack_invalid', errors: [e('pack', 'pack_invalid', 'JSON hỏng')] }); }
  const res = checkPack(json, opts);
  if (!res.ok) throw Object.assign(new Error('GS_KOL_PACK: pack không hợp lệ — ' + res.errors.map(x => x.path + ' ' + x.code + ': ' + x.text_human).join(' | ')), { code: 'kol_pack_invalid', errors: res.errors });
  LOADED = { file: path.resolve(file), json, hash: crypto.createHash('sha256').update(text).digest('hex').slice(0, 16), outline: OUTLINE, recipes: res.recipes, warnings: res.warnings };
  return LOADED;
}
const current = () => LOADED;
const unload = () => { LOADED = null; };

// seed(db) → { seeded:[CM-…], skipped:[id], reason? } — nhân vật của pack vào kênh ĐẦU TIÊN ở `candidate` nếu chưa có (so theo data.id); không kênh ⇒ chưa làm gì.
function seed(db, recipes) {
  const list = recipes || (LOADED && LOADED.recipes) || [];
  const ch = db.get('SELECT id, display_id FROM channels WHERE workspace_id=? AND deleted_at IS NULL ORDER BY created_at, display_id LIMIT 1', db.ws);
  if (!ch) return { seeded: [], skipped: [], reason: 'no_channel' };
  const out = { seeded: [], skipped: [] };
  db.tx(() => {
    const have = new Set(db.all('SELECT m.id, m.current_version FROM cast_members m WHERE m.channel_id=? AND m.deleted_at IS NULL', ch.id)
      .map(m => { const v = db.get('SELECT data FROM cast_versions WHERE entity_id=? AND version=?', m.id, m.current_version); try { return JSON.parse(v.data).id; } catch { return null; } }));
    list.forEach(rc => {
      if (have.has(rc.id)) { out.skipped.push(rc.id); return; }
      const m = db.insertRow('cast_members', { channel_id: ch.id, name: rc.name, role_label: rc.role || null, current_version: 1, status: 'candidate', created_by: 'system' }, { prefix: 'CM' });
      db.insertRow('cast_versions', { entity_id: m.id, version: 1, data: rc, note: 'seed: GS_KOL_PACK', created_by: 'system' });
      db.audit({ actor: 'system', entry: 'system', action: 'cast.seed_pack', entity_type: 'cast_member', entity_id: m.display_id, before: null, after: { status: 'candidate', id: rc.id, channel: ch.display_id } });
      out.seeded.push(m.display_id);
    });
  });
  return out;
}
// bootstrap(ctx) — gọi từ server/main.js khi có config.kolPack: nạp + kiểm pack (sai ⇒ ném lỗi, máy chủ không lên), seed ngay nếu đã có kênh,
// và seed ngay khi kênh đầu tiên được tạo (không phụ thuộc GS_SEED_DEMO).
function bootstrap(ctx) {
  const file = ctx.config && ctx.config.kolPack;
  if (!file) return null;
  const pack = load(file);
  const res = seed(ctx.db);
  if (ctx.events) ctx.events.on('change', (ev) => { if (ev && ev.entity === 'channel' && ev.op === 'channel.create') setImmediate(() => { try { seed(ctx.db); } catch (x) { console.error('[kol-pack] seed lỗi:', x.message); } }); });
  return { pack, seeded: res.seeded };
}

module.exports = { loadEngine, checkPack, recipesOf, load, current, unload, seed, bootstrap, OUTLINE, RESERVED_PACKS };
