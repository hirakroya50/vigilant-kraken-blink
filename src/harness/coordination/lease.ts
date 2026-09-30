import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
const renewScript = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end";
const releaseScript = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
/** Only safi:leases keys are used; this adapter never deletes routing keys. */
export class Lease {
  private lost = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private renewing = false;
  private constructor(private readonly redis: Redis, readonly key: string, readonly owner: string, private readonly ttl: number) {}
  static async acquire(redis: Redis, identity: string, ttl = 60000): Promise<Lease | null> {
    if (!/^[a-zA-Z0-9:_-]{1,220}$/.test(identity) || !Number.isInteger(ttl) || ttl < 3000 || ttl > 300000) throw new Error("Invalid lease identity or TTL.");
    const owner = randomUUID(); const key = `safi:leases:${identity}`;
    const result = await redis.set(key, owner, "PX", ttl, "NX");
    return result === "OK" ? new Lease(redis, key, owner, ttl) : null;
  }
  async assertOwned() {
    try { if (this.lost || await this.redis.get(this.key) !== this.owner) throw new Error("Lease lost; reacquire and revalidate before publishing."); }
    catch (error) { this.lost = true; throw error; }
  }
  async renew() {
    if (this.lost) throw new Error("Lease already lost.");
    try { if (Number(await this.redis.eval(renewScript, 1, this.key, this.owner, String(this.ttl))) !== 1) throw new Error("Lease ownership changed."); }
    catch (error) { this.lost = true; throw error; }
  }
  heartbeat(onLost: (error: unknown) => void) {
    if (this.timer) throw new Error("Heartbeat already active.");
    this.timer = setInterval(() => {
      if (this.renewing) return;
      this.renewing = true;
      void this.renew().catch(error => { this.stop(); onLost(error); }).finally(() => { this.renewing = false; });
    }, Math.floor(this.ttl / 3));
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  async release() { this.stop(); this.lost = true; return Number(await this.redis.eval(releaseScript, 1, this.key, this.owner)) === 1; }
}
export function connectValkey(url: string) {
  if (!/^rediss?:\/\//.test(url)) throw new Error("VALKEY_URL must use redis:// or rediss://.");
  return new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 5000, retryStrategy: () => null });
}
