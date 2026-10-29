import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const PROFILE_TTL = 86400; // 24 hours

export async function cacheUserProfile(
  userId: string,
  username: string,
  avatarUrl: string | null
): Promise<void> {
  await redis.set(
    `sp:profile:${userId}`,
    JSON.stringify({ username, avatarUrl }),
    { ex: PROFILE_TTL }
  );
}
