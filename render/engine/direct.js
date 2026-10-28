// © 2026 Gen Labs — All rights reserved.
// Đạo diễn nhân vật (thuần, không DOM): từ plan (câu nói, mốc beat, tâm trạng, tính cách) suy ra trạng thái/biểu cảm/động tác Gen-Chibi tại mỗi thời điểm.
// makeDirector(plan) → { level(who, t_ms) → 0..1 | -1 (không nói), act(who, t_ms) → { state, director, talking, mood } } — director dùng cho GC.svgString. API giữ nguyên từ 0.1.x.
// 0.2.0 (SPEC §3.6, gói V): lines.mood → bảng DỮ LIỆU render/engine/moods.json (state + động tác mở đầu/khi nói + phản ứng người nghe + giữ/hạ hiệu ứng);
//   phản xạ theo beat (stamp → người nghe giật mình; beat trong câu → point quay về vùng beat; end-card → host chính wave, đồng dẫn cheer, cả hai bow 0,8 s cuối);
//   tính cách plan.persona[id] (energy co giãn phản ứng · temperament nét mặt khi nghe · laugh · tic chạy một lần khi đứng không nói > 4 s · running_gag theo trigger, ≤ max_per_min);
//   PiP (plan.actors[i].layout.mode = 'pip', do hook plan.input cấp): gõ phím (plan.cursor.typing) → typing, bấm chuột (plan.cursor.clicks) → point về phía màn hình.
// Mọi thứ TẤT ĐỊNH: lịch tic/gag chỉ phụ thuộc plan + hash(id). Bảng tâm trạng: Node → require('./moods.json'); trình duyệt → plan.moods (hook plan.after nhét vào) hoặc window.GSMoods.
(function (root) {
  'use strict';
  var STATES = ['normal', 'work', 'think', 'unsure', 'smug', 'greedy', 'proud', 'vow', 'beg', 'shock', 'panic', 'rage', 'dizzy', 'cry', 'injured', 'exhausted', 'lazy', 'sleep'];
  var HOLD_NEAR_BEAT_BEFORE = 300, HOLD_NEAR_BEAT_AFTER = 1500;   // cửa sổ "câu có beat": point từ trước beat 0,3 s đến sau 1,5 s
  var STAMP_MS = 1400, WALK_MS = 950, BOW_MS = 800, TIC_AFTER_MS = 4000, TIC_MS = 1300, GAG_MS = 1700, GAG_MIN_GAP_MS = 2500, CLICK_MS = 900, MIN_SETTLE_MS = 400;
  var WRONG_RE = /\b(sai|nhầm|wrong|incorrect|false)\b/i;
  var D = {};
  // bảng mặc định tối thiểu khi trang sân khấu không có bảng (plan không mang moods) — chỉ neutral, hành vi giống 0.1.x
  var FALLBACK = { default: 'neutral', aliases: {}, energy: {}, temperament: {}, laugh: {}, moods: { neutral: { state: 'normal', speak: { motion: 'talk' }, listen: { motion: 'nod', ms: 900 } } } };
  if (typeof module === 'object' && module.exports) D.MOODS = require('./moods.json'); else if (root.GSMoods) D.MOODS = root.GSMoods;

  function blink(t, off) { var c = (t + off) % 3.7; return c < 0.1 || (c > 0.28 && c < 0.36 && Math.floor((t + off) / 3.7) % 3 === 1); }
  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  D.mouthOf = function (lv) { return lv < 0 ? null : lv < 0.12 ? 'flat' : lv < 0.42 ? 'oSmall' : 'oBig'; };
  D.hash = hash;

  // Tên tâm trạng → mục trong bảng (alias → tên chính; id state cũ của 0.1.x vẫn dùng được; lạ ⇒ neutral)
  D.resolveMood = function (table, name) {
    var T = table || D.MOODS || FALLBACK, key = name === null || name === undefined ? '' : String(name);
    if (T.moods[key]) return { name: key, def: T.moods[key], known: true };
    if (T.aliases && T.aliases[key] && T.moods[T.aliases[key]]) return { name: T.aliases[key], def: T.moods[T.aliases[key]], known: true };
    if (key && STATES.indexOf(key) >= 0) return { name: key, def: { state: key, speak: { motion: 'talk' }, listen: { motion: 'nod', ms: 900 } }, known: true, passthrough: true };
    var d = T.default || 'neutral';
    return { name: d, def: T.moods[d] || FALLBACK.moods.neutral, known: !key };
  };
  // Danh sách tên tâm trạng chính (cho capabilities / kiểm bài)
  D.moodNames = function (table) { return Object.keys((table || D.MOODS || FALLBACK).moods); };

  D.makeDirector = function (plan) {
    var T = plan.moods || D.MOODS || FALLBACK, persona = plan.persona || {}, cursor = plan.cursor || null;
    var lines = plan.lines, beats = plan.beats, order = Object.keys(plan.cast), lastLine = lines[lines.length - 1];
    var endCard = beats.filter(function (b) { return b.block === 'end-card'; })[0], endT = endCard ? endCard.t_in : plan.duration_ms + 1;
    var stamps = beats.filter(function (b) { return b.block === 'stamp'; }), points = beats.filter(function (b) { return b.block !== 'lesson-map' && b.block !== 'end-card'; });
    var layouts = {}; (plan.actors || []).forEach(function (a) { layouts[a.id] = a.layout || {}; });
    function lineAt(who, t) { for (var i = 0; i < lines.length; i++) { var l = lines[i]; if ((who === null || l.who === who) && t >= l.a_ms && t <= l.b_ms) return l; } return null; }
    function moodOfLine(l) { return D.resolveMood(T, l.mood); }
    function nearBeat(l, t) { return points.some(function (b) { return t >= b.t_in - HOLD_NEAR_BEAT_BEFORE && t < b.t_in + HOLD_NEAR_BEAT_AFTER && b.t_in >= l.a_ms - 200 && b.t_in <= l.b_ms; }); }

    // ---- lịch tic: đứng không nói > 4 s ⇒ chạy persona.tic một lần cho mỗi khoảng lặng (jitter theo hash(id)) ----
    var tics = {};
    order.forEach(function (who) {
      var p = persona[who], list = []; tics[who] = list;
      if (!p || !p.tic) return;
      var own = lines.filter(function (l) { return l.who === who; }), cur = 0;
      var spans = own.map(function (l) { return [l.a_ms, l.b_ms]; }).concat([[Math.min(endT, plan.duration_ms), Infinity]]);
      spans.forEach(function (s) {
        var a = cur, b = s[0];
        if (b - a >= TIC_AFTER_MS + TIC_MS) {
          var at = a + TIC_AFTER_MS + (hash(who + ':tic:' + a) % 400);
          if (at + TIC_MS <= b) list.push({ a: at, b: at + TIC_MS, motion: p.tic });
        }
        cur = Math.max(cur, s[1]);
      });
    });

    // ---- lịch gag: theo trigger, ≤ max_per_min (cửa sổ trượt 60 s), cách nhau ≥ 2,5 s, tất định ----
    var gags = {};
    order.forEach(function (who) {
      var p = persona[who], g = p && p.running_gag, list = []; gags[who] = list;
      if (!g || !g.trigger) return;
      var at = [], trig = String(g.trigger), jit = hash(who + ':' + (g.id || '')) % 300;
      if (trig.indexOf('on_partner_mood:') === 0) {
        var want = D.resolveMood(T, trig.slice('on_partner_mood:'.length)).name;
        lines.forEach(function (l) { if (l.who !== who && moodOfLine(l).name === want) at.push({ t: l.a_ms + 300 + jit, end: l.b_ms }); });
      } else if (trig === 'on_wrong_answer') {
        stamps.forEach(function (b) { var pr = b.params || {}; if (WRONG_RE.test(String(pr.text || '') + ' ' + String(pr.sub || ''))) at.push({ t: b.t_in + 500 + jit, end: b.t_in + 500 + GAG_MS }); });
      } else if (trig === 'on_term_first_use') {
        var seen = {};
        lines.forEach(function (l) { var fresh = (l.terms || []).filter(function (x) { if (seen[x]) return false; seen[x] = 1; return true; }); if (fresh.length && l.who !== who) at.push({ t: l.a_ms + 400 + jit, end: l.b_ms }); });
      } else if (trig === 'on_end_card') {
        at.push({ t: endT + 300 + jit, end: endT + 300 + GAG_MS });
      } else if (trig === 'once_per_lesson') {
        var from = plan.duration_ms * 0.4, first = lines.filter(function (l) { return l.who !== who && l.a_ms >= from; })[0];
        if (first) at.push({ t: first.a_ms + 300 + jit, end: first.b_ms });
      }
      var max = g.max_per_min > 0 ? g.max_per_min : 1, done = [];
      at.sort(function (x, y) { return x.t - y.t; }).forEach(function (x) {
        var last = done[done.length - 1];
        if (last && x.t - last.a < GAG_MIN_GAP_MS) return;
        if (done.filter(function (q) { return x.t - q.a < 60000; }).length >= max) return;
        var b = Math.max(x.t + 800, Math.min(x.t + GAG_MS, x.end));
        done.push({ a: x.t, b: b, motion: g.motion, fx: g.fx || null });
      });
      list.push.apply(list, done);
    });
    function within(list, t) { for (var i = 0; i < list.length; i++) if (t >= list[i].a && t < list[i].b) return list[i]; return null; }

    var api = {
      level: function (who, t) {
        var l = lineAt(who, t); if (!l) return -1;
        var k = Math.floor((t - l.a_ms) / 1000 * (l.env_fps || 30)), e = l.envelope; return e[Math.min(e.length - 1, Math.max(0, k))] || 0;
      },
      act: function (who, t) {
        var idx = order.indexOf(who), ts = t / 1000, d = {}, state = 'normal', moodName = null;
        var p = persona[who] || {}, en = (T.energy && T.energy[p.energy]) || {}, kR = en.react || 1, kI = en.intro || 1, L = layouts[who] || {}, pip = L.mode === 'pip';
        if (L.mode === 'hidden') return { state: 'normal', director: {}, talking: false, mood: null };
        if (idx > 0) d.facing = 'left';
        var talking = api.level(who, t) >= 0, l = lineAt(who, t), canBlink = true;

        if (t >= endT) {
          if (idx === 0) d.activity = 'wave'; else d.activity = 'cheer';
          if (t >= plan.duration_ms - BOW_MS) d.activity = 'bow';          // cả hai cúi chào ở 0,8 s cuối
          var ge = within(gags[who], t); if (ge) { d.motion = ge.motion; if (ge.fx) d.fx = [ge.fx]; }
        } else if (idx === 1 && t < WALK_MS && !pip) d.activity = 'walk';
        else if (l) {
          var m = moodOfLine(l), md = m.def, rel = t - l.a_ms, sp = md.speak || {}; moodName = m.name;
          state = md.state || 'normal';
          if (md.eyes) d.eyes = md.eyes; if (md.brows) d.brows = md.brows;
          // giữ hiệu ứng đúng thời hạn rồi hạ xuống (confetti ≤ 1,2 s · crown ≤ 1 s); câu quá ngắn thì không hạ (tránh đổi state < 400 ms)
          if (md.hold_ms && md.settle && rel >= md.hold_ms && l.b_ms - (l.a_ms + md.hold_ms) >= MIN_SETTLE_MS) {
            state = md.settle.state || 'normal'; d.eyes = md.settle.eyes || undefined; d.brows = md.settle.brows || undefined;
            if (!d.eyes) delete d.eyes; if (!d.brows) delete d.brows;
          }
          var introMs = sp.intro ? Math.round((sp.intro_ms || 800) * kI) : 0;
          if (rel < introMs) d.motion = sp.intro;
          else if (md.beat !== false && nearBeat(l, t)) { d.motion = 'point'; d.view = idx === 0 ? 'right45' : 'left45'; }   // quay về phía vùng beat (trang vở nằm giữa khung)
          else d.motion = sp.motion || 'talk';
          if (l === lastLine && d.motion === 'talk') d.motion = 'nod';
          canBlink = !d.eyes || ['normal', 'happy', 'half', 'smug'].indexOf(d.eyes) >= 0;
        } else {
          var other = lineAt(null, t), hitStamp = stamps.some(function (b) { return t >= b.t_in && t < b.t_in + STAMP_MS; }), g = within(gags[who], t), ti = within(tics[who], t);
          var oi = other ? lines.indexOf(other) : -1, om = other ? moodOfLine(other).def : null, ls = om && om.listen;
          if (hitStamp) state = 'shock';
          else if (g) { d.motion = g.motion; if (g.fx) d.fx = [g.fx]; }
          else if (ls && oi > 0 && t - other.a_ms < ls.ms * kR) {
            d.motion = ls.motion; if (ls.state) state = ls.state;
            var lm = ls.mouth && p.laugh && T.laugh && T.laugh[p.laugh]; if (ls.mouth) d.mouth = lm || ls.mouth;
          } else if (ti) d.motion = ti.motion;
          else { var tf = T.temperament && T.temperament[p.temperament]; if (tf) { if (tf.eyes) d.eyes = tf.eyes; if (tf.brows) d.brows = tf.brows; } }
          canBlink = !d.eyes || ['normal', 'happy', 'half', 'smug'].indexOf(d.eyes) >= 0;
        }

        // PiP (tutorial): gõ phím → typing; bấm chuột → point về phía màn hình (màn hình nằm ở phía ngược với chỗ đứng của PiP)
        if (pip && cursor && t < endT) {
          var typing = (cursor.typing || []).some(function (x) { return t >= x.t0 && t <= x.t1; });
          var clicked = (cursor.clicks || []).some(function (x) { return t >= x.t && t < x.t + CLICK_MS; });
          if (typing) d.motion = 'typing';
          else if (clicked) { d.motion = 'point'; d.view = typeof L.x === 'number' && L.x < 960 ? 'right45' : 'left45'; }
        }

        var lv = api.level(who, t), mo = D.mouthOf(lv); if (mo) d.mouth = mo;
        if (canBlink && blink(ts, idx === 0 ? 0.3 : 1.9)) d.eyes = 'closed';
        return { state: state, director: d, talking: talking, mood: moodName };
      }
    };
    api.schedule = function () { return { tics: tics, gags: gags, endT: endT }; };
    return api;
  };

  // Mẫu dòng thời gian của một nhân vật (kiểm thử, bảng nhân vật, gỡ lỗi): [{t, state, motion, eyes, brows, mouth, fx, view, activity, talking, mood}] mỗi `step` ms
  D.timelineOf = function (plan, who, step) {
    var dir = D.makeDirector(plan), out = [], s = step || 100;
    for (var t = 0; t <= plan.duration_ms; t += s) {
      var r = dir.act(who, t), d = r.director;
      out.push({ t: t, state: r.state, motion: d.motion || null, eyes: d.eyes || null, brows: d.brows || null, mouth: d.mouth || null, fx: d.fx || null, view: d.view || null, activity: d.activity || null, talking: r.talking, mood: r.mood });
    }
    return out;
  };
  if (typeof module === 'object' && module.exports) module.exports = D; else root.GSDirect = D;
})(typeof self !== 'undefined' ? self : this);
