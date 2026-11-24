/**
 * 环参数扫描：找一组「正前方那张把后面全挡住、旁边只露一条边」的几何。
 *
 *   node ring-sweep.mjs
 *
 * 关键事实：正前方那张是 132 宽。±36° 那两张左右各偏 min(36°)·rx，
 * 卡片本身宽 132·scale·cos36°，所以只要 rx 大过 ~97，它们的中线就跑到
 * 正前方那张外面去了，挡不住。rx 是唯一真正管用的旋钮。
 *
 * 判定（设计稿单位）：
 *   1. 上下不漏：非正前方牌的上下边都落在正前方那张之内
 *   2. 宽牌（宽 > 34px）露出的面积 ≤ 45%，否则第二张也读得出内容
 *   3. 左右至少各露一条边，看得出是环
 * 不参与构建。
 */
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const pk = require(path.resolve("../../game/js/pack.js"));

const THIN = 34; // 比这窄的只算「一条边」

function metrics(R, spin = 0) {
  const saved = Object.assign({}, pk.RING);
  Object.assign(pk.RING, R);
  const list = pk.ring(10, spin, 0, 1000);
  Object.assign(pk.RING, saved);

  const box = (s) => {
    const w = s.w * s.scale * s.wscale;
    const h = s.h * s.scale;
    return { l: s.x - w / 2, r: s.x + w / 2, t: s.y - h / 2, b: s.y + h / 2, w, h };
  };
  const front = list.find((s) => s.depth === 1);
  const fb = box(front);
  let leak = 0;
  let worstVis = 0; // 宽牌里露得最多的一张
  let worstW = 0;
  let sideEdge = 0; // 左右露出来的最大宽度
  const rows = [];
  for (const s of list) {
    if (s === front) continue;
    const b = box(s);
    const iw = Math.max(0, Math.min(fb.r, b.r) - Math.max(fb.l, b.l));
    const ih = Math.max(0, Math.min(fb.b, b.b) - Math.max(fb.t, b.t));
    const vis = 1 - (b.w * b.h > 0 ? (iw * ih) / (b.w * b.h) : 1);
    if (b.t < fb.t - 0.5 || b.b > fb.b + 0.5) leak++;
    const wide = b.w > THIN;
    if (wide && vis > worstVis) {
      worstVis = vis;
      worstW = b.w;
    }
    const outL = Math.max(0, fb.l - b.l);
    const outR = Math.max(0, b.r - fb.r);
    sideEdge = Math.max(sideEdge, outL, outR);
    rows.push(`${Math.round(((s.a * 180) / Math.PI + 720) % 360)}° w${b.w.toFixed(0)} v${(vis * 100) | 0}%`);
  }
  return {
    frontW: fb.w,
    frontH: fb.h,
    leak,
    worstVis,
    worstW,
    sideEdge,
    rows,
  };
}

const R0 = Object.assign({}, pk.RING);
const found = [];
for (const camK of [1.6, 1.8, 2, 2.4, 3]) {
  for (const rx of [88, 92, 96, 100, 104, 108, 112]) {
    for (const ry of [22, 26, 30]) {
      const m = metrics(Object.assign({}, R0, { camK, rx, ry }));
      if (m.leak === 0 && m.worstVis <= 0.45 && m.sideEdge >= 30) {
        // 偏爱：旁边的牌尽量小露（但别 < 30，环要看得出来），前面的牌尽量大
        found.push({ camK, rx, ry, score: +(m.frontW - m.worstVis * 60 - Math.abs(m.sideEdge - 48) * 0.4).toFixed(1), ...m });
      }
    }
  }
}
found.sort((a, b) => b.score - a.score);
console.log("可用组合:", found.length);
for (const b of found.slice(0, 8)) {
  console.log(
    `camK=${b.camK} rx=${b.rx} ry=${b.ry} -> 前牌 ${b.frontW.toFixed(0)}x${b.frontH.toFixed(0)} 最宽露 ${(b.worstVis * 100) | 0}%(w${b.worstW.toFixed(0)}) 侧边 ${b.sideEdge.toFixed(0)}px 漏 ${b.leak}`,
  );
  console.log("   " + b.rows.join(" "));
}
const cur = metrics(R0);
console.log(`\n当前 camK=${R0.camK} rx=${R0.rx} ry=${R0.ry} -> 最宽露 ${(cur.worstVis * 100) | 0}%(w${cur.worstW.toFixed(0)}) 侧边 ${cur.sideEdge.toFixed(0)}px 漏 ${cur.leak}`);
console.log("   " + cur.rows.join(" "));
