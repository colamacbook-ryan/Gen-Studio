// © 2026 Gen Labs — All rights reserved.
// Gói F: kiểm cấu hình đóng gói (compose, Dockerfile, install.sh, cli) — không cần Docker hay mạng.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

// Parser YAML tối thiểu cho compose: map lồng bằng thụt lề, list "- x", scalar. Đủ cho file của repo.
function parseYaml(text) {
  const lines = text.split('\n').map((l) => l.replace(/\s+#.*$/, '').replace(/^#.*$/, '')).filter((l) => l.trim());
  let i = 0;
  const scalar = (v) => v.trim().replace(/^["']|["']$/g, '');
  function block(indent) {
    const first = lines[i];
    if (first.trim().startsWith('- ')) {
      const arr = [];
      while (i < lines.length && lines[i].search(/\S/) === indent && lines[i].trim().startsWith('- ')) {
        arr.push(scalar(lines[i].trim().slice(2))); i++;
      }
      return arr;
    }
    const obj = {};
    while (i < lines.length && lines[i].search(/\S/) === indent) {
      const m = lines[i].trim().match(/^([^:]+):\s*(.*)$/);
      i++;
      if (m[2] === '') {
        if (i < lines.length && lines[i].search(/\S/) > indent) obj[m[1]] = block(lines[i].search(/\S/)); else obj[m[1]] = null;
      } else if (m[2].startsWith('[') && m[2].endsWith(']')) {
        obj[m[1]] = m[2].slice(1, -1).split(',').map(scalar).filter(Boolean);
      } else if (m[2] === '{}') obj[m[1]] = {};
      else obj[m[1]] = scalar(m[2]);
    }
    return obj;
  }
  return block(lines[0].search(/\S/));
}

const compose = parseYaml(read('docker-compose.yml'));

test('parser compose đọc được hai service', () => {
  assert.ok(compose.services.studio);
  assert.ok(compose.services.agent);
});

test('CNS-034: service agent KHÔNG có volume dữ liệu và không có docker.sock', () => {
  const agent = compose.services.agent;
  const vols = agent.volumes || [];
  for (const v of vols) {
    const src = String(v).split(':')[0];
    assert.notStrictEqual(src, 'data');
    assert.ok(!/(^|\/)data(\/|$)/.test(src), `agent mount dữ liệu: ${v}`);
    assert.ok(!/docker\.sock/.test(v));
    assert.ok(!/^[./~]/.test(src), `agent không được bind-mount đường dẫn host: ${v}`);
  }
  assert.deepStrictEqual(vols.map((v) => String(v).split(':')[0]), ['agent-home']);
  assert.ok(!agent.env_file, 'agent không dùng env_file (không rò secret của studio)');
  assert.ok(!/docker\.sock/.test(read('docker-compose.yml')), 'không mount docker.sock ở bất kỳ đâu');
  assert.ok(!('privileged' in agent) && !('network_mode' in agent));
  const env = JSON.stringify(agent.environment || {});
  assert.ok(!/MASTER_KEY|DATA_DIR/.test(env), 'agent không nhận khoá chính / DATA_DIR');
});

test('studio: cổng chỉ loopback, có volume data, DATA_DIR=/data', () => {
  const s = compose.services.studio;
  assert.ok(s.ports.every((p) => p.startsWith('127.0.0.1:')), 'cổng phải bind 127.0.0.1');
  assert.ok(s.ports.some((p) => p.includes('GS_PORT:-7490')));
  assert.ok(s.volumes.some((v) => v.endsWith(':/data')));
  assert.strictEqual(s.environment.DATA_DIR, '/data');
});

test('Dockerfile studio không chạy root, có HEALTHCHECK /api/health, CMD server/main.js, volume /data', () => {
  const d = read('Dockerfile');
  const users = [...d.matchAll(/^USER\s+(\S+)/gm)].map((m) => m[1]);
  assert.ok(users.length > 0 && users[users.length - 1] !== 'root' && users[users.length - 1] !== '0');
  assert.match(d, /HEALTHCHECK[\s\S]*\/api\/health/);
  assert.match(d, /CMD \["node", "server\/main\.js"\]/);
  assert.match(d, /VOLUME \/data/);
  assert.match(d, /FROM node:22-bookworm-slim/);
  assert.match(d, /chromium/); assert.match(d, /ffmpeg/); assert.match(d, /fonts-noto-core/);
  assert.ok(!/claude-code/.test(d), 'Claude Code CLI chỉ ở image agent');
});

test('Dockerfile.agent: không root, không volume /data, có Claude Code CLI + runner', () => {
  const d = read('Dockerfile.agent');
  const users = [...d.matchAll(/^USER\s+(\S+)/gm)].map((m) => m[1]);
  assert.ok(users.length > 0 && users[users.length - 1] !== 'root');
  assert.ok(!/VOLUME\s+\/data/.test(d));
  assert.match(d, /npm install -g "@anthropic-ai\/claude-code/);
  assert.match(d, /agent\/runner\.js/);
  assert.match(d, /GS_MCP_URL=http:\/\/studio:7490\/mcp/);
});

test('install.sh: set -euo pipefail, không hỏi tương tác', () => {
  const s = read('install.sh');
  assert.match(s, /^set -euo pipefail$/m);
  const code = s.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
  assert.ok(!/(^|[;&|\s])read\s+(-\w+\s+)*\w+/m.test(code), 'install.sh không được có read');
  assert.match(code, /get\.docker\.com/);
  assert.match(code, /admin-key/);
  assert.match(code, /#\/setup\?k=/);
});

test('bash -n cho mọi script', () => {
  const files = ['install.sh', 'cli/genstudio', 'tools/test.sh'];
  for (const f of files) {
    const r = spawnSync('bash', ['-n', path.join(root, f)], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, `${f}: ${r.stderr}`);
  }
});

test('cli/genstudio có đủ lệnh, mcp qua docker compose exec -T', () => {
  const s = read('cli/genstudio');
  for (const c of ['start)', 'stop)', 'restart)', 'status)', 'logs)', 'update)', 'backup)', 'restore)', 'uninstall)', 'mcp)', 'password)', 'lang)', 'open)', 'agent-login)']) {
    assert.ok(s.includes(c), `thiếu lệnh ${c}`);
  }
  assert.match(s, /exec -T studio node server\/mcp-stdio\.js/);
  assert.match(s, /run --rm -it agent claude login/);
});

test('backup không chứa data/.env (khoá chủ) và nhắc cất khoá riêng', () => {
  const s = read('cli/genstudio');
  assert.match(s, /tar -czf[^\n]*--exclude=data\/\.env/);
  assert.match(s, /KHÔNG chứa GS_MASTER_KEY/);
  assert.match(s, /master_key_mismatch/);
});
