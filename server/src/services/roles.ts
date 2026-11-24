/**
 * 从 shared/roles.json 读取角色库。
 * 前后端共用同一份数据：小程序端复制到 miniprogram/data/roles.js（由 sync 脚本生成）。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "../config.ts";

export type Task = { id: string; text: string; tag: string };
export type Role = {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  intro: string;
  gradient: string[];
  accent: string;
  tasks: Task[];
};

const raw = JSON.parse(readFileSync(resolve(ROOT, "shared/roles.json"), "utf8")) as {
  version: number;
  roles: Role[];
};

export const ROLES: Role[] = raw.roles;
export const ROLES_VERSION = raw.version;

const roleMap = new Map(ROLES.map((r) => [r.id, r]));
const taskMap = new Map<string, Task & { roleId: string }>();
for (const role of ROLES) {
  for (const task of role.tasks) taskMap.set(task.id, { ...task, roleId: role.id });
}

export function getRole(id: string): Role | undefined {
  return roleMap.get(id);
}

export function getTask(id: string): (Task & { roleId: string }) | undefined {
  return taskMap.get(id);
}

/** 每次抽 3–5 条：角色池里有几条就取几条，上限 4 */
export function tasksPerDraw(role: Role): number {
  return Math.min(4, Math.max(3, Math.floor(role.tasks.length / 2)));
}