#!/usr/bin/env node
/**
 * 日期/连续天数纯函数单测。
 * 用法：node --experimental-strip-types tools/day.test.ts
 */
import assert from "node:assert/strict";
import { addDays, computeStreak, dayDiff } from "../server/src/lib/day.ts";

let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log("✔ " + name);
  } catch (e) {
    console.error("✘ " + name);
    throw e;
  }
}

test("跨月加天", () => {
  assert.equal(addDays("2026-01-31", 1), "2026-02-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("跨年加天", () => {
  assert.equal(addDays("2025-12-31", 1), "2026-01-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
});

test("闰年 2 月", () => {
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addDays("2024-02-29", 1), "2024-03-01");
});

test("日期间隔", () => {
  assert.equal(dayDiff("2026-11-01", "2026-11-19"), 18);
  assert.equal(dayDiff("2026-11-19", "2026-11-19"), 0);
});

test("连续天数：连续三天", () => {
  const dates = ["2026-11-17", "2026-11-18", "2026-11-19"];
  assert.equal(computeStreak(dates, "2026-11-19"), 3);
});

test("连续天数：今天未抽，从昨天算", () => {
  const dates = ["2026-11-17", "2026-11-18"];
  assert.equal(computeStreak(dates, "2026-11-19"), 2);
});

test("连续天数：断档只算最近一段", () => {
  const dates = ["2026-11-10", "2026-11-11", "2026-11-18", "2026-11-19"];
  assert.equal(computeStreak(dates, "2026-11-19"), 2);
});

test("连续天数：空记录为 0", () => {
  assert.equal(computeStreak([], "2026-11-19"), 0);
});

test("连续天数：只有前天，今天和昨天都没抽 → 0", () => {
  assert.equal(computeStreak(["2026-11-17"], "2026-11-19"), 0);
});

console.log(`\n${passed} 项通过 ✅`);