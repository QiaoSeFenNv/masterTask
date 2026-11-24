import { config } from "../config.ts";
import { upsertUser } from "../db/index.ts";
import { signToken } from "../lib/jwt.ts";

type Jscode2sessionOk = { openid: string; session_key?: string };
type Jscode2sessionErr = { errcode: number; errmsg: string };

/**
 * 用 wx.login() 拿到的 code 换 openid。
 * 这是后端专用接口：code 一次性、5 分钟失效，AppSecret 只存在于服务端。
 */
async function code2openid(code: string): Promise<string> {
  const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
  url.searchParams.set("appid", config.wxAppId);
  url.searchParams.set("secret", config.wxAppSecret);
  url.searchParams.set("js_code", code);
  url.searchParams.set("grant_type", "authorization_code");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`jscode2session HTTP ${res.status}`);
    const json = (await res.json()) as Jscode2sessionOk & Jscode2sessionErr;
    if (!json.openid) {
      throw new Error(`jscode2session 失败: ${json.errcode} ${json.errmsg}`);
    }
    return json.openid;
  } finally {
    clearTimeout(timer);
  }
}

/** mock 模式：本地开发没有 AppSecret 时，code 直接当 openid 用 */
function mockOpenid(code: string): string {
  return `mock_${code}`;
}

export async function loginWithCode(code: string) {
  if (!code || typeof code !== "string" || code.length > 200) {
    return { ok: false as const, error: "INVALID_CODE" };
  }
  let openid: string;
  try {
    openid = config.mockAuth ? mockOpenid(code) : await code2openid(code);
  } catch (e) {
    return { ok: false as const, error: "WX_LOGIN_FAILED", detail: (e as Error).message };
  }

  const user = upsertUser(openid);
  return { ok: true as const, token: signToken(user.id, openid), userId: user.id };
}