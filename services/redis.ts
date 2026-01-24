import { createClient } from "redis";

class RedisClient {
  private client;
  constructor() {
    this.client = createClient({});
    this.client.on("error", (err) => console.error("Redis Client Error", err));
    this.client.connect().then(() => console.log("Connected to Redis"));
  }

  async set(key: string, value: string, expiryMode: "EX", ttl?: number) {
    if (ttl) {
      await this.client.set(key, value, { EX: ttl });
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async del(key: string) {
    await this.client.del(key);
  }

  async getOrSetCache<T>(
    key: string,
    func: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const data = await this.get(key);

    if (!data) {
      const data = await func();
      if (ttl) {
        await this.set(key, JSON.stringify(data), "EX", ttl);
      } else {
        await this.set(key, JSON.stringify(data), "EX");
      }
      return data;
    }

    return JSON.parse(data);
  }
}

export const redisClient = new RedisClient();
