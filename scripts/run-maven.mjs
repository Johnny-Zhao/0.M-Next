import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const windows = process.platform === "win32";
const command = windows ? "cmd.exe" : "sh";
const args = windows
  ? ["/d", "/s", "/c", "mvnw.cmd", ...process.argv.slice(2)]
  : ["mvnw", ...process.argv.slice(2)];
const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });

if (result.error) throw result.error;
process.exit(result.status ?? 1);
