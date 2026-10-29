// © 2026 Gen Labs — All rights reserved.
// Khối `sticky-tracker` (K18 + K15): tờ giấy nhớ góc phải trên giữ SUỐT video, lấp dần từng dòng (vd RÕ VIỆC · MÌNH DUYỆT · ĐỦ ĐỒ · HẸP QUYỀN).
// Mỗi beat là một hành động; trạng thái (các dòng đã có) suy ra từ mọi beat sticky-tracker trước nó trong plan ⇒ tua tới/lui đều tất định.
//   action 'show'   : tờ giấy trượt vào, các ô số trống (đầu video).
//   action 'add'    : cụm chữ `text` hiện to giữa khung rồi bay theo vòng cung vào ô kế tiếp — hoặc ô `slot` (0-based) — (fly_at = lúc bay), tờ giấy nảy nhẹ.
//   action 'review' : tờ giấy phóng to ra giữa khung (trang vở phía sau phủ nền giấy mờ 88 %), các dòng úp lại (chỉ còn số), rồi lật từng dòng theo flip_at[i] (K15 formula-grid).
//   action 'hide'   : tờ giấy rút lên.
// Tham số: { action, text?: ≤18 (add), from?: near (mặc định, cạnh tờ giấy) | center (giữa khung), title?: ≤24 (beat đầu quyết định; mặc định "Giao việc cho agent"), slots?: 2–6 (beat đầu; mặc định 4), fly_at?: cue, flip_at?: cue[] (≤6) }
// Lớp: HUD (không theo máy quay). Toạ độ khung: 16:9 góc phải trên (x 1550–1880, y 36); 9:16 dưới thanh trên nền tảng (y 300).
// Ngân sách (L-42): ≤ 8 phần tử động (tờ giấy, chip bay, ≤ 6 dòng); chỉ transform/opacity; beat bị beat sau thay thì ẩn và lắng.
(function (root) {
  'use strict';
  var U = (typeof module === 'object' && module.exports) ? require('./util') : root.GSUtil;
  var ACTIONS = ['show', 'add', 'review', 'hide'];
  // trạng thái tại beat: danh sách beat sticky theo thời gian, chỉ mục beat này, các dòng đã có TRƯỚC beat, beat kế (để nhường chỗ)
  function stateOf(plan, beat) {
    var all = plan.beats.filter(function (b) { return b.block === 'sticky-tracker'; }).sort(function (a, b) { return a.t_in - b.t_in; });
    var i = all.indexOf(all.filter(function (b) { return b.id === beat.id; })[0]), first = all[0].params;
    var lines = [], shown = false;
    // 0.2.x: `slot` (0-based) đặt cụm vào đúng dòng (vd thứ tự ôn khác thứ tự gieo); thiếu ⇒ dòng trống đầu tiên (như cũ)
    var free = function (pp) { if (typeof pp.slot === 'number') return pp.slot; var k = 0; while (lines[k] !== undefined) k++; return k; };
    for (var j = 0; j < i; j++) { var a = all[j].params.action; if (a === 'add') lines[free(all[j].params)] = all[j].params.text; if (a === 'hide') shown = false; else shown = true; }
    return { idx: i, lines: lines, mine: all[i].params.action === 'add' ? free(all[i].params) : -1, shown: shown, next: all[i + 1] || null, title: first.title === undefined ? 'Giao việc cho agent' : first.title, slots: first.slots || 4 };
  }
  // nx/ny: điểm chip hiện ra mặc định (cạnh tờ giấy, không đè giữa khung nội dung); cx/cy: giữa khung (from 'center', review)
  var geo = function (aspect) { return aspect === '9:16' ? { x: 1080 - 72 - 330, y: 300, cx: 540, cy: 760, nx: 560, ny: 720, big: 2.3 } : { x: 1920 - 40 - 330, y: 36, cx: 960, cy: 470, nx: 1300, ny: 400, big: 2.0 }; };
  var ROW = 54, HEAD = 64;
  function timing(p, cues) {
    var fly = cues && typeof cues[0] === 'number' ? cues[0] : 1.1;
    // lật mở không sớm hơn lúc úp xong (1,6 s) và cách nhau ≥ 0,35 s
    var flips = [0, 0, 0, 0, 0, 0].map(function (_, i) { return cues && typeof cues[1 + i] === 'number' ? cues[1 + i] : 2.0 + 1.2 * i; });
    // giãn ≥ 0,35 s giữa hai dòng liền nhau khi mốc theo thứ tự; mốc NGƯỢC thứ tự dòng (ôn theo thứ tự khác lúc gieo) giữ nguyên đúng lời
    var raw = flips.slice();
    for (var i = 0; i < flips.length; i++) flips[i] = Math.max(flips[i], 1.6, i && raw[i] >= raw[i - 1] ? flips[i - 1] + 0.35 : 0);
    return { fly: fly, flips: flips };
  }
  var block = {
    name: 'sticky-tracker', version: 1, place: 'hud', stackOn: [], peak: 1.1,
    schema: { type: 'object', required: ['action'], additionalProperties: false, properties: {
      action: { type: 'string', enum: ACTIONS }, text: { type: 'string', minLength: 1, maxLength: 18 },
      title: { type: 'string', maxLength: 24 }, from: { type: 'string', enum: ['near', 'center'] }, slots: { type: 'integer', minimum: 2, maximum: 6 },
      slot: { type: 'integer', minimum: 0, maximum: 5 }, fly_at: { type: 'cue' }, flip_at: { type: 'array', maxItems: 6, items: { type: 'cue' } } } },
    check: function (p) {
      var e = [];
      if (p.action === 'add' && !p.text) e.push('params.text: hành động "add" cần cụm chữ bay vào tờ giấy');
      if (p.action !== 'add' && p.text !== undefined) e.push('params.text: chỉ dùng với action "add"');
      if (p.flip_at && p.action !== 'review') e.push('params.flip_at: chỉ dùng với action "review"');
      if (p.slot !== undefined && p.action !== 'add') e.push('params.slot: chỉ dùng với action "add"');
      return e;
    },
    cues: function (p) { return [p.fly_at].concat(p.flip_at || []); },
    // dựng trước giờ nhường chỗ cho beat sticky kế ⇒ lắng ngay sau đó (ẩn, không vẽ lại)
    settleFor: function (p, ctx) { var s = stateOf(ctx.plan, ctx.beat); return s.next ? (s.next.t_in - ctx.beat.t_in) / 1000 + 0.02 : (p.action === 'review' ? timing(p, ctx.cues).flips[s.slots - 1] + 1 : 2.5); },
    footprint: function () { return { w: 0, h: 0 }; },
    sfx: [{ at: 'in', name: 'swish', vol: 0.3 }],
    sfxTimed: function (p, cues) {
      var T = timing(p, cues);
      if (p.action === 'add') return [{ t: 0, name: 'pop', vol: 0.35 }, { t: T.fly, name: 'zip', vol: 0.3 }, { t: T.fly + 0.7, name: 'chime', vol: 0.35 }];
      if (p.action === 'review') return [{ t: 0, name: 'whoosh', vol: 0.3 }].concat((p.flip_at || [0, 0, 0, 0]).map(function (_, i) { return { t: T.flips[i], name: 'swish', vol: 0.3 }; }));
      return [{ t: 0, name: p.action === 'hide' ? 'slide-up' : 'slide-down', vol: 0.25 }];
    },
    mount: function (world, p, ctx) {
      var S = stateOf(ctx.plan, ctx.beat), G = geo(ctx.aspect), box = U.el('div', 'b-sticky');
      var h = (p.action === 'review' ? '<div class="sk-dim" style="background:radial-gradient(ellipse 820px 470px at ' + G.cx + 'px ' + G.cy + 'px,var(--v-paper) 72%,transparent 100%)"></div>' : '') + '<div class="sk-n" style="left:' + G.x + 'px;top:' + G.y + 'px"><i class="sk-tape"></i><div class="sk-h"></div>';
      for (var i = 0; i < S.slots; i++) h += '<div class="sk-r"><b>' + (i + 1) + '</b><span class="sk-e"></span><span class="sk-t"></span><span class="sk-bk">?</span></div>';
      h += '</div><div class="sk-fly"></div>';
      box.innerHTML = h;
      var note = box.querySelector('.sk-n'); note.style.height = (HEAD + S.slots * ROW + 18) + 'px';
      box.querySelector('.sk-h').textContent = S.title;
      var rows = [].slice.call(box.querySelectorAll('.sk-r')).map(function (r, i) {
        var txt = S.lines[i] !== undefined ? S.lines[i] : (p.action === 'add' && i === S.mine ? p.text : '');
        r.style.setProperty('top', (HEAD + i * ROW) + 'px');   // chuẩn hoá thuộc tính style ngay từ đầu ⇒ tua tới/lui ra outerHTML y hệt khi transform bị gán rồi xoá
        r.querySelector('.sk-t').textContent = txt; return { r: r, t: r.querySelector('.sk-t'), e: r.querySelector('.sk-e'), bk: r.querySelector('.sk-bk'), b: r.querySelector('b'), filled: S.lines[i] !== undefined };
      });
      box.querySelector('.sk-fly').textContent = p.text || '';
      ctx.hud.appendChild(box);
      box._r = { S: S, G: G, note: note, rows: rows, fly: box.querySelector('.sk-fly'), slot: S.mine, dim: box.querySelector('.sk-dim') };
      return box;
    },
    draw: function (el, t, ctx) {
      var r = el._r, p = ctx.chain[0].params, S = r.S, G = r.G, T = timing(p, ctx.cues);
      var gone = S.next && t >= (S.next.t_in - ctx.beat.t_in) / 1000;
      el.style.display = gone ? 'none' : '';
      if (gone) return;
      var nx = 0, ny = 0, sc = 1, rot = -2, op = 1;
      if (p.action === 'show' || (!S.shown && p.action !== 'hide')) { var q = U.eo(U.seg(t, 0, 0.6)); ny = (1 - q) * -60; rot = -2 + (1 - q) * 6; op = U.clamp(q * 1.6); }
      if (p.action === 'hide') { var hq = U.eio(U.seg(t, 0, 0.5)); ny = hq * -(G.y + 420); op = 1 - U.seg(t, 0.25, 0.5); }
      if (p.action === 'review') {
        var bq = U.eio(U.seg(t, 0, 0.8)), w = 330, hgt = HEAD + S.slots * ROW + 18;
        nx = (G.cx - (G.x + w / 2)) * bq; ny = (G.cy - (G.y + hgt / 2)) * bq; sc = U.lerp(1, G.big, bq); rot = -2 + 2 * bq;
        if (r.dim) r.dim.style.opacity = U.f3(0.88 * bq);   // nền giấy phủ mờ trang vở phía sau ⇒ mắt chỉ còn tờ giấy nhớ (khối/thẻ cũ không lẫn vào)
      }
      var land = p.action === 'add' ? T.fly + 0.7 : -1, bump = land > 0 ? Math.sin(Math.PI * U.seg(t, land, land + 0.35)) : 0;
      U.setT(r.note, 'translate(' + U.f3(nx) + 'px,' + U.f3(ny) + 'px) rotate(' + U.f3(rot) + 'deg) scale(' + U.f3(sc * (1 + 0.05 * bump)) + ')', U.f3(op));
      r.rows.forEach(function (R, i) {
        var on = R.filled ? 1 : 0, back = 0, flip = 0;
        if (p.action === 'add' && i === r.slot) on = U.seg(t, land - 0.1, land + 0.15);
        if (p.action === 'review') {
          // 0.2.x: úp sẵn ngay từ đầu (không lộ đáp án trong lúc tờ giấy bay ra giữa — critic clip dài); mở quanh flip_at[i]
          var down = 1, up = U.seg(t, T.flips[i], T.flips[i] + 0.45);
          flip = down < 1 ? down : 1 - up; back = (down >= 0.5 && up < 0.5) ? 1 : 0;
        }
        var ang = Math.sin(Math.PI * U.clamp(flip)) > 0 ? (U.clamp(flip) <= 0.5 ? flip * 180 : (1 - flip) * 180) : 0;
        R.r.style.transform = ang ? 'rotateX(' + U.f3(ang) + 'deg)' : '';
        R.t.style.opacity = U.f3(back ? 0 : on); R.e.style.opacity = U.f3(back ? 0 : 1 - on); R.bk.style.opacity = back; R.b.style.opacity = 1;
      });
      if (p.action === 'add') {
        // chip: hiện to giữa khung → giữ → bay vòng cung vào ô (cỡ và vị trí nội suy cùng một easing ⇒ không trượt)
        var ap = U.back(U.seg(t, 0, 0.4), 1.4), sx0 = 0, fp = U.eio(U.seg(t, T.fly, T.fly + 0.7)), rowY = G.y + HEAD + r.slot * ROW + ROW / 2, rowX = G.x + 56;
        var sx = p.from === 'center' ? G.cx : G.nx, sy = p.from === 'center' ? G.cy : G.ny;
        var x = U.lerp(sx, rowX, fp), y = U.lerp(sy, rowY, fp) - Math.sin(Math.PI * fp) * 120, s = U.lerp(1.9, 1, fp) * U.lerp(0.6, 1, ap);
        U.setT(r.fly, 'translate(' + U.f3(x) + 'px,' + U.f3(y) + 'px) translate(' + (fp > 0 ? U.f3(-50 * (1 - fp)) : -50) + '%,-50%) scale(' + U.f3(s) + ')', U.f3(U.clamp(ap * 2) * (1 - U.seg(t, land - 0.1, land + 0.1))));
      } else r.fly.style.opacity = 0;
    }
  };
  block.stateOf = stateOf; block.timing = timing;
  if (typeof module === 'object' && module.exports) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
