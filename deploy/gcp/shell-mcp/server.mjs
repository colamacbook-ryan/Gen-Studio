#!/usr/bin/env node
// MCP shell cấp cứu cho VM Gen-Studio. © 2026 Gen Labs — All rights reserved.
// Chỉ nghe loopback 127.0.0.1:7777, đường /mcp, Streamable HTTP không trạng thái (stateless).
// Vào bằng Bearer token đọc từ GS_SHELL_TOKEN_FILE — KHÔNG mở cổng công khai, KHÔNG qua Caddy.
// Dùng khi Claude Code trên VM hết quota: Ryan nối SSH tunnel từ máy nhà vào, chạy tiếp bằng agy/Gen-hub.
// Biến môi trường:
//   GS_SHELL_TOKEN_FILE  mặc định /opt/gs-deploy/shell-token
//   GS_SHELL_LOG         mặc định /var/log/gs-shell-mcp.log
//   GS_SHELL_ALLOW_DIRS  mặc định /home/genstudio:/opt/gen-studio (cách nhau bằng ":") — phạm vi read_file/write_file

import http from "node:http";
import { spawn } from "node:child_process";
import { promises as fsp } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const HOST = "127.0.0.1";
const PORT = 7777;
const TOKEN_FILE = process.env.GS_SHELL_TOKEN_FILE || "/opt/gs-deploy/shell-token";
const LOG_PATH = process.env.GS_SHELL_LOG || "/var/log/gs-shell-mcp.log";
const ALLOW_DIRS_RAW = (process.env.GS_SHELL_ALLOW_DIRS || "/home/genstudio:/opt/gen-studio")
  .split(":")
  .filter(Boolean);

const MAX_OUTPUT_BYTES = 200 * 1024; // mỗi luồng stdout/stderr của run_shell, cắt tối đa 200 KB — giữ phần cuối
const DEFAULT_READ_BYTES = 200 * 1024; // mặc định read_file
const HARD_READ_CEILING = 10 * 1024 * 1024; // trần cứng cho max_bytes dù client xin nhiều hơn — chống đọc file khổng lồ làm nghẽn
const DEFAULT_TIMEOUT_SEC = 120;
const MAX_TIMEOUT_SEC = 600;

// ---------- khởi động: đọc token + dò thư mục cho phép ----------

let TOKEN;
try {
  TOKEN = (await fsp.readFile(TOKEN_FILE, "utf8")).trim();
} catch (err) {
  console.error(`✗ Không đọc được token tại ${TOKEN_FILE}: ${err.message}`);
  process.exit(1);
}
if (!TOKEN) {
  console.error(`✗ Token rỗng tại ${TOKEN_FILE}`);
  process.exit(1);
}

const ALLOWED_ROOTS = [];
for (const d of ALLOW_DIRS_RAW) {
  try {
    ALLOWED_ROOTS.push(await fsp.realpath(d));
  } catch {
    console.warn(`! thư mục cho phép chưa tồn tại lúc khởi động (vẫn chấp nhận theo đường dẫn khai báo): ${d}`);
    ALLOWED_ROOTS.push(path.resolve(d));
  }
}

function isWithinAllowed(realPath) {
  return ALLOWED_ROOTS.some((root) => realPath === root || realPath.startsWith(root + path.sep));
}

// ---------- so sánh token kiểu timing-safe ----------

function timingSafeEqualStr(a, b) {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    // so bBuf với chính nó để thời gian chạy không khác gì so với nhánh đúng cỡ — tránh lộ độ dài token qua thời gian
    crypto.timingSafeEqual(bBuf, bBuf);
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

// ---------- log mọi lệnh gọi ----------

function truncate(s, n) {
  if (typeof s !== "string") return s;
  return s.length > n ? s.slice(0, n) + "…" : s;
}

async function logCall({ tool, arg, exit_code, ms, extra }) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    tool,
    arg: truncate(arg ?? "", 500),
    exit_code: exit_code ?? null,
    ms,
    ...(extra ? { extra: truncate(String(extra), 500) } : {}),
  });
  try {
    await fsp.appendFile(LOG_PATH, line + "\n");
  } catch (err) {
    console.error(`! không ghi được log tại ${LOG_PATH}: ${err.message}`);
  }
}

// ---------- bộ gom output cắt tối đa N byte, giữ phần cuối ----------

function makeCollector(maxBytes) {
  let chunks = [];
  let total = 0;
  return {
    push(buf) {
      chunks.push(buf);
      total += buf.length;
      if (total > maxBytes * 2) {
        const merged = Buffer.concat(chunks);
        const tail = merged.subarray(merged.length - maxBytes);
        chunks = [tail];
        total = tail.length;
      }
    },
    final() {
      const merged = Buffer.concat(chunks);
      return merged.length <= maxBytes ? merged : merged.subarray(merged.length - maxBytes);
    },
  };
}

// ---------- run_shell ----------

function runShell(cmd, cwd, timeoutSec) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn("bash", ["-lc", cmd], {
        cwd: cwd ? path.resolve(cwd) : undefined,
        env: process.env,
        detached: true, // tiến trình con làm trưởng nhóm riêng (pid = pgid) ⇒ giết được cả nhóm, kể cả tiến trình nền nó để lại
      });
    } catch (err) {
      resolve({ stdout: "", stderr: err.message, exitCode: -1, timedOut: false });
      return;
    }
    const out = makeCollector(MAX_OUTPUT_BYTES);
    const err = makeCollector(MAX_OUTPUT_BYTES);
    let timedOut = false;
    let settled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, "SIGKILL"); // pid âm ⇒ giết cả process group, không chỉ tiến trình bash -lc
      } catch {
        try {
          child.kill("SIGKILL");
        } catch {
          /* tiến trình đã chết trước đó — bỏ qua */
        }
      }
    }, timeoutSec * 1000);

    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => err.push(d));
    child.on("error", (spawnErr) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: out.final().toString("utf8"),
        stderr: `${err.final().toString("utf8")}\n${spawnErr.message}`.trim(),
        exitCode: -1,
        timedOut: false,
      });
    });
    // "exit" chứ không phải "close": lệnh để lại tiến trình nền (vd. `(sleep 30 &)`) giữ fd stdout/stderr mở ⇒ "close"
    // không bao giờ bắn, treo mãi. "exit" bắn ngay khi bash -lc kết thúc; output đã gom tới lúc đó vẫn được trả về.
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: out.final().toString("utf8"),
        stderr: err.final().toString("utf8"),
        exitCode: code,
        timedOut,
      });
    });
  });
}

// ---------- read_file / write_file, chỉ trong ALLOWED_ROOTS ----------

async function readFileSafe(inputPath, maxBytes) {
  const resolved = path.resolve(inputPath);
  let real;
  try {
    real = await fsp.realpath(resolved);
  } catch (err) {
    throw new Error(`không đọc được đường dẫn: ${err.message}`);
  }
  if (!isWithinAllowed(real)) {
    throw new Error(`đường dẫn ngoài phạm vi cho phép: ${real}`);
  }
  const stat = await fsp.stat(real);
  if (!stat.isFile()) throw new Error("không phải file thường");
  const cap = Math.min(maxBytes, HARD_READ_CEILING);
  const len = Math.min(stat.size, cap);
  const fh = await fsp.open(real, "r");
  try {
    const buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, 0);
    return { content: buf.toString("utf8"), bytes: len, truncated: stat.size > len, path: real };
  } finally {
    await fh.close();
  }
}

async function writeFileSafe(inputPath, content) {
  const resolved = path.resolve(inputPath);
  const dir = path.dirname(resolved);
  const base = path.basename(resolved);
  let realDir;
  try {
    realDir = await fsp.realpath(dir);
  } catch (err) {
    throw new Error(`thư mục chứa không tồn tại: ${err.message}`);
  }
  if (!isWithinAllowed(realDir)) {
    throw new Error(`thư mục ngoài phạm vi cho phép: ${realDir}`);
  }
  const finalPath = path.join(realDir, base);
  try {
    const lst = await fsp.lstat(finalPath);
    if (lst.isSymbolicLink()) {
      const target = await fsp.realpath(finalPath);
      if (!isWithinAllowed(target)) {
        throw new Error(`symlink trỏ ra ngoài phạm vi cho phép: ${target}`);
      }
    }
  } catch (err) {
    if (err.code !== "ENOENT") throw err; // chưa tồn tại ⇒ tạo mới, bỏ qua
  }
  await fsp.writeFile(finalPath, content, "utf8");
  return finalPath;
}

// ---------- dựng server MCP (1 instance mới mỗi request — đúng khuyến nghị cho chế độ stateless) ----------

function buildServer() {
  const mcpServer = new McpServer({ name: "gs-shell-mcp", version: "0.1.0" });

  mcpServer.registerTool(
    "run_shell",
    {
      description: "Chạy lệnh shell (bash -lc) trên VM Gen-Studio, không sudo.",
      inputSchema: {
        cmd: z.string().min(1, "cmd không được rỗng"),
        cwd: z.string().optional(),
        timeout_sec: z.number().int().positive().max(MAX_TIMEOUT_SEC).optional(),
      },
    },
    async ({ cmd, cwd, timeout_sec }) => {
      const started = Date.now();
      const timeoutSec = Math.min(timeout_sec ?? DEFAULT_TIMEOUT_SEC, MAX_TIMEOUT_SEC);
      const result = await runShell(cmd, cwd, timeoutSec);
      const ms = Date.now() - started;
      await logCall({ tool: "run_shell", arg: cmd, exit_code: result.exitCode, ms });
      const payload = {
        stdout: result.stdout,
        stderr: result.stderr,
        exit_code: result.exitCode,
        timed_out: result.timedOut,
      };
      return { content: [{ type: "text", text: JSON.stringify(payload) }] };
    },
  );

  mcpServer.registerTool(
    "read_file",
    {
      description: `Đọc file trong phạm vi cho phép (${ALLOWED_ROOTS.join(", ")}).`,
      inputSchema: {
        path: z.string().min(1),
        max_bytes: z.number().int().positive().optional(),
      },
    },
    async ({ path: p, max_bytes }) => {
      const started = Date.now();
      try {
        const result = await readFileSafe(p, max_bytes ?? DEFAULT_READ_BYTES);
        const ms = Date.now() - started;
        await logCall({ tool: "read_file", arg: p, exit_code: 0, ms });
        return { content: [{ type: "text", text: result.content }] };
      } catch (err) {
        const ms = Date.now() - started;
        await logCall({ tool: "read_file", arg: p, exit_code: 1, ms, extra: err.message });
        return { isError: true, content: [{ type: "text", text: `Lỗi: ${err.message}` }] };
      }
    },
  );

  mcpServer.registerTool(
    "write_file",
    {
      description: `Ghi file trong phạm vi cho phép (${ALLOWED_ROOTS.join(", ")}).`,
      inputSchema: {
        path: z.string().min(1),
        content: z.string(),
      },
    },
    async ({ path: p, content }) => {
      const started = Date.now();
      try {
        const finalPath = await writeFileSafe(p, content);
        const ms = Date.now() - started;
        await logCall({ tool: "write_file", arg: p, exit_code: 0, ms });
        return {
          content: [{ type: "text", text: `Đã ghi ${Buffer.byteLength(content, "utf8")} byte vào ${finalPath}` }],
        };
      } catch (err) {
        const ms = Date.now() - started;
        await logCall({ tool: "write_file", arg: p, exit_code: 1, ms, extra: err.message });
        return { isError: true, content: [{ type: "text", text: `Lỗi: ${err.message}` }] };
      }
    },
  );

  return mcpServer;
}

// ---------- HTTP server thuần node:http — StreamableHTTPServerTransport tự đọc body từ req ----------

const httpServer = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${HOST}:${PORT}`);
  } catch {
    res.writeHead(400).end();
    return;
  }

  if (url.pathname !== "/mcp") {
    res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "not_found" }));
    return;
  }

  if (req.method !== "POST") {
    res
      .writeHead(405, { "Content-Type": "application/json" })
      .end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }));
    return;
  }

  const authHeader = req.headers["authorization"] || "";
  const m = /^Bearer\s+(.+)$/.exec(authHeader);
  const provided = m ? m[1] : "";
  if (!provided || !timingSafeEqualStr(provided, TOKEN)) {
    res.writeHead(401, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "unauthorized" }));
    return;
  }

  try {
    const mcpServer = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await mcpServer.connect(transport);
    res.on("close", () => {
      transport.close();
      mcpServer.close();
    });
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error("Lỗi xử lý /mcp:", err);
    if (!res.headersSent) {
      res
        .writeHead(500, { "Content-Type": "application/json" })
        .end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null }));
    }
  }
});

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    httpServer.close(() => process.exit(0));
  });
}

httpServer.listen(PORT, HOST, () => {
  console.log(`✓ MCP shell cấp cứu: http://${HOST}:${PORT}/mcp (phạm vi file: ${ALLOWED_ROOTS.join(", ")})`);
});
