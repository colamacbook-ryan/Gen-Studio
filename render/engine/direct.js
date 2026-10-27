// © 2026 Gen Labs — All rights reserved.
// Đạo diễn nhân vật (thuần, không DOM): từ plan (câu nói, mốc beat) suy ra trạng thái/biểu cảm/động tác Gen-Chibi tại mỗi thời điểm.
// makeDirector(plan) → { level(who, t_ms) → 0..1 | -1 (không nói), act(who, t_ms) → { state, director } } — director dùng cho GC.svgString.
(function (root) {
  'use strict';
  var STATES = ['normal', 'work', 'think', 'unsure', 'smug', 'greedy', 'proud', 'vow', 'beg', 'shock', 'panic', 'rage', 'dizzy', 'cry', 'injured', 'exhausted', 'lazy', 'sleep'];
  var D = {};
  function blink(t, off) { var c = (t + off) % 3.7; return c < 0.1 || (c > 0.28 && c < 0.36 && Math.floor((t + off) / 3.7) % 3 === 1); }
  D.mouthOf = function (lv) { return lv < 0 ? null : lv < 0.12 ? 'flat' : lv < 0.42 ? 'oSmall' : 'oBig'; };

  D.makeDirector = function (plan) {
    var lines = plan.lines, beats = plan.beats, order = Object.keys(plan.cast), lastLine = lines[lines.length - 1];
    var endCard = beats.filter(function (b) { return b.block === 'end-card'; })[0], endT = endCard ? endCard.t_in : plan.duration_ms + 1;
    var stamps = beats.filter(function (b) { return b.block === 'stamp'; }), points = beats.filter(function (b) { return b.block !== 'lesson-map' && b.block !== 'end-card'; });
    function lineAt(who, t) { for (var i = 0; i < lines.length; i++) { var l = lines[i]; if ((who === null || l.who === who) && t >= l.a_ms && t <= l.b_ms) return l; } return null; }
    var api = {
      level: function (who, t) {
        var l = lineAt(who, t); if (!l) return -1;
        var k = Math.floor((t - l.a_ms) / 1000 * (l.env_fps || 30)), e = l.envelope; return e[Math.min(e.length - 1, Math.max(0, k))] || 0;
      },
      act: function (who, t) {
        var idx = order.indexOf(who), ts = t / 1000, d = {}, state = 'normal';
        if (idx > 0) d.facing = 'left';
        var talking = api.level(who, t) >= 0, l = lineAt(who, t);
        if (t >= endT) { if (idx === 0) d.activity = 'wave'; else d.activity = 'cheer'; }
        else if (idx === 1 && t < 950) d.activity = 'walk';
        else if (l) {
          if (STATES.indexOf(l.mood) >= 0) state = l.mood;
          var near = points.some(function (b) { return t >= b.t_in - 300 && t < b.t_in + 1500 && b.t_in >= l.a_ms - 200 && b.t_in <= l.b_ms; });
          if (l === lastLine) d.motion = 'nod'; else if (near) { d.motion = 'point'; d.view = 'q45'; } else d.motion = 'talk';
        } else {
          var other = lineAt(null, t), hitStamp = stamps.some(function (b) { return t >= b.t_in && t < b.t_in + 1400; });
          if (hitStamp) state = 'shock';
          else if (other && t - other.a_ms < 900 && lines.indexOf(other) > 0) d.motion = 'nod';
        }
        var lv = api.level(who, t), m = D.mouthOf(lv); if (m) d.mouth = m;
        if (!d.eyes && blink(ts, idx === 0 ? 0.3 : 1.9)) d.eyes = 'closed';
        return { state: state, director: d, talking: talking };
      }
    };
    return api;
  };
  if (typeof module === 'object' && module.exports) module.exports = D; else root.GSDirect = D;
})(typeof self !== 'undefined' ? self : this);
