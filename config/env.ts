import dotenv from "dotenv";
import path from "path";

/**
 * Loads environment variables from .env or .env.development based on NODE_ENV
 * @param log Whether to log which file is being loaded (default: true)
 * @returns The result of dotenv.config()
 */
export function loadEnv(log: boolean = true): ReturnType<typeof dotenv.config> {
  const env = process.env.NODE_ENV || "development";
  const envFile = env === "production" ? ".env" : ".env.development";

  const result = dotenv.config({ path: envFile });

  if (log && !result.error) {
    const message = `Loading environment from ${envFile}`;
    console.log(message);
  }

  return result;
}
