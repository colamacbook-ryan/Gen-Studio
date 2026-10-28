// © 2026 Gen Labs — All rights reserved.
// Sân khấu: đường dựng một khung (SPEC-0.2.0 §2.2). window.__still(mode, payload) → Promise<measures> gọi GSStill[mode](payload); KHÔNG chạy vòng __seek theo khung.
// Mỗi gói đăng ký chế độ của mình SAU file này: GSStill.brand (B), GSStill.thumb (T), GSStill.frame (U), GSStill.cast (K, file cast-sheet.js).
// Ở đây chỉ có bản mặc định (stub: true) để đường still chạy được từ P0a; gói sở hữu ghi đè bằng bản thật.
(function () {
  'use strict';
  var GS = window.GSStill = window.GSStill || {};
  var MODES = ['brand', 'thumb', 'frame', 'cast'];

  // dựng khung giữ chỗ: nền sáng + nhãn chế độ; trả số đo tối thiểu
  function placeholder(mode, payload) {
    var root = document.getElementById('stage');
    root.innerHTML = '';
    var box = document.createElement('div');
    box.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:700 64px sans-serif;color:#1D2A6E;background:#F6F7FC';
    box.textContent = 'still:' + mode + (payload && payload.label ? ' · ' + payload.label : '');
    root.appendChild(box);
    return { mode: mode, stub: true };
  }
  MODES.forEach(function (m) {
    if (!GS[m]) { GS[m] = function (payload) { return placeholder(m, payload); }; GS[m].stub = true; }
  });
  // frame: có payload.plan thì dựng đúng khung của sân khấu (cùng __load/__seek) — xem trước một khung của bài
  GS.frame = function (payload) {
    if (!payload || !payload.plan) return placeholder('frame', payload);
    return Promise.resolve(window.__load(payload.plan)).then(function (info) {
      window.__seek(payload.t_ms || 0);
      return { mode: 'frame', stub: false, beats: info && info.beats, actors: info && info.actors };
    });
  };

  window.__still = function (mode, payload) {
    var fn = GS[mode];
    if (typeof fn !== 'function') return Promise.reject(new Error('chế độ still "' + mode + '" chưa đăng ký (có: ' + Object.keys(GS).join(', ') + ')'));
    return Promise.resolve(fn(payload || {})).then(function (m) {
      return document.fonts && document.fonts.ready ? document.fonts.ready.then(function () { return m === undefined ? {} : m; }) : (m === undefined ? {} : m);
    });
  };
})();
