// © 2026 Gen Labs — All rights reserved.
// Trang sân khấu: dựng plan thành khung hình theo thời gian. API cho render.js: __load(plan) → Promise · __seek(t_ms) · __sfx(names) → {tên: base64 WAV} · __stats().
// Ngân sách hiệu năng (L-42): ≤ 8 nhân vật (MVP vẽ 2); SVG nhân vật chỉ thay khi chuỗi đổi; khối đã "lắng" (settle) không vẽ lại; khối chưa tới giờ bị ẩn.
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
    var map = {};
    ids.forEach(function (cid) {
      var r = JSON.parse(JSON.stringify(plan.cast[cid]));
      r.id = r.id || cid.toLowerCase(); r.kind = r.kind || 'character'; r.version = r.version || 1; r.status = r.status || 'draft'; r.expressions = r.expressions || {}; r.lines = r.lines || {};
      GC.registerAsset('local.my', r); map[cid] = GC.ASSETS['local.my/' + r.id];
      if (!map[cid]) console.error('nhân vật ' + cid + ' không đăng ký được');
    });
    return map;
  }

  window.__load = function (plan) {
    var root = $('stage'); root.innerHTML = '';
    if (plan.fontCss) { var st = document.createElement('style'); st.textContent = plan.fontCss; document.head.appendChild(st); }
    var world = plan.style.world;
    root.innerHTML = '<div class="shake" id="shake"><div class="world" id="world" style="width:' + world.w + 'px;height:' + world.h + 'px"></div>' +
      '<div class="hud" id="hud"><div class="chip-top" id="chipTop"><b></b><span></span></div><div class="sub" id="sub"></div></div></div>';
    var E = { world: $('world'), shake: $('shake'), hud: $('hud'), chip: $('chipTop'), sub: $('sub') };
    var assets = registerCast(plan), dir = Dir.makeDirector(plan);

    // chip góc trái: tiêu đề bài, hiện khi máy quay rời vùng đầu
    var meta = plan.style.meta || {}; E.chip.querySelector('b').textContent = meta.tag || ''; E.chip.querySelector('span').textContent = meta.title || '';
    var z2 = plan.style.zones[1], chipT = z2 ? plan.beats.filter(function (b) { return b.id === z2.beats[0]; })[0].t_in - 200 : Infinity;
    var ov = plan.beats.filter(function (b) { return b.block === 'lesson-map'; }).pop();

    // actors
    var actors = plan.actors.map(function (a, i) {
      var el = U.el('div', 'actor'); el.style.left = (i === 0 ? -40 : 1500) + 'px'; E.hud.insertBefore(el, E.sub);
      return { id: a.id, name: a.name, side: i, el: el, last: '' };
    });
    stats.actors = actors.length;

    // terms
    var terms = []; plan.lines.forEach(function (l) { (l.terms || []).forEach(function (t) { t.split(/\s+/).forEach(function (w) { var n = norm(w); if (n && terms.indexOf(n) < 0) terms.push(n); }); }); });
    var assetUrl = function (a) {
      var u = (plan.assetData && plan.assetData[a]) || (/^data:/.test(a) ? a : '');
      if (!u) console.error('illustration: không nạp được asset ' + String(a).slice(0, 80));
      return u;
    };

    // chuỗi morph: beat có morphFrom dùng chung phần tử của beat đầu chuỗi
    var byId = {}; plan.beats.forEach(function (b) { byId[b.id] = b; });
    var headOf = function (b) { while (b.morphFrom) b = byId[b.morphFrom]; return b; };
    var chains = {}; plan.beats.forEach(function (b) { var h = headOf(b); (chains[h.id] = chains[h.id] || []).push(b); });
    var recs = [];
    Object.keys(chains).forEach(function (hid) {
      var head = byId[hid], def = B.get(head.block), list = chains[hid];
      var chain = list.map(function (b) { return { beat: b, params: b.params, t: (b.t_in - head.t_in) / 1000, peak: b.peak_ms / 1000 }; });
      var ctx = { beat: head, slot: head.slot, plan: plan, chain: chain, peak: chain[0].peak, terms: terms, zones: plan.style.zones, world: world, hud: E.hud, assetUrl: assetUrl };
      var el = def.mount(E.world, head.params, ctx);
      var last = chain[chain.length - 1];
      recs.push({ head: head, def: def, el: el, ctx: ctx, settleAt: def.settle === undefined ? Infinity : last.t + def.settle, drawnSettled: false, shown: null });
    });
    recs.sort(function (a, b) { return a.head.t_in - b.head.t_in; });
    var impacts = plan.beats.filter(function (b) { return B.get(b.block).impact !== undefined; }).map(function (b) { return b.t_in + B.get(b.block).impact * 1000; });

    // phụ đề
    var subs = plan.lines.map(function (l) {
      var html = U.esc(l.say); (l.terms || []).forEach(function (t) { html = html.split(U.esc(t)).join('\u0001' + U.esc(t) + '\u0002'); });
      return { line: l, html: html };
    });
    S = { plan: plan, E: E, recs: recs, dir: dir, actors: actors, assets: assets, subs: subs, curSub: null, subC: [], subOn: -1, chipT: chipT, ov: ov, impacts: impacts, firstSeek: true };
    var fonts = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    var imgs = [].slice.call(E.world.querySelectorAll('img')).map(function (i) { return i.decode ? i.decode().catch(function () { console.error('illustration: ảnh không giải mã được'); }) : Promise.resolve(); });
    return Promise.all([fonts].concat(imgs)).then(function () { window.__seek(0); return { beats: plan.beats.length, actors: actors.length }; });
  };

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

  function drawActor(a, t) {
    var r = S.dir.act(a.id, t), asset = S.assets[a.id], d = r.director;
    var svg = GC.svgString(asset, r.state, { t: t / 1000, director: d });
    if (svg !== a.last) { a.el.innerHTML = svg; a.last = svg; stats.svgRedraws++; }
    var ts = t / 1000, outP = S.ov ? U.eio(U.seg(ts, S.ov.t_in / 1000, S.ov.t_in / 1000 + 1.5)) : 0, zoom = r.talking ? 1.05 : 1, tx = 0, ty = outP * 30;
    if (a.side === 0) ty += (1 - U.eb(U.seg(ts, 0.5, 1.1))) * 300; else tx = U.lerp(520, 0, U.eo(U.seg(ts, 0, 0.95)));
    a.el.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + (zoom * U.lerp(1, 0.82, outP)) + ')';
  }

  window.__seek = function (tMs) {
    var E = S.E, plan = S.plan, c = Cam.sample(plan.camera, tMs);
    stats.seeks++;
    E.world.style.transform = 'translate(' + (960 - c.x * c.z) + 'px,' + (540 - c.y * c.z) + 'px) scale(' + c.z + ')';
    var amp = 0, dt = 0; S.impacts.forEach(function (ti) { var d = (tMs - ti) / 350; if (d > 0 && d < 1) { amp = (1 - d) * 14; dt = tMs - ti; } });
    E.shake.style.transform = amp ? 'translate(' + (Math.sin(dt * 0.09) * amp) + 'px,' + (Math.cos(dt * 0.073) * amp * 0.6) + 'px)' : '';
    S.recs.forEach(function (r) {
      var tl = (tMs - r.head.t_in) / 1000, vis = tl >= 0;
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
    drawSub(tMs);
    return true;
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
