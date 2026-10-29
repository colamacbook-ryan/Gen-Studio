// © 2026 Gen Labs — All rights reserved.
// Hợp đồng tỉ lệ khung (SPEC-0.2.0-F7 §3.1, gói W2-0): đọc render/aspects.json (nguồn duy nhất), hàm THUẦN — không DOM, không I/O ngoài lúc nạp dữ liệu.
// Chạy cả Node (require) lẫn trình duyệt (UMD như camera.js: window.GSAspects; dữ liệu lấy từ window.GSAspectsData nếu có, không có thì chỉ layoutVars dùng được).
//   list({enabledOnly}) · get(id) · resolve({lesson, workOrder, channelData, kind, previous}) · presetsOf(aspect) · fit(aspect, duration_s) · token(aspect)
//   thumbSupported(aspect, templates?) · thumbSizes(aspect) · coverFrameMs(plan) · sampleTimes(plan) · layoutVars(layout) · safeCheck(aspect, measures)
//   catalog(opts?) → {version, default, aspects, presets} (= GET /api/aspects = get_capabilities.aspects) · create(data) → API gắn với bộ dữ liệu khác (test, trình duyệt)
// Lỗi của resolve: ném AspectError {name:'AspectError', code, text_human, detail} — code ∈ aspect_unsupported | aspect_mismatch | aspect_kind_unsupported.
(function (root) {
  'use strict';
  var isNode = typeof module === 'object' && module.exports;

  function AspectError(code, text, detail) {
    var e = new Error(text); e.name = 'AspectError'; e.code = code; e.text_human = text; e.detail = detail === undefined ? null : detail; return e;
  }
  var clone = function (v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); };
  var has = function (o, k) { return o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k); };
  var given = function (v) { return v !== undefined && v !== null && v !== ''; };
  var TUTORIAL_BLOCKED = 'Bài hướng dẫn (tutorial/trailer) hiện chỉ dựng được khung 16:9. Bản dọc 9:16 cho hướng dẫn dự kiến ở 0.2.x. Hãy để tỉ lệ 16:9 cho bài này, hoặc làm bài thường (`lesson`) nếu cần clip dọc.';
  var EDGE_VI = { top: 'mép trên', bottom: 'mép dưới', left: 'mép trái', right: 'mép phải' };
  var ZONE_VI = { top: 'thanh trên của nền tảng', bottom: 'vùng caption của nền tảng', left: 'lề trái của nền tảng', right: 'cột nút của nền tảng' };
  var ROLE_VI = { subtitle: 'Phụ đề', logo: 'Logo', block: 'Khối hình', end_card: 'Thẻ kết', intro: 'Chữ intro', actor_head: 'Đầu nhân vật' };

  // biến CSS cho sân khấu (CNS-335) — thuần trên `layout`, không cần dữ liệu; legacy/không có layout ⇒ {} (16:9 không có biến mới)
  function layoutVars(layout) {
    var v = {};
    if (!layout || typeof layout !== 'object' || layout.legacy) return v;
    var px = function (n) { return n + 'px'; };
    var s = layout.subtitle;
    if (s) { v['--lay-sub-top'] = px(s.top); v['--lay-sub-left'] = px(s.left); v['--lay-sub-maxw'] = px(s.max_w); v['--lay-sub-font'] = px(s.font_px); v['--lay-sub-tr-display'] = s.show_translation ? 'block' : 'none'; }
    var a = layout.actors;
    if (a) { v['--lay-actor-scale'] = a.scale; v['--lay-actor-left-x'] = px(a.x[0]); v['--lay-actor-right-x'] = px(a.x[1]); v['--lay-actor-bottom'] = px(a.bottom); }
    var l = layout.logo;
    if (l) { if (l.tl) { v['--lay-logo-tl-x'] = px(l.tl[0]); v['--lay-logo-tl-y'] = px(l.tl[1]); } if (l.tr) { v['--lay-logo-tr-x'] = px(l.tr[0]); v['--lay-logo-tr-y'] = px(l.tr[1]); } }
    v['--lay-chip-display'] = layout.chip_top === false ? 'none' : 'block';
    v['--lay-lt-display'] = layout.lower_third === false ? 'none' : 'block';
    var e = layout.end_card;
    if (e) { v['--lay-end-top'] = e.top_pct + '%'; v['--lay-end-cx'] = px(e.center_x); v['--lay-end-maxw'] = px(e.max_w); }
    return v;
  }

  function create(data) {
    var API = { AspectError: AspectError, create: create, layoutVars: layoutVars, TUTORIAL_BLOCKED: TUTORIAL_BLOCKED };
    var need = function () { if (!data || !data.aspects) throw AspectError('aspects_data_missing', 'Chưa nạp dữ liệu tỉ lệ (render/aspects.json).'); return data; };
    var def = function (id) { var D = need(); return typeof id === 'string' && has(D.aspects, id) ? D.aspects[id] : null; };
    var enabledIds = function () { var D = need(); return Object.keys(D.aspects).filter(function (k) { return D.aspects[k].enabled; }); };
    var R = function () { return need().render; };

    API.data = function () { return clone(need()); };
    API.get = function (id) { var d = def(id); return d ? Object.assign({ id: id }, clone(d)) : null; };
    API.token = function (id) { var d = def(id); return d ? d.token : null; };
    API.thumbSizes = function (id) { var d = def(id); return d ? clone(d.thumb_sizes) : null; };
    API.list = function (o) {
      var D = need(), only = !!(o && o.enabledOnly);
      return Object.keys(D.aspects).filter(function (k) { return !only || D.aspects[k].enabled; }).map(function (k) {
        var d = D.aspects[k];
        return { id: k, size: clone(d.size), token: d.token, kinds: clone(d.kinds), presets: clone(d.presets), enabled: !!d.enabled, default: k === D.default,
          safe: clone(d.safe), target_s: d.target_s ? clone(d.target_s) : null, min_font_px: d.min_font_px === undefined ? null : d.min_font_px };
      });
    };
    // [{id, aspect, platform, max_s, cover, grid_crop?, source, source_url, checked, verified}] theo thứ tự `presets` của tỉ lệ
    API.presetsOf = function (id) {
      var D = need(), d = def(id); if (!d) return [];
      return d.presets.filter(function (p) { return has(D.presets, p); }).map(function (p) {
        var x = D.presets[p], o = { id: p, aspect: x.aspect, platform: x.platform, max_s: x.max_s, cover: x.cover };
        if (x.grid_crop) o.grid_crop = clone(x.grid_crop);
        o.source = x.source || null; o.source_url = x.source && D.sources && D.sources[x.source] || null;
        o.checked = x.checked || null; o.verified = x.verified === undefined ? null : x.verified;
        return o;
      });
    };
    // {[preset]: {ok, max_s}}; max_s null ⇒ nền tảng không giới hạn ⇒ ok
    API.fit = function (id, durationS) {
      var out = {};
      API.presetsOf(id).forEach(function (p) { out[p.id] = { ok: p.max_s === null || (typeof durationS === 'number' && durationS <= p.max_s), max_s: p.max_s }; });
      return out;
    };
    // GET /api/aspects = get_capabilities.aspects (§3.5–3.6). opts.blocksOf(aspect) / opts.templatesOf(aspect) → [tên] do server cấp (registry, mẫu ảnh bìa)
    API.catalog = function (opts) {
      var D = need(), o = opts || {}, presets = [];
      var aspects = API.list({ enabledOnly: true }).map(function (a) {
        API.presetsOf(a.id).forEach(function (p) { presets.push(p); });
        if (typeof o.blocksOf === 'function') a.blocks = o.blocksOf(a.id);
        if (typeof o.templatesOf === 'function') a.thumbnail_templates = o.templatesOf(a.id);
        return a;
      });
      return { version: D.version, default: D.default, aspects: aspects, presets: presets };
    };
    // có ≥ 1 mẫu ảnh bìa cùng tỉ lệ (mẫu cũ không khai `aspect` ⇒ 16:9). templates: mảng mẫu hoặc {templates:[…]}; Node mặc định đọc render/thumbs/templates.json
    API.thumbSupported = function (id, templates) {
      if (!def(id)) return false;
      var list = templates === undefined ? defaultTemplates() : templates;
      if (list && !Array.isArray(list)) list = list.templates;
      return Array.isArray(list) && list.some(function (t) { return (t && t.aspect || '16:9') === id; });
    };

    // §3.3: lesson.aspect → workOrder.aspect → (previous) → channelData.default_aspect (bí danh cũ `aspect`) → default. previous = {aspect} của version trước (update_lesson):
    // bài không gửi aspect và lệnh không đặt ⇒ kế thừa previous.aspect, version cũ NULL ⇒ '16:9' (luật chung lessonExt); lệnh có aspect (vd "Tạo lệnh bản 9:16") thắng kế thừa.
    API.resolve = function (o) {
      var D = need(); o = o || {};
      var lesson = o.lesson || {}, wo = o.workOrder || null, ch = o.channelData || {}, kind = o.kind || lesson.kind || 'lesson', warnings = [];
      var woAspect = wo && given(wo.aspect) ? wo.aspect : null, woName = wo && (wo.display_id || wo.id) || null;
      var cand = null, source = null, inherited = false;
      if (given(lesson.aspect)) { cand = lesson.aspect; source = 'lesson'; }
      else if (woAspect) { cand = woAspect; source = 'work_order'; }
      else if (o.previous) { cand = given(o.previous.aspect) ? o.previous.aspect : '16:9'; source = 'lesson'; inherited = true; }
      else if (given(ch.default_aspect) || given(ch.aspect)) { cand = given(ch.default_aspect) ? ch.default_aspect : ch.aspect; source = 'channel'; }
      else { cand = D.default; source = 'default'; }
      var on = enabledIds(), ok = function (id) { var d = def(id); return !!(d && d.enabled); };
      if (!ok(cand)) {
        if (source === 'channel') {   // tỉ lệ mặc định của kênh đã tắt (vd cắt L-MIN) ⇒ không chặn mọi bài của kênh: về mặc định hệ thống + cảnh báo
          warnings.push({ code: 'aspect_channel_unsupported', text_human: 'Tỉ lệ mặc định của kênh (' + cand + ') đang tắt; bài dựng ' + D.default + '.', detail: { channel: cand, used: D.default } });
          cand = D.default; source = 'default';
        } else throw AspectError('aspect_unsupported', 'Tỉ lệ "' + cand + '" không được hỗ trợ (đang bật: ' + on.join(', ') + ').', { aspect: cand, enabled: on });
      }
      if (source === 'lesson' && !inherited && woAspect && woAspect !== cand)
        throw AspectError('aspect_mismatch', 'Lệnh ' + (woName || '') + ' yêu cầu ' + woAspect + ', bài gửi ' + cand + '.', { work_order: woName, expected: woAspect, got: cand });
      if (def(cand).kinds.indexOf(kind) < 0) {
        if (source === 'lesson' || source === 'work_order')
          throw AspectError('aspect_kind_unsupported', kind === 'tutorial' ? TUTORIAL_BLOCKED : 'Loại bài "' + kind + '" chưa dựng được ở tỉ lệ ' + cand + '.', { aspect: cand, kind: kind, source: source });
        var fb = on.filter(function (id) { return def(id).kinds.indexOf(kind) >= 0; })[0];
        if (!fb) throw AspectError('aspect_kind_unsupported', 'Không tỉ lệ nào đang bật dựng được loại bài "' + kind + '".', { aspect: cand, kind: kind, source: source });
        warnings.push({ code: 'aspect_kind_fallback', text_human: 'Kênh mặc định ' + cand + ' nhưng loại bài "' + kind + '" chỉ dựng được ' + fb + '; bài này dựng ' + fb + '.', detail: { from: cand, to: fb, kind: kind } });
        cand = fb; source = 'kind_fallback';
      }
      var out = { aspect: cand, source: source, warnings: warnings };
      if (inherited) out.inherited = true;
      return out;
    };

    // khung bìa trong clip (cover.jpg 0.1.x): lúc tiêu đề đã dựng xong, nằm trong clip
    API.coverFrameMs = function (plan) {
      var first = plan && plan.beats && plan.beats.length ? plan.beats[0].t_in : 0;
      return Math.min(plan.duration_ms - 1, first + R().cover_frame_after_ms);
    };

    // mốc đo vùng an toàn (§3.1, §4.4, CNS-331) → [{t, kind:'line'|'beat'|'end', line?, beat?, zone?}] tăng dần, nguyên ms.
    //   line: a_ms+line_after_ms và giữa câu (phụ đề không theo máy quay ⇒ đo ở mọi đoạn trừ intro);
    //   beat: t_in+beat_settle_ms của khối thuộc vùng, CHỈ khi máy quay đứng yên ở mốc đó, ngoài intro, ngoài toàn cảnh lesson-map, trước t_out;
    //   end: thẻ kết đã lắng. Gộp: hai mốc cách < min_gap_ms ⇒ giữ mốc ưu tiên cao hơn (end > beat > line; bằng nhau giữ mốc trước), mang theo `line` nếu câu còn hiện. Tối đa `max`.
    API.sampleTimes = function (plan) {
      var S = R().sampling, still = R().camera_still, dur = plan.duration_ms, out = [];
      var br = plan.style && plan.style.brand, intro = br && br.intro && br.intro.enabled && br.intro.kind !== 'none' ? Math.max(0, br.intro.duration_ms | 0) : 0;
      var ov = (plan.beats || []).filter(function (b) { return b.block === 'lesson-map'; }).pop(), ovT = ov ? ov.t_in : Infinity;
      var keys = plan.camera || [];
      var camStill = function (t) {
        if (keys.length < 2 || t <= keys[0].t || t >= keys[keys.length - 1].t) return true;
        var i = 1; while (i < keys.length - 1 && keys[i].t <= t) i++;
        var a = keys[i - 1], b = keys[i];
        return Math.abs(b.x - a.x) <= still.max_dxy_px && Math.abs(b.y - a.y) <= still.max_dxy_px && Math.abs(b.z - a.z) / Math.max(a.z, b.z, 1e-9) <= still.max_dz_ratio;
      };
      var inIntro = function (t) { return t < intro; };
      var visible = function (l, t) { return t >= l.a_ms - 120 && t <= l.b_ms + 300; };   // cửa sổ phụ đề của stage.js drawSub
      (plan.lines || []).forEach(function (l) {
        var t1 = l.a_ms + S.line_after_ms, t2 = Math.round((l.a_ms + l.b_ms) / 2);
        [Math.min(t1, l.b_ms), t2].forEach(function (t) { if (!inIntro(t) && t < dur) out.push({ t: t, kind: 'line', line: l.id }); });
      });
      (plan.beats || []).forEach(function (b) {
        if (b.block === 'end-card') { out.push({ t: Math.min(dur - 1, b.t_in + S.end_settle_ms), kind: 'end', beat: b.id }); return; }
        if (b.zone === null || b.zone === undefined) return;   // hud/fullbleed/track/toàn cảnh: không phải khối trong vùng
        var t = b.t_in + S.beat_settle_ms;
        if (t >= dur || (typeof b.t_out === 'number' && t >= b.t_out) || inIntro(t) || t >= ovT || !camStill(t)) return;
        out.push({ t: t, kind: 'beat', beat: b.id, zone: b.zone });
      });
      var PRI = { end: 3, beat: 2, line: 1 };
      out.sort(function (p, q) { return p.t - q.t || PRI[q.kind] - PRI[p.kind]; });
      var byLine = {}; (plan.lines || []).forEach(function (l) { byLine[l.id] = l; });
      var kept = [];
      out.forEach(function (s) {
        var last = kept[kept.length - 1];
        if (!last || s.t - last.t >= S.min_gap_ms) { kept.push(s); return; }
        var win = PRI[s.kind] > PRI[last.kind] ? s : last, lose = win === s ? last : s;
        if (lose.line && !win.line && visible(byLine[lose.line], win.t)) win.line = lose.line;
        kept[kept.length - 1] = win;
      });
      if (kept.length > S.max) {
        var hi = kept.filter(function (s) { return s.kind !== 'line'; }), lo = kept.filter(function (s) { return s.kind === 'line'; });
        var thin = function (arr, n) { if (n <= 0) return []; if (arr.length <= n) return arr; var r = []; for (var i = 0; i < n; i++) r.push(arr[Math.floor(i * arr.length / n)]); return r; };
        kept = hi.length >= S.max ? thin(hi, S.max) : hi.concat(thin(lo, S.max - hi.length));
        kept.sort(function (p, q) { return p.t - q.t; });
      }
      return kept.map(function (s) { var o = { t: Math.round(s.t), kind: s.kind }; if (s.line) o.line = s.line; if (s.beat) o.beat = s.beat; if (s.zone) o.zone = s.zone; return o; });
    };

    // G-SAFE (§6.2) thuần: measures = {duration_s?, samples:[{t_ms, kind?, beat?, zone?, line?, cam?, els:[{role, id?, beat?, zone?, line?, box:[x,y,w,h], font_px_min?}]}]}
    //   (mỗi mẫu = kết quả window.__measure() gộp với mốc của sampleTimes) → {result: 'pass'|'fail'|'unknown', measure} — measure đúng lược đồ §6.2 (+ count, result).
    API.safeCheck = function (id, measures) {
      var d = def(id), m = measures || {}, samples = Array.isArray(m.samples) ? m.samples : null;
      var durS = typeof m.duration_s === 'number' ? m.duration_s : null;
      var base = { aspect: id, safe_ref: d && d.safe ? d.safe.ref : null, samples: samples ? samples.length : 0, min_font_px: null, violations: [], warnings: [], platform_fit: durS === null ? null : {} };
      if (durS !== null) { var f = API.fit(id, durS); Object.keys(f).forEach(function (k) { base.platform_fit[k] = f[k].ok; }); }
      if (!d) return { result: 'unknown', measure: Object.assign(base, { text_human: 'Tỉ lệ "' + id + '" không có trong render/aspects.json.' }) };
      if (!d.safe) return { result: 'pass', measure: Object.assign(base, { applicable: false, text_human: 'Tỉ lệ ' + id + ' không có vùng UI nền tảng cần kiểm.' }) };
      var hard = d.safe.hard, soft = d.safe.soft, minPx = d.min_font_px;
      var boxOk = function (b) { return Array.isArray(b) && b.length === 4 && b.every(function (n) { return typeof n === 'number' && isFinite(n); }); };
      if (!samples || !samples.length || !samples.every(function (s) { return s && typeof s.t_ms === 'number' && Array.isArray(s.els) && s.els.every(function (e) { return e && typeof e.role === 'string' && boxOk(e.box); }); }))
        return { result: 'unknown', measure: Object.assign(base, { text_human: 'Không có số đo vùng an toàn (hoặc số đo hỏng) — chưa kết luận được, bản dựng bị chặn.' }) };
      // mép vượt nhiều nhất ra ngoài vùng [x0,y0,x1,y1]; null = nằm trọn
      var edgeOut = function (b, z) {
        var o = { left: z[0] - b[0], top: z[1] - b[1], right: b[0] + b[2] - z[2], bottom: b[1] + b[3] - z[3] }, best = null;
        Object.keys(o).forEach(function (k) { if (o[k] > 0.5 && (best === null || o[k] > o[best])) best = k; });
        return best;
      };
      var seen = {}, V = base.violations, W = base.warnings, minSeen = null;
      var add = function (arr, item, key) { if (seen[key]) { seen[key].count++; return; } item.count = 1; seen[key] = item; arr.push(item); };
      var ref = function (e, s) { var o = {}; if (e.id) o.id = e.id; var ln = e.line || (e.role === 'subtitle' ? s.line : null); if (ln) o.line = ln; if (e.beat) o.beat = e.beat; return o; };
      var keyOf = function (rule, e, s, edge) { var r = ref(e, s); return [rule, e.role, r.id || r.beat || r.line || '', edge].join('|'); };
      samples.forEach(function (s) {
        var judged = s.kind === 'beat' && s.beat ? s.els.filter(function (e) { return e.role === 'block' && (e.beat === s.beat || (s.zone && e.zone === s.zone)); }) : [];
        s.els.forEach(function (e) {
          var rule = e.role === 'subtitle' ? 'S1' : (e.role === 'logo' || e.role === 'end_card' || e.role === 'intro') ? 'S2' : (e.role === 'block' && judged.indexOf(e) >= 0) ? 'S3' : null;
          if (e.role === 'actor_head') {
            if (e.box[1] + e.box[3] > hard[3] + 0.5) add(W, Object.assign({ rule: 'S5', role: e.role, t_ms: s.t_ms, box: e.box, edge: 'bottom' }, ref(e, s)), keyOf('S5', e, s, 'bottom'));
            return;
          }
          if (!rule) return;
          var eh = edgeOut(e.box, hard);
          if (eh) add(V, Object.assign({ rule: rule, role: e.role, t_ms: s.t_ms, box: e.box, edge: eh }, ref(e, s)), keyOf(rule, e, s, eh));
          else { var es = edgeOut(e.box, soft); if (es) add(W, Object.assign({ rule: 'S5', role: e.role, t_ms: s.t_ms, box: e.box, edge: es, tier: 'soft' }, ref(e, s)), keyOf('S5', e, s, es)); }
          if (rule === 'S3' && typeof e.font_px_min === 'number') {
            minSeen = minSeen === null ? e.font_px_min : Math.min(minSeen, e.font_px_min);
            if (e.font_px_min < minPx) add(V, Object.assign({ rule: 'S4', role: e.role, t_ms: s.t_ms, font_px: e.font_px_min, min_font_px: minPx }, ref(e, s)), keyOf('S4', e, s, ''));
          }
        });
      });
      base.min_font_px = minSeen;
      if (durS !== null) {
        API.presetsOf(id).forEach(function (p) { if (p.max_s !== null && durS > p.max_s) W.push({ rule: 'S6', preset: p.id, duration_s: durS, max_s: p.max_s }); });
        if (d.target_s && (durS < d.target_s[0] || durS > d.target_s[1])) W.push({ rule: 'S6', duration_s: durS, target_s: clone(d.target_s) });
      }
      var result = V.length ? 'fail' : 'pass';
      base.text_human = V.length ? describe(V[0]) + (V.length > 1 ? ' (+' + (V.length - 1) + ' vi phạm khác)' : '')
        : 'Đạt: ' + samples.length + ' mốc đo, 0 vi phạm' + (minSeen !== null ? ' · chữ nhỏ nhất ' + Math.round(minSeen) + ' px' : '') + '.';
      return { result: result, measure: base };
    };
    function describe(v) {
      var who = ROLE_VI[v.role] || v.role;
      if (v.role === 'subtitle' && v.line) who = 'Phụ đề câu ' + v.line;
      else if (v.role === 'block' && v.beat) who = 'Khối của nhịp ' + v.beat;
      if (v.rule === 'S4') return who + ' có chữ ' + Math.round(v.font_px) + ' px, nhỏ hơn mức đọc được ' + v.min_font_px + ' px.';
      return who + ' chạm ' + ZONE_VI[v.edge] + ' (' + EDGE_VI[v.edge] + ').';
    }
    return API;
  }

  var _tpl;
  function defaultTemplates() {
    if (_tpl !== undefined) return _tpl;
    _tpl = null;
    if (isNode) { try { _tpl = require('./thumbs/templates.json').templates; } catch (e) { _tpl = null; } }
    else if (root.GSThumbTemplates) _tpl = root.GSThumbTemplates;
    return _tpl;
  }

  var api = create(isNode ? require('./aspects.json') : (root.GSAspectsData || null));
  if (isNode) module.exports = api; else root.GSAspects = api;
})(typeof self !== 'undefined' ? self : this);
