import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, normalize } from "node:path";
import { config, ROOT, assertRuntimeConfig } from "./config.ts";
import { cors, fail, ok, readBody, type Ctx } from "./lib/http.ts";
import { verifyToken } from "./lib/jwt.ts";
import { loginWithCode } from "./services/auth.ts";
import { drawForToday, getDrawByIdempotent, offerForToday, redrawToday } from "./services/draw.ts";
import { calendar, checkinTask, stats } from "./services/stats.ts";
import { ROLES, ROLES_VERSION } from "./services/roles.ts";
import { logicalDate } from "./lib/day.ts";
import { db, getDrawRound } from "./db/index.ts";

assertRuntimeConfig();

type Route = {
  method: "GET" | "POST" | "PATCH";
  pattern: RegExp;
  keys: string[];
  auth: boolean;
  handler: (ctx: Ctx) => Promise<unknown> | unknown;
};

const routes: Route[] = [];

function route(
  method: Route["method"],
  path: string,
  auth: boolean,
  handler: Route["handler"],
): void {
  const keys: string[] = [];
  const pattern = new RegExp(
    "^" +
      path.replace(/:([A-Za-z]+)/g, (_, k: string) => {
        keys.push(k);
        return "([^/]+)";
      }) +
      "$",
  );
  routes.push({ method, pattern, keys, auth, handler });
}

// ---------- health ----------
route("GET", "/api/health", false, () => ({
  ok: true,
  env: config.nodeEnv,
  mockAuth: config.mockAuth,
  roles: ROLES.length,
  rolesVersion: ROLES_VERSION,
  serverDate: logicalDate(),
}));

// ---------- auth ----------
route("POST", "/api/auth/login", false, async (ctx) => {
  const body = (ctx.body ?? {}) as { code?: string };
  const result = await loginWithCode(body.code ?? "");
  if (!result.ok) {
    if (result.error === "WX_LOGIN_FAILED") {
      throw Object.assign(new Error("微信登录失败"), { status: 401, code: "WX_LOGIN_FAILED" });
    }
    throw Object.assign(new Error("code 无效"), { status: 400, code: "INVALID_CODE" });
  }
  return { token: result.token };
});

// ---------- roles ----------
route("GET", "/api/roles", false, () => ({
  version: ROLES_VERSION,
  roles: ROLES.map((r) => ({
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    tagline: r.tagline,
    gradient: r.gradient,
    accent: r.accent,
  })),
}));

// ---------- draw ----------
// GET 只读不创建：没选时把今天摊开的三张候选一起返回；
// POST 才落定，带 roleId 时必须来自这三张，且当天不可更改。
route("GET", "/api/draw/today", true, (ctx) => {
  const date = logicalDate();
  const view = getDrawByIdempotent(ctx.userId, date);
  return {
    date,
    drawn: Boolean(view),
    draw: view,
    // 没落定时把三张候选一起给出去；已经选定就返回空数组
    offer: view ? [] : offerForToday(ctx.userId, date),
    // 客户端据此决定要不要显示「重新抽卡」；生产环境恒为 false
    canRedraw: config.allowRedraw,
    round: getDrawRound(ctx.userId, date),
  };
});

route("POST", "/api/draw", true, (ctx) => {
  const body = (ctx.body ?? {}) as { date?: string; roleId?: string };
  if (body.date && body.date !== logicalDate()) {
    const existing = getDrawByIdempotent(ctx.userId, body.date);
    if (!existing) {
      throw Object.assign(new Error("只能在今天抽卡"), { status: 400, code: "NOT_TODAY" });
    }
    return existing;
  }
  return drawForToday(ctx.userId, logicalDate(), body.roleId);
});

// 重新抽卡：作废今天已落定的卡，重新发一包。测试专用，生产环境会被拒绝。
route("POST", "/api/draw/redraw", true, (ctx) => redrawToday(ctx.userId, logicalDate()));

route("GET", "/api/draw/:date", true, (ctx) => {
  const view = getDrawByIdempotent(ctx.userId, ctx.params.date);
  if (!view) throw Object.assign(new Error("这一天没有抽卡记录"), { status: 404, code: "NOT_FOUND" });
  return view;
});

// ---------- checkin ----------
route("PATCH", "/api/checkin", true, (ctx) => {
  const body = (ctx.body ?? {}) as { date?: string; taskId?: string; done?: boolean; note?: string };
  if (!body.taskId) throw Object.assign(new Error("缺少 taskId"), { status: 400, code: "BAD_REQUEST" });
  const date = body.date ?? logicalDate();
  const note = typeof body.note === "string" ? body.note.slice(0, 200) : "";
  const result = checkinTask(ctx.userId, date, body.taskId, body.done !== false, note);
  if (!result.ok) {
    const message = result.error === "NOT_DRAWN" ? "这一天还没有抽卡" : "任务不属于这次抽卡";
    throw Object.assign(new Error(message), { status: 400, code: result.error });
  }
  return { checkin: result.checkin };
});

// ---------- calendar / stats ----------
route("GET", "/api/calendar", true, (ctx) => {
  const today = logicalDate();
  const from = ctx.query.get("from") ?? today.slice(0, 8) + "01";
  const to = ctx.query.get("to") ?? today;
  return { from, to, today, ...calendar(ctx.userId, from, to) };
});

route("GET", "/api/stats", true, (ctx) => stats(ctx.userId));

// ---------- static ----------
const MIME: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

async function serveStatic(pathname: string, res: ServerResponse): Promise<boolean> {
  const rel = normalize(decodeURIComponent(pathname.replace(/^\/static\/?/, "")));
  if (rel.includes("..") || rel.startsWith("/") || rel.startsWith("\\")) return false;
  const file = resolve(ROOT, "static", rel);
  try {
    const info = await stat(file);
    if (!info.isFile()) return false;
    const buf = await readFile(file);
    res.writeHead(200, {
      "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
      "content-length": buf.length,
      "cache-control": "public, max-age=31536000, immutable",
    });
    res.end(buf);
    return true;
  } catch {
    return false;
  }
}

function matchRoute(method: string, pathname: string): { route: Route; params: Record<string, string> } | null {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.pattern.exec(pathname);
    if (!m) continue;
    const params: Record<string, string> = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    return { route: r, params };
  }
  return null;
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const started = Date.now();
  cors(res);

  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  if (url.pathname.startsWith("/static/")) {
    if (await serveStatic(url.pathname, res)) return;
    fail(res, 404, "NOT_FOUND", "文件不存在");
    return;
  }

  const matched = matchRoute(req.method ?? "GET", url.pathname);
  if (!matched) {
    fail(res, 404, "NOT_FOUND", `无此接口: ${req.method} ${url.pathname}`);
    return;
  }

  let body: unknown;
  try {
    if (req.method !== "GET") body = await readBody(req);
  } catch (e) {
    fail(res, 400, (e as Error).message === "INVALID_JSON" ? "INVALID_JSON" : "BAD_REQUEST", "请求体解析失败");
    return;
  }

  let userId = 0;
  let openid = "";
  if (matched.route.auth) {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const payload = token ? verifyToken(token) : null;
    if (!payload) {
      fail(res, 401, "UNAUTHORIZED", "登录已过期，请重新进入小程序");
      return;
    }
    userId = payload.uid;
    openid = payload.openid;
  }

  const ctx: Ctx = {
    req,
    res,
    params: matched.params,
    query: url.searchParams,
    body,
    userId,
    openid,
  };

  try {
    const data = await matched.route.handler(ctx);
    ok(res, data);
  } catch (e) {
    const err = e as Error & { status?: number; code?: string };
    const status = err.status ?? 500;
    if (status >= 500) console.error(`[error] ${req.method} ${url.pathname}`, err);
    fail(res, status, err.code ?? "INTERNAL_ERROR", err.message || "服务端错误");
  } finally {
    console.log(`[${req.method}] ${url.pathname} ${res.statusCode} ${Date.now() - started}ms`);
  }
});

server.listen(config.port, () => {
  console.log(`\n  Roles API  →  http://127.0.0.1:${config.port}`);
  console.log(`  health     →  http://127.0.0.1:${config.port}/api/health`);
  console.log(`  env        →  ${config.nodeEnv}${config.mockAuth ? " (mock auth)" : ""}`);
  console.log(`  逻辑日期   →  ${logicalDate()}  (${config.appTz}, ${config.dayRolloverHour}:00 切换)\n`);
});

// 优雅退出：SQLite WAL 需要正常关闭
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(`\n${sig} 收到，正在关闭...`);
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => {
      try {
        db.close();
      } catch {}
      process.exit(0);
    }, 3000).unref();
  });
}