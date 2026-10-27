// © 2026 Gen Labs — All rights reserved.
// Seed demo = đúng dữ liệu BUILD-BRIEF §5 (idempotent: đã có CH-0001 thì bỏ qua).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const secrets = require('./secrets');
const { anchorIndex } = require('./write');

const DEMO = path.join(__dirname, '..', 'seed', 'demo.json');

function seedDemo(db, opts = {}) {
  const d = JSON.parse(fs.readFileSync(DEMO, 'utf8'));
  if (db.get('SELECT 1 AS x FROM channels WHERE workspace_id=? AND display_id=?', db.ws, d.channel.id)) return { skipped: true };

  const out = { password: null };
  db.tx(() => {
    const now = Date.now();
    const ago = (min) => new Date(now - min * 60000).toISOString();
    const by = 'system';
    const id = {}; // display_id → id
    const ins = (table, f) => { const r = db.insertRow(table, { created_by: by, ...f }); if (r.display_id) id[r.display_id] = r.id; return r; };

    db.update('workspaces', db.ws, d.workspace);

    // user owner
    const pw = opts.password || process.env.GS_DEMO_PASSWORD || crypto.randomBytes(9).toString('base64url');
    if (!opts.password && !process.env.GS_DEMO_PASSWORD) out.password = pw;
    const user = db.get('SELECT * FROM users WHERE username=? AND deleted_at IS NULL', d.user.username)
      || ins('users', { display_id: db.nextDisplayId(db.ws, 'US'), username: d.user.username, display_name: d.user.display_name,
        password_hash: secrets.hashPassword(pw), role: 'owner', locale: 'vi' });
    out.user = user.id;

    // kênh + cast
    const ch = ins('channels', { display_id: d.channel.id, name: d.channel.name, lang_primary: d.channel.lang_primary, lang_terms: d.channel.lang_terms, current_version: 1 });
    db.insertRow('channel_versions', { entity_id: ch.id, version: 1, data: d.channel.data, note: 'seed', created_by: by });
    for (const c of d.cast) {
      const m = ins('cast_members', { display_id: c.id, channel_id: ch.id, name: c.name, role_label: c.role_label, current_version: 1 });
      db.insertRow('cast_versions', { entity_id: m.id, version: 1, created_by: by, note: 'seed',
        data: { look: c.look, voice: { provider: 'gemini', model: 'gemini-3.1-flash-tts-preview', voice: c.voice }, engine_version: '0.25.1' } });
    }
    for (const a of d.agents) {
      const ag = ins('agents', { display_id: a.id, name: a.name, kind: a.kind, scopes: a.scopes, cli: a.cli, wake_limit_per_day: a.wake_limit_per_day, status: 'active' });
      if (a.kind === 'oauth') db.run('INSERT INTO oauth_clients(client_id, workspace_id, agent_id, redirect_uris, name, kind, created_channel, created_at) VALUES(?,?,?,?,?,?,?,?)',
        `demo-${ag.display_id.toLowerCase()}`, db.ws, ag.id, JSON.stringify(['https://claude.ai/api/mcp/auth_callback']), a.name, 'dcr', 'public', db.now());
    }
    const today = db.now().slice(0, 10);
    for (const p of d.providers) {
      const pv = ins('providers', { display_id: p.id, kind: p.kind, vendor: p.vendor, model: p.model, enabled: 1, scan: { ...p.scan, scanned_at: db.now() } });
      db.run('INSERT INTO provider_usage(provider_id, day, calls, errors_429) VALUES(?,?,?,?)', pv.id, today, p.usage.calls, p.usage.errors_429);
    }
    for (const c of d.curriculum) ins('curriculum_nodes', { display_id: c.id, channel_id: ch.id, ord: c.ord, title: c.title, status: c.status, principle: null });

    // Work order (review_id gắn sau khi có RV)
    const wo = {};
    for (const w of d.work_orders) {
      const opened = ago(w.minutes_ago);
      wo[w.id] = ins('work_orders', { display_id: w.id, channel_id: ch.id, kind: w.kind, curriculum_node_id: w.node ? id[w.node] : null,
        agent_id: w.agent ? id[w.agent] : null, state: w.state, brief: w.brief || `Soạn bài mới cho mục ${w.node}.`, attempts: 0, opened_at: opened,
        assigned_at: w.agent ? opened : null, summary: w.summary || null,
        closed_at: w.state === 'fulfilled' ? new Date(now - (w.minutes_ago - w.took_min) * 60000).toISOString() : null });
    }

    // Bài học
    const verId = {};
    for (const l of d.lessons) {
      const ls = ins('lessons', { display_id: l.id, channel_id: ch.id, curriculum_node_id: id[l.node], title: l.title, current_version: l.versions.length });
      for (const v of l.versions) {
        const lv = db.insertRow('lesson_versions', { lesson_id: ls.id, version: v.version, created_by: by, submitted_by: 'agent:AG-0001',
          state: v.version === l.versions.length ? 'submitted' : 'superseded', work_order_id: v.wo ? wo[v.wo].id : null });
        verId[`${l.id}:${v.version}`] = lv.id;
        const says = {};
        l.lines.forEach((ln, i) => {
          const say = (v.lineOverrides && v.lineOverrides[ln.id] && v.lineOverrides[ln.id].say) || ln.say;
          says[ln.id] = say;
          db.insertRow('lines', { display_id: ln.id, lesson_version_id: lv.id, ord: i, cast_member_id: id[ln.who], say, lang: 'vi',
            terms_declared: ln.terms, subtitle: null, mood: ln.mood, created_by: by });
        });
        l.beats.forEach((b, i) => {
          const idx = anchorIndex(says[b.line], b.word);
          if (idx < 0) throw new Error(`Seed: neo "${b.word}" không có trong ${b.line}`);
          db.insertRow('beats', { display_id: b.id, lesson_version_id: lv.id, ord: i, block_type: b.block, block_version: 1, params: b.params,
            anchor_line_display_id: b.line, anchor_word_index: idx, created_by: by });
        });
      }
    }

    // Bản dựng
    const lessonBy = Object.fromEntries(d.lessons.map((l) => [l.id, l]));
    const rd = {};
    const asset = (label) => {
      const sha = crypto.createHash('sha256').update(`seed:${label}`).digest('hex');
      const kind = label.endsWith('.mp4') ? 'video' : label.endsWith('.srt') ? 'subtitle' : label.endsWith('.png') ? 'cover' : 'audio';
      return db.insertRow('assets', { kind, sha256: sha, path: `media/${sha.slice(0, 2)}/${sha}.bin`, bytes: 0, mime: null,
        meta: { seed: true }, media_present: 0, source: 'system', created_by: by }, { prefix: 'AS' });
    };
    for (const r of d.renders) {
      const l = lessonBy[r.lesson];
      const lvId = verId[`${r.lesson}:${r.version}`];
      let manifest = null;
      let outputs = null;
      if (!['queued', 'voicing', 'judging', 'aligning'].includes(r.state) && r.state !== 'superseded') {
        const lineMap = {};
        l.lines.forEach((ln) => {
          const vc = db.insertRow('voice_clips', { display_id: db.nextDisplayId(db.ws, 'VC'),
            content_hash: crypto.createHash('sha256').update(`seed:${r.id}:${ln.id}`).digest('hex'), model: 'gemini-3.1-flash-tts-preview',
            voice: 'seed', say: ln.say, asset_id: asset(`${r.id}-${ln.id}.wav`).id, duration_ms: ln.b - ln.a, created_by: by });
          lineMap[ln.id] = { voice_clip: vc.display_id, a_ms: ln.a, b_ms: ln.b };
        });
        manifest = { seed: true, lines: lineMap, channel: `${d.channel.id}@1`, cast: d.cast.map((c) => `${c.id}@1`),
          engine: { app: 'seed', gen_chibi: '0.25.1' }, aspect: '16:9', fps: 30, size: [1920, 1080] };
      }
      if (['awaiting_review', 'approved'].includes(r.state)) {
        outputs = { mp4: asset(`${r.id}.mp4`).id, srt_vi: asset(`${r.id}-vi.srt`).id, srt_en: asset(`${r.id}-en.srt`).id, cover: asset(`${r.id}.png`).id, mix: asset(`${r.id}-mix.wav`).id };
      }
      const created = ago(r.minutes_ago);
      rd[r.id] = ins('renders', { display_id: r.id, lesson_version_id: lvId, state: r.state, state_changed_at: created, created_at: created,
        progress: r.progress !== undefined ? r.progress : ['awaiting_review', 'approved', 'changes_requested'].includes(r.state) ? 1 : 0,
        manifest, outputs, duration_ms: r.duration_ms || null, frames: r.frames || null,
        blocked_reason: null });
      if (r.gates) {
        for (const [gate, measure] of d.gates[r.gates]) {
          db.insertRow('gate_results', { subject_kind: 'render', subject_id: rd[r.id].id, gate, result: 'pass', measure, attempt: 1, created_by: by }, { prefix: 'GT' });
        }
      }
    }
    for (const l of d.lessons) {
      const latest = d.renders.filter((r) => r.lesson === l.id).pop();
      db.update('lessons', id[l.id], { latest_render_id: rd[latest.id].id });
    }

    // Review + ghi chú → gắn vào WO
    const rv = d.review;
    const rvRow = ins('reviews', { display_id: rv.id, render_id: rd[rv.render].id, decision: rv.decision, decided_by: user.id,
      review_seconds: rv.review_seconds, work_order_id: wo['WO-0003'].id, created_at: ago(1550) });
    for (const n of rv.notes) db.insertRow('review_notes', { review_id: rvRow.id, ...n });
    db.update('work_orders', wo['WO-0003'].id, { review_id: rvRow.id, render_id: rd[rv.render].id, lesson_id: id['LS-0001'] });
    db.update('work_orders', wo['WO-0002'].id, { render_id: rd['RD-0001'].id, lesson_id: id['LS-0001'] });
    db.update('work_orders', wo['WO-0001'].id, { lesson_id: id['LS-0001'] });

    // Runs
    for (const r of d.runs) {
      const started = ago(r.minutes_ago);
      ins('runs', { display_id: r.id, kind: r.kind, render_id: r.render ? rd[r.render].id : null, work_order_id: r.wo ? wo[r.wo].id : null,
        state: r.state, attempt: 1, started_at: started, finished_at: r.state === 'done' ? started : null, progress: r.state === 'done' ? 1 : r.progress || 0,
        cost: r.cost || { calls: 1 }, waiting_until: r.waiting_minutes ? new Date(now + r.waiting_minutes * 60000).toISOString() : null,
        lease_until: r.state === 'running' ? new Date(now + 60000).toISOString() : null, worker_id: r.state === 'running' ? 'seed' : null,
        payload: null, created_at: started });
    }
    db.audit({ actor: 'system', entry: 'system', action: 'seed.demo', entity_type: 'workspace', entity_id: db.ws, before: null, after: { channel: d.channel.id } });
  });
  if (out.password) console.log(`[seed] Tài khoản demo: ${d.user.username} / ${out.password}  (đặt GS_DEMO_PASSWORD để chọn mật khẩu)`);
  return out;
}

module.exports = { seedDemo };
