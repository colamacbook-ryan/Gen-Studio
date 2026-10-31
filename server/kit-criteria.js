// © 2026 Gen Labs — All rights reserved.
// Hằng số tiêu chí STANDARD-KIT-v1 §3.4/§4 — dùng chung giữa server/checks/ (máy kiểm, gói E) và
// server/ops/kit.js (cổng duyệt/chứng nhận, gói A). MỘT nguồn: suy classify() của gói E để khỏi lệch khi
// gói E đổi cách phân nhóm mã ô.
// requiredCriteria(slotCode) → { m: [mã tiêu chí MỨC M bắt buộc 'ok'/waived trước khi chứng nhận],
//                                 mh: [mã tiêu chí M*/H cần Ryan tick trong kit_certs.h_ticks] }
'use strict';
const { classify } = require('./checks');

function requiredCriteria(slotCode) {
  const cls = classify(slotCode);
  const m = ['GEN-FMT'];   // mọi loại: định dạng/magic bytes đúng (STANDARD-KIT-v1 §7 bước 1; DB-GK-0.1 §4.7)
  const mh = [];
  if (cls.group === 'char') {
    m.push('CH-01', 'CH-02', 'CH-03');           // kích thước/chống đệm, nền đúng màu, không lẫn màu nền
    mh.push('CH-09', 'CH-10');                    // H: đúng nhân vật/phong cách, diễn đọc được
    if (cls.sub === 'expr') {
      m.push('CH-05');                            // vai chạm mép (chỉ biểu cảm)
      mh.push('CH-04');                           // M* — khoá khung biểu cảm (chưa có máy dò mốc mặt)
      if (/^0[1-6]$/.test(cls.n)) m.push('CH-06'); // khẩu hình .expr.01–06: chỉ khác miệng
    } else if (cls.sub === 'pose') {
      m.push('CH-07');                            // chân chạm đường đất (chỉ tư thế)
      mh.push('CH-08');                           // M* — cùng tỉ lệ (pose, id)
    } else if (cls.sub === 'id') {
      mh.push('CH-08');
    }
  } else if (cls.group === 'scene') {
    m.push('SC-01');
    if (cls.fg) m.push('SC-02');                  // tiền cảnh: bắt buộc kênh alpha
    mh.push('SC-03', 'SC-04', 'SC-05');
  } else if (cls.group === 'prop') {
    m.push('PR-01', 'CH-02', 'PR-02');
    mh.push('PR-03', 'PR-04');
  } else if (cls.group === 'fx') {
    m.push('FX-01', 'CH-02', 'FX-02');
    mh.push('FX-03', 'FX-04');
  } else if (cls.group === 'ui') {
    m.push('UI-01');
    mh.push('UI-02', 'UI-03');
  } else if (cls.group === 'audio') {
    m.push('AU-01', 'AU-02');
    if (cls.isMusic) m.push('AU-03');
    if (cls.isSfx) m.push('AU-04');
    mh.push('AU-05', 'AU-06', 'AU-07');
  } else if (cls.group === 'motion') {
    m.push('MO-01', 'MO-02');
    mh.push('MO-03', 'MO-04');
  } else if (cls.group === 'font') {
    m.push('FO-01', 'FO-02', 'FO-03');
    mh.push('FO-04');
  }
  return { m, mh, group: cls.group };
}

module.exports = { requiredCriteria };
