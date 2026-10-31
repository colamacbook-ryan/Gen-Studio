// © 2026 Gen Labs — All rights reserved.
// Adapter: kết quả máy kiểm (server/checks/index.js, gói E — {code, level:'M'|'M*'|'H'|'M + H', pass, measured,
// note_vi, note_en}) → hàng ghi được qua write('submission.record_checks', {results:[{criterion, severity, level, …}]}).
// Không đụng DB — chỉ đổi hình dạng dữ liệu, gói A gọi adapter rồi tự write().
'use strict';

// 'M'/'M*'/'H'/'M + H' (chuỗi lẫn, xem server/checks/index.js) → severity CHECK('M','M*','H') của asset_checks.
function severityOf(level) {
  const s = String(level || '');
  if (s.startsWith('M*')) return 'M*';
  if (s.startsWith('M')) return 'M';   // 'M' hoặc 'M + H' (gói E dùng cho tiêu chí M chưa cài máy đo) ⇒ vẫn là M (chặn)
  return 'H';
}

// pass: true đạt / false trượt / null chưa đo được (M chưa phủ, hoặc số đo chỉ tham khảo) — DB không có mức
// "pending" nên null ánh xạ 'warn' (không chặn ngầm như 'ok', không coi là trượt hẳn như 'fail' — xem gói E finish()).
function levelOf(pass) {
  return pass === true ? 'ok' : pass === false ? 'fail' : 'warn';
}

// toDbResults(runResult) → [{criterion, severity, level, measured, detail}] cho results của submission.record_checks.
function toDbResults(runResult) {
  const checks = (runResult && runResult.checks) || [];
  return checks.map((c) => ({
    criterion: c.code,
    severity: severityOf(c.level),
    level: levelOf(c.pass),
    measured: c.measured,
    detail: c.note_vi,
  }));
}

module.exports = { toDbResults, severityOf, levelOf };
