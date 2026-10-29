// © 2026 Gen Labs — All rights reserved.
// Trang sân khấu: dựng plan thành khung hình theo thời gian. API cho render.js: __load(plan) → Promise · __seek(t_ms) · __sfx(names) → {tên: base64 WAV} · __stats().
// Ngân sách hiệu năng (L-42): ≤ 8 nhân vật (MVP vẽ 2); SVG nhân vật chỉ thay khi chuỗi đổi; khối đã "lắng" (settle) không vẽ lại; khối chưa tới giờ bị ẩn.
// 0.2.0 (SPEC §2.1/§6.5, P0b): khối theo `place` — 'fullbleed' (màn hình) vào lớp E.full, 'track' (con trỏ/focus bám đích) vào lớp E.track: cả hai phủ khung 1920×1080,
// KHÔNG chịu máy quay; chỗ đứng nhân vật theo plan.actors[].layout {mode: stage|pip|hidden, x, y, scale} (mặc định = v0.1.x); mode 'pip' = host góc trái dưới (lớp HUD, máy quay không kéo theo);
// plan.style.brand ≠ null ⇒ GSBrand.apply lúc __load và GSBrand.inkFilter mỗi khi SVG nhân vật đổi chuỗi (không mỗi khung). Khối ở tầng 'layers' nhận ctx.layers {full, track, hud, pip}.
// F7 (SPEC-0.2.0-F7 §4.3): plan.layout ≠ null (tỉ lệ không legacy, vd 9:16) ⇒ .stage cỡ plan.size + lớp `lay` (và `a-<token>` chỉ để soi) + biến CSS --lay-* từ
//   GSAspects.layoutVars(plan.layout) đặt SAU GSBrand.apply (CNS-343); máy quay quy về tâm size/2; phụ đề lật trang theo mốc từ (layout.subtitle.paging, CNS-333);
//   window.__measure() → {t_ms, cam, els:[{role, box:[x,y,w,h], …}]} cho G-SAFE (render.js gọi ở aspects.sampleTimes). 16:9 không có lớp/biến mới, không đo (M14).
//   render/aspects.js không có thẻ <script> trong stage.html ⇒ nạp động khi plan có layout (như brand.js nạp render/brand.js).
(function () {
  'use strict';
  var GC = window.GenChibi, B = window.GSBlocks, Cam = window.GSCamera, Dir = window.GSDirect, U = window.GSUtil;
  var MAX_CHARACTERS = 8;
  var S = null, stats = { actors: 0, svgRedraws: 0, blockDraws: 0, seeks: 0 };
  var $ = function (id) { return document.getElementById(id); };

  function norm(w) { return w.toLowerCase().replace(/[.,;:!?"'“”‘’()…]/g, ''); }

  function registerCast(plan) {
    var ids = Object.keys(plan.cast);
    if (ids.length > MAX_CHARACTERS) throw new Error('quá ' + MAX_CHARACTERS + ' nhân vật trên sân khấu');
    if (!GC.PACKS['local.my']) GC.pack({ id: 'local.my', name: 'Của tôi', owner: 'Gen Labs', group: 'mine', visibility: 'private', license: '© 2026 Gen Labs' }, function () {});
    (plan.parts || []).forEach(function (p) { var r = GC.registerDataPart('local.my', p); if (r && r.errors && r.errors.length) console.error('part ' + p.id + ': ' + r.errors.join('; ')); });
    // gói dữ liệu Gen-Chibi (plan.packs = [{json, outline}], gói K): đăng ký TRƯỚC công thức; outline ≠ null ⇒ nhân vật dùng linh kiện của gói đó được viền nướng vào path (opts.outline, không filter)
    var outlineOf = {};
    (plan.packs || []).forEach(function (p) {
      var r = GC.registerDataPack(p.json);
      if (r && r.errors && r.errors.length) console.error('pack ' + (p.json && p.json.id) + ': ' + r.errors.join('; '));
      else if (p.outline) outlineOf[p.json.id] = p.outline;
    });
    var map = {}, outlines = {};
    ids.forEach(function (cid) {
      var r = JSON.parse(JSON.stringify(plan.cast[cid]));
      r.id = r.id || cid.toLowerCase(); r.kind = r.kind || 'character'; r.version = r.version || 1; r.status = r.status || 'draft'; r.expressions = r.expressions || {}; r.lines = r.lines || {};
      GC.registerAsset('local.my', r); map[cid] = GC.ASSETS['local.my/' + r.id];
      if (!map[cid]) console.error('nhân vật ' + cid + ' không đăng ký được');
      else { var parts = (r.look && r.look.parts) || {}; for (var s in parts) { var o = outlineOf[String(parts[s]).split('/')[0]]; if (o) { outlines[cid] = o; break; } } }
    });
    return { assets: map, outlines: outlines };
  }

  function loadAspects() {
    if (window.GSAspects) return Promise.resolve(window.GSAspects);
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = '../aspects.js';
      s.onload = function () { res(window.GSAspects); }; s.onerror = function () { rej(new Error('không nạp được render/aspects.js')); };
      document.head.appendChild(s);
    });
  }
  window.__load = function (plan) { return plan && plan.layout && !window.GSAspects ? loadAspects().then(function () { return load(plan); }) : load(plan); };

  // bố cục theo tỉ lệ (F7): cỡ khung + lớp + biến CSS; logo tối đa = phần còn lại tới mép phải vùng mềm (soft.x1 − logo.tr.x), dữ liệu aspects.json
  function applyLayout(root, plan) {
    var L = plan.layout, w = plan.size[0] + 'px', h = plan.size[1] + 'px';
    root.classList.add('lay', 'a-' + String(plan.aspect || '').replace(':', 'x'));
    [document.documentElement, document.body, root].forEach(function (e) { e.style.width = w; e.style.height = h; });
    var v = window.GSAspects.layoutVars(L);
    if (L.safe && L.safe.soft && L.logo && L.logo.tr) v['--lay-logo-max'] = Math.max(0, L.safe.soft[2] - L.logo.tr[0]) + 'px';
    Object.keys(v).forEach(function (k) { root.style.setProperty(k, String(v[k])); });
  }

  window.GSStageLayout = { load: loadAspects, apply: applyLayout };   // brand.js: xem trước nhận diện view 'thumb' ở tỉ lệ không legacy (không có plan)

  function load(plan) {
    var root = $('stage'); root.innerHTML = '';
    if (plan.fontCss) { var st = document.createElement('style'); st.textContent = plan.fontCss; document.head.appendChild(st); }
    var world = plan.style.world;
    root.innerHTML = '<div class="shake" id="shake"><div class="world" id="world" style="width:' + world.w + 'px;height:' + world.h + 'px"></div>' +
      '<div class="layer-full" id="layerFull"></div><div class="layer-track" id="layerTrack"></div>' +
      '<div class="hud" id="hud"><div class="chip-top" id="chipTop"><b></b><span></span></div><div class="pip" id="pip" style="display:none"></div><div class="sub" id="sub"></div></div></div>';
    var E = { world: $('world'), shake: $('shake'), hud: $('hud'), chip: $('chipTop'), sub: $('sub'), full: $('layerFull'), track: $('layerTrack'), pip: $('pip') };
    if (plan.style.brand && window.GSBrand) window.GSBrand.apply(root, plan.style.brand);   // nhận diện kênh (gói B): biến CSS, logo, lower-third, intro
    if (plan.layout) applyLayout(root, plan);   // F7: sau brand ⇒ biến bố cục thắng (CNS-343)
    // 0.2.x clip dài: cỡ phụ đề theo bài (plan.style.sub_px) + cỡ xuất nhỏ hơn cỡ thiết kế (plan.output) ⇒ CSS zoom cả sân khấu, Chromium vẽ thẳng ở cỡ xuất (chụp 1:1, không clip.scale — L-108)
    if (plan.style.sub_px) { root.style.setProperty('--sub-size', plan.style.sub_px + 'px'); root.style.setProperty('--sub-who-size', Math.round(plan.style.sub_px * 0.92) + 'px'); }
    if (plan.style.sub_maxw) root.style.setProperty('--sub-maxw', plan.style.sub_maxw + 'px');
    if (plan.style.chip === false) E.chip.style.display = 'none';
    if (plan.style.sub_dim) root.style.setProperty('--sub-dim', String(plan.style.sub_dim));
    if (plan.style.text_floor) root.classList.add('tf');   // 0.2.x: sàn chữ (style.css .stage.tf …) + phụ đề ngắt dòng cân bằng
        if (plan.output) root.style.zoom = String(plan.output[0] / plan.size[0]);
    var reg = registerCast(plan), assets = reg.assets, dir = Dir.makeDirector(plan);

    // chip góc trái: tiêu đề bài, hiện khi máy quay rời vùng đầu
    var meta = plan.style.meta || {}; E.chip.querySelector('b').textContent = meta.tag || ''; E.chip.querySelector('span').textContent = meta.title || '';
    var z2 = plan.style.zones[1], chipT = z2 ? plan.beats.filter(function (b) { return b.id === z2.beats[0]; })[0].t_in - 200 : Infinity;
    var ov = plan.beats.filter(function (b) { return b.block === 'lesson-map'; }).pop();

    // actors
    var inkFilter = plan.style.brand && window.GSBrand && window.GSBrand.inkFilter ? function (svg) { return window.GSBrand.inkFilter(svg, plan.style.brand); } : null;
    var actors = plan.actors.map(function (a, i) {
      var L = a.layout || { mode: 'stage', x: i === 0 ? -40 : 1500, y: 0, scale: 1 };   // plan cũ (không có layout) vẫn dựng đúng như v0.1.x
      var act = { id: a.id, name: a.name, side: i, el: null, last: '', lastRaw: '', outline: reg.outlines[a.id] || null, mode: L.mode || 'stage', ox: L.x, oy: L.y || 0, sc: L.scale || 1 };
      if (act.mode === 'hidden') return act;
      act.el = U.el('div', 'actor');
      if (act.mode === 'pip') { E.pip.style.display = ''; E.pip.appendChild(act.el); }
      else { act.el.style.left = (typeof L.x === 'number' ? L.x : (i === 0 ? -40 : 1500)) + 'px'; E.hud.insertBefore(act.el, E.pip); }
      return act;
    });
    stats.actors = actors.filter(function (a) { return a.el; }).length;

    // terms
    var terms = []; plan.lines.forEach(function (l) { (l.terms || []).forEach(function (t) { t.split(/\s+/).forEach(function (w) { var n = norm(w); if (n && terms.indexOf(n) < 0) terms.push(n); }); }); });
    var assetUrl = function (a) {
      var u = (plan.assetData && plan.assetData[a]) || (/^data:/.test(a) ? a : '');
      if (!u) console.error('illustration: không nạp được asset ' + String(a).slice(0, 80));
      return u;
    };

    var actorFx = {};   // {[actorId]: {pip 0..1, cx, cy, r}} — xoá mỗi __seek trước khi vẽ khối (tua ngược vẫn tất định)
    // chuỗi morph: beat có morphFrom dùng chung phần tử của beat đầu chuỗi
    var byId = {}; plan.beats.forEach(function (b) { byId[b.id] = b; });
    var headOf = function (b) { while (b.morphFrom) b = byId[b.morphFrom]; return b; };
    var chains = {}; plan.beats.forEach(function (b) { var h = headOf(b); (chains[h.id] = chains[h.id] || []).push(b); });
    var recs = [];
    Object.keys(chains).forEach(function (hid) {
      var head = byId[hid], def = B.get(head.block), list = chains[hid];
      var chain = list.map(function (b) { return { beat: b, params: b.params, t: (b.t_in - head.t_in) / 1000, peak: b.peak_ms / 1000, cues: b.cues_ms ? b.cues_ms.map(function (x) { return x === null ? null : x / 1000; }) : null }; });
      var ctx = { beat: head, slot: head.slot, plan: plan, chain: chain, peak: chain[0].peak, terms: terms, zones: plan.style.zones, world: world, hud: E.hud, assetUrl: assetUrl,
        layers: { full: E.full, track: E.track, hud: E.hud, pip: E.pip } };
      ctx.aspect = plan.aspect || '16:9';   // F7 §4.5: khối đọc được tỉ lệ (không bắt buộc dùng)
      ctx.cues = chain[0].cues;              // mốc trong khối (giây sau lúc vào; null = mặc định) — khối có `cues` (0.2.x)
      ctx.actorFx = actorFx;                 // khối lái nhân vật (pip-swap) ghi {pip, cx, cy, r} mỗi khung; drawActor đọc
      var parent = def.place === 'fullbleed' ? E.full : def.place === 'track' ? E.track : E.world;   // fullbleed/track không chịu máy quay
      var el = def.mount(parent, head.params, ctx);
      var last = chain[chain.length - 1];
      var settle = def.settleFor ? def.settleFor(head.params, ctx) : def.settle;   // khối có nhịp theo params/cue tự tính lúc lắng (L-42: sau đó không vẽ lại)
      recs.push({ head: head, def: def, el: el, ctx: ctx, settleAt: settle === undefined ? Infinity : last.t + settle, drawnSettled: false, shown: null });
    });
    recs.sort(function (a, b) { return a.head.t_in - b.head.t_in; });
    var impacts = plan.beats.filter(function (b) { return B.get(b.block).impact !== undefined; }).map(function (b) { return b.t_in + B.get(b.block).impact * 1000; });

    // phụ đề
    var subs = plan.lines.map(function (l) {
      var html = U.esc(l.text || l.say); (l.terms || []).forEach(function (t) { html = html.split(U.esc(t)).join('\u0001' + U.esc(t) + '\u0002'); });
      return { line: l, html: html };
    });
    var br = plan.style.brand, brandInk = br && br.tokens && /^#[0-9a-fA-F]{6}$/.test(String(br.tokens.ink || '')) ? br.tokens.ink : null;
    S = { actorFx: actorFx, plan: plan, E: E, ink: inkFilter, brandInk: brandInk, recs: recs, dir: dir, actors: actors, assets: assets, subs: subs, curSub: null, subC: [], subOn: -1, chipT: chipT, ov: ov, impacts: impacts, firstSeek: true, exitMs: plan.style && plan.style.exit_ms || 0 };
    S.poseFade = plan.style.pose_fade_ms > 0 ? plan.style.pose_fade_ms : 0;
    if (!plan.layout && plan.style.sub_page) { S.paging = { cap: plan.style.sub_page, tr: false, balance: true, clause: !!plan.style.sub_clause }; S.subPage = -1; }   // 0.2.x clip dài: câu dài lật trang (≤ cap ký tự/trang) thay vì phủ 3–4 dòng
    if (plan.layout) {   // F7: tâm khung + phụ đề lật trang
      var ls = plan.layout.subtitle || {};
      S.half = [plan.size[0] / 2, plan.size[1] / 2]; S.lastT = 0;
      S.paging = ls.paging ? { cap: Math.max(1, (ls.lines_max | 0) * (ls.chars_per_line | 0)), tr: !!ls.show_translation } : null;
      S.subPage = -1;
    }
    var fonts = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    var imgs = [].slice.call(E.world.querySelectorAll('img')).map(function (i) { return i.decode ? i.decode().catch(function () { console.error('illustration: ảnh không giải mã được'); }) : Promise.resolve(); });
    return Promise.all([fonts].concat(imgs)).then(function () { window.__seek(0); return { beats: plan.beats.length, actors: actors.length }; });
  }

  function drawSub(t) {
    var E = S.E, s = null;
    S.subs.forEach(function (x) { if (t >= x.line.a_ms - 120 && t <= x.line.b_ms + 300) s = x; });
    if (s !== S.curSub) {
      S.curSub = s; S.subOn = -1;
      if (!s) { E.sub.innerHTML = ''; S.subC = []; }
      else {
        var ai = S.actors.filter(function (a) { return a.id === s.line.who; })[0], inEn = false, out = '<span class="who s' + (ai ? ai.side : 0) + '">' + U.esc(ai ? ai.name : '') + ':</span>';
        s.html.split(/(\u0001|\u0002| )/).forEach(function (tok) { if (tok === '\u0001') inEn = true; else if (tok === '\u0002') inEn = false; else if (tok === ' ') out += ' '; else if (tok) out += '<span class="c' + (inEn ? ' en' : '') + '">' + tok + '</span>'; });
        if (s.line.subtitle && s.line.subtitle.en) out += '<span class="tr">' + U.esc(s.line.subtitle.en) + '</span>';
        E.sub.innerHTML = out; S.subC = [].slice.call(E.sub.querySelectorAll('.c'));
      }
    }
    E.sub.style.opacity = s ? 1 : 0;
    if (s) {
      // chữ sáng dần theo mốc từng chữ đã căn (words cùng số chữ với câu); lệch số chữ thì theo tỉ lệ thời gian
      var ws = s.line.words, n = S.subC.length, k = 0;
      if (ws.length === n) { for (var i = 0; i < n; i++) if (t >= ws[i].t0 - 40) k = i + 1; }
      else k = Math.round(U.seg(t, s.line.a_ms, s.line.b_ms) * n);
      if (k !== S.subOn) { S.subOn = k; S.subC.forEach(function (c, j) { c.classList.toggle('on', j < k); }); }
    }
  }

  // ---- phụ đề lật trang (F7 CNS-333): trang = các từ vừa lines_max × chars_per_line ký tự; trang đổi khi từ đang nói (mốc word_times) sang trang mới.
  // Chỉ đổi innerHTML khi sang trang (L-42); tô từ đang nói + đánh dấu thuật ngữ (.en) giữ như 16:9; dòng dịch .tr chỉ khi show_translation.
  function subTokens(s) {
    var toks = [], inEn = false;
    s.html.split(/(\u0001|\u0002| )/).forEach(function (tok) { if (tok === '\u0001') inEn = true; else if (tok === '\u0002') inEn = false; else if (tok && tok !== ' ') toks.push({ h: tok, en: inEn, n: tok.replace(/&[#a-z0-9]+;/gi, 'x').length }); });
    return toks;
  }
  function paginate(toks, cap) {
    var starts = [0], len = 0;
    toks.forEach(function (k, i) { if (len > 0 && len + 1 + k.n > cap) { starts.push(i); len = k.n; } else len += (len > 0 ? 1 : 0) + k.n; });
    return starts;
  }
  // 0.2.x clip dài (phụ đề lật trang ở 16:9): số trang như paginate nhưng chia ĐỀU độ dài giữa các trang ⇒ không còn trang cuối 1–2 chữ mồ côi
  function paginateBalanced(toks, cap) {
    var total = toks.reduce(function (a, k) { return a + k.n + 1; }, -1), pages = paginate(toks, cap).length;
    if (pages < 2) return [0];
    var target = total / pages, starts = [0], len = 0;
    toks.forEach(function (k, i) { var add = (len > 0 ? 1 : 0) + k.n; if (len > 0 && starts.length < pages && (len + add > cap || len + add / 2 > target)) { starts.push(i); len = k.n; } else len += add; });
    return starts;
  }
  // 0.2.x v7 (style.sub_clause): lật trang ở ranh giới vế câu — quy hoạch động chọn chỗ ngắt: mỗi trang ≤ cap ký tự, phạt ngắt không sau dấu câu,
  // phạt trang một chữ (mồ côi), ưu tiên trang dài đều; cho phép thêm 1 trang nếu nhờ đó ngắt đúng vế. Thuần (cùng toks ⇒ cùng kết quả).
  function paginateClause(toks, cap) {
    var n = toks.length, minP = paginate(toks, cap).length;
    if (minP < 2) return [0];
    var punct = toks.map(function (k) { return /[,.:;!?…»)]$/.test(String(k.h).replace(/<[^>]*>/g, '')); });
    var lenOf = function (a, b) { var L = -1; for (var i = a; i < b; i++) L += toks[i].n + 1; return L; };
    var best = null;
    [minP, minP + 1].forEach(function (P) {
      if (P > n) return;
      var target = lenOf(0, n) / P, INF = 1e18, C = [], from = [];
      for (var p = 0; p <= P; p++) { C.push([]); from.push([]); for (var i = 0; i <= n; i++) { C[p].push(INF); from[p].push(-1); } }
      C[0][0] = 0;
      for (var q = 1; q <= P; q++) for (var b = 1; b <= n; b++) for (var a = q - 1; a < b; a++) {
        if (C[q - 1][a] >= INF) continue;
        var L = lenOf(a, b); if (L > cap) continue;
        var cost = C[q - 1][a] + (L - target) * (L - target) / 10 + (b - a === 1 ? 900 : 0) + (b < n && !punct[b - 1] ? 260 : 0);
        if (cost < C[q][b]) { C[q][b] = cost; from[q][b] = a; }
      }
      var total = C[P][n] + (P > minP ? 150 : 0);
      if (C[P][n] < INF && (!best || total < best.c)) { var st = [], b2 = n; for (var q2 = P; q2 > 0; q2--) { var a2 = from[q2][b2]; st.unshift(a2); b2 = a2; } best = { c: total, st: st }; }
    });
    return best ? best.st : paginateBalanced(toks, cap);
  }
  function drawSubPaged(t) {
    var E = S.E, P = S.paging, s = null;
    S.subs.forEach(function (x) { if (t >= x.line.a_ms - 120 && t <= x.line.b_ms + 300) s = x; });
    if (s !== S.curSub) {
      S.curSub = s; S.subOn = -1; S.subPage = -1;
      if (s && !s.toks) { s.toks = subTokens(s); s.pages = P.clause ? paginateClause(s.toks, P.cap) : P.balance ? paginateBalanced(s.toks, P.cap) : paginate(s.toks, P.cap); }
      if (!s) { E.sub.innerHTML = ''; S.subC = []; }
    }
    E.sub.style.opacity = s ? 1 : 0;
    if (!s) return;
    var ws = s.line.words, n = s.toks.length, k = 0;
    if (ws.length === n) { for (var i = 0; i < n; i++) if (t >= ws[i].t0 - 40) k = i + 1; }
    else k = Math.round(U.seg(t, s.line.a_ms, s.line.b_ms) * n);
    var cur = Math.max(0, k - 1), pg = 0;
    while (pg < s.pages.length - 1 && cur >= s.pages[pg + 1]) pg++;
    if (pg !== S.subPage) {
      S.subPage = pg; S.subOn = -1;
      var a0 = s.pages[pg], a1 = pg + 1 < s.pages.length ? s.pages[pg + 1] : n;
      var ai = S.actors.filter(function (a) { return a.id === s.line.who; })[0], out = '<span class="who s' + (ai ? ai.side : 0) + '">' + U.esc(ai ? ai.name : '') + ':</span>';
      for (var j = a0; j < a1; j++) out += (j > a0 ? ' ' : '') + '<span class="c' + (s.toks[j].en ? ' en' : '') + '">' + s.toks[j].h + '</span>';
      if (P.tr && s.line.subtitle && s.line.subtitle.en) out += '<span class="tr">' + U.esc(s.line.subtitle.en) + '</span>';
      E.sub.innerHTML = out; S.subC = [].slice.call(E.sub.querySelectorAll('.c'));
    }
    if (k !== S.subOn) { S.subOn = k; var base = s.pages[pg]; S.subC.forEach(function (c, j) { c.classList.toggle('on', base + j < k); }); }
  }

  function drawActor(a, t) {
    if (!a.el) return;   // layout.mode 'hidden'
    var r = S.dir.act(a.id, t), asset = S.assets[a.id], d = r.director;
    var so = { t: t / 1000, director: d };
    if (a.outline) { so.outline = a.outline; if (S.brandInk) so.ink = S.brandInk; }   // nhân vật của pack: viền nướng vào path + màu mực theo brand ngay trong engine (không hậu xử lý chuỗi)
    var raw = GC.svgString(asset, r.state, so);
    if (S.poseFade) poseFade(a, t, r, raw, so, asset);   // 0.2.x clip dài: hoà tư thế cũ → mới (không giật khi đổi động tác)
    else if (raw !== a.lastRaw) { a.lastRaw = raw; a.last = S.ink && !a.outline ? S.ink(raw) : raw; a.el.innerHTML = a.last; stats.svgRedraws++; }   // inkFilter chỉ chạy khi chuỗi SVG đổi (CNS-088)
    if (a.mode === 'pip') { a.el.style.transform = 'scale(' + (0.52 * a.sc * (r.talking ? 1.04 : 1)) + ')'; return; }   // PiP: không chạy vào/ra theo máy quay
    var ts = t / 1000, outP = S.ov ? U.eio(U.seg(ts, S.ov.t_in / 1000, S.ov.t_in / 1000 + 1.5)) : 0, zoom = r.talking ? 1.05 : 1, tx = 0, ty = outP * 30;
    if (a.side === 0) ty += (1 - U.eb(U.seg(ts, 0.5, 1.1))) * 300; else tx = U.lerp(520, 0, U.eo(U.seg(ts, 0, 0.95)));
    if (r.dx) tx += r.dx;   // 0.2.x: act.move (chạy ra khỏi khung, ló đầu vào)
    if (S.plan.style.talk_lean_px) {   // 0.2.x: người nói nhích về phía giữa khung (vào 0,35 s, ra 0,45 s sau câu) — hàm thuần của t
      var ln = S.plan.lines, lean = 0;
      for (var li = 0; li < ln.length; li++) { var L = ln[li]; if (L.who !== a.id || t < L.a_ms - 200 || t > L.b_ms + 700) continue; lean = Math.max(lean, U.eio(U.seg(t, L.a_ms - 200, L.a_ms + 150)) * (1 - U.eio(U.seg(t, L.b_ms + 250, L.b_ms + 700)))); }
      tx += (a.side === 0 ? 1 : -1) * S.plan.style.talk_lean_px * lean;
    }
    var fx = S.actorFx[a.id], sc0 = a.sc * zoom * U.lerp(1, 0.82, outP);
    if (fx && fx.shot && !(fx.pip > 0)) {   // 0.2.x v7: khối `shot` đặt lại người dẫn theo bố cục cảnh — nội suy chỗ đứng cảnh trước → cảnh này (null = chỗ mặc định)
      var cxb = (typeof a.ox === 'number' ? a.ox : (a.side === 0 ? -40 : 1500)) + 225, sh = fx.shot, mdx = r.dx || 0;
      var T = function (q) { return q ? { x: q.cx - cxb + mdx, y: q.by - 1114, s: a.sc * q.s * zoom } : { x: tx, y: ty + a.oy, s: sc0 }; };
      var P0 = T(sh.from), P1 = T(sh.to);
      if (a.clipped) { a.el.style.clipPath = ''; a.clipped = false; }
      a.el.style.transform = 'translate(' + U.f3(U.lerp(P0.x, P1.x, sh.k)) + 'px,' + U.f3(U.lerp(P0.y, P1.y, sh.k)) + 'px) scale(' + U.f3(U.lerp(P0.s, P1.s, sh.k)) + ')';
      return;
    }
    if (fx && fx.pip > 0) { pipPose(a, fx, tx, ty + a.oy, a.sc * zoom * U.lerp(1, 0.82, outP), r.talking); return; }
    if (a.clipped) { a.el.style.clipPath = ''; a.clipped = false; }
    a.el.style.transform = 'translate(' + tx + 'px,' + (ty + a.oy) + 'px) scale(' + (a.sc * zoom * U.lerp(1, 0.82, outP)) + ')';
  }

  // ---- hoà tư thế (plan.style.pose_fade_ms, 0.2.x clip dài) ----
  // Engine Gen-Chibi không nội suy giữa hai động tác/hoạt động: đổi `motion`/`activity`/`state` là tư thế nhảy trong 1 khung (đo được như cú giật).
  // Khi khoá tư thế (state|motion|activity|view|facing) vừa đổi trong ≤ pose_fade_ms, vẽ thêm tư thế CŨ (đạo diễn tại t − k·33 ms, cùng t) đè lên và mờ dần 1 → 0.
  // Tất định: chỉ phụ thuộc (plan, t) — tua tới/lui ra cùng kết quả. L-42: chỉ trong lúc chuyển mới có hai SVG; mỗi khung ≤ ceil(fade/33) lần gọi đạo diễn (thuần JS).
  function poseKey(r) { var d = r.director; return r.state + '|' + (d.motion || '') + '|' + (d.activity || '') + '|' + (d.view || '') + '|' + (d.facing || ''); }
  function poseFade(a, t, r, raw, so, asset) {
    if (!a.pfNew) { a.el.innerHTML = '<div class="pf"></div><div class="pf"></div>'; a.pfNew = a.el.children[0]; a.pfOld = a.el.children[1]; a.pfOldRaw = ''; }
    if (raw !== a.lastRaw) { a.lastRaw = raw; a.pfNew.innerHTML = S.ink && !a.outline ? S.ink(raw) : raw; stats.svgRedraws++; }
    var F = S.poseFade, step = 1000 / 30, k = poseKey(r), old = null, el = 0;
    for (var j = 1; j * step <= F + 0.5; j++) { var q = S.dir.act(a.id, t - j * step); if (poseKey(q) !== k) { old = q; el = (j - 0.5) * step; break; } }
    var op = old ? U.clamp(1 - el / F) : 0;
    if (op > 0.02) {
      var o2 = { t: so.t, director: old.director }; if (so.outline) o2.outline = so.outline; if (so.ink) o2.ink = so.ink;
      var oraw = GC.svgString(asset, old.state, o2);
      if (oraw !== a.pfOldRaw) { a.pfOldRaw = oraw; a.pfOld.innerHTML = S.ink && !a.outline ? S.ink(oraw) : oraw; }
      a.pfOld.style.opacity = U.f3(U.eio(op)); a.pfOld.style.visibility = '';
    } else if (a.pfOld.style.visibility !== 'hidden') { a.pfOld.style.visibility = 'hidden'; a.pfOld.style.opacity = '0'; }
  }

  // PiP tròn do khối pip-swap lái (0.2.x): nội suy từ chỗ đứng sân khấu tới vòng tròn {cx, cy, r} (toạ độ khung), vòng cắt thu theo log (không pop).
  // Hộp nhân vật 450×540, gốc biến đổi = giữa đáy; khung PiP = đầu + vai: tâm đầu (cục bộ 225, 290 — dáng chibi mặc định) đặt hơi dưới tâm vòng (cy + 0,12 r),
  // cỡ 0,65·r/112,5 (đầu ≈ rộng bằng bán kính). L-42: mỗi khung chỉ đổi transform + clip-path của MỘT phần tử nhân vật.
  function pipPose(a, fx, tx0, ty0, sc0, talking) {
    var k = fx.pip, ox = (typeof a.ox === 'number' ? a.ox : (a.side === 0 ? -40 : 1500)) + 225, oy = (S.half ? S.half[1] * 2 : 1080) + 34;
    var s1 = 0.65 * fx.r / 112.5 * (talking ? 1.03 : 1), bx = U.lerp(ox + tx0, fx.cx, k), by = U.lerp(oy + ty0, fx.cy + fx.r * 0.12 + 250 * s1, k), s = U.lerp(sc0, s1, k);
    a.el.style.transform = 'translate(' + U.f3(bx - ox) + 'px,' + U.f3(by - oy) + 'px) scale(' + U.f3(s) + ')';
    // bán kính vòng cắt (khung) đi theo log: 1700 px (phủ cả khung) → r; đổi sang toạ độ cục bộ của hộp (trước biến đổi)
    var R = Math.exp(U.lerp(Math.log(1700), Math.log(fx.r), k)), lx = (fx.cx - bx) / s + 225, ly = (fx.cy - by) / s + 540;
    a.el.style.clipPath = 'circle(' + U.f3(R / s) + 'px at ' + U.f3(lx) + 'px ' + U.f3(ly) + 'px)'; a.clipped = true;
  }

  window.__seek = function (tMs) {
    var E = S.E, plan = S.plan, c = Cam.sample(plan.camera, tMs);
    stats.seeks++;
    if (S.half) { S.lastT = tMs; E.world.style.transform = 'translate(' + (S.half[0] - c.x * c.z) + 'px,' + (S.half[1] - c.y * c.z) + 'px) scale(' + c.z + ')'; }   // F7: tâm khung theo plan.size
    else E.world.style.transform = 'translate(' + (960 - c.x * c.z) + 'px,' + (540 - c.y * c.z) + 'px) scale(' + c.z + ')';
    var amp = 0, dt = 0; S.impacts.forEach(function (ti) { var d = (tMs - ti) / 350; if (d > 0 && d < 1) { amp = (1 - d) * 14; dt = tMs - ti; } });
    E.shake.style.transform = amp ? 'translate(' + (Math.sin(dt * 0.09) * amp) + 'px,' + (Math.cos(dt * 0.073) * amp * 0.6) + 'px)' : '';
    for (var fk in S.actorFx) delete S.actorFx[fk];
    S.recs.forEach(function (r) {
      var tl = (tMs - r.head.t_in) / 1000, vis = tl >= 0;
      // exit_ms (0.2.x): khối mờ + trượt lên trong exit_ms trước lúc máy quay rời vùng (t_leave), rồi ẩn — không thẻ nào biến mất trong 1 khung; tất định theo t
      var lv = S.exitMs && r.head.t_leave !== undefined ? r.head.t_leave : null;
      if (lv !== null) {
        var ex = U.seg(tMs, lv - S.exitMs, lv), exv = U.eio(ex);
        if (tMs >= lv) vis = false;
        var key = vis && ex > 0 ? exv.toFixed(4) : '';
        if (key !== r.exitKey) { r.exitKey = key; r.el.style.filter = key ? 'opacity(' + (1 - exv).toFixed(4) + ')' : ''; r.el.style.translate = key ? '0 ' + (-50 * exv).toFixed(2) + 'px' : ''; }
      }
      if (vis !== r.shown) { r.el.style.visibility = vis ? 'visible' : 'hidden'; r.shown = vis; }
      if (!vis) { r.drawnSettled = false; return; }
      var settled = tl >= r.settleAt;
      if (settled && r.drawnSettled) return;
      r.def.draw(r.el, tl, r.ctx); stats.blockDraws++;
      r.drawnSettled = settled;
    });
    var ts = tMs, ct = U.eo(U.seg(ts, S.chipT + 200, S.chipT + 750)), cOut = S.ov ? 1 - U.seg(ts, S.ov.t_in, S.ov.t_in + 400) : 1;
    U.setT(E.chip, 'translate(' + ((1 - ct) * -60) + 'px,' + ((1 - ct) * -90) + 'px) scale(' + U.lerp(0.7, 1, ct) + ')', ct * cOut);
    S.actors.forEach(function (a) { drawActor(a, tMs); });
    if (S.paging) drawSubPaged(tMs); else drawSub(tMs);
    return true;
  };

  // ---- đo vùng an toàn (F7 §4.3, G-SAFE): CHỈ gọi khi plan có layout (render.js, ở mốc aspects.sampleTimes, ngay sau __seek của khung gần nhất) ----
  // → {t_ms, cam:{x,y,z}, els:[{role, box:[x,y,w,h] (px khung, đã qua máy quay), line?, beat?, zone?, block?, id?, font_px_min?}]}
  //   role: subtitle | logo | intro | block (khối trang vở đang hiện, trong khung) | end_card | actor_head (40 % trên của hộp nhân vật).
  //   font_px_min (khối) = min(font-size tính × tỉ lệ hiệu dụng) trên ≤ 300 phần tử có chữ của khối; tỉ lệ hiệu dụng = hộp hiển thị / hộp bố cục (gồm z máy quay + biến đổi khối).
  var MEASURE_TEXT_MAX = 300;
  var r1 = function (n) { return Math.round(n * 10) / 10; };
  function shown(el) { if (!el) return false; var cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.01; }
  function boxOf(el) { var r = el.getBoundingClientRect(); return [r1(r.left), r1(r.top), r1(r.width), r1(r.height)]; }
  function hasText(el) { for (var c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 3 && c.nodeValue.trim()) return true; return false; }
  function fontMin(root) {
    var all = [root].concat([].slice.call(root.querySelectorAll('*'))), n = 0, min = null;
    for (var i = 0; i < all.length && n < MEASURE_TEXT_MAX; i++) {
      var e = all[i]; if (!hasText(e)) continue; n++;
      if (!(e.offsetWidth > 0 && e.offsetHeight > 0)) continue;   // SVG / không hiển thị
      var cs = getComputedStyle(e); if (cs.visibility === 'hidden' || parseFloat(cs.opacity) <= 0.01) continue;
      var r = e.getBoundingClientRect(), sc = Math.min(r.width / e.offsetWidth, r.height / e.offsetHeight), px = parseFloat(cs.fontSize) * sc;
      if (isFinite(px) && (min === null || px < min)) min = px;
    }
    return min === null ? null : r1(min);
  }
  function beatAt(rec, t) { var b = rec.head; rec.ctx.chain.forEach(function (c) { if (c.beat.t_in <= t) b = c.beat; }); return b; }
  window.__measure = function () {
    var plan = S.plan, E = S.E, t = S.lastT === undefined ? 0 : S.lastT, c = Cam.sample(plan.camera, t), els = [];
    var W = plan.size[0], H = plan.size[1], inFrame = function (b) { return b[2] > 0 && b[3] > 0 && b[0] < W && b[1] < H && b[0] + b[2] > 0 && b[1] + b[3] > 0; };
    if (S.curSub && shown(E.sub) && E.sub.textContent) els.push({ role: 'subtitle', line: S.curSub.line.id, box: boxOf(E.sub) });
    [].forEach.call(E.hud.querySelectorAll('.brand-logo'), function (el) { if (shown(el)) els.push({ role: 'logo', box: boxOf(el) }); });
    var intro = E.hud.querySelector('.intro');
    if (intro && shown(intro)) [].forEach.call(intro.querySelectorAll('.name, .mark'), function (el) { if (shown(el)) els.push({ role: 'intro', box: boxOf(el) }); });
    S.recs.forEach(function (r) {
      if (!r.shown) return;
      var b = beatAt(r, t), place = r.def.place;
      if (r.head.block === 'end-card') { if (shown(r.el)) els.push({ role: 'end_card', beat: b.id, box: boxOf(r.el) }); return; }
      if (place === 'hud' || place === 'fullbleed' || place === 'track') return;
      var bx = boxOf(r.el); if (!inFrame(bx)) return;
      var e = { role: 'block', block: r.head.block, beat: b.id, zone: b.zone || null, box: bx }, f = fontMin(r.el);
      if (f !== null) e.font_px_min = f;
      els.push(e);
    });
    S.actors.forEach(function (a) { if (!a.el) return; var r = a.el.getBoundingClientRect(); els.push({ role: 'actor_head', id: a.id, box: [r1(r.left), r1(r.top), r1(r.width), r1(r.height * 0.4)] }); });
    return { t_ms: Math.round(t), cam: { x: r1(c.x), y: r1(c.y), z: Math.round(c.z * 1e4) / 1e4 }, els: els };
  };

  window.__sfx = function (names) {
    var out = {}, chain = Promise.resolve();
    names.forEach(function (n) {
      chain = chain.then(function () { return GC.audio.renderWav(n, { sampleRate: 48000 }); }).then(function (buf) {
        var s = '', u = new Uint8Array(buf); for (var i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); out[n] = btoa(s);
      });
    });
    return chain.then(function () { return out; });
  };
  window.__stats = function () { return JSON.parse(JSON.stringify(stats)); };
})();
