// © 2026 Gen Labs — All rights reserved.
// Nhận diện kênh trên sân khấu (SPEC-0.2.0 §4.4–4.5, gói B). Nạp SAU stage.js/still.js.
//   GSBrand.apply(rootEl, brand) — stage.js gọi MỘT lần lúc __load khi plan.style.brand ≠ null: đặt biến CSS --v-* (brand.vars đã tính sẵn ở render/brand.js),
//     gắn logo, dựng lower-third + intro (HUD; chuyển động chỉ transform/opacity, là hàm thuần của t ⇒ seek tuỳ ý vẫn tất định).
//   GSBrand.inkFilter(svg, brand) → svg — thay GC.INK (#2b211d) bằng brand.tokens.ink trong SVG nhân vật; stage.js CHỈ gọi khi chuỗi SVG đổi (CNS-088), không mỗi khung.
//   GSStill.brand(payload) — xem trước nhận diện (renderStill mode 'brand'): view 'mid' (khung giữa bài: KOL + phụ đề + lower-third) · 'card' (thẻ kết) · 'thumb' (ảnh bìa mẫu).
// apply(rootEl, brand) không nhận plan, mà logo/lower-third cần plan.assetData/lines ⇒ file này bọc __load để giữ plan hiện hành và bọc __seek để chạy tick(t) (không sửa stage.js).
// F7 (SPEC-0.2.0-F7 §5.3): plan.layout ≠ null ⇒ góc logo đổi theo layout.logo.remap (bl→tl, br→tr ở 9:16); layout.lower_third === false ⇒ không dựng lower-third;
//   GSStill.brand nhận payload.aspect + payload.layout/size (route xem trước cấp) ⇒ view 'thumb' dựng khung dọc; view mid/card dựng theo plan đã có layout.
(function () {
  'use strict';
  var U = window.GSUtil, GC = window.GenChibi;
  var plan = null, ST = null;
  var isTop = function (v) { return v !== null && typeof v === 'object'; };

  function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function setVars(root, brand) {
    var v = brand && brand.vars;
    if (isTop(v)) Object.keys(v).forEach(function (k) { if (/^--[a-z0-9-]+$/.test(k)) root.style.setProperty(k, String(v[k])); });
  }
  function logoUrl(brand, p) {
    var ref = brand && brand.logo && brand.logo.ref, d = (p && p.assetData) || {};
    if (!(brand && brand.logo)) return '';
    if (ref && d[ref]) return d[ref];
    var ks = Object.keys(d);   // render_still của agent: assetRefs chỉ có mã AS-… ⇒ chưa có ref, lấy asset đã phân giải đầu tiên
    return !ref && ks.length === 1 ? d[ks[0]] : '';
  }
  // câu thoại đầu tiên của từng người nói ⇒ lịch lower-third [{t0,t1,text,side}]
  function ltSchedule(brand, p) {
    var lt = brand.lower_third, seen = {}, out = [];
    (p.lines || []).forEach(function (l) {
      if (seen[l.who]) return; seen[l.who] = true;
      var c = (p.cast && p.cast[l.who]) || {}, a = (p.actors || []).filter(function (x) { return x.id === l.who; })[0] || {};
      var name = a.name || c.name || '', role = c.role || c.role_label || '';
      var text = lt.text.split('{name}').join(name).split('{role}').join(role);
      if (!role) text = text.replace(/\s*[·|–-]\s*$/, '').replace(/^\s*[·|–-]\s*/, '');
      out.push({ t0: l.a_ms, t1: l.a_ms + lt.duration_ms, text: text.trim(), side: a.side === 'right' ? 'r' : 'l' });
    });
    return out;
  }

  // góc logo theo bố cục tỉ lệ (layout.logo.remap); 16:9 / không layout ⇒ giữ nguyên
  function cornerFor(corner, layout) {
    var rm = layout && !layout.legacy && layout.logo && layout.logo.remap;
    return rm && rm[corner] ? rm[corner] : corner;
  }

  function apply(rootEl, brand) {
    if (!brand) return;
    var lay = plan && plan.layout && !plan.layout.legacy ? plan.layout : null;
    setVars(rootEl, brand);
    rootEl.classList.add('brand');
    if (brand.subtitle && brand.subtitle.position === 'top') rootEl.classList.add('sub-top');
    if (brand.subtitle && brand.subtitle.plate === 'card') rootEl.classList.add('sub-plate-card');
    var hud = rootEl.querySelector('#hud') || rootEl, p = plan || {}, st = { brand: brand, lt: null, ltEl: null, ltSched: [], ltKey: '', intro: null, ready: [] };
    var url = logoUrl(brand, p);
    if (url && brand.logo.show.indexOf('video') >= 0) {
      var im = mk('img', 'brand-logo ' + cornerFor(brand.logo.corner, lay)); im.alt = ''; im.src = url; hud.appendChild(im);
      if (im.decode) st.ready.push(im.decode().catch(function () { console.error('brand: logo không giải mã được'); }));
    }
    if (brand.lower_third && brand.lower_third.enabled && !(lay && lay.lower_third === false)) {
      st.ltSched = ltSchedule(brand, p);
      st.ltEl = mk('div', 'lower-third ' + brand.lower_third.style); hud.appendChild(st.ltEl);
    }
    var bi = brand.intro;
    if (bi && bi.enabled && bi.kind !== 'none') {
      var ov = mk('div', 'intro'), mark = null, wipe = null, name = null;
      if (bi.kind === 'logo-pop') {
        if (url) { mark = mk('img', 'mark'); mark.alt = ''; mark.src = url; ov.appendChild(mark); if (mark.decode) st.ready.push(mark.decode().catch(function () {})); }
        else { mark = mk('div', 'name', (p.style && p.style.meta && p.style.meta.title) || ''); ov.appendChild(mark); }
      } else {
        wipe = mk('div', 'wipe'); name = mk('div', 'name', (p.style && p.style.meta && p.style.meta.title) || '');
        ov.appendChild(wipe); ov.appendChild(name);
      }
      hud.appendChild(ov);
      st.intro = { el: ov, mark: mark, wipe: wipe, name: name, dur: bi.duration_ms, kind: bi.kind, hidden: false };
    }
    ST = st;
  }

  function tickIntro(i, t) {
    var d = i.dur;
    if (t >= d) { if (!i.hidden) { i.el.style.visibility = 'hidden'; i.hidden = true; } return; }
    if (i.hidden) { i.el.style.visibility = 'visible'; i.hidden = false; }
    i.el.style.opacity = 1 - U.eio(U.seg(t, d * 0.72, d));
    if (i.kind === 'logo-pop') {
      var p = U.seg(t, 0, d * 0.45); U.setT(i.mark, 'scale(' + U.eb(p) + ')', U.clamp(p * 2));
    } else {
      var a = U.eo(U.seg(t, 0, d * 0.35)), b = U.eio(U.seg(t, d * 0.55, d * 0.9));
      i.wipe.style.transform = 'translateX(' + ((a - 1) * 100 + b * 100) + '%)';
      var np = U.eo(U.seg(t, d * 0.3, d * 0.55)); U.setT(i.name, 'translateY(' + ((1 - np) * 40) + 'px)', np * (1 - b));
    }
  }
  function tickLower(s, t) {
    var cur = null; s.ltSched.forEach(function (e) { if (t >= e.t0 && t <= e.t1) cur = e; });
    var el = s.ltEl;
    if (!cur) { if (s.ltKey !== '') { s.ltKey = ''; el.style.opacity = 0; } return; }
    var key = cur.t0 + '|' + cur.side + '|' + cur.text;
    if (key !== s.ltKey) { s.ltKey = key; el.textContent = cur.text; el.className = 'lower-third ' + s.brand.lower_third.style + ' ' + cur.side; }
    var inP = U.eo(U.seg(t, cur.t0, cur.t0 + 320)), outP = U.seg(t, cur.t1 - 320, cur.t1);
    U.setT(el, 'translateX(' + ((1 - inP) * (cur.side === 'r' ? 80 : -80)) + 'px)', inP * (1 - outP));
  }
  function tick(t) { if (!ST) return; if (ST.intro) tickIntro(ST.intro, t); if (ST.ltEl) tickLower(ST, t); }

  var legacy = null;
  function inkFilter(svg, brand) {
    var ink = brand && brand.tokens && brand.tokens.ink;
    if (!ink || !GC || !GC.INK) return svg;
    if (!legacy) legacy = new RegExp(GC.INK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return svg.replace(legacy, ink);
  }

  window.GSBrand = { stub: false, apply: apply, inkFilter: inkFilter, tick: tick };

  // ---- bọc __load / __seek (xem đầu file) ----
  var origLoad = window.__load, origSeek = window.__seek;
  if (origLoad) window.__load = function (p) {
    plan = p; ST = null;
    return Promise.resolve(origLoad.apply(this, arguments)).then(function (r) {
      return ST && ST.ready.length ? Promise.all(ST.ready).then(function () { window.__seek(0); return r; }) : r;
    });
  };
  if (origSeek) window.__seek = function (t) { var r = origSeek.apply(this, arguments); tick(t); return r; };

  // ---- xem trước nhận diện (still) ----
  function count(s, re) { var m = s.match(re); return m ? m.length : 0; }
  function inkMeasure(brand) {
    var legacyRe = new RegExp(GC && GC.INK ? GC.INK : '#2b211d', 'gi'), inkRe = new RegExp(brand.tokens.ink, 'gi'), l = 0, b = 0, n = 0;
    [].slice.call(document.querySelectorAll('.actor')).forEach(function (a) { n++; l += count(a.innerHTML, legacyRe); b += count(a.innerHTML, inkRe); });
    return { actors: n, legacyInk: l, brandInk: b };
  }
  function lastEnd(p) { return p.lines.length ? p.lines[p.lines.length - 1].b_ms : 0; }
  function stillPlan(payload, view) {
    var p = payload.plan;
    if (!p || !p.style) return Promise.reject(new Error('GSStill.brand view "' + view + '" cần payload.plan (plan đã dựng bằng buildPlan, style.brand ≠ null)'));
    if (payload.assetData) p.assetData = Object.assign({}, p.assetData, payload.assetData);
    if (payload.fontCss) p.fontCss = payload.fontCss;
    var t = typeof payload.t_ms === 'number' ? payload.t_ms : null;
    if (t === null) {
      var ec = p.beats.filter(function (b) { return b.block === 'end-card'; }).pop(), l0 = p.lines[0];
      t = view === 'card' ? (ec ? ec.t_in + 900 : Math.max(0, p.duration_ms - 600)) : (l0 ? l0.a_ms + Math.min(1500, (l0.b_ms - l0.a_ms) * 0.6) : 0);
    }
    return Promise.resolve(window.__load(p)).then(function () { window.__seek(t); return t; });
  }
  function thumbView(payload) {
    var root = document.getElementById('stage'), brand = payload.brand;
    root.innerHTML = '';
    setVars(root, brand); root.classList.add('brand');
    var lay = payload.layout && !payload.layout.legacy && Array.isArray(payload.size) && window.GSStageLayout ? payload.layout : null;
    if (lay) return window.GSStageLayout.load().then(function () { window.GSStageLayout.apply(root, { layout: lay, size: payload.size, aspect: payload.aspect }); return thumbBody(root, brand, payload, lay); });
    return thumbBody(root, brand, payload, null);
  }
  function thumbBody(root, brand, payload, lay) {
    var box = mk('div', 'brand-thumb'), th = brand.thumb || {};
    box.appendChild(mk('div', 'kick ' + (th.kicker_style === 'plain' ? 'plain' : 'plate'), payload.kicker || 'Bài 12 · Nhập môn A.I.'));
    box.appendChild(mk('div', 'tt', payload.title || 'Vì sao A.I. sai mà vẫn tự tin?'));
    box.appendChild(mk('div', 'bar'));
    var url = logoUrl(brand, payload), done = [];
    if (url && brand.logo.show.indexOf('thumb') >= 0) {
      var im = mk('img', 'brand-logo ' + cornerFor(th.corner || brand.logo.corner, lay)); im.alt = ''; im.src = url; box.appendChild(im);
      if (im.decode) done.push(im.decode().catch(function () {}));
    }
    root.appendChild(box);
    return Promise.all(done).then(function () { return { view: 'thumb', logo: !!(url && done.length) }; });
  }

  // render/brand.js (UMD) không có thẻ <script> trong stage.html ⇒ nạp động khi cần chuẩn hoá bản thô (render_still của agent gửi brand chưa chuẩn hoá)
  function ensureData() {
    if (window.GSBrandData) return Promise.resolve(window.GSBrandData);
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = '../brand.js';
      s.onload = function () { res(window.GSBrandData); }; s.onerror = function () { rej(new Error('không nạp được render/brand.js')); };
      document.head.appendChild(s);
    });
  }
  var GS = window.GSStill = window.GSStill || {};
  // payload: { view?: 'mid'|'card'|'thumb' (mặc định mid nếu có plan, không thì thumb), brand?: bản thô hoặc đã chuẩn hoá, plan?: plan đã dựng (view mid/card), t_ms?, kicker?, title?, assetData?, fontCss? }
  GS.brand = function (payload) {
    payload = payload || {};
    var view = payload.view || (payload.plan ? 'mid' : 'thumb');
    if (['mid', 'card', 'thumb'].indexOf(view) < 0) return Promise.reject(new Error('GSStill.brand view phải là mid|card|thumb'));
    if (view !== 'thumb' && !(payload.plan && payload.plan.style)) return Promise.reject(new Error('GSStill.brand view "' + view + '" cần payload.plan (plan đã dựng bằng buildPlan)'));
    if (payload.fontCss) { var st = document.createElement('style'); st.textContent = payload.fontCss; document.head.appendChild(st); }
    return ensureData().then(function (D) {
      var raw = payload.brand || (payload.plan && payload.plan.style && payload.plan.style.brand) || {};
      var brand = D.normalize({ brand: raw });
      brand.hash = raw.hash || null;   // hash thật tính ở Node (SHA-256); bản trình duyệt chỉ là dự phòng nên KHÔNG dùng
      if (view === 'thumb') return thumbView(Object.assign({}, payload, { brand: brand })).then(function (m) { return Object.assign({ mode: 'brand', stub: false, brand_hash: brand.hash }, m); });
      payload.plan.style.brand = brand;
      return stillPlan(payload, view).then(function (t) {
        var m = { mode: 'brand', stub: false, view: view, t_ms: t, brand_hash: brand.hash, ink: inkMeasure(brand), logo: !!document.querySelector('.brand-logo'),
          lower_third: ST && ST.ltEl && ST.ltKey ? ST.ltEl.textContent : '', intro: !!(ST && ST.intro && !ST.intro.hidden) };
        m.paper = getComputedStyle(document.getElementById('stage')).backgroundColor;
        return m;
      });
    });
  };
  GS.brand.stub = false;
})();
