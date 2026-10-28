// © 2026 Gen Labs — All rights reserved.
// STUB do gói P0b tạo (SPEC-0.2.0 §5.5, §13.2): gói T sở hữu file này. Nạp SAU still.js.
//   GSThumb.render(spec) — dựng DOM tĩnh 1920×1080 (nền brand, mặt chính, sidekick, khối visual, chữ tiêu đề co trong hộp) và trả bbox từng phần + cỡ chữ thật (toạ độ 1280).
//   GSThumb.textOff()    — ẩn lớp chữ để Node đo tương phản bằng hiệu hai ảnh. HỢP ĐỒNG: GSStill.thumb(spec) PHẢI hiểu spec.textOff === true (renderPlan dựng mỗi phương án 2 lần: có chữ / không chữ).
// Bản stub: dựng khung giữ chỗ có chữ "still:thumb"; textOff ⇒ bỏ chữ. measures.stub = true (test h-still dựa vào).
(function () {
  'use strict';
  var GS = window.GSStill = window.GSStill || {};
  var GT = window.GSThumb = window.GSThumb || {
    stub: true,
    render: function (spec) {
      var root = document.getElementById('stage'); root.innerHTML = '';
      var box = document.createElement('div');
      box.className = 'thumb-stub';
      box.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:700 64px sans-serif;color:#1D2A6E;background:#F6F7FC';
      var txt = document.createElement('span'); txt.className = 'thumb-text';
      txt.textContent = (spec && spec.textOff) ? '' : 'still:thumb' + (spec && spec.label ? ' · ' + spec.label : '');
      box.appendChild(txt); root.appendChild(box);
      return { mode: 'thumb', stub: true };
    },
    textOff: function () { var t = document.querySelector('.thumb-text'); if (t) t.style.visibility = 'hidden'; }
  };
  if (!GS.thumb || GS.thumb.stub) { GS.thumb = function (payload) { return GT.render(payload || {}); }; GS.thumb.stub = true; }
})();
