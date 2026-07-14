import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const windows = process.platform === "win32";
const serverPidFile = path.join(root, ".dev", "server.pid");

main();

function main() {
  const pid = readServerPid();
  if (pid) killProcessTree(pid, "记录的后端进程");
  for (const portPid of pidsOnPort(8080)) {
    if (isJavaProcess(portPid))
      killProcessTree(portPid, "占用 8080 的 Java 进程");
  }
  if (fs.existsSync(serverPidFile)) fs.rmSync(serverPidFile);
  run("docker", ["compose", "stop"], "停止 docker compose 失败");
  console.log("dev 环境已停止");
}

function readServerPid() {
  if (!fs.existsSync(serverPidFile)) return null;
  const pid = Number(fs.readFileSync(serverPidFile, "utf8").trim());
  return Number.isFinite(pid) && pid > 0 ? pid : null;
}

function killProcessTree(pid, label) {
  if (!isRunning(pid)) return;
  console.log(`停止${label} pid=${pid}`);
  if (windows) {
    spawnSync("taskkill", ["/F", "/T", "/PID", String(pid)], {
      stdio: "inherit",
    });
  } else {
    spawnSync("kill", ["-TERM", String(pid)], { stdio: "inherit" });
  }
}

function isRunning(pid) {
  const result = windows
    ? spawnSync("tasklist", ["/FI", `PID eq ${pid}`], { encoding: "utf8" })
    : spawnSync("ps", ["-p", String(pid)], { encoding: "utf8" });
  return result.status === 0 && result.stdout.includes(String(pid));
}

function pidsOnPort(port) {
  return windows ? windowsPidsOnPort(port) : unixPidsOnPort(port);
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
    ? capture("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"])
    : capture("ps", ["-p", String(pid), "-o", "comm="]);
  return /java/i.test(`${result.stdout} ${result.stderr}`);
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
    shell: false,
  });
}
