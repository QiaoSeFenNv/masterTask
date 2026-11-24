import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** 24 字节随机 salt（base64url） */
export function newSalt(): string {
  return randomBytes(24).toString("base64url");
}

/** 随机种子：抽卡时使用，保证同一张卡可复现 */
export function newSeed(): string {
  return randomBytes(16).toString("hex");
}

/** 确定性伪随机：seed 相同 → 结果相同。用于「已抽过的卡」可复现。 */
export function seededRandom(seed: string): () => number {
  const h = createHash("sha256").update(seed).digest();
  let counter = 0;
  return () => {
    const block = createHash("sha256")
      .update(h)
      .update(String(counter++))
      .digest();
    // 取前 6 字节转成 [0,1)
    return block.readUIntBE(0, 6) / 0x1000000000000;
  };
}

/** 从数组中用确定性随机挑 n 个不重复元素 */
export function pickN<T>(items: readonly T[], n: number, rand: () => number): T[] {
  const pool = items.slice();
  const out: T[] = [];
  const count = Math.min(n, pool.length);
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rand() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

export function hmac(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}