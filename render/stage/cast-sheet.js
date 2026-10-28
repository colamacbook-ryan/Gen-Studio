// © 2026 Gen Labs — All rights reserved.
// GSStill.cast — STUB do gói P0a tạo (CNS-120). Gói K sở hữu file này và thay bằng bản thật: lưới 5 hướng × mood, bóng xám 32/64 px,
// bbox + mặt nạ để Node đo XOR, mặt cắt 168×94, mock ảnh bìa. Chữ ký giữ nguyên: GSStill.cast(payload) → measures | Promise<measures>.
(function () {
  'use strict';
  var GS = window.GSStill = window.GSStill || {};
  GS.cast = function (payload) {
    var root = document.getElementById('stage');
    root.innerHTML = '';
    var box = document.createElement('div');
    box.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:700 64px sans-serif;color:#1D2A6E;background:#F6F7FC';
    box.textContent = 'still:cast (stub)';
    root.appendChild(box);
    return { mode: 'cast', stub: true };
  };
  GS.cast.stub = true;
})();
