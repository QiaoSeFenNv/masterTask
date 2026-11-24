import { findDraw, listDrawsInRange, listAllDrawDates, listCheckins, upsertCheckin } from "../db/index.ts";
import { computeStreak, logicalDate } from "../lib/day.ts";
import { getRole, getTask } from "./roles.ts";

export function checkinTask(userId: number, date: string, taskId: string, done: boolean, note: string) {
  const draw = findDraw(userId, date);
  if (!draw) return { ok: false as const, error: "NOT_DRAWN" };

  const taskIds = JSON.parse(draw.task_ids) as string[];
  if (!taskIds.includes(taskId)) return { ok: false as const, error: "TASK_NOT_IN_DRAW" };

  const row = upsertCheckin(draw.id, taskId, done, note);
  return { ok: true as const, checkin: { taskId: row.task_id, done: row.done === 1, note: row.note } };
}

export type CalendarEntry = {
  date: string;
  roleId: string;
  roleName: string;
  emoji: string;
  gradient: string[];
  tasksTotal: number;
  tasksDone: number;
};

export function calendar(userId: number, from: string, to: string) {
  const draws = listDrawsInRange(userId, from, to);
  const entries: CalendarEntry[] = draws.map((d) => {
    const role = getRole(d.role_id);
    const taskIds = JSON.parse(d.task_ids) as string[];
    const doneCount = listCheckins(d.id).filter((c) => c.done === 1).length;
    return {
      date: d.local_date,
      roleId: d.role_id,
      roleName: role?.name ?? d.role_id,
      emoji: role?.emoji ?? "🎴",
      gradient: role?.gradient ?? ["#333", "#555", "#222"],
      tasksTotal: taskIds.length,
      tasksDone: doneCount,
    };
  });
  return { entries, streak: computeStreak(listAllDrawDates(userId), logicalDate()) };
}

export function stats(userId: number) {
  const dates = listAllDrawDates(userId);
  const today = logicalDate();
  const draws = listDrawsInRange(userId, "0000-01-01", "9999-12-31");

  const roleCounts = new Map<string, number>();
  let totalTasks = 0;
  let doneTasks = 0;

  for (const d of draws) {
    roleCounts.set(d.role_id, (roleCounts.get(d.role_id) ?? 0) + 1);
    const ids = JSON.parse(d.task_ids) as string[];
    totalTasks += ids.length;
    doneTasks += listCheckins(d.id).filter((c) => c.done === 1).length;
  }

  const collected = [...roleCounts.entries()]
    .map(([roleId, times]) => {
      const role = getRole(roleId);
      return {
        roleId,
        name: role?.name ?? roleId,
        emoji: role?.emoji ?? "🎴",
        gradient: role?.gradient ?? ["#333", "#555", "#222"],
        tagline: role?.tagline ?? "",
        times,
      };
    })
    .sort((a, b) => b.times - a.times);

  return {
    today,
    streak: computeStreak(dates, today),
    totalDays: dates.length,
    totalTasks,
    doneTasks,
    completionRate: totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100),
    collected,
  };
}

export { getTask };