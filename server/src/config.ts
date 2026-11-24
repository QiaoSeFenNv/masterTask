import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, "../..");

/** 极简 .env 读取：只处理 KEY=VALUE，不引入 dotenv 依赖 */
function loadDotEnv(): void {
  const p = resolve(ROOT, ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotEnv();

function num(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: num("PORT", 3000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  isDev: (process.env.NODE_ENV ?? "development") !== "production",
  wxAppId: process.env.WX_APPID ?? "",
  wxAppSecret: process.env.WX_APPSECRET ?? "",
  jwtSecret: process.env.JWT_SECRET ?? "",
  jwtExpiresDays: num("JWT_EXPIRES_DAYS", 30),
  dbPath: process.env.DB_PATH ?? "./data/roles.db",
  appTz: process.env.APP_TZ ?? "Asia/Shanghai",
  /** 0–6 点算前一天的切割时点 */
  dayRolloverHour: num("DAY_ROLLOVER_HOUR", 6),
  /**
   * 测试开关：是否放出「重新抽卡」。
   * 这是临时功能 —— 一天一次的仪式和连续天数统计都建立在「当天不可改」上，
   * 所以生产环境一律关死，开发环境默认开。
   * 要关掉就设 ALLOW_REDRAW=0；线上无论怎么设都会被强制关掉。
   */
  get allowRedraw(): boolean {
    const env = String(process.env.NODE_ENV ?? "development").trim().toLowerCase();
    if (env === "production" || env === "prod") return false;
    const raw = process.env.ALLOW_REDRAW;
    if (raw == null || raw.trim() === "") return true;
    return !/^(0|false|no|off)$/i.test(raw.trim());
  },
  staticBaseUrl: process.env.STATIC_BASE_URL ?? "",
  subscribeTemplateId: process.env.WX_SUBSCRIBE_TEMPLATE_ID ?? "",
  /** 本地开发没有 AppSecret 时，用假 openid 跑通全流程 */
  get mockAuth(): boolean {
    return !this.wxAppSecret;
  },
};

export function assertRuntimeConfig(): void {
  if (!config.jwtSecret) {
    if (config.isDev) {
      console.warn("[warn] JWT_SECRET 为空，开发模式使用临时密钥（重启后 token 失效）");
    } else {
      throw new Error("生产环境必须设置 JWT_SECRET");
    }
  }
  if (config.allowRedraw) {
    console.warn("[warn] 已放出「重新抽卡」（开发环境测试用；生产环境会自动关闭）");
  }
  if (config.mockAuth) {
    console.warn("[warn] 未设置 WX_APPSECRET，登录走 mock 模式（不会真正调用微信接口）");
  }
}