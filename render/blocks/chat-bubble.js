// © 2026 Gen Labs — All rights reserved.
// Khối `chat-bubble` (K12): thông báo kiểu điện thoại — tin nhắn (message), cuộc gọi đến (call: vòng sóng quanh ảnh đại diện + nút nghe/từ chối), tin hệ thống/IT (notice).
// Trượt xuống + lò xo, rồi RUNG `shake` lần (mặc định 2) — mỗi lần 0,32 s, biên độ tắt dần (không giật cứng).
// Tham số: { kind?: message|call|notice (mặc định message), from: ≤30 (người gửi, bắt buộc), text?: ≤80, app?: ≤20 (vd "Zalo", "Email"), time?: ≤10 ("09:12"),
//   tone?: normal|urgent|good, shake?: 0–3, avatar?: ≤3 ký tự (mặc định chữ đầu của tên), at?: cue (lúc rung lần đầu; mặc định 0,5 s) }
// Chỗ đặt: 'over' — đè lên khối trước (vd màn mock-ui/agent-steps) như thông báo bật lên; không có khối trước ⇒ vùng mới.
// Ngân sách (L-42): ≤ 5 phần tử động (thẻ, 2 vòng sóng, 2 nút); chỉ transform/opacity; lắng sau lần rung cuối 0,6 s (call: sóng chạy tới 6 s rồi lắng).
(function (root) {
  'use strict';
  var isNode = typeof module === 'object' && module.exports;
  var U = isNode ? require('./util') : root.GSUtil, I = isNode ? require('./icons') : root.GSIcons;
  var lay = function (p, aspect) { var v = aspect === '9:16', body = p.text ? Math.min(2, Math.ceil(U.textW(p.text, v ? 40 : 48) / (v ? 620 : 800))) : 0; return { v: v, W: v ? 960 : 1120, H: (v ? 150 : 170) + body * (v ? 50 : 59) + (p.kind === 'call' ? 20 : 0) }; };
  var timing = function (p, cues) { var a = cues && typeof cues[0] === 'number' ? cues[0] : 0.5, n = p.shake === undefined ? 2 : p.shake, s = []; for (var i = 0; i < n; i++) s.push(Math.max(0.35, a) + i * 0.75); return { shakes: s }; };
  // chữ đầu của TÊN (từ cuối, bỏ phần trong ngoặc như "(Sếp)"): "Chị Hạnh (Sếp)" ⇒ "H"
  var initials = function (name) { var w = name.replace(/\([^)]*\)/g, ' ').trim().split(/\s+/).filter(Boolean); return (w.length ? w[w.length - 1].charAt(0) : '?').toUpperCase(); };
  // thông báo sau cùng vùng đè lên ⇒ thông báo này lùi xuống + mờ đi (như chồng thông báo trên điện thoại): mốc giây tính từ lúc vào
  var nextOf = function (ctx) { var b = ctx.beat, n = (ctx.plan.beats || []).filter(function (x) { return x.block === 'chat-bubble' && x.zone === b.zone && x.t_in > b.t_in; }).sort(function (a, c) { return a.t_in - c.t_in; })[0]; return n ? (n.t_in - b.t_in) / 1000 : Infinity; };
  var block = {
    name: 'chat-bubble', version: 1, place: 'over', stackOn: [], peak: 0.5,
    schema: { type: 'object', required: ['from'], additionalProperties: false, properties: {
      kind: { type: 'string', enum: ['message', 'call', 'notice'] }, from: { type: 'string', minLength: 1, maxLength: 30 }, text: { type: 'string', maxLength: 80 },
      app: { type: 'string', maxLength: 20 }, time: { type: 'string', maxLength: 10 }, tone: { type: 'string', enum: ['normal', 'urgent', 'good'] },
      shake: { type: 'integer', minimum: 0, maximum: 3 }, avatar: { type: 'string', minLength: 1, maxLength: 3 }, at: { type: 'cue' } } },
    cues: function (p) { return [p.at]; },
    settleFor: function (p, ctx) { var T = timing(p, ctx && ctx.cues), last = T.shakes.length ? T.shakes[T.shakes.length - 1] : 0.5, nx = nextOf(ctx); return nx < Infinity ? nx + 0.5 : p.kind === 'call' ? Math.max(6, last + 0.6) : last + 0.6; },
    footprint: function (aspect, p) { var L = lay(p || { from: 'x' }, aspect); return { w: L.W, h: L.H }; },
    sfx: [{ at: 'in', name: 'ding', vol: 0.4 }],
    sfxTimed: function (p, cues) {
      var T = timing(p, cues), out = [{ t: 0.05, name: p.kind === 'call' ? 'bao-thuc' : p.kind === 'notice' ? 'chime' : 'ding', vol: 0.4 }];
      T.shakes.forEach(function (s) { out.push({ t: s, name: 'wobble', vol: 0.25 }); });
      return out;
    },
    mount: function (world, p, ctx) {
      var L = lay(p, ctx.aspect), kind = p.kind || 'message', box = U.box(ctx.slot, 'b-chat k-' + kind + ' tone-' + (p.tone || (kind === 'notice' ? 'urgent' : 'normal')) + (L.v ? ' v' : ''));
      var av = kind === 'notice' ? '<span class="cb-av ic">' + I.svg('warning', 64) + '</span>' : '<span class="cb-av"><i class="w1"></i><i class="w2"></i><b></b></span>';
      box.innerHTML = '<div class="cb-c" style="width:' + L.W + 'px">' + av + '<div class="cb-m"><div class="cb-top"><span class="cb-app"></span><span class="cb-time"></span></div><b class="cb-from"></b><div class="cb-text"></div></div>' +
        (kind === 'call' ? '<div class="cb-btns"><span class="cb-b no">' + I.svg('handset', 46) + '</span><span class="cb-b ok">' + I.svg('handset', 46) + '</span></div>' : '') + '</div>';
      var b = box.querySelector('.cb-av b'); if (b) b.textContent = p.avatar || initials(p.from);
      box.querySelector('.cb-app').textContent = p.app || (kind === 'call' ? 'Cuộc gọi đến' : kind === 'notice' ? 'Thông báo' : 'Tin nhắn');
      box.querySelector('.cb-time').textContent = p.time || 'bây giờ';
      box.querySelector('.cb-from').textContent = p.from;
      var tx = box.querySelector('.cb-text'); if (p.text) tx.textContent = p.text; else tx.style.display = 'none';
      world.appendChild(box);
      box._r = { next: nextOf(ctx), c: box.querySelector('.cb-c'), w1: box.querySelector('.w1'), w2: box.querySelector('.w2'), btns: [].slice.call(box.querySelectorAll('.cb-b')) };
      return box;
    },
    draw: function (el, t, ctx) {
      var r = el._r, p = ctx.chain[0].params, T = timing(p, ctx.cues);
      var q = U.spring(U.seg(t, 0, 0.9) * 1.6), sh = 0;
      // rung: sin tần số 16 Hz × bao hình sin^2 (vào/ra mềm) — tất định theo t
      T.shakes.forEach(function (s) { var u = U.seg(t, s, s + 0.32); if (u > 0 && u < 1) sh = Math.sin((t - s) * Math.PI * 2 * 16) * Math.pow(Math.sin(Math.PI * u), 2); });
      var out = U.eio(U.seg(t, r.next, r.next + 0.45));
      U.setTV(r.c, 'translate(' + U.f3(sh * 12) + 'px,' + U.f3((1 - q) * -70 + out * 90) + 'px) rotate(' + U.f3(sh * 1.6) + 'deg) scale(' + U.f3(U.lerp(0.94, 1, q) * (1 - 0.08 * out)) + ')', U.f3(U.clamp(U.seg(t, 0, 0.2)) * (1 - out)));
      if (r.w1) [r.w1, r.w2].forEach(function (w, i) {
        var on = (p.kind === 'call') ? 1 : 0, ph = ((t + i * 0.6) % 1.2) / 1.2;
        U.setT(w, 'scale(' + U.f3(1 + 0.55 * U.eo(ph)) + ')', U.f3(on * 0.55 * (1 - ph) * U.clamp(U.seg(t, 0.2, 0.5)) * (1 - U.seg(t, 5.2, 5.9))));   // tắt dần trước lúc lắng (không đứng hình giữa nhịp)
      });
      r.btns.forEach(function (b, i) { var bq = U.back(U.seg(t, 0.35 + i * 0.1, 0.75 + i * 0.1), 1.6); U.setTV(b, 'scale(' + U.f3(bq) + ')', U.f3(U.clamp(bq * 2))); });
    }
  };
  block.layout = lay; block.timing = timing;
  if (isNode) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
