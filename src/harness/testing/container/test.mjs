import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { collectFiles } from "./collect.mjs";

const exec = promisify(execFile);
let log = ""; let exitCode = 0;
try {
  const result = await exec(process.execPath, ["/opt/fixture/node_modules/@playwright/test/cli.js", "test", "--config=/opt/gate/playwright.config.mjs"], { cwd: "/opt/gate", timeout: 500000, maxBuffer: 4 * 1024 * 1024, env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/tmp", CI: "1", PLAYWRIGHT_BROWSERS_PATH: "/ms-playwright" } });
  log = result.stdout + result.stderr;
} catch (error) {
  exitCode = Number.isInteger(error.code) && error.code > 0 && error.code < 256 ? error.code : 1;
  log = String(error.stdout ?? "") + String(error.stderr ?? "");
}
const files = await collectFiles("/results", 64 * 1024 * 1024, 16 * 1024 * 1024);
process.stdout.write(JSON.stringify({ version: 1, exitCode, log, files }));
