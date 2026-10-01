import { test as base, expect } from "@playwright/test";

export const test = base.extend<{ browserEvidence: void }>({
  browserEvidence: [async ({ page }, use, testInfo) => {
    const errors: string[] = [];
    const responses: { url: string; status: number }[] = [];
    const consoleEvents: { level: string; text: string }[] = [];
    const networkFailures: { url: string; error: string }[] = [];
    page.on("pageerror", error => { if (errors.length < 200) errors.push(error.message.slice(0, 2000)); });
    page.on("console", message => { if (consoleEvents.length < 200) consoleEvents.push({ level: message.type(), text: message.text().slice(0, 2000) }); });
    page.on("response", response => { if (response.status() >= 400 && responses.length < 200) responses.push({ url: response.url().slice(0, 1000), status: response.status() }); });
    page.on("requestfailed", request => { if (networkFailures.length < 200) networkFailures.push({ url: request.url().slice(0, 1000), error: request.failure()?.errorText ?? "unknown" }); });
    await use();
    await testInfo.attach("browser-evidence", { body: Buffer.from(JSON.stringify({ errors, responses, consoleEvents, networkFailures }, null, 2)), contentType: "application/json" });
    expect(errors, "Uncaught browser errors").toEqual([]);
    expect(responses.filter(response => response.url.startsWith("http://127.0.0.1:4173/")), "Failed application HTTP responses").toEqual([]);
  }, { auto: true }],
});
export { expect };
