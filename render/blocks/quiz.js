// © 2026 Gen Labs — All rights reserved.
// Khối `quiz` (K9): câu đố cho người xem — câu hỏi, 2–4 ô lựa chọn, đồng hồ đếm 3-2-1, rồi lật đáp án: ô sai mờ đi, ô đúng sáng xanh + dấu tick vẽ dần.
// Tham số: { question ≤70, options?: string[0–4] (mỗi ô ≤30; mode guess cần ≥ 2), answer?: chỉ mục ô đúng (bỏ ⇒ không lật),
//   mode?: guess (mặc định: đếm 3-2-1 rồi lật) | pause (mời dừng video nghĩ, không đếm) | comment (mời trả lời ở bình luận, không đếm, không lật),
//   countdown?: false (tắt đồng hồ) · countdown_s?: 0–5 (mặc định 3 với guess, 0 với pause/comment), kicker?: ≤24, hint?: ≤44 (dòng mời ở chân, pause/comment),
//   count_at?: cue, reveal_at?: cue }  — cue = số giây sau lúc khối vào hoặc neo chữ {line, word}.
// Nhịp mặc định: ô hiện lần lượt 0,45 s + 0,12 s/ô · đồng hồ bắt đầu sau ô cuối 0,5 s · lật ở count + countdown_s (reveal_at thắng nếu khai).
// Bố cục: 2 ô ⇒ 2 cột · 3 ô ⇒ 1 cột · 4 ô ⇒ lưới 2×2. 9:16: khung hẹp 1000 px, chữ ≥ 38 px thế giới (≥ 28 px khung sau zoom ~0,75).
// Ngân sách (L-42): ≤ 8 phần tử động cùng lúc (nhãn, câu hỏi, ≤4 ô, đồng hồ, tick); chỉ transform/opacity + stroke-dashoffset; lắng sau lật 1,2 s (không vẽ lại).
(function (root) {
  'use strict';
  var isNode = typeof module === 'object' && module.exports;
  var U = isNode ? require('./util') : root.GSUtil, I = isNode ? require('./icons') : root.GSIcons;
  var LET = ['A', 'B', 'C', 'D'];
  var KICK = { guess: 'Đố bạn', pause: 'Dừng lại nghĩ', comment: 'Bình luận nhé' }, HINT = { pause: 'Tạm dừng video, nghĩ thử rồi xem tiếp', comment: 'Trả lời ở phần bình luận nhé' };
  var modeOf = function (p) { return p.mode || 'guess'; };
  var secs = function (p) { return p.countdown === false ? 0 : p.countdown_s !== undefined ? p.countdown_s : modeOf(p) === 'guess' ? 3 : 0; };
  var hintOf = function (p) { return p.hint !== undefined ? p.hint : HINT[modeOf(p)] || ''; };
  var lineCount = function (text, fs, w) { return Math.max(1, Math.ceil(U.textW(text, fs) / Math.max(1, w))); };
  // bố cục thuần (footprint + mount dùng chung): kích thước chữ theo tỉ lệ, số cột, chiều cao ước theo số dòng
  function lay(p, aspect) {
    var v = aspect === '9:16', n = (p.options || []).length, W = v ? 1000 : 1300, cols = n === 3 ? 1 : 2, gap = v ? 22 : 28;
    var timer = secs(p) > 0, tw = v ? 112 : 132;
    var qfs = v ? 52 : 66, ofs = v ? 44 : 64, kfs = v ? 40 : 40, qw = W - (timer ? tw + 30 : 0);
    while (qfs > (v ? 44 : 56) && lineCount(p.question, qfs, qw) > 2) qfs -= 2;
    var cellW = (W - gap * (cols - 1)) / cols, textW = cellW - (v ? 24 + 60 + 16 + 24 : 26 + 76 + 22 + 30);
    var rows = [], i; for (i = 0; i < n; i += cols) rows.push(Math.max.apply(null, (p.options || []).slice(i, i + cols).map(function (o) { return Math.min(2, lineCount(o, ofs, textW)); })));
    var rowH = rows.map(function (l) { return Math.round(l * ofs * 1.14 + (v ? 34 : 40)); });
    var qh = Math.round(Math.min(3, lineCount(p.question, qfs, qw)) * qfs * 1.14);
    var hint = hintOf(p) ? (v ? 70 : 76) : 0;
    var H = hint + 64 + 16 + qh + (v ? 30 : 36) + rowH.reduce(function (s, h) { return s + h; }, 0) + gap * (rows.length - 1);
    return { v: v, W: W, H: Math.max(H, timer ? tw + 20 : 0), cols: cols, gap: gap, qfs: qfs, ofs: ofs, kfs: kfs, tw: tw, timer: timer, rowH: rowH };
  }
  // lịch của khối (draw + sfxTimed dùng chung ⇒ hình và tiếng không lệch): giây tính từ lúc khối vào
  function plan(p, cues) {
    var n = (p.options || []).length, N = secs(p);
    var c0 = cues && typeof cues[0] === 'number' ? cues[0] : 0.45 + n * 0.12 + 0.5 + 0.35;
    var rv = cues && typeof cues[1] === 'number' ? cues[1] : c0 + (N || 3);
    return { n: n, N: N, count: c0, reveal: Math.max(rv, 0.6 + n * 0.12), open: typeof p.answer !== 'number' || modeOf(p) === 'comment' };
  }
  var block = {
    name: 'quiz', version: 1, place: 'new', stackOn: [], peak: 3.5, settle: 6,
    schema: { type: 'object', required: ['question'], additionalProperties: false, properties: {
      question: { type: 'string', minLength: 1, maxLength: 70 },
      options: { type: 'array', minItems: 0, maxItems: 4, items: { type: 'string', minLength: 1, maxLength: 30 } },
      answer: { type: 'integer', minimum: 0, maximum: 3 },
      mode: { type: 'string', enum: ['guess', 'pause', 'comment'] }, countdown: { type: 'boolean' },
      countdown_s: { type: 'integer', minimum: 0, maximum: 5 }, hint: { type: 'string', maxLength: 44 },
      kicker: { type: 'string', maxLength: 24 },
      count_at: { type: 'cue' }, reveal_at: { type: 'cue' } } },
    check: function (p) {
      var e = [];
      if (modeOf(p) === 'guess' && (p.options || []).length < 2) e.push('params.options: câu đố kiểu guess cần ít nhất 2 ô (câu hỏi mở thì dùng mode "pause" hoặc "comment")');
      if (modeOf(p) === 'comment' && typeof p.answer === 'number') e.push('params.answer: mode "comment" không lật đáp án — bỏ answer hoặc dùng mode "pause"');
      if (Array.isArray(p.options) && typeof p.answer === 'number' && p.answer >= (p.options || []).length) e.push('params.answer: chỉ mục ' + p.answer + ' vượt số lựa chọn (' + (p.options || []).length + ' ô, đánh số từ 0)');
      return e;
    },
    cues: function (p) { return [p.count_at, p.reveal_at]; },
    settleFor: function (p, ctx) { var P = plan(p, ctx && ctx.cues); return (P.open && !P.N ? 2 : P.reveal) + 1.2; },
    footprint: function (aspect, p) { var L = lay(p && p.question ? p : { question: 'Câu hỏi?', options: ['A', 'B', 'C', 'D'] }, aspect); return { w: L.W, h: L.H }; },
    sfx: [{ at: 'in', name: 'pop', vol: 0.35 }, { at: 'peak', name: 'ding', vol: 0.45 }],
    sfxTimed: function (p, cues) {
      var P = plan(p, cues), out = [{ t: 0, name: 'pop', vol: 0.35 }];
      for (var i = 0; i < P.N; i++) out.push({ t: P.count + i, name: 'tick', vol: 0.3 });
      if (!P.open || P.N) out.push({ t: P.reveal, name: P.open ? 'chime' : 'ding', vol: 0.45 });
      return out;
    },
    mount: function (world, p, ctx) {
      var L = lay(p, ctx.aspect), box = U.box(ctx.slot, 'b-quiz' + (L.v ? ' v' : ''));
      var h = '<div class="qz-k" style="font-size:' + L.kfs + 'px"></div><div class="qz-q" style="font-size:' + L.qfs + 'px;max-width:' + (L.W - (L.timer ? L.tw + 30 : 0)) + 'px"></div>' +
        '<div class="qz-g" style="grid-template-columns:repeat(' + L.cols + ',1fr);gap:' + L.gap + 'px">';
      (p.options || []).forEach(function (o, i) {
        h += '<div class="qz-o" style="font-size:' + L.ofs + 'px;min-height:' + L.rowH[Math.floor(i / L.cols)] + 'px"><i class="qz-ok"></i><b class="qz-l">' + LET[i] + '</b>' +
          '<svg class="qz-tk" viewBox="0 0 60 60"><path d="M14 31 L26 43 L47 18" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></svg>' +
          '<span class="qz-t"></span></div>';
      });
      h += '</div>';
      if (L.timer) {
        var N = secs(p);
        h += '<div class="qz-c" style="width:' + L.tw + 'px;height:' + L.tw + 'px"><svg viewBox="0 0 100 100"><circle class="tr" cx="50" cy="50" r="42"/><circle class="pr" cx="50" cy="50" r="42" pathLength="1" stroke-dasharray="1" stroke-dashoffset="0" transform="rotate(-90 50 50)"/></svg>';
        for (var d = N; d >= 1; d--) h += '<span class="qz-d" style="font-size:' + Math.round(L.tw * 0.48) + 'px">' + d + '</span>';
        h += '</div>';
      }
      if (hintOf(p)) h += '<div class="qz-h" style="font-size:' + (L.v ? 44 : 52) + 'px">' + I.svg(modeOf(p) === 'comment' ? 'chat' : 'hand', L.v ? 46 : 52) + '<span></span></div>';
      box.innerHTML = h;
      box.querySelector('.qz-k').textContent = p.kicker === undefined ? KICK[modeOf(p)] : p.kicker;
      if (hintOf(p)) box.querySelector('.qz-h span').textContent = hintOf(p);
      // câu hỏi: từng chữ một span (hiện lần lượt), giữ khoảng trắng thật để trình duyệt tự xuống dòng
      var qw = p.question.trim().split(/\s+/);
      box.querySelector('.qz-q').innerHTML = qw.map(function (w) { return '<span class="qw">' + U.esc(w) + '</span>'; }).join(' ');
      var opts = [].slice.call(box.querySelectorAll('.qz-o'));
      opts.forEach(function (o, i) { o.querySelector('.qz-t').textContent = (p.options || [])[i]; });
      world.appendChild(box);
      box._r = { k: box.querySelector('.qz-k'), qw: [].slice.call(box.querySelectorAll('.qz-q .qw')),
        opts: opts.map(function (o) { return { o: o, ok: o.querySelector('.qz-ok'), l: o.querySelector('.qz-l'), tk: o.querySelector('.qz-tk'), tp: o.querySelector('.qz-tk path') }; }),
        hint: box.querySelector('.qz-h'), c: box.querySelector('.qz-c'), pr: box.querySelector('.qz-c .pr'), ds: [].slice.call(box.querySelectorAll('.qz-d')) };
      return box;
    },
    draw: function (el, t, ctx) {
      var r = el._r, p = ctx.chain[0].params, P = plan(p, ctx.cues);
      var kp = U.back(U.seg(t, 0, 0.45), 1.4); U.setT(r.k, 'rotate(-3deg) scale(' + U.f3(U.lerp(0.6, 1, kp)) + ')', U.f3(U.clamp(kp * 2)));
      r.qw.forEach(function (w, i) { var q = U.eo(U.seg(t, 0.1 + i * 0.045, 0.5 + i * 0.045)); U.setT(w, 'translateY(' + U.f3((1 - q) * 26) + 'px)', U.f3(q)); });
      var rv = U.seg(t, P.reveal, P.reveal + 0.45), rve = U.eio(rv);
      r.opts.forEach(function (o, i) {
        var a = 0.45 + i * 0.12, q = U.back(U.seg(t, a, a + 0.5), 1.1), e = U.clamp(U.seg(t, a, a + 0.3));
        var right = !P.open && i === p.answer, wrong = !P.open && !right;
        var sc = U.lerp(0.92, 1, q) * (right ? 1 + 0.04 * U.back(rv, 2.2) : wrong ? 1 - 0.03 * rve : 1);
        U.setT(o.o, 'translateY(' + U.f3((1 - q) * 40 + (wrong ? rve * 6 : 0)) + 'px) scale(' + U.f3(sc) + ')', U.f3(e * (wrong ? 1 - 0.62 * rve : 1)));
        o.ok.style.opacity = right ? U.f3(rve) : 0;
        if (right) { o.l.style.opacity = U.f3(1 - rve); o.tk.style.opacity = U.f3(rve); U.dash(o.tp, U.eo(U.seg(t, P.reveal + 0.15, P.reveal + 0.55))); }
      });
      if (r.hint) { var hq = U.eo(U.seg(t, 0.8 + P.n * 0.12, 1.4 + P.n * 0.12)); U.setT(r.hint, 'translateY(' + U.f3((1 - hq) * 24) + 'px)', U.f3(hq)); }
      if (r.c) {
        // đồng hồ: vào trước count 0,35 s; vòng cạn đều theo giây; mỗi số mờ-vào/mờ-ra 0,14 s (không nhảy); tan khi lật
        var ci = U.back(U.seg(t, P.count - 0.35, P.count + 0.05), 1.3), co = U.eio(U.seg(t, P.reveal, P.reveal + 0.35));
        U.setT(r.c, 'scale(' + U.f3(U.lerp(0.5, 1, ci) * U.lerp(1, 0.7, co)) + ')', U.f3(U.clamp(ci * 2) * (1 - co)));
        r.pr.style.strokeDashoffset = U.f3(U.clamp((t - P.count) / Math.max(0.001, P.reveal - P.count)));
        var N = r.ds.length;
        r.ds.forEach(function (d, j) {
          var a = P.count + j * (P.reveal - P.count) / N, b = a + (P.reveal - P.count) / N, w = U.win(t, a - 0.07, b + 0.07, 0.14, 0.14);
          if (j === 0) w = U.win(t, P.count - 0.35, b + 0.07, 0.3, 0.14);
          var pop = U.eo(U.seg(t, a - 0.07, a + 0.25));
          U.setT(d, 'translate(-50%,-50%) scale(' + U.f3(U.lerp(1.3, 1, pop)) + ')', U.f3(w));
        });
      }
    }
  };
  block.layout = lay; block.timing = plan;
  if (typeof module === 'object' && module.exports) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
