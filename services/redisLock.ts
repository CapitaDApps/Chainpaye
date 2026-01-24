import { redisClient } from "./redis";

/**
 * Acquire a lock for a quoteId. Returns true if lock acquired.
 * token should be a unique value (e.g. UUID or flow_token) so release is safe.
 */
export async function acquireQuoteLock(quoteId: string, token: string, ttlSeconds = 300) {
  const key = `quote_lock:${quoteId}`;
  // redisClient.set(key, token, "NX", "EX", ttlSeconds)
  const result = await redisClient.set(key, token, "EX", ttlSeconds);
  return result != null;
}

/**
 * Release a lock only if token matches (atomic).
 */
export async function releaseQuoteLock(quoteId: string, token: string) {
  const key = `quote_lock:${quoteId}`;
  const lua = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  // eval returns number of keys removed or 0
  // Some Redis client typings don't expose `eval`. Cast to `any` to call the command
  // while preserving runtime behavior (atomic compare-and-del via Lua).
  const result = await (redisClient as any).eval(lua, 1, key, token);
  return result === 1;

  return result === 1;
}