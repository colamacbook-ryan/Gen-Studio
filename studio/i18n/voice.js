// © 2026 Gen Labs — All rights reserved.
// Chuỗi giao diện của gói L — giọng offline (bước "Giọng đọc" của thiết lập + màn Nhà cung cấp). vi và en CÙNG bộ khoá.
export const vi = {
  'voff.opt_gemini': 'Gemini (cần khoá)', 'voff.opt_gemini_hint': 'Giọng và giám khảo của Google. Cần khoá Google Gemini.',
  'voff.opt_offline': 'Giọng offline trên máy (không cần khoá)', 'voff.opt_offline_hint': 'VieNeu-TTS đọc tiếng Việt, faster-whisper làm giám khảo. Chạy trên máy này, không gửi dữ liệu ra ngoài.',
  'voff.enable': 'Bật giọng offline', 'voff.enabled': 'Đã bật giọng offline. Đang kiểm dịch vụ…',
  'voff.need_pull': 'Dịch vụ giọng offline chưa sẵn sàng. Trên máy chủ, chạy lệnh dưới đây (tải ~1 GB model lần đầu), rồi bấm Quét lại.',
  'voff.fix_error': 'Model giọng offline không khớp bản đã ghim nên bị từ chối nạp. Chạy lại lệnh dưới đây trên máy chủ, rồi bấm Quét lại.',
  'voff.voices': '{n} giọng có sẵn',
  'voff.state.ready': 'sẵn sàng', 'voff.state.loading': 'đang nạp model', 'voff.state.verifying': 'đang kiểm model',
  'voff.state.missing': 'chưa tải model', 'voff.state.error': 'model lỗi', 'voff.state.unknown': 'chưa rõ',
  'voff.gender.female': 'nữ', 'voff.gender.male': 'nam',
  'voff.disable_row': 'Tắt nhà cung cấp này', 'voff.enable_row': 'Bật nhà cung cấp này',
};
export const en = {
  'voff.opt_gemini': 'Gemini (needs a key)', 'voff.opt_gemini_hint': 'Google voices and judge. Needs a Google Gemini key.',
  'voff.opt_offline': 'Offline voice on this machine (no key)', 'voff.opt_offline_hint': 'VieNeu-TTS reads Vietnamese, faster-whisper judges. Runs on this machine; no data leaves it.',
  'voff.enable': 'Enable offline voice', 'voff.enabled': 'Offline voice enabled. Checking the service…',
  'voff.need_pull': 'The offline voice service is not ready. On the server, run the command below (downloads ~1 GB of models the first time), then click Rescan.',
  'voff.fix_error': 'The offline voice models do not match the pinned version and were refused. Run the command below on the server again, then click Rescan.',
  'voff.voices': '{n} voices available',
  'voff.state.ready': 'ready', 'voff.state.loading': 'loading models', 'voff.state.verifying': 'checking models',
  'voff.state.missing': 'models not downloaded', 'voff.state.error': 'model error', 'voff.state.unknown': 'unknown',
  'voff.gender.female': 'female', 'voff.gender.male': 'male',
  'voff.disable_row': 'Disable this provider', 'voff.enable_row': 'Enable this provider',
};
