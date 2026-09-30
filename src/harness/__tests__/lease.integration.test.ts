import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { connectValkey, Lease } from "../coordination/lease.js";

test("real Valkey collision, expiry, and owner-safe recovery", { skip: !process.env.VALKEY_URL, timeout: 15000 }, async () => {
  const redis = connectValkey(process.env.VALKEY_URL!);
  redis.on("error", () => {});
  await redis.connect();
  const identity = `integration:${randomUUID()}`;
  let replacement: Lease | null = null;
  try {
    const first = await Lease.acquire(redis, identity, 3000); assert.ok(first);
    assert.equal(await Lease.acquire(redis, identity, 3000), null);
    await first.renew();
    await delay(3300);
    replacement = await Lease.acquire(redis, identity, 3000); assert.ok(replacement);
    await assert.rejects(first.assertOwned());
    assert.equal(await first.release(), false);
    await replacement.assertOwned();
    assert.equal(await replacement.release(), true);
    replacement = null;
  } finally { if (replacement) await replacement.release(); redis.disconnect(); }
});
