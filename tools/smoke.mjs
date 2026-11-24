#!/usr/bin/env node
/**
 * 本地全流程冒烟测试：登录 → 抽卡 → 打卡 → 日历 → 统计
 * 用法：node tools/smoke.mjs [baseUrl]
 */
const BASE = process.argv[2] || "http://127.0.0.1:3000";

function assert(cond, msg) {
  if (!cond) throw new Error("✘ " + msg);
  console.log("✔ " + msg);
}

async function call(method, path, body, token) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = "Bearer " + token;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json };
}

const main = async () => {
  const health = await call("GET", "/api/health");
  assert(health.json.ok === true, "服务健康检查");
  assert(health.json.data.roles === 20, "加载到 20 个角色");

  const code = "smoke_" + Date.now();
  const login = await call("POST", "/api/auth/login", { code });
  assert(login.status === 200 && login.json.data.token, "登录换取 token");
  const token = login.json.data.token;

  const before = await call("GET", "/api/draw/today", undefined, token);
  assert(before.json.data.drawn === false, "新用户今天未抽卡");
  assert(before.json.data.draw === null, "GET 不创建抽卡记录");
  assert(before.json.data.offer.length === 10, "GET 返回一包十张候选");

  const stillBefore = await call("GET", "/api/draw/today", undefined, token);
  assert(stillBefore.json.data.drawn === false, "重复 GET 仍不创建");
  assert(
    JSON.stringify(stillBefore.json.data.offer) === JSON.stringify(before.json.data.offer),
    "同一天候选固定,不会刷新就换",
  );

  const offer = before.json.data.offer;
  const notOffered = await call("POST", "/api/draw", { roleId: "not-in-offer" }, token);
  assert(notOffered.status === 400, "选候选之外的角色被拒绝");

  const pickId = offer[1].id;
  const draw = await call("POST", "/api/draw", { roleId: pickId }, token);
  const d = draw.json.data;
  assert(d.isNew === true, "首次落定 isNew");
  assert(d.role.id === pickId, "落定的正是选中的那张");
  assert(d.tasks.length >= 3 && d.tasks.length <= 4, `抽到 ${d.tasks.length} 条任务（3–4）`);
  assert(d.tasks.every((t) => t.text), "任务都有文案");
  assert(d.role.gradient.length >= 2, "角色有渐变配色");

  const again = await call("POST", "/api/draw", { roleId: offer[0].id }, token);
  assert(again.json.data.isNew === false, "当天重复落定等于原卡");
  assert(again.json.data.role.id === pickId, "选定后不能换成别的角色");
  assert(again.json.data.seed === d.seed, "重复落定 seed 一致（幂等）");

  const taskId = d.tasks[0].id;
  const check = await call("PATCH", "/api/checkin", { date: d.date, taskId, done: true, note: "测试手记" }, token);
  assert(check.json.data.checkin.done === true, "勾选任务");
  assert(check.json.data.checkin.note === "测试手记", "手记已保存");

  const uncheck = await call("PATCH", "/api/checkin", { date: d.date, taskId, done: false }, token);
  assert(uncheck.json.data.checkin.done === false, "取消勾选");

  const badTask = await call("PATCH", "/api/checkin", { date: d.date, taskId: "not-a-task" }, token);
  assert(badTask.status === 400, "非本卡任务被拒绝");

  const unauth = await call("GET", "/api/stats");
  assert(unauth.status === 401, "无 token 被拒绝");

  const cal = await call("GET", "/api/calendar", undefined, token);
  assert(cal.json.data.entries.length === 1, "日历包含今天的记录");
  assert(cal.json.data.streak === 1, "连续天数为 1");

  const stats = await call("GET", "/api/stats", undefined, token);
  assert(stats.json.data.totalDays === 1, "统计累计天数");
  assert(stats.json.data.collected.length === 1, "图鉴解锁 1 个角色");

  const history = await call("GET", "/api/draw/" + d.date, undefined, token);
  assert(history.json.data.role.id === d.role.id, "可按日期回看当日卡");

  console.log("\n全部通过 ✅");
};

main().catch((e) => {
  console.error("\n" + e.message);
  process.exit(1);
});