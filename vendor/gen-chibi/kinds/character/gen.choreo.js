/* gen-chibi — bộ động tác của KHUNG (gen.dong-tac): tư thế then chốt + hành vi (clip) + từ vựng hành động trung lập chủ đề
 * (tay không + hài + đòn binh khí chung). Đòn riêng chủ đề = gói động tác dữ liệu (engine/choreo.js › checkPack / registerPack).
 * © 2026 Gen Labs — All rights reserved.
 * Quy ước tư thế: xem đầu engine/choreo.js (góc nghiêng viết theo bản quay TRÁI: phía trước là −x, tay / chân gần là R;
 * tay xoay + = vung ra trước; đùi + = đá ra trước; cẳng chân − = gập gối; gốc rot − = đổ người ra trước).
 */
(function (GC) {
  'use strict';
  var C = GC.choreo, P = C.pose, S = C.swapLR, mix = C.mix, about = C.about;

  /* ---------------- tư thế nghiêng (q90, quay trái) ---------------- */
  P('stand', {});
  P('ready', { thighR: { rot: 12 }, shinR: { rot: -10 }, thighL: { rot: -10 }, shinL: { rot: -8 }, body: { rot: -3 }, armR: { rot: 38 }, foreR: { rot: 46 }, wR: -42, armL: { rot: 36 }, foreL: { rot: 40 } });
  P('guard', { root: { sy: 0.94, sx: 1.04 }, pelvis: { y: 1 }, thighR: { rot: 34 }, shinR: { rot: -20 }, thighL: { rot: -30 }, shinL: { rot: -26 }, body: { rot: -8 }, head: { rot: -4 },
    armR: { rot: 72 }, foreR: { rot: 18 }, wR: -86, armL: { rot: 84 }, foreL: { rot: 10 } });
  P('sneak', { root: { rot: -7, sy: 0.95 }, body: { rot: -6 }, head: { rot: -6, x: -2 }, armR: { rot: 22 }, foreR: { rot: 64 }, wR: -100, armL: { rot: 58 }, foreL: { rot: 66 } });
  // chu kỳ bước rón rén: nhấc gối cao — đặt chân
  P('sneakUp', { $: 'sneak', root: { rot: -4, sy: 1.04, y: -7 }, hem: { rot: -12 }, head: { rot: -2, x: -2 }, thighR: { rot: 64, sy: 1.45 }, shinR: { rot: -70, sy: 1.3 }, footR: { rot: 18 }, thighL: { rot: -8, sy: 1.2 }, shinL: { rot: -6 } });
  P('sneakDown', { $: 'sneak', root: { sy: 0.92, sx: 1.04 }, hem: { rot: 6 }, thighR: { rot: 32, sy: 1.3 }, shinR: { rot: -4, sy: 1.2 }, thighL: { rot: -30, sy: 1.3 }, shinL: { rot: -16, sy: 1.2 }, footL: { rot: -14 } });
  P('peek', { root: { rot: -16 }, body: { rot: -12 }, head: { rot: -6, x: -3 }, thighR: { rot: 10 }, thighL: { rot: -26 }, shinL: { rot: -10 },
    armL: { rot: 158 }, foreL: { rot: 74 }, armR: { rot: 18 }, foreR: { rot: 50 }, wR: -96 });
  P('lookBack', { root: { rot: 4 }, body: { rot: 10 }, head: { rot: 18, x: 3 }, thighR: { rot: 4 }, thighL: { rot: -6 }, armL: { rot: 20 }, foreL: { rot: 40 }, armR: { rot: 14 }, foreR: { rot: 44 }, wR: -60 });
  // chạy: tiếp đất — bay (đổi chân ở nửa chu kỳ sau)
  P('runA', { root: { rot: -13, y: 0, sy: 0.93, sx: 1.05 }, body: { rot: -4 }, head: { rot: 6, y: 2 }, hem: { rot: -10 }, thighR: { rot: 50, sy: 1.4 }, shinR: { rot: -10, sy: 1.3 }, thighL: { rot: -46, sy: 1.4 }, shinL: { rot: -60, sy: 1.3 }, footL: { rot: -20 },
    armL: { rot: -46 }, foreL: { rot: 70 }, armR: { rot: 26 }, foreR: { rot: 62 }, wR: -98 });
  P('runB', { root: { rot: -16, y: -16, sy: 1.06, sx: 0.96 }, body: { rot: -7 }, head: { rot: 0, y: -1 }, hem: { rot: 8 }, thighR: { rot: 4, sy: 1.3 }, shinR: { rot: -80, sy: 1.25 }, thighL: { rot: 30, sy: 1.35 }, shinL: { rot: -36, sy: 1.25 },
    armL: { rot: 40 }, foreL: { rot: 76 }, armR: { rot: 30 }, foreR: { rot: 58 }, wR: -94 });
  P('skid', { root: { rot: 15, sy: 0.92, sx: 1.06 }, body: { rot: 8 }, head: { rot: 6 }, thighR: { rot: 56 }, shinR: { rot: 6 }, footR: { rot: -20 }, thighL: { rot: -12 }, shinL: { rot: -34 },
    armL: { rot: -30 }, foreL: { rot: 30 }, armR: { rot: 66 }, foreR: { rot: 20 }, wR: -150 });
  P('lunge', { root: { rot: -14, x: -10, sy: 0.96, sx: 1.05 }, body: { rot: -10 }, head: { rot: -6, x: -2 }, thighR: { rot: 60 }, shinR: { rot: -6 }, thighL: { rot: -46 }, shinL: { rot: -6 }, footL: { rot: -10 },
    armR: { rot: 96 }, foreR: { rot: -4 }, wR: -92, armL: { rot: 104 }, foreL: { rot: -6 } });
  P('coil', { root: { rot: 6, x: 6, sy: 0.92, sx: 1.06 }, body: { rot: 8 }, head: { rot: -2 }, thighR: { rot: 26 }, shinR: { rot: -30 }, thighL: { rot: -24 }, shinL: { rot: -30 },
    armR: { rot: 24 }, foreR: { rot: 46 }, wR: -84, armL: { rot: 60 }, foreL: { rot: 40 } });
  P('crouch', { root: { sy: 0.84, sx: 1.1 }, pelvis: { y: 2 }, thighR: { rot: 50 }, shinR: { rot: -70 }, thighL: { rot: 30 }, shinL: { rot: -64 }, body: { rot: -8 }, head: { rot: -6 },
    armR: { rot: 40 }, foreR: { rot: 40 }, wR: -60, armL: { rot: 50 }, foreL: { rot: 40 } });
  P('airTuck', { root: { y: -96, sy: 1, sx: 1 }, thighR: { rot: 70 }, shinR: { rot: -110 }, thighL: { rot: 56 }, shinL: { rot: -100 }, body: { rot: -2 }, head: { rot: 6 },
    armR: { rot: 168 }, foreR: { rot: 12 }, wR: 176, armL: { rot: 160 }, foreL: { rot: 20 } });
  P('hero', { root: { sy: 1.02 }, body: { rot: 6 }, head: { rot: 8 }, hem: { rot: 6 }, thighR: { rot: 16, sy: 1.2 }, shinR: { rot: -4 }, thighL: { rot: -18, sy: 1.2 }, armR: { rot: 62 }, foreR: { rot: 24 }, wR: -24, armL: { rot: -30 }, foreL: { rot: 56 } });
  P('hitBack', mix({ body: { rot: 14 }, head: { rot: 26, x: 4 }, thighR: { rot: 30 }, shinR: { rot: -10 }, thighL: { rot: -4 }, armR: { rot: 96 }, foreR: { rot: 30 }, wR: 30, armL: { rot: 120 }, foreL: { rot: 20 } }, about(22, 100, 170)));
  P('sitFloor', { root: { y: 15, sy: 0.96 }, thighR: { rot: 84 }, shinR: { rot: -8 }, thighL: { rot: 76 }, shinL: { rot: -14 }, body: { rot: 6 }, head: { rot: 4 },
    armR: { rot: -10 }, foreR: { rot: 30 }, wR: 64, armL: { rot: -16 }, foreL: { rot: 20 } });
  P('stompUp', { root: { sy: 1.06, y: -4 }, body: { rot: 4, sx: 1.08 }, head: { rot: 4 }, thighR: { rot: 74 }, shinR: { rot: -76 }, thighL: { rot: -6 }, armR: { rot: -18 }, foreR: { rot: 64 }, wR: -20, armL: { rot: -24 }, foreL: { rot: 80 } });
  P('stompDown', { root: { sy: 0.88, sx: 1.08 }, body: { rot: -8, sx: 1.08 }, head: { rot: -8 }, thighR: { rot: 20 }, shinR: { rot: -6 }, thighL: { rot: -22 }, shinL: { rot: -10 }, armR: { rot: -26 }, foreR: { rot: 70 }, wR: -30, armL: { rot: -30 }, foreL: { rot: 84 } });
  P('dash', { root: { rot: -28, sy: 0.9, sx: 1.12 }, body: { rot: -8 }, head: { rot: 10 }, thighR: { rot: 30 }, shinR: { rot: -30 }, thighL: { rot: -70 }, shinL: { rot: -10 },
    armR: { rot: 84 }, foreR: { rot: 6 }, wR: -100, armL: { rot: -60 }, foreL: { rot: 30 } });
  P('block', { root: { sy: 0.9, sx: 1.06 }, body: { rot: 4 }, head: { rot: -8, x: 2 }, thighR: { rot: 36 }, shinR: { rot: -24 }, thighL: { rot: -34 }, shinL: { rot: -24 },
    armR: { rot: 70 }, foreR: { rot: 60 }, wR: -34, armL: { rot: 80 }, foreL: { rot: 64 } });
  P('jab', { $: 'lunge', root: { rot: -9, x: -6, sy: 0.97 }, thighR: { rot: 44 }, thighL: { rot: -34 }, armR: { rot: 90 }, foreR: { rot: 0 } });
  P('upper', { root: { rot: 8, y: -16, sy: 1.08, sx: 0.96 }, body: { rot: 10 }, head: { rot: 12 }, thighR: { rot: 40 }, shinR: { rot: -50 }, thighL: { rot: -10 }, shinL: { rot: -10 },
    armR: { rot: 178 }, foreR: { rot: 10 }, wR: 48, armL: { rot: 140 }, foreL: { rot: 10 } });

  /* ---------------- tư thế chính diện ---------------- */
  P('fStand', { armR: { rot: -34 }, foreR: { rot: 8 }, wR: 16, armL: { rot: 8 }, foreL: { rot: 14 } });
  P('fScratch', { head: { rot: 12, x: 2 }, body: { rot: -5 }, pelvis: { x: -3, rot: 4 }, armL: { rot: 168, sy: 1.5 }, foreL: { rot: 64, sy: 1.25 }, armR: { rot: -36 }, foreR: { rot: 8 }, wR: 18, thighR: { rot: -4 }, thighL: { rot: 6 } });
  P('fJump', { root: { y: -40, sy: 1.12, sx: 0.92, rot: -5 }, head: { rot: -6 }, armL: { rot: 104 }, foreL: { rot: 70 }, armR: { rot: -168, sy: 1.3 }, foreR: { rot: -10 }, wR: 34, thighL: { rot: 36, sy: 1.3 }, shinL: { rot: -50 }, thighR: { rot: -12, sy: 1.3 }, shinR: { rot: 10 } });
  P('fSquash', { root: { sy: 0.82, sx: 1.14 }, pelvis: { y: 2 }, head: { rot: 0 }, armL: { rot: 40 }, foreL: { rot: 30 }, armR: { rot: -40 }, foreR: { rot: -30 }, wR: 10, thighL: { rot: 20 }, shinL: { rot: -24 }, thighR: { rot: -20 }, shinR: { rot: 24 } });
  P('fReach', { pelvis: { x: -3, rot: -4 }, body: { rot: 14 }, head: { rot: 12, x: 2 }, armL: { rot: 174, sy: 1.45 }, foreL: { rot: 18, sy: 1.25 }, armR: { rot: -40 }, foreR: { rot: 10 }, wR: 22, thighR: { rot: -6 } });
  P('fReach2', { pelvis: { x: 3, rot: 4 }, body: { rot: -10 }, head: { rot: -12, x: -2 }, armL: { rot: 62 }, foreL: { rot: 96 }, armR: { rot: -150, sy: 1.35 }, foreR: { rot: -20 }, wR: 10, thighL: { rot: 6 } });
  P('fFlourish', { root: { rot: 4 }, pelvis: { x: 2 }, body: { rot: 6 }, head: { rot: 10, x: 2 }, armR: { rot: -64 }, foreR: { rot: -46 }, wR: 120, armL: { rot: -40 }, foreL: { rot: -70 }, thighR: { rot: -14, sy: 1.2 }, thighL: { rot: 4 } });
  P('fShoulder', { body: { rot: 2 }, armR: { rot: -48 }, foreR: { rot: -118 }, wR: 64, armL: { rot: 20 }, foreL: { rot: 30 } });
  P('fHop', { $: 'fShoulder', root: { y: -16, sy: 1.08, sx: 0.95 }, armL: { rot: 150 }, foreL: { rot: 20 }, thighL: { rot: 24 }, shinL: { rot: -40 }, thighR: { rot: -10 } });
  P('fDanceL', { $: 'fShoulder', root: { x: -12, rot: -6, y: -5 }, pelvis: { rot: -13, x: -3 }, body: { rot: 11 }, head: { rot: 12 }, hem: { rot: 9 }, armL: { rot: 112 }, foreL: { rot: 74 }, thighL: { rot: 28, sy: 1.35 }, shinL: { rot: -40 }, thighR: { rot: -4 } });
  P('fDanceR', { $: 'fShoulder', root: { x: 12, rot: 6, y: -5 }, pelvis: { rot: 13, x: 3 }, body: { rot: -11 }, head: { rot: -12 }, hem: { rot: -9 }, armL: { rot: 172, sy: 1.4 }, foreL: { rot: -16, sy: 1.2 }, thighR: { rot: -28, sy: 1.35 }, shinR: { rot: 40 }, thighL: { rot: 4 } });
  P('fSalute', { armL: { rot: -48 }, foreL: { rot: -74 }, armR: { rot: 44 }, foreR: { rot: 76 }, wR: 32, head: { rot: 0 } });
  P('fBow', { $: 'fSalute', body: { sy: 0.9 }, head: { y: 10, rot: 0 }, root: { sy: 0.97 } });
  P('fWave', { $: 'fStand', head: { rot: 9 }, body: { rot: -4 }, pelvis: { rot: 3 }, armL: { rot: 124, sy: 1.3 }, foreL: { rot: -58, sy: 1.2 } });
  P('fWave2', { $: 'fWave', head: { rot: 6 }, armL: { rot: 116, sy: 1.3 }, foreL: { rot: -14, sy: 1.2 } });
  P('fFinal', { root: { sy: 1.02 }, pelvis: { x: 2, rot: 4 }, body: { rot: -5 }, head: { rot: -8 }, armR: { rot: -60 }, foreR: { rot: -40 }, wR: 40, armL: { rot: 128 }, foreL: { rot: -64 }, thighL: { rot: 12 }, thighR: { rot: -8 } });

  /* ---------------- hành vi (clip): [giây, tư thế, nhịp, { view, dir, face, ez, hide }] ---------------- */
  var clip = C.clip;
  clip('sneakIn', { label: 'Rón rén vào', view: 'q90', face: { eyes: 'lookSide', brows: 'worried', mouth: 'cat', fx: [] },
    keys: [[0, 'sneakDown'], [0.28, 'sneakUp', 'out'], [0.56, 'sneakDown', 'in'], [0.84, S(C.POSES.sneakUp), 'out'], [1.12, S(C.POSES.sneakDown), 'in'],
      [1.4, 'sneakUp', 'out'], [1.68, 'sneakDown', 'in'], [1.96, S(C.POSES.sneakUp), 'out'], [2.24, S(C.POSES.sneakDown), 'in']],
    travel: [[0, 0], [2.24, 170, 'lin']],
    events: [[0, { music: 'tense', ambient: { time: 'day', weather: 'petals' } }], [0.56, { sfx: 'tick', gain: 0.35 }], [1.12, { sfx: 'tick', gain: 0.35 }], [1.68, { sfx: 'tick', gain: 0.35 }], [2.24, { sfx: 'tick', gain: 0.35 }]],
    cam: [[0, { z: 1.25, lead: 70, fy: 0.55, roll: 0, lag: 4 }]] });
  clip('peek', { label: 'Ngó nghiêng', view: 'q90', face: { eyes: 'lookSide', brows: 'raised', mouth: 'oSmall' },
    keys: [[0.22, 'peek', 'out'], [0.62, mix(C.POSES.peek, { head: { rot: -2, x: -4 }, root: { rot: -18 } }), 'sine'], [0.86, 'lookBack', 'back'], [1.2, mix(C.POSES.lookBack, { head: { rot: 22 } }), 'sine']],
    faces: [[0.86, { eyes: 'wide', mouth: 'wavy' }]],
    events: [[0.3, { sfx: 'hmm', gain: 0.5 }]],
    cam: [[0.3, { z: 1.6, lead: 40, fy: 0.75 }]] });
  clip('scratch', { label: 'Gãi đầu bối rối', view: 'front', face: { eyes: 'normal', brows: 'think', mouth: 'wavy', fx: ['question'] },
    keys: [[0.24, 'fScratch', 'back'], [0.3, mix(C.POSES.fScratch, { foreL: { rot: 80 }, head: { rot: 12 } }), 'sine'], [0.46, 'fScratch', 'sine'], [0.62, mix(C.POSES.fScratch, { foreL: { rot: 80 }, head: { rot: 13 } }), 'sine'], [0.8, 'fScratch', 'sine'], [1, mix(C.POSES.fStand, { head: { rot: 6 } }), 'io']],
    events: [[0.2, { sfx: 'hmm', gain: 0.4 }]],
    cam: [[0.1, { z: 1.9, lead: 0, fy: 0.8 }]] });
  clip('startle', { label: 'Giật mình', view: 'front', face: { eyes: 'wide', brows: 'raised', mouth: 'oBig', fx: ['exclaim', 'sweat'] },
    keys: [[0.1, 'fSquash', 'out'], [0.26, 'fJump', 'up', { ez: { 'root.y': 'up' } }], [0.4, mix(C.POSES.fJump, { root: { y: -44 } }), 'sine'], [0.56, 'fSquash', 'down', { ez: { 'root.y': 'down' } }], [0.8, 'crouch', 'back', { view: 'q90' }]],
    events: [[0.08, { sfx: 'sting' }], [0.12, { at: 'head', fx: 'text', text: '!!', dy: -40, color: '#ff4d3d', size: 1.2, rot: 6 }], [0.56, { sfx: 'boing', gain: 0.5 }], [0.56, { at: 'feet', fx: 'dust', size: 0.7 }]],
    cam: [[0.06, { z: 2.6, fy: 0.95, lead: 0, lag: 14 }, 'snap'], [0.7, { z: 1.5, fy: 0.55, lag: 6 }, 'io']] });
  clip('run', { label: 'Chạy thục mạng', view: 'q90', face: { eyes: 'fierce', brows: 'determined', mouth: 'flat', fx: [] },
    keys: [[0.12, 'runA'], [0.27, 'runB', 'out'], [0.42, S(C.POSES.runA), 'in'], [0.57, S(C.POSES.runB), 'out'], [0.72, 'runA', 'in'], [0.87, 'runB', 'out'], [1.02, S(C.POSES.runA), 'in'], [1.17, S(C.POSES.runB), 'out'], [1.32, 'runA', 'in'], [1.47, 'runB', 'out'], [1.62, S(C.POSES.runA), 'in'], [1.77, S(C.POSES.runB), 'out']],
    travel: [[0, 0], [0.12, 10, 'in'], [1.77, 360, 'lin']],
    events: [[0.12, { sfx: 'whoosh', gain: 0.5 }], [0.12, { lines: 1.6, style: 'h' }], [0.42, { sfx: 'step', gain: 0.5, at: 'feet', fx: 'dust', size: 0.5 }], [0.72, { sfx: 'step', gain: 0.5, at: 'feet', fx: 'dust', size: 0.5 }], [1.02, { sfx: 'step', gain: 0.5, at: 'feet', fx: 'dust', size: 0.5 }], [1.32, { sfx: 'step', gain: 0.5, at: 'feet', fx: 'dust', size: 0.5 }], [1.62, { sfx: 'step', gain: 0.5, at: 'feet', fx: 'dust', size: 0.5 }]],
    cam: [[0.1, { z: 1.35, lead: 110, fy: 0.5, roll: -2, lag: 5 }]] });
  clip('skid', { label: 'Phanh gấp', view: 'q90', face: { eyes: 'wide', brows: 'raised', mouth: 'bite' },
    keys: [[0.1, 'skid', 'out'], [0.45, mix(C.POSES.skid, { root: { rot: 10 } }), 'sine'], [0.7, 'ready', 'io']],
    travel: [[0, 0], [0.5, 70, 'out']],
    events: [[0.08, { sfx: 'swish' }], [0.1, { at: 'feet', fx: 'dust', size: 1.2, push: 1 }], [0.28, { at: 'feet', fx: 'dust', size: 1, push: 1 }], [0.3, { shake: 2 }]],
    cam: [[0.1, { z: 1.45, lead: 20, roll: 0, lag: 4 }]] });
  clip('stretch', { label: 'Vươn vai giãn cơ', view: 'front', face: { eyes: 'closed', brows: 'neutral', mouth: 'oSmall', fx: [] },
    keys: [[0.3, 'fReach', 'io'], [0.66, mix(C.POSES.fReach, { body: { rot: 18 }, head: { rot: 16 } }), 'sine'], [0.9, 'fReach2', 'io'], [1.3, mix(C.POSES.fStand, { head: { rot: -4 } }), 'io']],
    faces: [[0.9, { eyes: 'happy', mouth: 'cat' }]],
    events: [[0.6, { sfx: 'pop', gain: 0.6 }], [0.95, { sfx: 'pop', gain: 0.5 }]],
    cam: [[0, { z: 1.45, lead: 0, fy: 0.6, lag: 3 }], [1.3, { z: 1.75, fy: 0.62 }, 'lin']] });
  clip('guard', { label: 'Thủ thế', view: 'q90', face: { eyes: 'fierce', brows: 'angry', mouth: 'flat', fx: [] },
    keys: [[0.12, mix(C.POSES.guard, { root: { sy: 0.9 } }), 'out'], [0.6, 'guard', 'sine']],
    events: [[0.05, { letterbox: 1, music: 'epic' }], [0.2, { at: 'tip', fx: 'glint', sfx: 'chime', gain: 0.7, size: 1.4 }]],
    cam: [[0.05, { z: 2.1, lead: 70, fy: 0.62, roll: -3, lag: 5 }, 'snap']] });
  clip('thrust', { label: 'Đâm thẳng', view: 'q90', face: { eyes: 'fierce', brows: 'angry', mouth: 'shout' },
    keys: [[0.16, 'coil', 'out'], [0.26, 'lunge', 'snap'], [0.42, mix(C.POSES.lunge, { root: { x: -12 } }), 'out'], [0.64, 'guard', 'io']],
    travel: [[0, 0], [0.16, -6, 'out'], [0.26, 34, 'snap'], [0.64, 40, 'out']],
    events: [[0.16, { sfx: 'swish' }], [0.26, { at: 'tip', fx: 'impact', hitstop: 0.07, shake: 4, sfx: 'hit' }], [0.26, { fx: 'smear', smear: 0.1 }], [0.28, { at: 'tip', fx: 'text', text: 'VÚT!', dy: -26, size: 0.9 }]],
    cam: [[0.2, { z: 2.2, lead: 90, roll: -4 }, 'snap'], [0.6, { z: 1.9, roll: -2 }]] });
  clip('sweep', { label: 'Quét ngang', view: 'q90', face: { eyes: 'fierce', brows: 'angry', mouth: 'bite' },
    keys: [[0.16, mix(C.POSES.guard, { wR: 60, armR: { rot: -20 }, foreR: { rot: 30 }, root: { rot: 4 }, body: { rot: 8 } }), 'out'],
      [0.3, mix(C.POSES.crouch, { wR: -150, armR: { rot: 100 }, foreR: { rot: 0 }, root: { rot: -12, sy: 0.86 } }), 'snap'],
      [0.55, mix(C.POSES.crouch, { wR: -170, armR: { rot: 110 }, foreR: { rot: -6 }, root: { rot: -10, sy: 0.86 } }), 'out'], [0.75, 'guard', 'io']],
    travel: [[0, 0], [0.3, 18, 'snap'], [0.6, 22, 'out']],
    events: [[0.2, { sfx: 'swish', gain: 0.9 }], [0.3, { fx: 'smear', smear: 0.14 }], [0.32, { at: 'tip', fx: 'dust', size: 0.8 }], [0.32, { at: 'tip', fx: 'spark', size: 0.8, hit: true }]],
    cam: [[0.1, { z: 1.8, lead: 70, fy: 0.45, roll: 2 }]] });
  clip('heroPose', { label: 'Tạo dáng anh hùng', view: 'q90', face: { eyes: 'smug', brows: 'smug', mouth: 'smile', fx: ['sparkles'] },
    keys: [[0.35, mix(C.POSES.hero, { root: { sy: 0.96 } }), 'io'], [0.6, 'hero', 'back'], [0.95, mix(C.POSES.hero, { head: { rot: 10 } }), 'sine']],
    events: [[0.2, { letterbox: 0, sfx: 'sparkle' }], [0.45, { at: 'head', fx: 'glint', dx: -30, dy: -30, size: 1.4 }]],
    cam: [[0.1, { z: 1.3, lead: 0, fy: 0.55, roll: 0, lag: 3 }]] });
  clip('hitReact', { label: 'Trúng đá vào đầu', view: 'q90', face: { eyes: 'shut', brows: 'sad', mouth: 'wail', fx: [] },
    keys: [[0.08, 'hero'], [0.14, 'hitBack', 'snap'], [0.5, mix(C.POSES.hitBack, about(34, 100, 170)), 'out']],
    travel: [[0, 0], [0.14, -16, 'snap'], [0.5, -50, 'out']],
    events: [[0.14, { at: 'head', fx: 'projectile', flight: 0.32, from: 300 }], [0.14, { at: 'head', fx: 'impact', size: 1, hitstop: 0.07, shake: 6, sfx: 'hit' }], [0.16, { at: 'head', fx: 'text', text: 'BỐP!', dx: 30, dy: -40, size: 1.1, color: '#ff4d3d', rot: 10 }], [0.18, { music: 'comic' }]],
    cam: [[0.12, { z: 1.9, fy: 0.9, lead: -20, lag: 10 }, 'snap']] });
  clip('tumble', { label: 'Ngã ngửa lộn ra sau', view: 'q90', face: { eyes: 'spiral', brows: 'sad', mouth: 'wavy', fx: [] },
    keys: [[0.22, mix(C.POSES.sitFloor, about(70, 100, 170, { ground: 1 }), { thighR: { rot: 100 }, thighL: { rot: 90 }, armR: { rot: 140 } }), 'down'],
      [0.5, mix(C.POSES.airTuck, about(200, 100, 160, { ground: 1, y: -4 }), { wR: 160 }), 'lin'],
      [0.78, mix(C.POSES.airTuck, about(320, 100, 160, { ground: 1, y: -6 }), { wR: -60 }), 'lin'],
      [1.0, mix(C.POSES.sitFloor, about(360, 100, 170), { wR: 64 }), 'out']],
    travel: [[0, 0], [1.0, -90, 'out']],
    events: [[0.22, { sfx: 'boing', at: 'feet', fx: 'dust', size: 0.9 }], [1.0, { sfx: 'step', at: 'feet', fx: 'dust', size: 0.8 }]],
    cam: [[0.1, { z: 1.45, fy: 0.4, lead: -40, lag: 6 }]] });
  clip('dizzy', { label: 'Choáng váng', view: 'q90', face: { eyes: 'spiral', brows: 'worried', mouth: 'wavy', fx: ['stars'] },
    keys: [[0.12, mix(C.POSES.sitFloor, { wR: 64, head: { rot: -10, x: -3 } }), 'sine'], [0.37, mix(C.POSES.sitFloor, { wR: 64, head: { rot: 10, x: 3 }, body: { rot: 10 } }), 'sine'],
      [0.62, mix(C.POSES.sitFloor, { wR: 64, head: { rot: -12, x: -3 }, body: { rot: 2 } }), 'sine'], [0.87, mix(C.POSES.sitFloor, { wR: 64, head: { rot: 8, x: 2 } }), 'sine']],
    events: [[0.1, { sfx: 'tick', gain: 0.5 }], [0.5, { sfx: 'tick', gain: 0.5 }]],
    cam: [[0.05, { z: 2.4, fy: 0.62, lead: 0, roll: 5, lag: 6 }], [0.87, { roll: -4 }, 'sine']] });
  clip('kipUp', { label: 'Bật dậy', view: 'q90', face: { eyes: 'fierce', brows: 'determined', mouth: 'bite', fx: ['sweat'] },
    keys: [[0.2, mix(C.POSES.sitFloor, about(48, 100, 190, { ground: 1 }), { thighR: { rot: 140 }, thighL: { rot: 130 }, shinR: { rot: -30 }, wR: 64 }), 'io'],
      [0.36, mix(C.POSES.crouch, { root: { y: -44, sy: 1.12, sx: 0.92 }, wR: -60 }), 'snap'],
      [0.56, mix(C.POSES.crouch, { wR: -60 }), 'down', { ez: { 'root.y': 'down' } }], [0.72, mix(C.POSES.ready, { wR: -42, head: { rot: -14 } }), 'out'], [0.84, mix(C.POSES.ready, { wR: -42, head: { rot: 12 } }), 'sine']],
    travel: [[0, 0], [0.56, 30, 'out']],
    events: [[0.34, { sfx: 'whoosh' }], [0.56, { at: 'feet', fx: 'dust', size: 0.9, sfx: 'step' }]],
    cam: [[0.1, { z: 1.6, fy: 0.55, roll: 0, lead: 20, lag: 5 }]] });
  clip('rage', { label: 'Nổi giận dậm chân', view: 'q90', face: { eyes: 'angry', brows: 'angry', mouth: 'shout', fx: ['vein', 'steam'] },
    keys: [[0.16, mix(C.POSES.stompUp, { wR: -20 }), 'out'], [0.3, mix(C.POSES.stompDown, { wR: -30 }), 'snap'], [0.48, mix(S(C.POSES.stompUp), { wR: -20 }), 'out'], [0.62, mix(S(C.POSES.stompDown), { wR: -30 }), 'snap'],
      [0.9, mix(C.POSES.lunge, { root: { x: 0, rot: -6 }, armR: { rot: 90 }, wR: -90 }), 'back'], [1.1, mix(C.POSES.guard, { wR: -86 }), 'io']],
    events: [[0.3, { shake: 5, sfx: 'rumble', gain: 0.6, at: 'feet', fx: 'dust', size: 0.9 }], [0.62, { shake: 6, sfx: 'rumble', gain: 0.7, at: 'feet', fx: 'dust', size: 1 }],
      [0.66, { at: 'head', fx: 'text', text: 'HỪ!', dy: -50, size: 1.2, color: '#ff4d3d' }], [0.9, { grade: 'warm' }]],
    cam: [[0.1, { z: 2.0, fy: 0.75, lead: 20, roll: 0, lag: 6 }], [0.9, { z: 1.8, lead: 80, roll: -3 }, 'snap']] });
  clip('dash', { label: 'Lướt tới như gió', view: 'q90', face: { eyes: 'fierce', brows: 'angry', mouth: 'flat', fx: [] },
    keys: [[0.08, mix(C.POSES.coil, { wR: -84 }), 'out'], [0.2, mix(C.POSES.dash, { wR: -100 }), 'snap'], [0.42, mix(C.POSES.dash, { wR: -98, root: { rot: -24 } }), 'lin'], [0.56, mix(C.POSES.skid, { wR: -150 }), 'out']],
    travel: [[0, 0], [0.08, -6, 'out'], [0.42, 290, 'lin'], [0.56, 320, 'out']],
    events: [[0.12, { sfx: 'whoosh', gain: 1 }], [0.12, { ghosts: 0.42 }], [0.12, { lines: 0.42, style: 'h' }], [0.5, { at: 'feet', fx: 'dust', size: 1.2, push: 1 }], [0.95, { grade: 'none' }]],
    cam: [[0.1, { z: 1.5, lead: 140, fy: 0.5, roll: 0, lag: 7 }]] });
  clip('backflip', { label: 'Lộn ngược né đòn', view: 'q90', face: { eyes: 'focus', brows: 'determined', mouth: 'bite' },
    keys: [[0.12, mix(C.POSES.crouch, { wR: -60 }), 'out'],
      [0.3, mix(C.POSES.airTuck, about(120, 100, 175, { y: -60 }), { wR: 60 }), 'up'],
      [0.48, mix(C.POSES.airTuck, about(250, 100, 175, { y: -50 }), { wR: 190 }), 'lin'],
      [0.66, mix(C.POSES.crouch, about(360, 100, 175), { wR: -60 }), 'down'], [0.86, mix(C.POSES.guard, { wR: -86 }), 'out']],
    travel: [[0, 0], [0.12, 4, 'out'], [0.66, -120, 'io']],
    speed: [[0.2, 1], [0.32, 0.45], [0.5, 0.45], [0.6, 1]],
    events: [[0.14, { sfx: 'whoosh' }], [0.14, { at: 'feet', fx: 'dust', size: 0.8 }], [0.66, { sfx: 'step', at: 'feet', fx: 'dust', size: 1 }]],
    cam: [[0.1, { z: 1.6, fy: 0.75, lead: 0, roll: 0, lag: 6 }], [0.66, { z: 1.7, fy: 0.55 }]] });
  clip('block', { label: 'Gạt đỡ', view: 'q90', face: { eyes: 'fierce', brows: 'determined', mouth: 'bite' },
    keys: [[0.12, 'block', 'snap'], [0.3, mix(C.POSES.block, { wR: -26, root: { rot: 6, sy: 0.86 } }), 'out'], [0.6, 'block', 'io']],
    travel: [[0, 0], [0.16, 0], [0.42, -34, 'out']],
    events: [[0.16, { at: 'hand', dy: -40, fx: 'spark', size: 1.3, hitstop: 0.08, shake: 5, sfx: ['hit', 'chime'], flash: 0.35, flashColor: '#fff2c4' }], [0.18, { at: 'feet', fx: 'dust', size: 0.9, push: -1 }]],
    cam: [[0.08, { z: 2.1, fy: 0.6, lead: 50, roll: 3, lag: 8 }, 'snap']] });
  clip('victory', { label: 'Nhảy cẫng vui mừng', view: 'front', face: { eyes: 'happy', brows: 'raised', mouth: 'laugh', fx: ['sparkles'] },
    keys: [[0.24, mix(C.POSES.fShoulder, { wR: 64 }), 'back'], [0.44, mix(C.POSES.fHop, { wR: 64 }), 'up'], [0.62, mix(C.POSES.fShoulder, { wR: 64, root: { sy: 0.92 } }), 'down'], [0.82, mix(C.POSES.fHop, { wR: 64 }), 'up'], [1.0, mix(C.POSES.fShoulder, { wR: 64, root: { sy: 0.94 } }), 'down'], [1.1, mix(C.POSES.fShoulder, { wR: 64 }), 'out']],
    events: [[0.1, { sfx: 'party', gain: 0.7, grade: 'none' }], [0.62, { sfx: 'step', gain: 0.4 }], [1.0, { sfx: 'step', gain: 0.4 }]],
    cam: [[0.1, { z: 1.45, fy: 0.55, lead: 0, roll: 0, lag: 4 }]] });
  clip('dance', { label: 'Nhảy mừng', view: 'front', face: { eyes: 'happy', brows: 'raised', mouth: 'grin', fx: [] },
    keys: [[0.2, mix(C.POSES.fDanceL, { wR: 64 }), 'back'], [0.4, mix(C.POSES.fShoulder, { wR: 64, root: { sy: 0.94 } }), 'io'], [0.6, mix(C.POSES.fDanceR, { wR: 64 }), 'back'], [0.8, mix(C.POSES.fShoulder, { wR: 64, root: { sy: 0.94 } }), 'io'],
      [1.0, mix(C.POSES.fDanceL, { wR: 64, armL: { rot: 168 } }), 'back'], [1.2, mix(C.POSES.fShoulder, { wR: 64, root: { sy: 0.94 } }), 'io'], [1.4, mix(C.POSES.fDanceR, { wR: 64, armL: { rot: 170 } }), 'back'], [1.6, mix(C.POSES.fShoulder, { wR: 64 }), 'io']],
    faces: [[0.8, { eyes: 'closed', mouth: 'laugh' }]],
    events: [[0.2, { sfx: 'tick', gain: 0.5 }], [0.6, { sfx: 'tick', gain: 0.5 }], [1.0, { sfx: 'tick', gain: 0.5 }], [1.4, { sfx: 'tick', gain: 0.6 }]],
    cam: [[0.1, { z: 1.6, fy: 0.6, lead: 0, roll: 0, lag: 3 }], [0.6, { roll: 3 }, 'sine'], [1.0, { roll: -3 }, 'sine'], [1.4, { roll: 2 }, 'sine'], [1.6, { roll: 0 }, 'sine']] });
  clip('salute', { label: 'Ôm quyền thi lễ', view: 'front', face: { eyes: 'normal', brows: 'determined', mouth: 'flat', fx: [] },
    keys: [[0.3, mix(C.POSES.fSalute, { wR: 30 }), 'io'], [0.62, mix(C.POSES.fSalute, { wR: 30 }), 'sine'], [0.95, mix(C.POSES.fBow, { wR: 30 }), 'io'], [1.2, mix(C.POSES.fBow, { wR: 30 }), 'sine'], [1.45, mix(C.POSES.fSalute, { wR: 30 }), 'io']],
    faces: [[0.8, { eyes: 'closed' }], [1.35, { eyes: 'normal', mouth: 'smile' }]],
    events: [[0.3, { sfx: 'swish', gain: 0.4 }], [0.95, { sfx: 'gong', gain: 0.6, music: 'calm' }]],
    cam: [[0.1, { z: 1.7, fy: 0.62, lead: 0, roll: 0, lag: 3 }]] });
  clip('wave', { label: 'Vẫy chào khán giả', view: 'front', face: { eyes: 'happy', brows: 'raised', mouth: 'grin', fx: ['blush'] },
    keys: [[0.22, mix(C.POSES.fWave, { wR: 30 }), 'back'], [0.42, mix(C.POSES.fWave2, { wR: 30 }), 'sine'], [0.62, mix(C.POSES.fWave, { wR: 30 }), 'sine'], [0.82, mix(C.POSES.fWave2, { wR: 30 }), 'sine'], [1.0, mix(C.POSES.fWave, { wR: 30 }), 'sine']],
    events: [[0.25, { sfx: 'chime', gain: 0.5 }]],
    cam: [[0.1, { z: 2.3, fy: 0.85, lead: 0, roll: 0, lag: 4 }, 'io']] });

  /* ---------------- dùng trong PHIM (v0.15): thủ thế chờ, áp sát / lùi, trúng đòn — duel() ghép với hành động + phản ứng ---------------- */
  // giữ một dáng (mặc định thủ thế) trong st.dur giây, thở nhẹ — chờ tới lượt / chờ đối thủ ra đòn
  clip('hold', { label: 'Thủ thế chờ', view: 'q90', make: function (st) {
    var p = st.pose || 'guard', d = Math.max(0.24, st.dur || 0.4), P0 = C.POSES[p] || {}, hr = ((P0.head || {}).rot || 0);
    return { keys: [[0.2, p, 'out'], [d, mix(P0, { head: { rot: hr - 3 }, root: { sy: ((P0.root || {}).sy || 1) * 0.985 } }), 'sine']], dur: d };
  } });
  // áp sát (dist > 0) / lùi lại (dist < 0) cho đòn đánh chạm đúng đối thủ: xa thì lướt (bóng mờ, vạch tốc độ), gần thì nhún bước
  clip('stepIn', { label: 'Áp sát', view: 'q90', make: function (st) {
    var d = st.dist || 40, ad = Math.abs(d);
    if (ad > 140) {
      var T = 0.3 + ad / 1500;
      return { label: d > 0 ? 'Lướt tới' : 'Lùi xa', keys: [[0.08, d > 0 ? 'coil' : 'crouch', 'out'], [0.18, d > 0 ? 'dash' : mix(C.POSES.skid, { root: { rot: 12 } }), 'snap'], [T - 0.04, d > 0 ? mix(C.POSES.dash, { root: { rot: -22 } }) : 'skid', 'lin'], [T + 0.12, 'guard', 'out']],
        travel: [[0, 0], [0.08, d > 0 ? -4 : 4, 'out'], [T, d, 'lin'], [T + 0.12, d, 'out']],
        events: [[0.14, { sfx: 'whoosh', gain: 0.8 }], [0.14, { ghosts: T - 0.12 }], [0.14, { lines: T - 0.1, style: 'h' }], [T, { at: 'feet', fx: 'dust', size: 0.9, push: 1 }]], dur: T + 0.12 };
    }
    var n = Math.max(1, Math.round(ad / 45)), dt = 0.17 + ad / n / 600, keys = [];
    for (var i = 0; i < n; i++) {
      keys.push([dt * i + dt * 0.45, mix(C.POSES.guard, { root: { y: -7, sy: 1.04, sx: 0.98 }, thighR: { rot: d > 0 ? 52 : 18, sy: 1.25 }, thighL: { rot: d > 0 ? -14 : -48, sy: 1.25 }, hem: { rot: d > 0 ? -8 : 8 } }), 'out']);
      keys.push([dt * (i + 1), 'guard', 'in']);
    }
    var ev = []; for (var j = 1; j <= n; j++) ev.push([dt * j, { sfx: 'step', gain: 0.35 }]);
    return { label: d > 0 ? 'Bước tới' : 'Lùi lại', keys: keys, travel: [[0, 0], [dt * n, d, 'io']], events: ev, dur: dt * n };
  } });
  // trúng đòn (đối thủ đánh): bật ngửa, trượt lùi, gượng lại — không tự phát va chạm (đòn của người đánh đã có)
  clip('hurt', { label: 'Trúng đòn', view: 'q90', face: { eyes: 'shut', brows: 'sad', mouth: 'wail', fx: [] },
    keys: [[0.06, 'guard'], [0.14, 'hitBack', 'snap'], [0.46, mix(C.POSES.hitBack, about(30, 100, 170)), 'out'], [0.86, mix(C.POSES.ready, { head: { rot: 12 }, root: { rot: 4 } }), 'io']],
    faces: [[0.6, { eyes: 'teary', brows: 'worried', mouth: 'wavy', fx: ['sweat'] }]],
    travel: [[0, 0], [0.06, 0], [0.14, -16, 'snap'], [0.46, -54, 'out']],
    events: [[0.2, { at: 'feet', fx: 'dust', size: 0.8, push: -1 }]] });

  /* ---------------- TAY KHÔNG + HÀI (v0.16, Q10): đấm, đá, xô, ném — ai cũng làm được, không cần binh khí ---------------- */
  P('fistGuard', { $: 'guard', armR: { rot: 40 }, foreR: { rot: 96 }, armL: { rot: 46 }, foreL: { rot: 100 } });
  P('fistCoil', { $: 'coil', armR: { rot: 30 }, foreR: { rot: 104 }, armL: { rot: 40 }, foreL: { rot: 104 } });
  // chibi đầu to, tay chân ngắn: đổ người tới thì đầu vượt cả nắm tay → tay không ĐỨNG THẲNG / NGẢ RA SAU, vươn tay ngang tầm mặt đối thủ
  P('jabR', { $: 'fistGuard', root: { rot: 2, x: -4, sy: 0.97 }, body: { rot: 2 }, head: { rot: -2 }, thighR: { rot: 42 }, thighL: { rot: -32 }, armR: { rot: 104, sy: 1.8 }, foreR: { rot: -4, sy: 1.5 } });   // tay cao su: duỗi dài đúng khung ra đòn (hoạt hình 2D)
  P('crossL', { $: 'fistGuard', root: { rot: 6, x: -8 }, body: { rot: 6 }, head: { rot: 4 }, thighR: { rot: 46 }, shinR: { rot: -14 }, thighL: { rot: -38 }, armL: { rot: 108, sy: 2 }, foreL: { rot: -6, sy: 1.6 }, armR: { rot: 30 }, foreR: { rot: 104 } });
  P('kickChamber', { $: 'guard', root: { rot: 8, y: -4 }, body: { rot: 10 }, head: { rot: 4 }, thighR: { rot: 96 }, shinR: { rot: -110 }, thighL: { rot: -6 }, shinL: { rot: -6 },
    armR: { rot: 30 }, foreR: { rot: 90 }, armL: { rot: 20 }, foreL: { rot: 100 } });
  P('kickOut', { $: 'guard', root: { rot: 16, y: -2 }, body: { rot: 14 }, head: { rot: 8 }, thighR: { rot: 94, sy: 1.5 }, shinR: { rot: 0, sy: 1.6 }, footR: { rot: -12 }, thighL: { rot: -10 }, shinL: { rot: -4 },
    armR: { rot: 10 }, foreR: { rot: 80 }, armL: { rot: -10 }, foreL: { rot: 60 } });
  P('shoveLoad', { $: 'coil', armR: { rot: 60 }, foreR: { rot: 80 }, armL: { rot: 70 }, foreL: { rot: 80 } });
  P('shove', { $: 'fistGuard', root: { rot: 6, x: -6 }, body: { rot: 8 }, head: { rot: 6 }, thighR: { rot: 44 }, thighL: { rot: -36 }, armR: { rot: 110, sy: 1.7 }, foreR: { rot: -8, sy: 1.4 }, armL: { rot: 114, sy: 1.8 }, foreL: { rot: -8, sy: 1.5 } });   // đẩy MẶT (trò hề quen thuộc)
  P('throwWind', { $: 'ready', root: { rot: 10, x: 6 }, body: { rot: 12 }, head: { rot: 6 }, thighR: { rot: 20 }, thighL: { rot: -20 }, armR: { rot: -150 }, foreR: { rot: -40 }, armL: { rot: 70 }, foreL: { rot: 20 } });
  P('throwRelease', { $: 'lunge', root: { rot: -12, x: -8 }, body: { rot: -10 }, armR: { rot: 130 }, foreR: { rot: 10 }, armL: { rot: 20 }, foreL: { rot: 40 } });
  clip('punch', { label: 'Đấm liên hai cú', view: 'q90', face: { eyes: 'fierce', brows: 'angry', mouth: 'shout' },
    keys: [[0.1, 'fistCoil', 'out'], [0.18, 'jabR', 'snap'], [0.3, 'fistGuard', 'out'], [0.4, 'crossL', 'snap'], [0.66, 'fistGuard', 'io']],
    travel: [[0, 0], [0.18, 14, 'snap'], [0.4, 30, 'snap'], [0.66, 32, 'out']],
    events: [[0.14, { sfx: 'swish', gain: 0.6 }], [0.18, { at: 'hand', fx: 'spark', size: 0.7, sfx: 'hit', gain: 0.6, hit: true }], [0.34, { sfx: 'swish', gain: 0.7 }],
      [0.4, { at: 'handL', fx: 'impact', size: 1, hitstop: 0.07, shake: 4, sfx: 'hit' }], [0.42, { at: 'handL', fx: 'text', text: 'BỐP!', dy: -24, size: 1, color: '#ff4d3d', rot: -8 }]],
    cam: [[0.1, { z: 2.0, lead: 70, fy: 0.6, roll: -2, lag: 6 }], [0.4, { z: 2.2, roll: 3 }, 'snap'], [0.66, { z: 1.9, roll: 0 }]] });
  clip('kick', { label: 'Đá thẳng', view: 'q90', face: { eyes: 'fierce', brows: 'angry', mouth: 'bite' },
    keys: [[0.14, 'kickChamber', 'out'], [0.3, 'kickOut', 'snap'], [0.48, 'kickChamber', 'out'], [0.72, 'fistGuard', 'io']],
    travel: [[0, 0], [0.14, 10, 'out'], [0.3, 42, 'snap'], [0.72, 46, 'out']],
    events: [[0.22, { sfx: 'whoosh', gain: 0.8 }], [0.3, { at: 'foot', fx: 'impact', size: 1.1, hitstop: 0.08, shake: 5, sfx: 'hit' }], [0.32, { at: 'foot', fx: 'text', text: 'BỊCH!', dy: -30, size: 1.1, color: '#ff4d3d', rot: 8 }]],
    cam: [[0.1, { z: 1.9, lead: 60, fy: 0.5, roll: 0, lag: 6 }], [0.3, { z: 2.1, roll: -3 }, 'snap'], [0.72, { z: 1.8, roll: 0 }]] });
  clip('push', { label: 'Đẩy mặt', view: 'q90', face: { eyes: 'fierce', brows: 'angry', mouth: 'bite' },
    keys: [[0.14, 'shoveLoad', 'out'], [0.28, 'shove', 'snap'], [0.5, { $: 'shove', root: { rot: 8, x: -8 } }, 'out'], [0.75, 'ready', 'io']],
    travel: [[0, 0], [0.28, 30, 'snap'], [0.5, 36, 'out']],
    events: [[0.2, { sfx: 'whoosh', gain: 0.6 }], [0.28, { at: 'hand', fx: 'impact', size: 0.9, hitstop: 0.06, shake: 3, sfx: 'boing' }], [0.3, { at: 'hand', fx: 'text', text: 'HUỴCH!', dy: -30, size: 1, color: '#ff9a3c', rot: -6 }]],
    cam: [[0.1, { z: 1.9, lead: 50, fy: 0.55, roll: 0, lag: 6 }]] });
  // ném: buông tay ở sự kiện release — duel() tự tính đường bay tới ngực đối thủ + lúc trúng; cất đồ cầm tay phải trong lúc ném
  clip('throw', { label: 'Ném', view: 'q90', face: { eyes: 'smug', brows: 'smug', mouth: 'grin' }, hide: ['heldR', 'tallR'],
    keys: [[0.14, 'throwWind', 'out'], [0.3, { $: 'throwWind', armR: { rot: -160 }, root: { rot: 12, x: 8 } }, 'sine'], [0.38, 'throwRelease', 'snap'],
      [0.56, { $: 'throwRelease', root: { rot: -16 }, armR: { rot: 160 }, foreR: { rot: 20 }, armL: { rot: 10 } }, 'out'], [0.85, 'ready', 'io']],
    travel: [[0, 0], [0.38, 12, 'snap'], [0.6, 14, 'out']],
    events: [[0.3, { sfx: 'whoosh', gain: 0.7 }], [0.38, { release: true, sfx: 'swish', gain: 0.6 }]],
    cam: [[0.1, { z: 1.6, lead: 90, fy: 0.55, roll: 0, lag: 6 }]] });

  // TỪ VỰNG PHIM của BỘ KHUNG (trung lập chủ đề, Q10 — ADR 0006): bước kịch bản { action, target, react } → clip người đánh + clip phản ứng
  //   id hành động (khoá dưới đây) KHÔNG trùng id hoạt động (activity) / trạng thái (state) của kịch bản — CNS-065, test.sh 2j2 kiểm; id clip là không gian tên riêng
  //   attack: cần target, có điểm va chạm (sự kiện hitstop / hit; điểm đánh = "at" của sự kiện: tip / hand / handL / foot)
  //   needs: 'weapon' — chỉ diễn viên cầm binh khí (heldR) mới dùng được; ranged: đòn ném (art: vật ném)
  //   Đòn riêng của một chủ đề (vd. thương / kiếm kiểu Tử Long) nằm trong GÓI ĐỘNG TÁC của bộ chủ đề đó, không ở khung.
  Object.assign(C.ACTIONS, {
    punch: { label: 'Đấm liên hai cú', clips: ['punch'], attack: true, aim: 'head', hint: 'tay không, đánh gần vào mặt' },
    kick: { label: 'Đá thẳng', clips: ['kick'], attack: true, hint: 'tay không' },
    push: { label: 'Đẩy mặt', clips: ['push'], attack: true, aim: 'head', hint: 'hài, không đau' },
    throw: { label: 'Ném cà chua', clips: ['throw'], attack: true, ranged: true, art: 'tomato', hint: 'hài, ném từ xa — không cần áp sát' },
    weaponThrust: { label: 'Đâm thẳng (binh khí)', clips: ['thrust'], attack: true, needs: 'weapon' },
    sweep: { label: 'Quét ngang (binh khí)', clips: ['sweep'], attack: true, needs: 'weapon' },
    stompRage: { label: 'Dậm chân nổi giận', clips: ['rage'] },
    hero: { label: 'Tạo dáng anh hùng', clips: ['heroPose'] },
    joyHop: { label: 'Nhảy cẫng vui mừng', clips: ['victory'] },
    dance: { label: 'Nhảy mừng', clips: ['dance'] },
    fistSalute: { label: 'Ôm quyền thi lễ', clips: ['salute'] },
    waveHello: { label: 'Vẫy chào', clips: ['wave'] },
    stretch: { label: 'Vươn vai', clips: ['stretch'] },
    scratch: { label: 'Gãi đầu', clips: ['scratch'] },
    startle: { label: 'Giật nảy mình', clips: ['startle'] },
    flip: { label: 'Lộn ngược ra sau', clips: ['backflip'] }
  });
  Object.assign(C.REACTS, {
    hit: { label: 'Trúng đòn', clips: ['hurt'], contact: 0.06 },
    fall: { label: 'Ngã lộn rồi bật dậy', clips: ['hurt', 'tumble', 'kipUp'], contact: 0.06 },
    ko: { label: 'Ngã choáng', clips: ['hurt', 'tumble', 'dizzy'], contact: 0.06 },
    block: { label: 'Gạt đỡ', clips: ['block'], contact: 0.16 },
    dodge: { label: 'Lộn ra sau né', clips: ['backflip'], contact: 0.3, miss: true }
  });
  Object.keys(C.ACTIONS).forEach(function (k) { if (!C.ACTIONS[k].pack) C.ACTIONS[k].pack = C.FRAME_PACK; });
  // CNS-065 (v0.23): id đòn khung không trùng activity / state của kịch bản (luật như gói). Id cũ (≤ v0.22) còn là bí danh — tác phẩm cũ diễn y hệt,
  // đọc / ghi qua server thì được chuyển sang id mới (engine/choreo.js migrateWork). Không thêm bí danh mới: id mới đặt đúng luật ngay từ đầu.
  [['thrust', 'weaponThrust'], ['rage', 'stompRage'], ['victory', 'joyHop'], ['salute', 'fistSalute'], ['wave', 'waveHello']].forEach(function (p) { C.aliasAction(p[0], p[1]); });
})(typeof window !== 'undefined' ? window.GenChibi : globalThis.GenChibi);
