import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config, ROOT } from "../config.ts";

const dbFile = resolve(ROOT, config.dbPath);
mkdirSync(dirname(dbFile), { recursive: true });

export const db = new DatabaseSync(dbFile);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    openid      TEXT    NOT NULL UNIQUE,
    created_at  TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS draws (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    local_date  TEXT    NOT NULL,
    role_id     TEXT    NOT NULL,
    seed        TEXT    NOT NULL,
    task_ids    TEXT    NOT NULL,
    created_at  TEXT    NOT NULL,
    UNIQUE (user_id, local_date)
  );

  -- 今天是第几轮：0 = 第一次。重新抽卡时 +1，用来换一批候选、换一组任务
  CREATE TABLE IF NOT EXISTS draw_rounds (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    local_date  TEXT    NOT NULL,
    round       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, local_date)
  );

  CREATE TABLE IF NOT EXISTS checkins (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    draw_id     INTEGER NOT NULL REFERENCES draws(id) ON DELETE CASCADE,
    task_id     TEXT    NOT NULL,
    done        INTEGER NOT NULL DEFAULT 0,
    note        TEXT    NOT NULL DEFAULT '',
    updated_at  TEXT    NOT NULL,
    UNIQUE (draw_id, task_id)
  );

  CREATE INDEX IF NOT EXISTS idx_draws_user_date ON draws(user_id, local_date);
  CREATE INDEX IF NOT EXISTS idx_checkins_draw   ON checkins(draw_id);
`);

export type UserRow = { id: number; openid: string; created_at: string };
export type DrawRow = {
  id: number;
  user_id: number;
  local_date: string;
  role_id: string;
  seed: string;
  task_ids: string;
  created_at: string;
};
export type CheckinRow = {
  id: number;
  draw_id: number;
  task_id: string;
  done: number;
  note: string;
  updated_at: string;
};

export function upsertUser(openid: string): UserRow {
  const now = new Date().toISOString();
  db.prepare("INSERT INTO users (openid, created_at) VALUES (?, ?) ON CONFLICT(openid) DO NOTHING").run(
    openid,
    now,
  );
  return db.prepare("SELECT * FROM users WHERE openid = ?").get(openid) as UserRow;
}

export function findDraw(userId: number, localDate: string): DrawRow | undefined {
  return db
    .prepare("SELECT * FROM draws WHERE user_id = ? AND local_date = ?")
    .get(userId, localDate) as DrawRow | undefined;
}

export function insertDraw(
  userId: number,
  localDate: string,
  roleId: string,
  seed: string,
  taskIds: string[],
): DrawRow {
  db.prepare(
    "INSERT INTO draws (user_id, local_date, role_id, seed, task_ids, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(userId, localDate, roleId, seed, JSON.stringify(taskIds), new Date().toISOString());
  return findDraw(userId, localDate)!;
}

export function listCheckins(drawId: number): CheckinRow[] {
  return db.prepare("SELECT * FROM checkins WHERE draw_id = ?").all(drawId) as CheckinRow[];
}

/** 删掉某天的抽卡记录（checkins 由外键级联清掉）；返回删掉的行数 */
export function deleteDraw(userId: number, localDate: string): number {
  const r = db.prepare("DELETE FROM draws WHERE user_id = ? AND local_date = ?").run(userId, localDate);
  return Number(r.changes ?? 0);
}

/** 今天已经重抽过几次（0 = 还没重抽过） */
export function getDrawRound(userId: number, localDate: string): number {
  const row = db
    .prepare("SELECT round FROM draw_rounds WHERE user_id = ? AND local_date = ?")
    .get(userId, localDate) as { round: number } | undefined;
  return row ? row.round : 0;
}

/** 重抽次数 +1，返回新的值 */
export function bumpDrawRound(userId: number, localDate: string): number {
  db.prepare(
    `INSERT INTO draw_rounds (user_id, local_date, round) VALUES (?, ?, 1)
     ON CONFLICT(user_id, local_date) DO UPDATE SET round = round + 1`,
  ).run(userId, localDate);
  return getDrawRound(userId, localDate);
}

export function upsertCheckin(drawId: number, taskId: string, done: boolean, note: string): CheckinRow {
  db.prepare(
    `INSERT INTO checkins (draw_id, task_id, done, note, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(draw_id, task_id) DO UPDATE SET
       done = excluded.done,
       note = excluded.note,
       updated_at = excluded.updated_at`,
  ).run(drawId, taskId, done ? 1 : 0, note, new Date().toISOString());
  return db
    .prepare("SELECT * FROM checkins WHERE draw_id = ? AND task_id = ?")
    .get(drawId, taskId) as CheckinRow;
}

export function listDrawsInRange(userId: number, from: string, to: string): DrawRow[] {
  return db
    .prepare("SELECT * FROM draws WHERE user_id = ? AND local_date BETWEEN ? AND ? ORDER BY local_date ASC")
    .all(userId, from, to) as DrawRow[];
}

export function listAllDrawDates(userId: number): string[] {
  return (db.prepare("SELECT local_date FROM draws WHERE user_id = ? ORDER BY local_date DESC").all(userId) as {
    local_date: string;
  }[]).map((r) => r.local_date);
}