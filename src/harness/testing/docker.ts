import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { RunnerError } from "./snapshot.js";
const exec = promisify(execFile);
export const imageIdSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/).length(71);
export const baseImageSchema = z.string().regex(/^mcr\.microsoft\.com\/playwright:v\d+\.\d+\.\d+-noble@sha256:[a-f0-9]{64}$/).refine(value => !/[\r\n]/.test(value));
export const recordSchema = z.object({
  version: z.literal(1), controlSha: z.string().length(40).regex(/^[a-f0-9]+$/),
  controlDigest: z.string().length(64).regex(/^[a-f0-9]+$/), testDigest: z.string().length(64).regex(/^[a-f0-9]+$/),
  dependencyDigest: z.string().length(64).regex(/^[a-f0-9]+$/), imageId: imageIdSchema,
  baseImage: baseImageSchema, preparedAt: z.string().datetime(), review: z.literal("operator-declared-control-review"),
}).strict();
export type RunnerRecord = z.infer<typeof recordSchema>;
export async function docker(args: string[], timeout = 30000, maxBuffer = 4 * 1024 * 1024, signal?: AbortSignal) {
  try {
    signal?.throwIfAborted();
    return await exec("docker", args, { timeout, maxBuffer, signal, env: { PATH: process.env.PATH, HOME: process.env.HOME }, encoding: "utf8" });
  } catch (error) {
    signal?.throwIfAborted();
    const result = error as { stdout?: string; stderr?: string; code?: number | string };
    // No host credentials are passed to containers; returned logs are saved privately, never printed as provider diagnostics.
    const failure = new RunnerError("Docker operation failed or timed out; inspect the private runner log and local Docker readiness.");
    Object.assign(failure, { stdout: String(result.stdout ?? "").slice(0, 2 * 1024 * 1024), stderr: String(result.stderr ?? "").slice(0, 2 * 1024 * 1024), exitCode: result.code });
    throw failure;
  }
}
export function sandboxArguments(imageId: string, name: string, source: string, purpose: "build" | "test") {
  imageIdSchema.parse(imageId);
  if (!/^safi-[a-f0-9-]{36}$/.test(name)) throw new RunnerError("Invalid container identity.");
  if (!source.startsWith("/") || /[,\r\n]/.test(source)) throw new RunnerError("Docker mounts require absolute paths without commas or line breaks.");
  const args = ["run", "--pull=never", "--name", name, "--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--pids-limit=256", "--memory=2g", "--cpus=2", "--shm-size=256m", "--user=1000:1000", "--tmpfs", "/tmp:rw,nosuid,nodev,size=1g,mode=1777", "--tmpfs", "/output:rw,nosuid,nodev,size=64m,mode=1777", "--tmpfs", "/results:rw,nosuid,nodev,size=128m,mode=1777", "--env", "HOME=/tmp", "--env", "CI=1", "--env", "PLAYWRIGHT_BROWSERS_PATH=/ms-playwright", "--mount", `type=bind,src=${source},dst=${purpose === "build" ? "/source" : "/artifact"},readonly`];
  if (purpose === "test") args.push("--workdir=/opt/gate");
  args.push("--entrypoint=node", imageId, purpose === "build" ? "/opt/gate/build.mjs" : "/opt/gate/test.mjs");
  return args;
}
export async function verifyImage(record: RunnerRecord) {
  const response = await docker(["image", "inspect", record.imageId]);
  const images: { Id?: string; Config?: { Labels?: Record<string, string> } }[] = JSON.parse(response.stdout);
  const image = images[0]; const labels = image?.Config?.Labels;
  if (images.length !== 1 || image.Id !== record.imageId || labels?.["safi.control-sha"] !== record.controlSha || labels?.["safi.control-digest"] !== record.controlDigest || labels?.["safi.test-digest"] !== record.testDigest || labels?.["safi.dependency-digest"] !== record.dependencyDigest || labels?.["safi.base-image"] !== record.baseImage) throw new RunnerError("Local image does not match reviewed control/dependency/test identity.");
}
