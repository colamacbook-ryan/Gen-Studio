// © 2026 Gen Labs — All rights reserved.
// Pipeline: worker lease run → voicing → judging → aligning → rendering → mixing → gating → awaiting_review; export gói; quét provider.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const queue = require('./queue.js');
const state = require('./state.js');
const secrets = require('./secrets.js');
const events = require('./events.js');
const grids = require('./grids.js');
const rights = require('./rights.js');
const gateIds = require('../media/gates/index.js').gatesFor;   // cổng áp cho loại bài (SPEC §2.5) — luôn bản thật, kể cả khi test tiêm deps.gates

const J = grids.J;
const SYS = { type: 'system', id: 'pipeline', entry: 'system' };
const LEASE_MS = 60000;
const MAX_RERUNS = 5;
const FPS = 30;
const MAX_REGEN = 2;
const LIVE = new Set(['queued', 'voicing', 'judging', 'aligning', 'rendering', 'mixing', 'gating', 'retrying', 'waiting_quota']);
const CORE_GATES = ['G-WAV', 'G-SCRIPT', 'G-PRON', 'G-LOUD', 'G-SYNC', 'G-MOTION', 'G-FRAMES', 'G-MUX'];   // 8 cổng R3: luôn có mã + cài đặt tại media/gates; cổng khác (G-THUMB, G-CURSOR) cài qua write.ext.gates

function fail(code, text, detail) { const e = new Error(text); e.code = code; e.text_human = text; e.detail = detail === undefined ? null : detail; return e; }
class Abort extends Error {}
class Wait extends Error { constructor(until, text) { super(text); this.until = until; this.text_human = text; } }
class Block extends Error { constructor(code, text, detail) { super(text); this.code = code; this.text_human = text; this.detail = detail === undefined ? null : detail; } }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- phụ thuộc (nạp lười để test tiêm stub) ----------
const LOADERS = {
  providers: () => require('../media/providers/index.js'),
  wav: () => require('../media/wav.js'),
  align: () => require('../media/align.js'),
  mix: () => require('../media/mix.js'),
  srt: () => require('../media/srt.js'),
  gates: () => Object.assign({}, require('../media/gates/index.js'), { gateWavB: require('../media/gates/render.js').gateWavB }),
  registry: () => require('../render/blocks/registry.js'),
  brand: () => require('../render/brand.js'),            // normalize/hash nhận diện kênh (gói B thay stub)
  cast: () => require('../render/cast'),                 // library() linh kiện dùng chung (gói K thay stub)
  timeline: () => require('../render/engine/timeline.js'),
  render: () => require('../render/render.js'),
};
function dep(ctx, name) {
  ctx.deps = ctx.deps || {};
  if (!ctx.deps[name]) ctx.deps[name] = LOADERS[name]();
  return ctx.deps[name];
}

// ---------- múi giờ ----------
function localParts(date, tz) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const o = {};
  f.formatToParts(date).forEach(p => { if (p.type !== 'literal') o[p.type] = Number(p.value); });
  return { y: o.year, m: o.month, d: o.day, h: o.hour, mi: o.minute, s: o.second, day: `${o.year}-${String(o.month).padStart(2, '0')}-${String(o.day).padStart(2, '0')}` };
}
const wsTz = db => (db.get('SELECT timezone FROM workspaces WHERE id=?', db.ws) || {}).timezone || 'UTC';
function nextMidnightIso(db, now = new Date()) {
  const p = localParts(now, wsTz(db));
  return new Date(now.getTime() + 86400000 - ((p.h * 60 + p.mi) * 60 + p.s) * 1000 + 60000).toISOString();
}

// ---------- thuật ngữ ----------
// Trích thuật ngữ tiếng Anh từ câu — gợi ý ưu tiên độ CHÍNH XÁC (G-PRON chấm cả những gì trích sai): chỉ nhận TỪ ASCII "trông như tiếng Anh"
// (viết tắt có chấm A.I., có f/j/w/z, đuôi -tion/-ing/-age…). Cụm nhiều từ lấy từ khai báo + từ điển kênh + giám khảo.
const ENGLISHY = /[fjwzFJWZ]|\w\.\w|tion|ing$|ment|ness|ity|ble|age|ck|ll|ss|ee|oo|ea|ou|ght/i;
function extractTerms(say) {
  const out = [];
  for (const m of String(say || '').matchAll(/[\p{L}\p{N}][\p{L}\p{N}.\-]*/gu)) {
    let w = m[0];
    if (!/^[A-Za-z][A-Za-z0-9.\-]*$/.test(w)) continue;
    if (w.endsWith('.') && !w.slice(0, -1).includes('.')) w = w.slice(0, -1);
    if (w.length < 2) continue;
    if ((ENGLISHY.test(w) || /^[A-Z]{2,}$/.test(w)) && !out.includes(w)) out.push(w);
  }
  return out;
}
function glossaryTerms(channelData, say) {
  const g = channelData && (channelData.glossary || channelData.terms);
  const keys = Array.isArray(g) ? g.map(x => (typeof x === 'string' ? x : x && x.term)) : g && typeof g === 'object' ? Object.keys(g) : [];
  const low = String(say).toLowerCase();
  return keys.filter(k => typeof k === 'string' && k && low.includes(k.toLowerCase()));
}

// ---------- đọc dữ liệu ----------
const row = (db, sql, ...p) => db.json(db.get(sql, ...p));
function assetFile(db, ref) {
  const a = db.get('SELECT * FROM assets WHERE id=? OR display_id=?', ref, ref);
  if (!a) throw new Block('asset_missing', 'Thiếu asset ' + ref + '.');
  const p = path.isAbsolute(a.path) ? a.path : path.join(db.dataDir, a.path);
  return { asset: a, file: p };
}
function loadBundle(db, render) {
  const lv = row(db, 'SELECT * FROM lesson_versions WHERE id=?', render.lesson_version_id);
  const lesson = row(db, 'SELECT * FROM lessons WHERE id=?', lv.lesson_id);
  const channel = row(db, 'SELECT * FROM channels WHERE id=?', lesson.channel_id);
  const cv = row(db, 'SELECT data FROM channel_versions WHERE entity_id=? AND version=?', channel.id, channel.current_version);
  const lines = db.all('SELECT * FROM lines WHERE lesson_version_id=? ORDER BY ord', lv.id).map(l => {
    const cm = row(db, 'SELECT * FROM cast_members WHERE id=?', l.cast_member_id);
    // bản dựng dùng approved_version của nhân vật đã chốt (SPEC §3.7); chưa chốt (draft/candidate/retired…) ⇒ bản hiện hành như 0.1.x
    let ver = cm.status === 'approved' && cm.approved_version ? cm.approved_version : cm.current_version;
    let cvv = row(db, 'SELECT data FROM cast_versions WHERE entity_id=? AND version=?', cm.id, ver);
    if (!cvv) { ver = cm.current_version; cvv = row(db, 'SELECT data FROM cast_versions WHERE entity_id=? AND version=?', cm.id, ver); }
    return Object.assign(db.json(l), { terms_declared: J(l.terms_declared) || [], subtitle: J(l.subtitle) || null, cast: cm, cast_data: (cvv && cvv.data) || {}, cast_version: ver });
  });
  const beats = db.all('SELECT * FROM beats WHERE lesson_version_id=? ORDER BY ord', lv.id).map(b => db.json(b));
  return { lv, lesson, channel, channelData: (cv && cv.data) || {}, lines, beats };
}
// Nhà cung cấp chưa chọn model: lấy mục ưu tiên đầu tiên có trong kết quả quét của cùng vendor (bất kỳ hàng nào đã quét);
// chưa quét lần nào thì dùng mục ưu tiên đầu. Không đoán được thì chặn rõ ràng thay vì gọi model "null".
// bảng tĩnh — không dựng đường dẫn require từ dữ liệu DB
const PREFERRED_BY_VENDOR = { gemini: require('../media/providers/gemini.js').PREFERRED };
function defaultModel(db, pv, kind) {
  const byVendor = Object.hasOwn(PREFERRED_BY_VENDOR, pv.vendor) ? PREFERRED_BY_VENDOR[pv.vendor] : {};
  const prefer = Object.hasOwn(byVendor, kind) ? byVendor[kind] : [];
  const seen = new Set(); let scanned = false;
  for (const r of db.all("SELECT scan FROM providers WHERE workspace_id=? AND vendor=? AND deleted_at IS NULL AND scan IS NOT NULL", db.ws, pv.vendor)) {
    const models = (db.json(r).scan || {}).models;
    if (Array.isArray(models)) scanned = true;
    for (const m of models || []) if (m.kind === kind && m.available) seen.add(m.model);
  }
  const hit = prefer.find(m => seen.has(m)) || [...seen][0] || (scanned ? null : prefer[0]);
  if (!hit) throw new Block('no_model', `Chưa chọn được model ${kind} cho ${pv.vendor}. Mở Nhà cung cấp, bấm Quét lại.`);
  return hit;
}
function pickProvider(ctx, kind) {
  const { db, config } = ctx;
  const pv = row(db, "SELECT * FROM providers WHERE workspace_id=? AND kind=? AND enabled=1 AND deleted_at IS NULL ORDER BY CASE WHEN json_extract(scan,'$.available')=0 THEN 1 ELSE 0 END, display_id LIMIT 1", db.ws, kind);
  if (pv) return { row: pv, id: pv.id, vendor: pv.vendor, model: pv.model || defaultModel(db, pv, kind), key: pv.secret_name ? secrets.get(db, db.ws, pv.secret_name) : null };
  if (config.fakeProviders) return { row: null, id: null, vendor: 'fake', model: kind === 'tts' ? 'fake-tts' : 'fake-judge', key: null };
  throw new Block('no_provider', kind === 'tts' ? 'Chưa cấu hình nhà cung cấp giọng (TTS). Thêm khoá ở màn Nhà cung cấp.' : 'Chưa cấu hình nhà cung cấp giám khảo. Thêm khoá ở màn Nhà cung cấp.');
}
function bumpUsage(db, providerId, is429) {
  if (!providerId) return;
  const day = localParts(new Date(), wsTz(db)).day;
  db.run(`INSERT INTO provider_usage(provider_id, day, calls, errors_429) VALUES(?,?,1,?)
          ON CONFLICT(provider_id, day) DO UPDATE SET calls=calls+1, errors_429=errors_429+?`, providerId, day, is429 ? 1 : 0, is429 ? 1 : 0);
}
function usageToday(db, providerId) {
  if (!providerId) return 0;
  const r = db.get('SELECT calls FROM provider_usage WHERE provider_id=? AND day=?', providerId, localParts(new Date(), wsTz(db)).day);
  return r ? r.calls : 0;
}
const hashClip = (p, voice, say, style) => crypto.createHash('sha256').update([p.vendor, p.model, voice, say, style || ''].join('\u0001')).digest('hex');
function voiceOf(l, channelData) {
  const v = l.cast_data && l.cast_data.voice;
  const byRole = channelData && channelData.voices && (channelData.voices[l.cast.display_id] || channelData.voices[l.cast.role_label]);
  const x = (v && (typeof v === 'string' ? v : v.voice)) || (byRole && (typeof byRole === 'string' ? byRole : byRole.voice));
  return x || 'Kore';
}

// ---------- gọi provider có xử lý lỗi ----------
async function callProvider(ctx, prov, fn) {
  const o = ctx.pipelineOpts || {};
  for (let attempt = 1; ; attempt++) {
    try {
      bumpUsage(ctx.db, prov.id, false);
      return await fn();
    } catch (e) {
      if (!e || e.name !== 'ProviderError') throw e;
      if (e.code === 'transient' && attempt < 3) { await sleep((o.backoffMs !== undefined ? o.backoffMs : 1000) * 2 ** (attempt - 1)); continue; }
      if (e.code === 'quota') {
        bumpUsage(ctx.db, prov.id, true);
        const secs = Math.max(30, Math.min(86400, e.retryAfterSec || 3600));
        learnQuota(ctx, prov);
        throw new Wait(new Date(Date.now() + secs * 1000).toISOString(), e.text_human || 'Nhà cung cấp hết lượt, sẽ chạy tiếp khi có lượt.');
      }
      if (e.code === 'auth') throw new Block('provider_auth', 'Khoá nhà cung cấp bị từ chối. Kiểm tra lại khoá ở màn Nhà cung cấp.', { vendor: prov.vendor });
      if (e.code === 'transient') throw new Block('provider_transient', 'Nhà cung cấp lỗi tạm thời nhiều lần liên tiếp.', { vendor: prov.vendor, message: e.message });
      throw new Block('provider_bad_output', e.text_human || 'Nhà cung cấp trả dữ liệu không dùng được.', { vendor: prov.vendor, message: e.message });
    }
  }
}
// Hạn mức học được từ lần 429: tổng hạn mức (of) = số đã dùng hôm nay, còn lại = 0 (CNS-037).
function learnQuota(ctx, prov) {
  if (!prov.row) return;
  try {
    const scan = Object.assign({}, prov.row.scan || {}, { quota: { value: 0, of: usageToday(ctx.db, prov.id), source: 'learned_429', confidence: 'low' } });
    ctx.write(SYS, 'provider.scan_result', { provider: prov.row.display_id, scan });
  } catch (e) { events.logError('learnQuota', e); }
}

// ---------- chạy một render ----------
async function execute(ctx, run, renderId) {
  const { db, write, config } = ctx;
  const D = n => dep(ctx, n);
  const stateOf = () => (db.get('SELECT state FROM renders WHERE id=?', renderId) || {}).state;
  const alive = () => { if (!LIVE.has(stateOf())) throw new Abort(); };
  const progress = p => { db.update('renders', renderId, { progress: Math.min(0.99, p) }); queue.heartbeat(db, run.id, LEASE_MS, Math.min(0.99, p)); };
  const goto = (to, extra) => { alive(); if (stateOf() !== to) state.transitionRender(db, renderId, to, extra); };

  let render = row(db, 'SELECT * FROM renders WHERE id=?', renderId);
  if (!LIVE.has(render.state)) throw new Abort();
  // vào voicing: từ giữa chừng (chạy bù) phải qua retrying
  if (!['queued', 'waiting_quota', 'retrying', 'voicing'].includes(render.state)) state.transitionRender(db, renderId, 'retrying');
  goto('voicing');

  const B = loadBundle(db, render);
  const tts = pickProvider(ctx, 'tts'), judgeP = pickProvider(ctx, 'judge');
  const prov = D('providers').get(config);
  const wavm = D('wav'), gates = D('gates');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-render-'));
  const keep = process.env.GS_KEEP_TMP === '1';
  try {
    // --- voicing ---
    const items = B.lines.map(l => {
      const voice = voiceOf(l, B.channelData), style = l.mood || '';
      const hash = hashClip(tts, voice, l.say, style);
      return { l, voice, style, hash, clip: row(db, 'SELECT * FROM voice_clips WHERE workspace_id=? AND content_hash=?', db.ws, hash), fresh: null };
    });
    const missing = items.filter(i => !i.clip);
    if (missing.length && tts.row) {
      const q = tts.row.scan && tts.row.scan.quota;
      if (q && typeof q.value === 'number' && q.source && q.source !== 'unknown') {
        const need = Math.ceil(missing.length * 1.3);
        // value = số lượt CÒN lại; nếu có `of` (tổng hạn mức) thì còn lại = of − đã dùng hôm nay (đếm cục bộ)
        const remaining = typeof q.of === 'number' ? q.of - usageToday(db, tts.id) : q.value;
        if (remaining < need) throw new Wait(nextMidnightIso(db), `Cần khoảng ${need} lượt giọng nhưng hôm nay không đủ; sẽ chạy tiếp sau nửa đêm.`);
      }
    }
    const synth = async it => {
      const r = await callProvider(ctx, tts, () => prov.tts({ key: tts.key, model: tts.model, voice: it.voice, text: it.l.say, style: it.style || undefined }));
      it.fresh = { raw: r.raw, wav: r.wav, duration_ms: r.duration_ms };
    };
    for (let i = 0; i < missing.length; i++) { alive(); await synth(missing[i]); progress(0.02 + 0.18 * (i + 1) / missing.length); }

    // --- judging ---
    goto('judging');
    const sigOf = it => {
      if (it.fresh) { const p = wavm.parse(it.fresh.wav); return gates.tailSig(p.pcm, p.rate).sig; }
      const p = wavm.parse(fs.readFileSync(assetFile(db, it.clip.asset_id).file)); return gates.tailSig(p.pcm, p.rate).sig;
    };
    items.forEach(it => { it.sig = sigOf(it); });
    for (let i = 0; i < missing.length; i++) {
      const it = missing[i];
      for (let attempt = 1; ; attempt++) {
        alive();
        const base = [...new Set([...(it.l.terms_declared || []), ...extractTerms(it.l.say), ...glossaryTerms(B.channelData, it.l.say)])];
        const j = await callProvider(ctx, judgeP, () => prov.judge({ key: judgeP.key, model: judgeP.model, wav: it.fresh.wav, script: it.l.say, terms: base }));
        const judged = j && j.terms ? Object.keys(j.terms) : [];
        const termsEffective = [...new Set([...base, ...(j.detected_terms || []).filter(t => judged.includes(t))])];
        const others = items.filter(o => o !== it && o.hash !== it.hash).map(o => o.sig);
        const res = gates.voiceGates({ wav: it.fresh.wav, raw: it.fresh.raw, judge: j, script: it.l.say, termsEffective, otherTails: others });
        const bad = res.filter(r => r.result === 'fail'), unk = res.filter(r => r.result === 'unknown');
        if (!bad.length && !unk.length) { it.judge = j; it.gateRes = res; it.attempt = attempt; it.termsEffective = termsEffective; break; }
        res.filter(r => r.result !== 'pass').forEach(r => db.insertRow('gate_results', { subject_kind: 'render', subject_id: renderId, gate: r.gate, result: r.result,
          measure: Object.assign({ phase: 'voice_attempt', line: it.l.display_id }, r.measure), run_id: run.id, attempt, created_by: 'system' }, { prefix: 'GT' }));
        if (unk.length && !bad.length) throw new Block('gate_unknown', `Không đo được cổng ${unk.map(r => r.gate).join(', ')} cho câu ${it.l.display_id}; chưa thể cho qua.`, { line: it.l.display_id, gates: unk });
        if (attempt > MAX_REGEN) throw new Block('gate_fail', `Câu ${it.l.display_id} vẫn trượt cổng ${bad.map(r => r.gate).join(', ')} sau ${MAX_REGEN} lần tạo lại.`, { line: it.l.display_id, gates: bad });
        await synth(it); it.sig = sigOf(it);
      }
      // lưu clip (sau khi qua cổng) — bất biến, word_times điền ở bước align
      const raw = write(SYS, 'asset.put', { kind: 'audio', bytes: it.fresh.raw, mime: 'audio/wav', meta: { role: 'tts_raw' }, source: 'system' });
      const wavA = write(SYS, 'asset.put', { kind: 'audio', bytes: it.fresh.wav, mime: 'audio/wav', meta: { role: 'tts', duration_ms: it.fresh.duration_ms }, source: 'system' });
      db.tx(() => {
        it.clip = db.insertRow('voice_clips', { content_hash: it.hash, provider_id: tts.id, model: tts.model, voice: it.voice, say: it.l.say, style: it.style || null,
          asset_id: wavA.id, raw_asset_id: raw.id, duration_ms: it.fresh.duration_ms, transcript: it.judge.transcript || null,
          terms_detected: it.judge.detected_terms || [], created_by: 'system' }, { prefix: 'VC' });
        it.gateRes.forEach(r => db.insertRow('gate_results', { subject_kind: 'voice_clip', subject_id: it.clip.id, gate: r.gate, result: r.result, measure: r.measure,
          run_id: run.id, attempt: it.attempt, created_by: 'system' }, { prefix: 'GT' }));
      });
      progress(0.2 + 0.1 * (i + 1) / missing.length);
    }

    // --- aligning ---
    goto('aligning');
    const clips = {};
    items.forEach(it => {
      let c = db.json(db.get('SELECT * FROM voice_clips WHERE id=?', it.clip.id));
      if (!c.word_times || !c.envelope) {
        const p = wavm.parse(it.fresh ? it.fresh.wav : fs.readFileSync(assetFile(db, c.asset_id).file));
        const wt = D('align').align({ say: c.say, duration_ms: c.duration_ms, judgeWordTimes: it.judge ? it.judge.word_times : null });
        db.update('voice_clips', c.id, { word_times: wt, envelope: wavm.envelope(p.pcm, p.rate, FPS) });
        c = db.json(db.get('SELECT * FROM voice_clips WHERE id=?', c.id));
      }
      it.clip = c;
      clips[it.l.display_id] = { duration_ms: c.duration_ms, word_times: c.word_times, envelope: c.envelope };
    });
    progress(0.32);

    // --- plan + đóng băng manifest + rendering ---
    const castRecipes = {};
    B.lines.forEach(l => { castRecipes[l.cast.display_id] = l.cast_data; });
    // công thức Gen-Chibi hợp lệ có look.parts; thiếu thì dùng cast mặc định của gói C (CM-0001 Anh Gen / CM-0002 Bé Hỏi)
    const haveRecipes = Object.values(castRecipes).every(r => r && r.look && r.look.parts && Object.keys(r.look.parts).length > 0);
    const planLines = B.lines.map(l => ({ id: l.display_id, who: l.cast.display_id, say: l.say, lang: l.lang, terms: l.terms_declared, subtitle: l.subtitle, mood: l.mood }));
    const illusRefs = [];   // asset của khối illustration (đường v1) — cũng vào plan.assetRefs để kiểm quyền cùng một chỗ
    const planBeats = B.beats.map(b => {
      let params = b.params;
      // illustration: params.asset phải là mã AS-… của asset trong workspace → đường dẫn tương đối media/xx/<sha>.<ext> (render.js chỉ đọc trong assetRoot)
      if (b.block_type === 'illustration' && params && params.asset !== undefined) {
        const a = typeof params.asset === 'string' && /^AS-\d+$/.test(params.asset) ? db.get('SELECT path, media_present FROM assets WHERE workspace_id=? AND display_id=?', db.ws, params.asset) : null;
        if (!a || !a.media_present) throw new Block('asset_invalid', `Beat ${b.display_id}: params.asset phải là mã asset (AS-…) còn tệp trong xưởng.`, { beat: b.display_id, asset: params.asset });
        params = Object.assign({}, params, { asset: a.path });
        illusRefs.push({ asset: a.path, label: 'illustration ' + b.display_id });
      }
      return { id: b.display_id, block: b.block_type, params, anchor: { line: b.anchor_line_display_id, word_index: b.anchor_word_index } };
    });
    const kind = B.lv.kind || 'lesson';
    const lib = D('cast').library();
    const brand = D('brand').normalize(B.channelData);   // null ⇒ chưa có nhận diện ⇒ giao diện mặc định v0.1.x
    const ext = write.ext || null;
    let plan;
    try {
      // plan v2 (SPEC §2.1): kind/variant/brand/assetRefs đi vào buildPlan; hook plan.input cho gói U/V/B sửa input (screens, cursor, actorLayout, persona…)
      const input = { lesson: { title: B.lesson.title, lines: planLines, beats: planBeats, camera_hints: B.lv.camera_hints || null, kind, variant: B.lv.variant || undefined, host: B.lv.host || null, screens: B.lv.screens || null, music: B.lv.music || null, thumbnail: B.lv.thumbnail || null }, clips,
        channel: Object.assign({ id: B.channel.display_id, name: B.channel.name }, B.channelData),
        cast: haveRecipes ? castRecipes : undefined, parts: haveRecipes ? lib.parts : undefined, packs: haveRecipes ? lib.packs : undefined, aspect: '16:9', fps: FPS,
        kind, variant: B.lv.variant || undefined, brand, assetRefs: illusRefs.slice() };
      if (ext) ext.hooks.run('plan.input', { B, input, ctx });
      plan = D('timeline').buildPlan(input);
      if (ext) ext.hooks.run('plan.after', { B, plan, ctx });   // gói T: plan.thumbs; B/U/T: đẩy plan.assetRefs
    } catch (e) {
      if (e && e.name === 'PlanError') throw new Block(e.code || 'plan_error', e.text_human || e.message, e.detail);
      throw e;
    }
    // một danh sách asset duy nhất cho dựng + kiểm quyền (illustration v1 + brand/màn hình/ảnh mặt do hook thêm); trùng thì gộp
    const seenRef = new Set();
    plan.assetRefs = illusRefs.concat(Array.isArray(plan.assetRefs) ? plan.assetRefs : []).filter(x => { const k = typeof x === 'string' ? x : x && x.asset; if (!k || seenRef.has(k)) return false; seenRef.add(k); return true; });
    // QUYỀN DÙNG ASSET (§6.10): raster/audio do người dùng tải lên sau 0003 phải có hàng attest. Chặn TRƯỚC bước dựng, không đốt công dựng.
    const noRights = rights.missing(db, plan.assetRefs);
    if (noRights.length) throw new Block('rights_missing', `Asset ${noRights.join(', ')} chưa được chủ xưởng xác nhận quyền sử dụng nên chưa dựng được. Chủ xưởng xác nhận trên giao diện (hoặc thay bằng SVG) rồi chạy lại.`, { assets: noRights });
    const registry = D('registry');
    const manifest = buildManifest(ctx, B, items, plan, tts, judgeP, registry, { brand, lib, brandMod: D('brand') });
    render = row(db, 'SELECT * FROM renders WHERE id=?', renderId);
    // chạy tiếp: manifest đã đóng băng phải khớp dữ liệu hiện tại (bỏ qua `engine` — môi trường chạy có thể đổi); lệch → chặn, cần bản dựng mới
    if (render.manifest) {
      const strip = m => JSON.stringify(Object.assign({}, m, { engine: undefined }));
      if (strip(render.manifest) !== strip(manifest)) throw new Block('manifest_changed', 'Kênh/nhân vật/nhà cung cấp đã đổi kể từ khi bản dựng này bắt đầu; manifest đã đóng băng không còn khớp. Hãy nộp lại bài để tạo bản dựng mới.', null);
    }
    goto('rendering', render.manifest ? {} : { manifest });
    const r = await D('render').renderPlan({ plan, outDir: path.join(tmp, 'frames'), chromiumPath: config.chromiumPath, assetRoot: config.dataDir, ffmpegPath: config.ffmpegPath, onProgress: p => { try { progress(0.33 + 0.47 * Math.max(0, Math.min(1, p))); } catch (e) { if (e instanceof Abort) return; throw e; } } })
      .catch(e => { if (e && (e.code === 'render_timeout' || e.code === 'cdp_timeout')) throw new Block('render_timeout', 'Dựng khung hình bị treo/quá hạn; đã đóng trình duyệt. Chạy lại được.', { message: e.message }); throw e; });
    alive();

    // --- mixing ---
    goto('mixing');
    const M = D('mix');
    const mixPath = path.join(tmp, 'mix.wav'), mp4Path = path.join(tmp, 'out.mp4');
    const voices = plan.lines.map(pl => ({ path: assetFile(db, clips[pl.id] && items.find(i => i.l.display_id === pl.id).clip.asset_id).file, at_ms: pl.a_ms }));
    const sfx = (plan.cues || []).filter(c => r.sfx && r.sfx[c.name]).map(c => ({ path: r.sfx[c.name], at_ms: c.t_ms, vol: c.vol == null ? 1 : c.vol }));
    // nhạc nền trailer (gói U): plan.music.asset = đường dẫn tương đối trong dataDir do hook plan.input của tutorial đổi từ AS-… (đã qua kiểm quyền ở plan.after)
    const music = plan.music && plan.music.asset && voices.length ? { path: path.isAbsolute(plan.music.asset) ? plan.music.asset : path.join(config.dataDir, plan.music.asset), gain_db: plan.music.gain_db, duck_db: plan.music.duck_db } : null;
    await M.mix({ voices, sfx, duration_ms: plan.duration_ms, out: mixPath, ffmpegPath: config.ffmpegPath, music });
    // G-WAV(b) đo xung quanh mốc ghép CÂU: đo trên nền giọng (không sfx) vì sfx có chủ ý có thể có đỉnh gần mốc câu (vd whoosh) và làm cổng báo nhầm.
    const stemPath = path.join(tmp, 'voices.wav');
    await M.mix({ voices, sfx: [], duration_ms: plan.duration_ms, out: stemPath, ffmpegPath: config.ffmpegPath, targetLufs: null });
    await M.mux({ framesPattern: r.framesPattern, fps: plan.fps || FPS, audio: mixPath, out: mp4Path, ffmpegPath: config.ffmpegPath });
    const srtM = D('srt');
    const langs = B.channelData.subtitle_langs || (B.lines.every(l => l.subtitle && l.subtitle.en) ? ['vi', 'en'] : ['vi']);
    const srts = langs.map(lang => ({ lang, text: srtM.build(plan.lines.map(pl => ({ say: pl.say, subtitle: planLines.find(x => x.id === pl.id).subtitle, a_ms: pl.a_ms, b_ms: pl.b_ms })), lang) }));
    const put = (kind, file, mime, meta) => write(SYS, 'asset.put', { kind, bytes: fs.readFileSync(file), mime, meta, source: 'system' });
    const outputs = { mp4: put('video', mp4Path, 'video/mp4', { duration_ms: plan.duration_ms }).id, mix: put('audio', mixPath, 'audio/wav', { role: 'mix' }).id };
    srts.forEach(s => { outputs['srt_' + s.lang] = write(SYS, 'asset.put', { kind: 'subtitle', bytes: Buffer.from(s.text, 'utf8'), mime: 'application/x-subrip', meta: { lang: s.lang }, source: 'system' }).id; });
    if (r.cover && fs.existsSync(r.cover)) {
      const head = fs.readFileSync(r.cover).subarray(0, 4);
      const cm = head[0] === 0x89 && head[1] === 0x50 ? 'image/png' : head[0] === 0xff && head[1] === 0xd8 ? 'image/jpeg' : null; // theo magic bytes, không theo đuôi tệp
      if (!cm) throw new Block('cover_invalid', 'Ảnh bìa dựng ra không phải PNG/JPEG.');
      outputs.cover = put('cover', r.cover, cm, { role: 'cover' }).id;
    }
    progress(0.9);
    goto('gating', { outputs, duration_ms: plan.duration_ms, frames: r.frames });
    const thumbFiles = Array.isArray(r.thumbs) ? r.thumbs : [];

    // --- gating ---
    const expected = Math.ceil(plan.duration_ms / 1000 * (plan.fps || FPS));
    const beatsOk = plan.beats.map(pb => {
      const d = B.beats.find(b => b.display_id === pb.id), ln = d && plan.lines.find(x => x.id === d.anchor_line_display_id);
      const ta = pb.t_anchor !== undefined ? pb.t_anchor : pb.t_in;
      if (!d) return { id: pb.id, anchor_ok: true }; // beat tự thêm (AUTO-lesson-map / AUTO-end-card) không có neo của tác giả
      return { id: pb.id, anchor_ok: !!(ln && ta >= ln.a_ms - 1 && ta <= ln.b_ms + 1) };
    });
    const cutsAllowed = plan.beats.filter(pb => { const d = registry.get && registry.get(pb.block); return d && d.cut === true; }).map(pb => pb.t_in / 1000);
    const rg = await gates.renderGates({ mixPath, mp4Path, lines: plan.lines, beats: beatsOk, frames: { expected, got: r.frames, errors: r.errors || [] },
      cutsAllowed, srt: srts, fps: plan.fps || FPS, ffmpegPath: config.ffmpegPath });
    const gw = await gates.gateWavB({ mixPath: stemPath, lines: plan.lines, ffmpegPath: config.ffmpegPath });
    const rg2 = rg.map(x => (x.gate === 'G-WAV' && x.measure && x.measure.tier === 'b' ? Object.assign({}, gw, { measure: Object.assign({ stem: 'voices_only' }, gw.measure) }) : x));
    // cổng theo loại bài + dữ liệu bài (GATES): ngoài 8 cổng R3, mỗi cổng áp dụng phải có cài đặt đăng ký ở write.ext.gates (T: G-THUMB, U: G-CURSOR); thiếu ⇒ unknown ⇒ chặn (INT-08)
    const ids = gateIds(kind, B.lv);
    for (const gid of ids.filter(g => !CORE_GATES.includes(g))) {
      const impl = ext && ext.gates.get(gid);
      let res;
      if (!impl) res = { gate: gid, result: 'unknown', measure: { text_human: `Cổng ${gid} chưa có bản cài đặt ở bản này.` } };
      else {
        try { res = await impl({ ctx, db, B, plan, render, rendered: r, tmp, run, mp4Path, mixPath, ffmpegPath: config.ffmpegPath }); }
        catch (e) { events.logError('gate ' + gid, e); res = { gate: gid, result: 'unknown', measure: { text_human: `Cổng ${gid} lỗi khi đo: ${events.mask(e && e.message)}` } }; }
      }
      rg2.push(Object.assign({ gate: gid }, res));
    }
    const final = aggregateGates(db, items, rg2, ids);
    final.forEach(g => db.insertRow('gate_results', { subject_kind: 'render', subject_id: renderId, gate: g.gate, result: g.result, measure: g.measure, run_id: run.id, attempt: 1, created_by: 'system' }, { prefix: 'GT' }));
    const bad = final.filter(g => g.result === 'fail'), unk = final.filter(g => g.result === 'unknown');
    if (bad.length || unk.length) {
      const names = (bad.length ? bad : unk).map(g => g.gate).join(', ');
      const onlyThumb = bad.length && bad.every(g => g.gate === 'G-THUMB');   // cả bộ ảnh bìa trượt ⇒ thumb_fail kèm số đo từng phương án (§5.5)
      throw new Block(bad.length ? (onlyThumb ? 'thumb_fail' : 'gate_fail') : 'gate_unknown', bad.length ? `Bản dựng trượt cổng ${names}.` : `Không đo được cổng ${names}; chưa thể cho qua.`, { gates: (bad.length ? bad : unk).map(g => ({ gate: g.gate, result: g.result, measure: g.measure })) });
    }
    alive();
    // ảnh bìa theo phương án: CHỈ phương án đạt G-THUMB mới thành asset (phương án trượt bị bỏ); outputs gộp dần (state.js) nên không mất mp4/srt, và vẫn ở trạng thái gating
    // nên trigger tr_render_outputs_once chưa khoá (CNS-119). measure.variants[] = [{index, pass, score}] do gói T cấp.
    const extra = { progress: 1 };
    if (thumbFiles.length) {
      const gm = final.find(g => g.gate === 'G-THUMB'), vmap = new Map((((gm && gm.measure) || {}).variants || []).map(v => [v.index, v]));
      const out = [];
      for (const t of thumbFiles) {
        const v = vmap.get(t.index);
        if (!v || !v.pass || !t.jpg1280 || !t.jpg1920) continue;
        const a = put('cover', t.jpg1280, 'image/jpeg', { role: 'thumb', variant: t.index, w: 1280 }), b = put('cover', t.jpg1920, 'image/jpeg', { role: 'thumb', variant: t.index, w: 1920 });
        out.push({ variant: t.index, w1280: a.display_id, w1920: b.display_id, pass: true, score: typeof v.score === 'number' ? v.score : null });
      }
      if (out.length) extra.outputs = { thumbs: out };
    }
    state.transitionRender(db, renderId, 'awaiting_review', extra);
    return { manifest: true };
  } finally {
    if (!keep) fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function ffmpegVersion(ctx) {
  if (!ctx._ffv) {
    try { ctx._ffv = String(cp.spawnSync(ctx.config.ffmpegPath || 'ffmpeg', ['-version'], { encoding: 'utf8' }).stdout || '').split('\n')[0].trim() || 'unknown'; } catch { ctx._ffv = 'unknown'; }
  }
  return ctx._ffv;
}
function buildManifest(ctx, B, items, plan, tts, judgeP, registry, extra) {
  const lines = {};
  items.forEach(i => { lines[i.l.display_id] = i.clip.display_id; });
  const cast = {}; B.lines.forEach(l => { cast[l.cast.display_id] = { version: l.cast_version === undefined ? l.cast.current_version : l.cast_version }; });
  const blocks = {}; B.beats.forEach(b => { blocks[b.block_type] = b.block_version; });
  let gc = 'unknown'; try { gc = fs.readFileSync(path.join(__dirname, '..', 'vendor', 'gen-chibi', 'VERSION'), 'utf8').trim(); } catch { /* chưa có vendor */ }
  return {
    lesson_version: { lesson: B.lesson.display_id, version: B.lv.version },
    lines, channel: { id: B.channel.display_id, version: B.channel.current_version }, cast, blocks,
    providers: { tts: { vendor: tts.vendor, model: tts.model }, judge: { vendor: judgeP.vendor, model: judgeP.model }, align: { method: 'judge_word_times|chars' } },
    engine: { app: ctx.config.version, gen_chibi: gc, chromium: ctx.config.chromiumPath || 'auto', ffmpeg: ffmpegVersion(ctx) },
    camera_plan_hash: crypto.createHash('sha256').update(JSON.stringify(plan.camera || [])).digest('hex'),
    aspect: '16:9', fps: plan.fps || FPS, size: plan.size,
    // chỉ thêm khoá mới khi có dữ liệu ⇒ manifest bản dựng cũ/đang chạy dở không đổi (so khớp khi chạy tiếp)
    ...(B.lv.kind && B.lv.kind !== 'lesson' ? { kind: B.lv.kind } : {}),
    ...(extra && extra.brand ? { brand_hash: extra.brand.hash || extra.brandMod.hash(extra.brand) } : {}),
    ...(extra && extra.lib && extra.lib.hash ? { parts_hash: extra.lib.hash } : {}),
    plan: {
      duration_ms: plan.duration_ms, fps: plan.fps || FPS,
      lines: plan.lines.map(l => ({ id: l.id, who: l.who, say: l.say, terms: l.terms || [], a_ms: l.a_ms, b_ms: l.b_ms })),
      beats: plan.beats.map(b => ({ id: b.id, block: b.block, t_in: b.t_in, t_out: b.t_out })),
      cues: (plan.cues || []).map(c => ({ t_ms: c.t_ms, name: c.name })),
    },
  };
}
// Gộp 8 cổng cho Render: G-WAV = tầng a (mọi câu) ∧ tầng b; G-SCRIPT/G-PRON = mọi câu.
function aggregateGates(db, items, rg, ids) {
  const combine = rs => (!rs.length || rs.some(r => r === 'unknown') && !rs.includes('fail') ? 'unknown' : rs.includes('fail') ? 'fail' : 'pass');
  const perClip = gate => items.map(i => {
    const g = db.get("SELECT result FROM gate_results WHERE subject_kind='voice_clip' AND subject_id=? AND gate=? ORDER BY created_at DESC, rowid DESC LIMIT 1", i.clip.id, gate);
    return { line: i.l.display_id, result: g ? g.result : 'unknown' };
  });
  const out = [];
  for (const gate of ids || CORE_GATES) {
    if (gate === 'G-SCRIPT' || gate === 'G-PRON') { const pc = perClip(gate); out.push({ gate, result: combine(pc.map(x => x.result)), measure: { lines: pc } }); continue; }
    const mine = rg.find(r => r.gate === gate && (gate !== 'G-WAV' || (r.measure && r.measure.tier === 'b')));
    if (gate === 'G-WAV') {
      const pc = perClip(gate);
      out.push({ gate, result: combine([...pc.map(x => x.result), mine ? mine.result : 'unknown']), measure: { tier_a: pc, tier_b: mine ? mine.measure : null } });
    } else out.push({ gate, result: mine ? mine.result : 'unknown', measure: mine ? mine.measure : null });
  }
  return out;
}

async function runOne(ctx, run) {
  const { db } = ctx;
  try {
    await execute(ctx, run, run.render_id);
    queue.done(db, run.id, { ok: true });
  } catch (e) {
    if (e instanceof Abort) { const r = db.get('SELECT state FROM runs WHERE id=?', run.id); if (r && r.state === 'running') queue.done(db, run.id, { aborted: true }); return; }
    if (e instanceof Wait) {
      state.transitionRender(db, run.render_id, 'waiting_quota', { waiting_until: e.until });
      queue.waitQuota(db, run.id, e.until);
      return;
    }
    const br = e instanceof Block || (e && e.code === 'master_key_mismatch') ? { code: e.code, text_human: e.text_human, detail: e.detail }
      : { code: 'internal', text_human: 'Lỗi nội bộ khi dựng bản dựng: ' + events.mask(e && e.message), detail: events.mask(e && e.stack) };
    if (!(e instanceof Block)) events.logError('pipeline error', e);
    const cur = (db.get('SELECT state FROM renders WHERE id=?', run.render_id) || {}).state;
    if (LIVE.has(cur)) state.transitionRender(db, run.render_id, 'blocked', { blocked_reason: br });
    queue.fail(db, run.id, br);
  }
}

// Render queued chưa có run → tạo run (vd sau retry từ blocked, hoặc run bị huỷ).
function pumpQueued(ctx) {
  const { db } = ctx;
  db.all(`SELECT r.id FROM renders r WHERE r.workspace_id=? AND r.state='queued'
          AND NOT EXISTS (SELECT 1 FROM runs n WHERE n.render_id=r.id AND n.state IN ('queued','running','waiting_quota'))`, db.ws)
    .forEach(r => queue.enqueue(db, { kind: 'voicing', render_id: r.id, payload: { render_id: r.id }, created_by: 'system' }));
}

// Gia hạn lease CHỈ khi run còn tiến triển (progress/state đổi trong staleMs); đứng yên quá hạn → để lease hết, run chạy bù được.
function startHeartbeat(db, runId, o = {}) {
  const staleMs = o.heartbeatStaleMs || 120000, every = o.heartbeatMs || 15000;
  const key = () => { const r = db.get('SELECT progress, state, (SELECT state FROM renders WHERE id=runs.render_id) AS rs FROM runs WHERE id=?', runId); return r ? r.progress + '|' + r.state + '|' + r.rs : ''; };
  let last = key(), lastChange = Date.now();
  const t = setInterval(() => {
    try {
      const k = key();
      if (k !== last) { last = k; lastChange = Date.now(); }
      if (Date.now() - lastChange <= staleMs) queue.heartbeat(db, runId, o.leaseMs || LEASE_MS);
    } catch (e) { events.logError('heartbeat', e); }
  }, every);
  t.unref();
  return { stop() { clearInterval(t); } };
}

function startWorkers(ctx, opts = {}) {
  const workerId = 'w-' + process.pid + '-' + crypto.randomBytes(3).toString('hex');
  ctx.pipelineOpts = Object.assign({}, ctx.pipelineOpts, opts);
  let stopped = false, busy = false, timer = null;
  async function tick() {
    if (stopped || busy) return false;
    busy = true;
    try {
      pumpQueued(ctx);
      const run = queue.lease(ctx.db, ['voicing'], workerId, LEASE_MS);
      if (!run) return false;
      const hb = startHeartbeat(ctx.db, run.id, ctx.pipelineOpts);
      try { await runOne(ctx, run); } finally { hb.stop(); }
      return true;
    } finally { busy = false; }
  }
  const loop = () => { if (stopped) return; tick().catch(e => events.logError('worker', e)).finally(() => { if (!stopped) timer = setTimeout(loop, opts.pollMs || 1000); }); };
  loop();
  return {
    stop() { stopped = true; clearTimeout(timer); },
    tick,
    // chờ tới khi không còn run queued/running (waiting_quota không tính)
    async idle(timeoutMs = 600000) {
      const t0 = Date.now();
      for (;;) {
        const n = ctx.db.get("SELECT COUNT(*) AS n FROM runs WHERE kind='voicing' AND state IN ('queued','running')").n;
        const q = ctx.db.get("SELECT COUNT(*) AS n FROM renders WHERE state='queued'").n;
        if (!n && !q && !busy) return;
        if (Date.now() - t0 > timeoutMs) throw new Error('pipeline.idle: quá thời gian chờ');
        await sleep(200);
      }
    },
  };
}

// ---------- chạy lại ----------
// actor: chuỗi ('user'/'agent'/'system') hoặc object {type,id}. Agent chỉ được chạy lại bản blocked/waiting_quota — không rút bản dựng khỏi hàng chờ duyệt của chủ xưởng.
function requeueRender(ctx, render, { actor } = {}) {
  const { db } = ctx;
  const r = db.json(render);
  const isAgent = actor === 'agent' || (actor && actor.type === 'agent');
  const actorName = state.actorStr(actor || 'system');
  const tAct = actor && typeof actor === 'object' ? { actor } : {};
  const out = id => db.json(db.get('SELECT * FROM renders WHERE id=?', id));
  if (r.state === 'blocked') {
    state.transitionRender(db, r.id, 'queued', tAct);
    queue.enqueue(db, { kind: 'voicing', render_id: r.id, payload: { render_id: r.id, by: actorName }, created_by: 'system' });
    return out(r.id);
  }
  if (r.state === 'waiting_quota') {
    db.run("UPDATE runs SET state='queued', waiting_until=NULL, updated_at=? WHERE render_id=? AND state='waiting_quota'", db.now(), r.id);
    return out(r.id);
  }
  if (['queued', 'voicing', 'judging', 'aligning', 'rendering', 'mixing', 'gating', 'retrying'].includes(r.state)) {
    throw fail('conflict', `Bản dựng ${r.display_id} đang chạy (${r.state}); chưa cần chạy lại.`);
  }
  if (isAgent) throw fail('forbidden', `Agent chỉ chạy lại được bản dựng bị chặn hoặc chờ hạn mức; ${r.display_id} đang "${r.state}" thuộc quyền chủ xưởng.`, { state: r.state });
  // đã xong/duyệt/bỏ: tạo Render mới từ cùng lesson version (trần MAX_RERUNS lần chạy lại mỗi phiên bản bài)
  if (db.get('SELECT COUNT(*) AS n FROM renders WHERE lesson_version_id=?', r.lesson_version_id).n > MAX_RERUNS) {
    throw fail('conflict', `Phiên bản bài này đã chạy lại ${MAX_RERUNS} lần; hãy sửa bài rồi nộp phiên bản mới thay vì chạy lại tiếp.`, { max: MAX_RERUNS });
  }
  return db.tx(() => {
    if (r.state === 'awaiting_review') state.transitionRender(db, r.id, 'superseded', tAct);
    const nr = db.insertRow('renders', { lesson_version_id: r.lesson_version_id, state: 'queued', state_changed_at: db.now(), progress: 0, created_by: 'system' }, { prefix: 'RD' });
    const lv = db.get('SELECT lesson_id FROM lesson_versions WHERE id=?', r.lesson_version_id);
    db.update('lessons', lv.lesson_id, { latest_render_id: nr.id });
    queue.enqueue(db, { kind: 'voicing', render_id: nr.id, payload: { render_id: nr.id, rerun_of: r.display_id }, created_by: 'system' });
    db.emitChange({ entity: 'render', id: nr.display_id });
    return nr;
  });
}

// ---------- xuất gói ----------
// opts: { actor, entry } — người xuất (owner UI hay agent MCP); chỉ để truyền cho hook export.after (gói O: owner xuất ⇒ exported_at + published_at; agent ⇒ chỉ exported_at)
function exportRender(ctx, render, opts = {}) {
  const { db, config } = ctx;
  const r = db.json(render);
  if (r.state !== 'approved') throw fail('conflict', `Chỉ xuất được bản dựng đã duyệt (${r.display_id} đang "${r.state}").`);
  const o = r.outputs || {};
  if (!o.mp4) throw fail('not_found', 'Bản dựng chưa có MP4.');
  const dir = path.join(config.dataDir, 'exports', r.display_id);
  fs.mkdirSync(dir, { recursive: true });
  const files = [];
  const coverExt = o.cover ? path.extname(assetFile(db, o.cover).file) || '.jpg' : '.jpg';
  const names = { mp4: r.display_id + '.mp4', srt_vi: r.display_id + '.vi.srt', srt_en: r.display_id + '.en.srt', cover: r.display_id + '.cover' + coverExt };
  const src = Object.assign({}, o);
  // ảnh bìa theo phương án (0.2.0 §5.4): bản đã chọn (renders.thumbnail_pick), chưa chọn ⇒ phương án đạt có score cao nhất (bằng nhau ⇒ theo thứ tự gửi) → RD-…cover.jpg (1280) + RD-…cover-1920.jpg
  const th = Array.isArray(o.thumbs) ? o.thumbs.filter(t => t && t.pass !== false && t.w1280) : [];
  if (th.length) {
    const pick = r.thumbnail_pick && th.find(t => t.w1280 === r.thumbnail_pick || t.w1920 === r.thumbnail_pick);
    const best = pick || th.reduce((a, b) => ((b.score || 0) > (a.score || 0) ? b : a));
    src.cover = best.w1280; names.cover = r.display_id + '.cover.jpg';
    if (best.w1920) { src.cover1920 = best.w1920; names.cover1920 = r.display_id + '.cover-1920.jpg'; }
  }
  for (const k of Object.keys(names)) {
    if (!src[k]) continue;
    const a = assetFile(db, src[k]);
    if (!fs.existsSync(a.file)) throw fail('not_found', `Tệp ${k} của ${r.display_id} đã bị dọn khỏi đĩa.`);
    fs.copyFileSync(a.file, path.join(dir, names[k]));
    files.push(names[k]);
  }
  const lv = db.get('SELECT lv.version, l.display_id AS lesson, l.title FROM lesson_versions lv JOIN lessons l ON l.id=lv.lesson_id WHERE lv.id=?', r.lesson_version_id);
  const gates = db.all("SELECT gate, result, measure FROM gate_results WHERE subject_kind='render' AND subject_id=? ORDER BY created_at, rowid", r.id);
  const latest = {}; gates.forEach(g => { latest[g.gate] = { result: g.result, measure: J(g.measure) }; });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ render: r.display_id, lesson: lv.lesson, title: lv.title, version: lv.version, manifest: r.manifest, gates: latest, files, exported_at: new Date().toISOString() }, null, 2));
  files.push('manifest.json');
  const out = { dir, files };
  if (ctx.write && ctx.write.ext) ctx.write.ext.hooks.run('export.after', { ctx, render: r, actor: opts.actor || null, entry: opts.entry || null, dir, files });   // gói O: ops.publish
  return out;
}

// ---------- quét provider (STD-10) ----------
async function scanProvider(ctx, pv, actor) {
  const { db, config } = ctx;
  const mod = dep(ctx, 'providers').get(config);
  const key = pv.secret_name ? secrets.get(db, db.ws, pv.secret_name) : null;
  let res;
  try { res = await mod.probe({ key }); } catch (e) {
    if (e && e.name === 'ProviderError') throw fail('bad_gateway', e.text_human || 'Không quét được nhà cung cấp.', { code: e.code });
    throw e;
  }
  const mine = (res.models || []).find(m => m.kind === pv.kind && (!pv.model || m.model === pv.model)) || (res.models || []).find(m => m.kind === pv.kind) || null;
  const scan = { available: mine ? !!mine.available : false, voices: res.voices || [], quota: mine ? mine.quota : { value: null, source: 'unknown' }, models: res.models || [], scanned_at: new Date().toISOString() };
  ctx.write(actor && actor.type ? actor : SYS, 'provider.scan_result', { provider: pv.display_id, scan });
  return { models: (res.models || []).map(m => ({ model: m.model, kind: m.kind, available: m.available, quota: m.quota })), voices: scan.voices, scan };
}

module.exports = { startWorkers, startHeartbeat, requeueRender, exportRender, scanProvider, pickProvider, extractTerms, assetFile, localParts, nextMidnightIso, wsTz, aggregateGates, SYS };
