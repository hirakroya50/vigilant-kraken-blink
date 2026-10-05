import { createHmac, timingSafeEqual } from "node:crypto";
import { WorkError } from "../work/records.js";
import { parseWakeup, type Wakeup } from "./wakeup.js";

const maxBodyBytes = 256 * 1024;
const eventNames = ["issues", "pull_request", "push", "check_run", "workflow_run"] as const;
export type WebhookEvent = (typeof eventNames)[number];
export type WebhookHeaders = { signature: string; deliveryId: string; event: string };
export type VerifiedWebhook = Wakeup & { payload: Record<string, unknown>; signature: "github-hmac-sha256" };

function header(value: string | undefined, name: string) {
  if (!value || value.length > 256 || /[\r\n]/.test(value)) throw new WorkError(`Webhook ${name} header is missing or invalid.`);
  return value;
}

export function verifySignature(body: Buffer | string, signature: string, secret: string) {
  if (!secret || secret.length > 256) throw new WorkError("Webhook secret is not configured safely.");
  const supplied = header(signature, "signature");
  if (!/^sha256=[a-f0-9]{64}$/.test(supplied)) throw new WorkError("Webhook signature must use GitHub sha256 format.");
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(supplied, "utf8"));
}

export function verifyWebhook(body: Buffer | string, headers: WebhookHeaders, secret: string, repository: string): VerifiedWebhook {
  const bytes = Buffer.byteLength(body);
  if (bytes > maxBodyBytes) throw new WorkError("Webhook payload exceeds the 256 KiB limit.");
  const deliveryId = header(headers.deliveryId, "delivery");
  if (!/^[a-zA-Z0-9-]+$/.test(deliveryId)) throw new WorkError("Webhook delivery ID is invalid.");
  if (!eventNames.includes(headers.event as WebhookEvent)) throw new WorkError("Webhook event type is not allowlisted.");
  if (!verifySignature(body, headers.signature, secret)) throw new WorkError("Webhook signature verification failed.");
  let payload: unknown;
  try { payload = JSON.parse(typeof body === "string" ? body : body.toString("utf8")); } catch { throw new WorkError("Webhook payload must be valid JSON."); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new WorkError("Webhook payload must be a JSON object.");
  const wakeup = parseWakeup({ event: headers.event, deliveryId, payload }, repository);
  return { ...wakeup, payload: payload as Record<string, unknown>, signature: "github-hmac-sha256" };
}

export function webhookLimit() { return maxBodyBytes; }
