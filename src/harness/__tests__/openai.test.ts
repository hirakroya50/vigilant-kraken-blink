import test from "node:test";
import assert from "node:assert/strict";
import { validateConfiguration } from "../config/index.js";
import { OpenAIAdapter, AIError, aiLimits } from "../ai/openai.js";
import { proposalInputSchema } from "../ai/contracts.js";
import { safeFailure } from "../logging/index.js";

const config = validateConfiguration({ GITHUB_REPOSITORY: "a/b", OPENAI_API_KEY: "unit-key-not-real" });
const path = "src/pages/Menu.tsx";
const input = { kind: "fit", candidateSha: "a".repeat(40), request: { version: 1, id: "search", title: "Search", description: "Improve search", acceptance: ["Search finds burgers"] }, permittedPaths: [path], files: [{ path, content: "export default function Menu() {}" }] };
const draft = { summary: "Improve search", allowedPaths: [path], acceptance: [{ id: "search", assertion: "Find matching burgers", test: "Protected search test" }] };
function transport(content: string | null, options: { refusal?: string; finish?: string; status?: number } = {}, requests: Record<string, unknown>[] = []): typeof fetch {
  return async (_url, init) => {
    requests.push(JSON.parse(String(init?.body ?? "{}")));
    if (options.status) return new Response(JSON.stringify({ error: { message: "credential-bearing-provider-message", type: "invalid_request_error" } }), { status: options.status, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ id: "unit-completion", object: "chat.completion", created: 1, model: "gpt-4.1", choices: [{ index: 0, finish_reason: options.finish ?? "stop", message: { role: "assistant", content, ...(options.refusal ? { refusal: options.refusal } : {}) } }], usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 } }), { headers: { "content-type": "application/json" } });
  };
}
test("structured proposal is bounded and unapproved; credentials are not in context", async () => {
  const requests: Record<string, unknown>[] = [];
  const result = await new OpenAIAdapter(config, transport(JSON.stringify(draft), {}, requests)).propose(input);
  assert.equal(result.status, "needs-human-review"); assert.equal(result.provenance, "ai-unreviewed");
  assert.equal(result.candidateSha, input.candidateSha); assert.equal(result.contextDigest.length, 64);
  assert.equal(result.usage.inputTokens, 50);
  assert.equal("acceptedBy" in result.draft, false);
  assert.equal(requests[0].max_completion_tokens, aiLimits.outputTokens);
  assert.equal(JSON.stringify(requests).includes("unit-key-not-real"), false);
  assert.match(JSON.stringify(requests), /UNTRUSTED DATA/);
});
test("reject protected and escaping paths before contacting provider", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; throw new Error("must not contact provider"); };
  for (const path of [".env", "src/harness/cli.ts", "src/tests/x.ts", "src/pages/../harness/x.ts", "src/pages/./x.ts", "src/pages//x.ts"]) {
    await assert.rejects(new OpenAIAdapter(config, fetcher).propose({ ...input, permittedPaths: [path], files: [{ path, content: "data" }] }), AIError);
  }
  assert.equal(calls, 0);
});
test("input budget rejects oversized packets before API request", async () => {
  const large = { ...input, files: Array.from({ length: 4 }, (_, i) => ({ path: `src/pages/Page${i}.tsx`, content: "x".repeat(17000) })), permittedPaths: Array.from({ length: 4 }, (_, i) => `src/pages/Page${i}.tsx`) };
  await assert.rejects(new OpenAIAdapter(config, transport(JSON.stringify(draft))).propose(large), error => error instanceof AIError && error.reason === "budget");
});
test("reject refusals, truncated, malformed, oversize, or self-approved output", async () => {
  for (const [content, options] of [
    [null, { refusal: "No" }], [JSON.stringify(draft), { finish: "length" }], ["not json", {}], ["x".repeat(aiLimits.outputBytes + 1), {}], [JSON.stringify({ ...draft, acceptedBy: "model" }), {}],
  ] as [string | null, { refusal?: string; finish?: string }][]) {
    await assert.rejects(new OpenAIAdapter(config, transport(content, options)).propose(input), AIError);
  }
});
test("model cannot broaden permitted scope even if provider accepts its response", async () => {
  await assert.rejects(new OpenAIAdapter(config, transport(JSON.stringify({ ...draft, allowedPaths: ["src/pages/Orders.tsx"] }))).propose(input), error => error instanceof AIError && error.reason === "scope");
});
test("provider failure is not retried and details are suppressed", async () => {
  const requests: Record<string, unknown>[] = [];
  try { await new OpenAIAdapter(config, transport(null, { status: 429 }, requests)).propose(input); assert.fail("must reject"); }
  catch (error) { assert.match(safeFailure(error), /quota/); assert.equal(safeFailure(error).includes("credential-bearing"), false); }
  assert.equal(requests.length, 1);
});
test("each adapter has a finite call budget", async () => {
  const requests: Record<string, unknown>[] = [];
  const adapter = new OpenAIAdapter(config, transport(JSON.stringify(draft), {}, requests));
  for (let i = 0; i < aiLimits.callsPerAdapter; i++) await adapter.propose(input);
  await assert.rejects(adapter.propose(input), error => error instanceof AIError && error.reason === "budget");
  assert.equal(requests.length, aiLimits.callsPerAdapter);
});
test("diagnosis is bounded to accepted Fit and does not pretend to be reviewed", async () => {
  const diagnosis = { kind: "diagnosis", candidateSha: "b".repeat(40), workId: "search", permittedPaths: [path], files: [{ path, content: "bug" }], diff: "bad change", failures: [{ checkUrl: "https://github.com/a/b/runs/123", summary: "search failed" }], fit: { version: 1, workId: "search", requestSha: "a".repeat(40), acceptedBy: "human", acceptedAt: new Date().toISOString(), provenance: "reviewed-human", ...draft } };
  const result = await new OpenAIAdapter(config, transport(JSON.stringify({ cause: "Query is ignored", repair: "Apply filter", affectedFiles: [path], confidence: "medium" }))).propose(diagnosis);
  assert.equal(result.kind, "diagnosis"); assert.equal(result.provenance, "ai-unreviewed");
  assert.equal(proposalInputSchema.safeParse({ ...diagnosis, workId: "different" }).success, false);
});
