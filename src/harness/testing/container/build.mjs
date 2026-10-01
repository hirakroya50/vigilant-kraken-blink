import { cp, mkdir, symlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { collectFiles } from "./collect.mjs";

const exec = promisify(execFile);
await mkdir("/tmp/work", { recursive: true });
await cp("/source", "/tmp/work", { recursive: true, dereference: false });
await symlink("/opt/fixture/node_modules", "/tmp/work/node_modules");
let log = "";
try {
  const result = await exec(process.execPath, ["/opt/fixture/node_modules/vite/bin/vite.js", "build", "--outDir", "/output/dist", "--emptyOutDir"], { cwd: "/tmp/work", timeout: 300000, maxBuffer: 2 * 1024 * 1024, env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/tmp", NODE_ENV: "production", CI: "1" } });
  log = result.stdout + result.stderr;
} catch (error) {
  console.error(String(error.stdout ?? "") + String(error.stderr ?? ""));
  process.exit(1);
}
const files = await collectFiles("/output/dist", 32 * 1024 * 1024, 8 * 1024 * 1024);
if (!files.some(file => file.path === "index.html")) throw new Error("Build did not produce index.html");
process.stdout.write(JSON.stringify({ version: 1, log, files }));
