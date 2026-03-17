import { jwtVerify, createRemoteJWKSet } from "jose";
import { env } from "../config/env.js";

export interface TokenPayload {
  sub: string;
  email?: string;
  user_metadata?: {
    username?: string;
    avatar_url?: string;
  };
}

// Supabase access tokens are signed with ES256 — verify via JWKS
const JWKS = createRemoteJWKSet(
  new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
);

export async function verifyToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `${env.SUPABASE_URL}/auth/v1`,
  });
  if (!payload.sub) throw new Error("Token missing sub claim");
  return payload as unknown as TokenPayload;
}
