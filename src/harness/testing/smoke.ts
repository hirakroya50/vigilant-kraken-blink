import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { docker, sandboxArguments, verifyImage, type RunnerRecord } from "./docker.js";
import { RunnerError } from "./snapshot.js";

export async function runnerSmoke(record: RunnerRecord) {
  await verifyImage(record);
  const root = await mkdtemp(join(tmpdir(), "safi-isolation-"));
  const source = join(root, "source"); const name = `safi-${randomUUID()}`;
  await mkdir(source, { mode: 0o755 });
  await writeFile(join(source, "visible.txt"), "source-only", { mode: 0o644 });
  const secret = join(root, "host-canary.env");
  await writeFile(secret, randomUUID(), { mode: 0o600 });
  const script = `
    const fs = require('node:fs'); const net = require('node:net');
    const hidden = path => { try { fs.readFileSync(path); return false; } catch { return true; } };
    const locked = path => { try { fs.writeFileSync(path, 'attack'); return false; } catch { return true; } };
    const checks = {
      nonRoot: process.getuid() === 1000,
      noSecrets: !['OPENAI_API_KEY','GITHUB_TOKEN','SAFI_GITHUB_APP_PRIVATE_KEY_PATH','VALKEY_URL','DATABASE_URL'].some(key => process.env[key]),
      sourceReadable: fs.readFileSync('/source/visible.txt','utf8') === 'source-only',
      sourceReadOnly: locked('/source/visible.txt'),
      controlsReadOnly: locked('/opt/gate/build.mjs'),
      hostCanaryHidden: hidden(${JSON.stringify(secret)}),
      dockerSocketHidden: !fs.existsSync('/var/run/docker.sock'),
      gitMetadataHidden: hidden('/source/.git/config')
    };
    const socket = net.connect({host:'1.1.1.1',port:443});
    socket.setTimeout(1500);
    let done = false;
    const finish = blocked => { if(done) return; done=true; socket.destroy(); checks.networkBlocked=blocked; process.stdout.write(JSON.stringify(checks)); };
    socket.once('error', () => finish(true)); socket.once('connect', () => finish(false)); socket.once('timeout', () => finish(false));
  `;
  try {
    const args = sandboxArguments(record.imageId, name, source, "build");
    args.pop(); args.push("-e", script);
    const response = await docker(args, 15000);
    const checks: Record<string, unknown> = JSON.parse(response.stdout);
    const expected = ["nonRoot", "noSecrets", "sourceReadable", "sourceReadOnly", "controlsReadOnly", "hostCanaryHidden", "dockerSocketHidden", "gitMetadataHidden", "networkBlocked"];
    if (Object.keys(checks).length !== expected.length || expected.some(key => checks[key] !== true)) throw new RunnerError("Docker isolation smoke failed; protected execution must remain blocked.");
    return { status: "passed", scope: "local-container-isolation-smoke-only", sowEvidence: false, imageId: record.imageId, controlSha: record.controlSha, timestamp: new Date().toISOString(), checks };
  } finally {
    await docker(["rm", "--force", name]).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
}
