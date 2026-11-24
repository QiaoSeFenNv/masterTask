import {
  bumpDrawRound,
  deleteDraw,
  findDraw,
  getDrawRound,
  insertDraw,
  listCheckins,
  type DrawRow,
} from "../db/index.ts";
import { newSeed, pickN, seededRandom } from "../lib/random.ts";
import { logicalDate } from "../lib/day.ts";
import { config } from "../config.ts";
import { ROLES, getRole, getTask, tasksPerDraw, type Role, type Task } from "./roles.ts";

export type DrawView = {
  date: string;
  role: Role;
  tasks: Task[];
  seed: string;
  checkins: { taskId: string; done: boolean; note: string }[];
  isNew: boolean;
};

/** 候选卡：只给前端看外观字段，任务列表等服务选定后再给 */
export type RolePreview = {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  intro: string;
  gradient: string[];
  accent: string;
};

/**
 * 每天摊开一包 10 张，用户从中点 3 张，再选 1 张落定。
 * 前端只负责仪式感，最终落定的 roleId 必须在这 10 张里（服务端校验）。
 */
export const OFFER_COUNT = 10;

function preview(role: Role): RolePreview {
  return {
    id: role.id,
    name: role.name,
    emoji: role.emoji,
    tagline: role.tagline,
    intro: role.intro,
    gradient: role.gradient,
    accent: role.accent,
  };
}

/**
 * 今天的候选卡。种子 = userId:date:round，所以同一天怎么刷新都是同样十张，
 * 不会因为重进小程序就换一批；只有重新抽卡（round+1）才会换一包。
 */
export function offerForToday(
  userId: number,
  today: string = logicalDate(),
  round: number = getDrawRound(userId, today),
): RolePreview[] {
  const rand = seededRandom(`${userId}:${today}:${round}:offer`);
  return pickN(ROLES, OFFER_COUNT, rand).map(preview);
}

function buildView(draw: DrawRow, isNew: boolean): DrawView {
  const role = getRole(draw.role_id);
  if (!role) throw new Error(`角色数据缺失: ${draw.role_id}`);
  const taskIds = JSON.parse(draw.task_ids) as string[];
  const tasks = taskIds.map((id) => getTask(id)).filter((t): t is Task & { roleId: string } => Boolean(t));
  const checkins = listCheckins(draw.id).map((c) => ({
    taskId: c.task_id,
    done: c.done === 1,
    note: c.note,
  }));
  return { date: draw.local_date, role, tasks, seed: draw.seed, checkins, isNew };
}

export class DrawError extends Error {
  status = 400;
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * 落定今天的卡（幂等）：同一天已经有记录就直接返回原卡。
 * roleId 必须是当天候选里的一张；不传则默认取第一张（兼容旧客户端）。
 * 选定后不可更改 —— 这是一天一次的仪式，也是连续天数统计的基础。
 */
export function drawForToday(userId: number, today: string = logicalDate(), roleId?: string): DrawView {
  const existing = findDraw(userId, today);
  if (existing) return buildView(existing, false);

  const round = getDrawRound(userId, today);
  const offer = offerForToday(userId, today, round);
  let role: Role | undefined;

  if (roleId) {
    if (!offer.some((o) => o.id === roleId)) {
      throw new DrawError("NOT_IN_OFFER", "只能从今天这包牌里选");
    }
    role = getRole(roleId);
  } else {
    role = getRole(offer[0].id);
  }
  if (!role) throw new DrawError("ROLE_MISSING", `角色数据缺失: ${roleId ?? offer[0].id}`);

  // 任务用 seed 确定：同一个 seed 永远抽出同一组任务，方便回看和复现
  const seed = newSeed();
  const rand = seededRandom(`${userId}:${today}:${round}:${seed}`);
  const tasks = pickN(role.tasks, tasksPerDraw(role), rand);

  // UNIQUE(user_id, local_date) 兜底并发：插入冲突时回读已有记录
  let draw: DrawRow;
  try {
    draw = insertDraw(
      userId,
      today,
      role.id,
      seed,
      tasks.map((t) => t.id),
    );
  } catch {
    draw = findDraw(userId, today)!;
    return buildView(draw, false);
  }
  return buildView(draw, true);
}

export function getDrawByIdempotent(userId: number, date: string): DrawView | null {
  const draw = findDraw(userId, date);
  return draw ? buildView(draw, false) : null;
}

/**
 * 作废今天已经落定的卡，重新发一包牌。
 *
 * 这是**测试专用的临时口子**：一天一次的仪式、连续天数、图鉴收藏都建立在
 * 「当天不可改」上，正常玩法里不该有这个动作。
 * - 只在 config.allowRedraw 为真时可用（开发环境默认开，生产强制关）；
 * - 只允许今天，不允许改历史；
 * - 删掉今天的 draw（checkins 级联删掉），round+1 换一批候选；
 * - 统计里今天的记录会消失，图鉴中这个角色的次数会 -1 —— 这正是测试想要的。
 */
export function redrawToday(userId: number, today: string = logicalDate()): { date: string; round: number } {
  if (!config.allowRedraw) {
    throw new DrawError("REDRAW_DISABLED", "重新抽卡只在测试环境开放");
  }
  const existing = findDraw(userId, today);
  if (!existing) {
    throw new DrawError("NOT_DRAWN_YET", "今天还没有抽卡，直接去抽吧");
  }
  deleteDraw(userId, today);
  const round = bumpDrawRound(userId, today);
  return { date: today, round };
}
