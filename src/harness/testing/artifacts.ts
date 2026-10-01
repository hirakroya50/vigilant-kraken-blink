import { createHash } from "node:crypto";
import { z } from "zod";
import { validateSnapshotPath, RunnerError, type SnapshotFile } from "./snapshot.js";

const outputFilesSchema = z.array(z.object({ path: z.string().max(500), data: z.string().max(24 * 1024 * 1024) }).strict()).max(2000);
function decodeFiles(packet: z.infer<typeof outputFilesSchema>, fileLimit: number, totalLimit: number): SnapshotFile[] {
  const seen = new Set<string>(); let total = 0;
  return packet.map(file => {
    validateSnapshotPath(file.path);
    if (seen.has(file.path)) throw new RunnerError("Output has duplicate paths.");
    seen.add(file.path);
    const data = Buffer.from(file.data, "base64");
    if (data.toString("base64") !== file.data || data.length > fileLimit) throw new RunnerError("Output encoding or file limit is invalid.");
    total += data.length;
    if (total > totalLimit) throw new RunnerError("Output exceeds total limit.");
    return { path: file.path, mode: "100644", oid: createHash("sha1").update(`blob ${data.length}\0`).update(data).digest("hex"), data };
  });
}
export function decodeBuildPacket(text: string) {
  const packet = z.object({ version: z.literal(1), log: z.string().max(4 * 1024 * 1024), files: outputFilesSchema }).strict().parse(JSON.parse(text));
  const files = decodeFiles(packet.files, 8 * 1024 * 1024, 32 * 1024 * 1024);
  if (!files.some(file => file.path === "index.html" && file.data.length > 0)) throw new RunnerError("Artifact lacks index.html.");
  return { log: packet.log, files };
}
export function decodeTestPacket(text: string) {
  const packet = z.object({ version: z.literal(1), exitCode: z.number().int().min(0).max(255), log: z.string().max(8 * 1024 * 1024), files: outputFilesSchema }).strict().parse(JSON.parse(text));
  return { exitCode: packet.exitCode, log: packet.log, files: decodeFiles(packet.files, 16 * 1024 * 1024, 64 * 1024 * 1024) };
}
export function summarizeBrowserReport(input: unknown) {
  const report = z.object({ stats: z.object({ expected: z.number().int().nonnegative(), unexpected: z.number().int().nonnegative(), skipped: z.number().int().nonnegative(), flaky: z.number().int().nonnegative() }), suites: z.array(z.unknown()), errors: z.array(z.unknown()).optional() }).parse(input);
  const projects = new Map<string, number>();
  function visit(value: unknown) {
    const suite = z.object({ suites: z.array(z.unknown()).optional(), specs: z.array(z.object({ tests: z.array(z.object({ projectName: z.string() })) })).optional() }).parse(value);
    for (const spec of suite.specs ?? []) for (const test of spec.tests) projects.set(test.projectName, (projects.get(test.projectName) ?? 0) + 1);
    for (const child of suite.suites ?? []) visit(child);
  }
  for (const suite of report.suites) visit(suite);
  const complete = report.stats.expected >= 22 && report.stats.unexpected === 0 && report.stats.skipped === 0 && report.stats.flaky === 0 && !report.errors?.length && (projects.get("desktop-chromium") ?? 0) >= 11 && (projects.get("mobile-chromium") ?? 0) >= 11;
  return { ...report.stats, projects: Object.fromEntries(projects), complete };
}
