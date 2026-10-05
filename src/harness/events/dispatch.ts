import { verifyWebhook, type VerifiedWebhook, type WebhookHeaders } from "./webhook.js";
import { WorkError } from "../work/records.js";

export type DeliveryStore = { claim(deliveryId: string): Promise<boolean> };
export type WakeupDispatcher = (event: VerifiedWebhook) => Promise<void>;

export class MemoryDeliveryStore implements DeliveryStore {
  private readonly ids = new Set<string>();
  private readonly order: string[] = [];
  constructor(private readonly limit = 2048) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000) throw new WorkError("Replay store limit is outside the safe bound.");
  }
  async claim(deliveryId: string) {
    if (this.ids.has(deliveryId)) return false;
    this.ids.add(deliveryId);
    this.order.push(deliveryId);
    while (this.order.length > this.limit) this.ids.delete(this.order.shift()!);
    return true;
  }
}

export async function dispatchWebhook(input: { body: Buffer | string; headers: WebhookHeaders; secret: string; repository: string }, store: DeliveryStore, dispatch: WakeupDispatcher) {
  const event = verifyWebhook(input.body, input.headers, input.secret, input.repository);
  if (!await store.claim(event.deliveryId)) return { status: "replay", accepted: false, deliveryId: event.deliveryId, authority: event.authority } as const;
  try {
    await dispatch(event);
    return { status: "accepted", accepted: true, deliveryId: event.deliveryId, authority: event.authority } as const;
  } catch (error) {
    throw new WorkError(`Wakeup dispatch failed after delivery claim: ${error instanceof Error ? error.message : "unknown failure"}`);
  }
}

export function boundedWakeup(event: VerifiedWebhook) {
  return { event: event.event, deliveryId: event.deliveryId, repository: event.repository, authority: event.authority, writeAuthorized: false } as const;
}
