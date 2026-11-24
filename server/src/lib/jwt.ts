import { config } from "../config.ts";
import { hmac, safeEqual } from "../lib/random.ts";
import { randomBytes } from "node:crypto";

const FALLBACK_SECRET = randomBytes(32).toString("base64url");
const secret = () => config.jwtSecret || FALLBACK_SECRET;

type Payload = { uid: number; openid: string; exp: number };

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function signToken(uid: number, openid: string): string {
  const exp = Math.floor(Date.now() / 1000) + config.jwtExpiresDays * 86_400;
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ uid, openid, exp } satisfies Payload));
  const sig = hmac(`${header}.${body}`, secret());
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token: string): Payload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = hmac(`${header}.${body}`, secret());
  if (!safeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Payload;
    if (typeof payload.uid !== "number" || typeof payload.exp !== "number") return null;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}