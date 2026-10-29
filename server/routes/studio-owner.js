// © 2026 Gen Labs — All rights reserved.
// Route cho giao diện W2 (UI-H1 Nhận diện · UI-R2 Phòng chiếu · UI-P2 Bài học · UI-L1 Nhân vật): đọc dữ liệu màn hình + các thao tác
// CHỈ chủ xưởng trên phiên UI (ma trận SPEC-0.2.0 §10). Mọi ghi đi qua write() — op tự kiểm quyền (ownerUi); route chỉ nối HTTP ↔ op.
//   GET  /api/channels/:id/brand        brand thô + đã chuẩn hoá + lỗi + preset/cặp phông + logo dùng được + đề xuất SG- channel_brand đang chờ
//   POST /api/suggestions/:id/apply     suggestion.apply (ownerUi)
//   GET  /api/renders/:id/room          phần Phòng chiếu cần thêm: trạng thái xuất/đăng + nhân vật dùng trong clip (chưa chốt ⇒ cảnh báo)
//   POST /api/renders/:id/thumbnail     thumbnail.pick {variant} (ownerUi)
//   POST /api/renders/:id/published     {published: true|false} ⇒ render.mark_published / unmark_published (ownerUi)
//   GET  /api/lessons/:id/ext           cột mở rộng của bài (kind, aspect, variant, screens, thumbnail) + tỉ lệ mặc định của kênh
//   GET  /api/cast/:id                  công thức + trạng thái suy ra + kết quả kiểm công thức (validateRecipe) + giọng quét được theo nhà cung cấp
//   GET  /api/cast/:id/sheet?w=         JPEG bảng nhân vật qua renderStill(mode:'cast') — đúng đường dựng của pipeline
//   POST /api/cast/:id/approve|retire   cast.approve {version?} / cast.retire (ownerUi)
//   POST /api/cast/:id/voice            {provider, voice} ⇒ cast.save (version mới; công thức kiểm lại phía server)
// Không có tool MCP tương ứng cho các thao tác chỉ-owner (cố ý, §10). Lỗi luôn {code, text_human, detail}.
'use strict';
const brandMod = require('../../render/brand.js');
const aspects = require('../../render/aspects.js');

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const UI = { sess: true, ui: true, strictOrigin: true };
const LOGO_MIME = ['image/svg+xml', 'image/png', 'image/webp'];

function register(add, rctx) {
  const { db, write, actorOf, fail, need, J, config } = rctx;
  const chanData = (ch) => { const v = db.json(db.get('SELECT data FROM channel_versions WHERE entity_id=? AND version=?', ch.id, ch.current_version)); return (v && v.data) || {}; };
  const castData = (m, ver) => { const r = db.json(db.get('SELECT data FROM cast_versions WHERE entity_id=? AND version=?', m.id, ver)); return (r && r.data) || null; };
  const status = (m) => {
    const st = m.status || 'draft';
    return st === 'approved' && m.approved_version && m.current_version > m.approved_version ? 'approved_pending' : st;   // CNS-102: suy ra, không lưu cột
  };

  // ---- UI-H1: nhận diện kênh ----
  add('GET', '/api/channels/:id/brand', { sess: true }, async (c) => {
    const ch = need('channels', c.params.id, 'kênh');
    const data = chanData(ch);
    const raw = isObj(data.brand) ? data.brand : null;
    const normalized = brandMod.normalize(Object.assign({}, data, { brand: raw || {} }));
    const logos = db.all("SELECT display_id, mime, bytes, meta FROM assets WHERE workspace_id=? AND media_present=1 AND mime IN ('image/svg+xml','image/png','image/webp') ORDER BY created_at DESC LIMIT 50", db.ws)
      .filter((a) => LOGO_MIME.includes(a.mime)).map((a) => ({ id: a.display_id, mime: a.mime, bytes: a.bytes, url: '/media/' + a.display_id, ok: a.bytes <= 512 * 1024 }));
    const suggestions = db.all("SELECT display_id, diff, created_at, created_by FROM suggestions WHERE workspace_id=? AND target_kind='channel_brand' AND target_id=? AND state='proposed' ORDER BY created_at DESC", db.ws, ch.display_id)
      .map((s) => { const d = J(s.diff) || {}; return { id: s.display_id, created_at: s.created_at, by: s.created_by, note: d.note || null, patch: isObj(d.patch) ? d.patch : {}, base_version: d.base_version == null ? null : d.base_version, stale: d.base_version != null && d.base_version !== ch.current_version }; });
    return {
      channel: { display_id: ch.display_id, name: ch.name, version: ch.current_version },
      default_aspect: data.default_aspect || data.aspect || aspects.catalog().default,
      brand: raw, normalized, errors: raw ? brandMod.check(raw) : [],
      presets: Object.keys(brandMod.PRESETS).map((k) => ({ id: k, label: brandMod.PRESETS[k].label, fonts: brandMod.PRESETS[k].fonts, tokens: brandMod.PRESETS[k].tokens })),
      font_pairs: Object.keys(brandMod.FONT_PAIRS).map((k) => ({ id: k, label: brandMod.FONT_PAIRS[k].label })),
      token_keys: brandMod.TOKEN_KEYS, logos, suggestions,
    };
  });
  add('POST', '/api/suggestions/:id/apply', UI, async (c) => ({ result: write(actorOf(c), 'suggestion.apply', { suggestion: c.params.id }) }));

  // ---- UI-R2: Phòng chiếu ----
  add('GET', '/api/renders/:id/room', { sess: true }, async (c) => {
    const r = need('renders', c.params.id, 'bản dựng');
    const man = J(r.manifest) || {};
    // phiên bản nhân vật ĐÃ DÙNG khi dựng: manifest.cast = {CM: {version}} (pipeline) | ["CM@v"] (dữ liệu cũ/seed); thiếu ⇒ suy từ plan.lines
    const used = new Map();
    if (isObj(man.cast)) for (const [k, v] of Object.entries(man.cast)) used.set(k, isObj(v) && Number.isInteger(v.version) ? v.version : null);
    else if (Array.isArray(man.cast)) for (const s of man.cast) { const m = /^(.+?)@(\d+)$/.exec(String(s)); if (m) used.set(m[1], Number(m[2])); }
    for (const l of (man.plan && man.plan.lines) || []) if (l.who && !used.has(l.who)) used.set(l.who, null);
    const cast = [...used].map(([ref, ver]) => {
      const m = db.get('SELECT display_id, name, status, current_version, approved_version FROM cast_members WHERE workspace_id=? AND (display_id=? OR id=?)', db.ws, ref, ref);
      if (!m) return null;
      const v = ver || (m.status === 'approved' && m.approved_version ? m.approved_version : m.current_version);
      return { display_id: m.display_id, name: m.name, status: status(m), version: v, approved: m.status === 'approved' && m.approved_version === v };
    }).filter(Boolean);
    return { render: r.display_id, state: r.state, exported_at: r.exported_at || null, published_at: r.published_at || null, published_source: r.published_source || null, thumbnail_pick: r.thumbnail_pick || null, cast };
  });
  add('POST', '/api/renders/:id/thumbnail', UI, async (c) => {
    const b = c.body || {};
    const variant = b.variant === undefined || b.variant === null ? undefined : Number(b.variant);
    return { result: write(actorOf(c), 'thumbnail.pick', { render: c.params.id, variant, asset: typeof b.asset === 'string' ? b.asset : undefined }) };
  });
  add('POST', '/api/renders/:id/published', UI, async (c) => {
    const on = (c.body || {}).published;
    if (typeof on !== 'boolean') throw fail('invalid', 'published phải là true hoặc false.');
    return { result: write(actorOf(c), on ? 'render.mark_published' : 'render.unmark_published', { render: c.params.id }) };
  });

  // ---- UI-P2: Bài học ----
  add('GET', '/api/lessons/:id/ext', { sess: true }, async (c) => {
    const l = need('lessons', c.params.id, 'bài học');
    const lv = db.json(db.get('SELECT kind, aspect, variant, screens, thumbnail, version FROM lesson_versions WHERE lesson_id=? AND version=?', l.id, l.current_version)) || {};
    const ch = db.get('SELECT * FROM channels WHERE id=?', l.channel_id);
    const cd = ch ? chanData(ch) : {};
    return { lesson: l.display_id, version: lv.version || l.current_version, kind: lv.kind || 'lesson', variant: lv.variant || null, aspect: lv.aspect || '16:9', aspect_stored: lv.aspect || null,
      screens: Array.isArray(lv.screens) ? lv.screens : null, thumbnail: isObj(lv.thumbnail) ? lv.thumbnail : null,
      channel: ch ? { display_id: ch.display_id, name: ch.name, default_aspect: cd.default_aspect || cd.aspect || null } : null };
  });

  // ---- UI-L1: Nhân vật ----
  // giọng quét được lúc chạy (STD-10): mỗi nhà cung cấp tts đang bật → danh sách giọng của lần quét gần nhất
  const voicesByVendor = () => {
    const out = {};
    for (const p of db.all("SELECT vendor, scan FROM providers WHERE workspace_id=? AND kind='tts' AND enabled=1 AND deleted_at IS NULL", db.ws)) {
      const sc = J(p.scan) || {};
      const svc = isObj(sc.service) && Array.isArray(sc.service.voices) ? sc.service.voices : null;
      const list = svc ? svc.filter(isObj).map((v) => ({ id: String(v.id), name: v.name ? String(v.name) : String(v.id), gender: v.gender ? String(v.gender) : null }))
        : (Array.isArray(sc.voices) ? sc.voices : []).map((v) => (isObj(v) ? { id: String(v.id || v.name), name: String(v.name || v.id), gender: v.gender ? String(v.gender) : null } : { id: String(v), name: String(v), gender: null }));
      const vendor = p.vendor === 'fake' ? 'gemini' : p.vendor;   // GS_FAKE_PROVIDERS dùng danh sách giọng của Gemini
      out[vendor] = (out[vendor] || []).concat(list.filter((v) => !(out[vendor] || []).some((x) => x.id === v.id)));
      if (sc.scanned_at) out[vendor + '_scanned_at'] = sc.scanned_at;
    }
    return out;
  };
  function validation(m, data) {
    const { validateRecipe } = require('../../render/cast/validate.js');
    const castLib = require('../../render/cast');
    const ch = db.get('SELECT * FROM channels WHERE id=?', m.channel_id);
    const cd = ch ? chanData(ch) : {};
    const sibs = db.all("SELECT * FROM cast_members WHERE channel_id=? AND deleted_at IS NULL AND status<>'retired' AND id<>?", m.channel_id, m.id)
      .map((x) => ({ ref: x.display_id, name: x.name, data: castData(x, x.status === 'approved' && x.approved_version ? x.approved_version : x.current_version) || {} }));
    const offline = new Set();
    for (const p of db.all("SELECT scan FROM providers WHERE workspace_id=? AND vendor='offline' AND deleted_at IS NULL AND scan IS NOT NULL", db.ws)) {
      const sc = J(p.scan); (sc && Array.isArray(sc.voices) ? sc.voices : []).forEach((x) => { if (typeof x === 'string') offline.add(x); });
    }
    const trusted = m.origin === 'seed' || m.origin === 'migration';
    try {
      const v = validateRecipe(data || {}, { library: castLib.library(), brand: isObj(cd.brand) ? cd.brand : null, channelName: ch ? ch.name : '', siblings: sibs, strict: true, allowLegacy: trusted, allowLight: true, voices: { offline: [...offline] } });
      return { ok: !!v.ok, mode: v.mode || null, errors: v.errors || [], warnings: v.warnings || [] };
    } catch (e) {
      return { ok: false, mode: null, errors: [{ path: '', code: 'validate_error', text_human: 'Không kiểm được công thức (engine lỗi).', detail: String(e && e.message || e).slice(0, 300) }], warnings: [] };
    }
  }
  add('GET', '/api/cast/:id', { sess: true }, async (c) => {
    const m = need('cast_members', c.params.id, 'nhân vật');
    const ch = db.get('SELECT display_id, name FROM channels WHERE id=?', m.channel_id);
    const data = castData(m, m.current_version);
    const versions = db.all('SELECT version, note, created_at, created_by FROM cast_versions WHERE entity_id=? ORDER BY version DESC LIMIT 20', m.id);
    return {
      member: { display_id: m.display_id, name: m.name, role_label: m.role_label, channel: ch, status: status(m), raw_status: m.status, current_version: m.current_version,
        approved_version: m.approved_version || null, approved_at: m.approved_at || null, origin: m.origin || null },
      data, voice: isObj(data && data.voice) ? data.voice : null, versions, validation: validation(m, data), voices: voicesByVendor(),
    };
  });
  const sheetCache = new Map();
  add('GET', '/api/cast/:id/sheet', { sess: true }, async (c) => {
    const m = need('cast_members', c.params.id, 'nhân vật');
    const w = c.url.searchParams.get('w') === null ? 1280 : Math.round(Number(c.url.searchParams.get('w')));
    if (!Number.isFinite(w) || w < 320 || w > 1920) throw fail('invalid', 'w phải trong 320..1920.');
    const ver = Number(c.url.searchParams.get('version')) || m.current_version;
    const data = castData(m, ver);
    if (!data) throw fail('not_found', `Nhân vật ${m.display_id} không có v${ver}.`);
    const key = [m.id, ver, w].join('|');
    let buf = sheetCache.get(key);
    if (!buf) {
      const castLib = require('../../render/cast');
      const lib = castLib.library();
      const ch = db.get('SELECT * FROM channels WHERE id=?', m.channel_id);
      const cd = ch ? chanData(ch) : {};
      const brand = isObj(cd.brand) ? brandMod.normalize(cd) : null;
      const payload = { cast: { [m.display_id]: data }, packs: lib.packs, parts: lib.parts, title: m.name + ' · v' + ver };
      if (brand && brand.tokens) payload.brand = { tokens: { bg: brand.tokens.paper, ink: brand.tokens.ink, hl: brand.tokens.hl } };
      let r;
      try {
        r = await require('../../render/still.js').renderStill({ mode: 'cast', payload, size: [w, Math.round(w * 9 / 16)], format: 'jpeg', quality: 82, assetRoot: config.dataDir, ffmpegPath: config.ffmpegPath, chromiumPath: config.chromiumPath });
      } catch (e) {
        if (e && e.code === 'still_queue_full') throw fail('rate_limited', e.message, { still: e.code });
        throw fail('bad_gateway', 'Không dựng được bảng nhân vật.', { still: e && e.code, message: String(e && e.message || e).slice(0, 300) });
      }
      if (r.errors && r.errors.length) throw fail('bad_gateway', 'Dựng bảng nhân vật có lỗi trong sân khấu.', { errors: r.errors.slice(0, 5) });
      buf = r.buffer;
      sheetCache.set(key, buf); while (sheetCache.size > 16) sheetCache.delete(sheetCache.keys().next().value);
    }
    c.res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': buf.length, 'Cache-Control': 'private, no-store' });
    c.res.end(buf);
    return null;
  });
  add('POST', '/api/cast/:id/approve', UI, async (c) => {
    const b = c.body || {};
    return { result: write(actorOf(c), 'cast.approve', { cast: c.params.id, version: b.version === undefined ? undefined : Number(b.version) }) };
  });
  add('POST', '/api/cast/:id/retire', UI, async (c) => ({ result: write(actorOf(c), 'cast.retire', { cast: c.params.id }) }));
  add('POST', '/api/cast/:id/voice', UI, async (c) => {
    const b = c.body || {};
    if (!['gemini', 'offline'].includes(b.provider)) throw fail('invalid', 'Nhà cung cấp giọng phải là gemini hoặc offline.');
    if (typeof b.voice !== 'string' || !b.voice.trim() || b.voice.length > 64) throw fail('invalid', 'Cần tên giọng.');
    const m = need('cast_members', c.params.id, 'nhân vật');
    const data = JSON.parse(JSON.stringify(castData(m, m.current_version) || {}));
    data.voice = Object.assign({}, isObj(data.voice) ? data.voice : {}, { provider: b.provider, voice: b.voice.trim() });
    if (data.voice.model === undefined) data.voice.model = null;
    return { result: write(actorOf(c), 'cast.save', { id: m.display_id, data, note: 'Đổi giọng: ' + b.provider + ' · ' + b.voice.trim() }) };
  });
}

module.exports = { register };
