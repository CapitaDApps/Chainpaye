import { createClient } from "redis";

class RedisClient {
  private client;
  constructor() {
    this.client = createClient({});
    this.client.on("error", (err) => console.error("Redis Client Error", err));
    this.client.connect().then(() => console.log("Connected to Redis"));
  }

  async set(key: string, value: string, expiryMode: "EX", ttl: number) {
    await this.client.set(key, value, { EX: ttl });
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async del(key: string) {
    await this.client.del(key);
  }
}

export const redisClient = new RedisClient();
