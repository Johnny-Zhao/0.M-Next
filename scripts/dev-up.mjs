import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const windows = process.platform === "win32";
const logsDir = path.join(root, "logs");
const stateDir = path.join(root, ".dev");
const serverLog = path.join(logsDir, "server.log");
const serverPidFile = path.join(stateDir, "server.pid");
const demoWorkspaceId = "11111111-1111-1111-1111-111111111111";
const serverReadyText = "DEV SEED: interior-design installed, demo workspace";
const dotEnv = loadDotEnv();

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main() {
  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  run("docker", ["compose", "up", "-d"], "启动 docker compose 失败");
  await waitForPostgres();
  // 已有运行中的后端就复用,绝不重启——重启前端不会再误杀后端
  if (await httpReady(serverReadyUrl())) {
    console.log("检测到 8080 已有运行中的后端,直接复用(不重启后端)。");
  } else {
    const jar = findServerJar();
    await killJavaOnPort(8080);
    const pid = startServer(jar);
    console.log(`后端已后台启动 pid=${pid}, 日志: ${serverLog}`);
    await waitForServerReady();
  }
  console.log(
    "后端就绪,启动前端 http://localhost:5173/ … (Ctrl+C 只停前端,后端继续运行;停后端用 corepack pnpm dev:down)",
  );
  const status = foreground("corepack", [
    "pnpm",
    "--filter",
    "@m-next/web",
    "dev",
  ]);
  process.exit(status);
}

function serverReadyUrl() {
  return `http://localhost:8080/workspaces/${demoWorkspaceId}/views/objects?objectType=room&page=0&pageSize=1`;
}

function run(command, args, message) {
  const result = spawnSync(command, args, {
    cwd: root,
    shell: windows,
    stdio: "inherit",
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${message}: ${result.error?.message ?? result.status}`);
  }
}

function capture(command, args) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: windows,
  });
}

function findServerJar() {
  const target = path.join(root, "packages", "server", "target");
  if (!fs.existsSync(target)) {
    throw missingJarError();
  }
  const jars = fs
    .readdirSync(target)
    .filter(
      (name) => /^server-.*\.jar$/.test(name) && !name.endsWith(".original"),
    )
    .sort();
  if (jars.length === 0) throw missingJarError();
  return path.join(target, jars.at(-1));
}

function missingJarError() {
  return new Error(
    "未找到 packages/server/target/server-*.jar；请先运行 node scripts/run-maven.mjs -DskipTests package",
  );
}

async function waitForPostgres() {
  const container = capture("docker", ["compose", "ps", "-q", "postgres"])
    .stdout.trim()
    .split(/\r?\n/)
    .find(Boolean);
  if (!container)
    throw new Error("未找到 postgres 容器，请确认 Docker Desktop 已启动");
  await waitUntil(
    () => {
      const result = capture("docker", [
        "inspect",
        "-f",
        "{{.State.Health.Status}}",
        container,
      ]);
      return result.stdout.trim() === "healthy";
    },
    "等待 postgres healthy 超时",
    120_000,
  );
  console.log("postgres healthy");
}

async function killJavaOnPort(port) {
  const pids = windows ? windowsPidsOnPort(port) : unixPidsOnPort(port);
  for (const pid of pids) {
    if (!isJavaProcess(pid)) continue;
    console.log(`清理占用 ${port} 的旧 Java 进程 pid=${pid}`);
    if (windows) {
      spawnSync("taskkill", ["/F", "/T", "/PID", String(pid)], {
        stdio: "inherit",
      });
    } else {
      spawnSync("kill", ["-TERM", String(pid)], { stdio: "inherit" });
    }
  }
  if (pids.length > 0) await sleep(1000);
}

function startServer(jar) {
  fs.writeFileSync(
    serverLog,
    `M-Next dev server log ${new Date().toISOString()}\n`,
  );
  const out = fs.openSync(serverLog, "a");
  const child = spawn("java", ["-jar", jar], {
    cwd: root,
    detached: true,
    env: { ...dotEnv, ...process.env, SPRING_PROFILES_ACTIVE: "dev" },
    stdio: ["ignore", out, out],
  });
  child.unref();
  fs.writeFileSync(serverPidFile, `${child.pid}\n`);
  return child.pid;
}

function loadDotEnv() {
  const file = path.join(root, ".env");
  if (!fs.existsSync(file)) return {};
  const values = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    values[match[1]] = unquoteEnv(match[2]);
  }
  return values;
}

function unquoteEnv(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function windowsPidsOnPort(port) {
  const result = capture("netstat", ["-ano", "-p", "TCP"]);
  const pids = new Set();
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.includes(`:${port}`)) continue;
    const match = line.trim().match(/\s(\d+)$/);
    if (match) pids.add(Number(match[1]));
  }
  return [...pids];
}

function unixPidsOnPort(port) {
  const result = capture("sh", [
    "-c",
    `lsof -ti tcp:${port} 2>/dev/null || true`,
  ]);
  return result.stdout
    .split(/\s+/)
    .filter(Boolean)
    .map((value) => Number(value))
    .filter(Number.isFinite);
}

function isJavaProcess(pid) {
  const result = windows
    ? capture("powershell.exe", [
        "-NoProfile",
        "-Command",
        `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}").Name`,
      ])
    : capture("ps", ["-p", String(pid), "-o", "comm="]);
  return /java/i.test(`${result.stdout} ${result.stderr}`);
}

async function waitForServerReady() {
  const url = `http://localhost:8080/workspaces/${demoWorkspaceId}/views/objects?objectType=room&page=0&pageSize=1`;
  await waitUntil(() => httpReady(url), "等待后端 8080 就绪超时", 120_000);
  await waitUntil(
    () =>
      fs.existsSync(serverLog) &&
      fs.readFileSync(serverLog, "utf8").includes(serverReadyText),
    `等待 DEV SEED ready 超时，请查看 ${serverLog}`,
    120_000,
  );
}

function httpReady(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(response.statusCode !== undefined && response.statusCode < 500);
    });
    request.on("error", () => resolve(false));
    request.setTimeout(1500, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitUntil(check, message, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(1500);
  }
  throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function foreground(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    shell: windows,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
