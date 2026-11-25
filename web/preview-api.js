/** Browser-only preview data. Matches the game API without contacting a backend. */
const PROFILE_KEY = 'roles.web-preview.v1';
const clone = value => JSON.parse(JSON.stringify(value));
function randomId() {
  if (globalThis.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
function seeded(seed) {
  let value = 2166136261;
  for (let i = 0; i < seed.length; i++) value = Math.imul(value ^ seed.charCodeAt(i), 16777619);
  return () => {
    value += 0x6D2B79F5;
    let n = Math.imul(value ^ (value >>> 15), value | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(items, rand) {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
// Asia/Shanghai, with the same 06:00 daily rollover as the game server.
const today = () => new Date(Date.now() + 2 * 3600000).toISOString().slice(0, 10);
function previous(date) {
  return new Date(Date.parse(date + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
}
export function createPreviewAPI(roles) {
  let profile;
  try { profile = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); } catch (_) {}
  if (!profile || profile.version !== 1 || typeof profile.visitor !== 'string' ||
      !profile.draws || typeof profile.draws !== 'object' || !profile.rounds || typeof profile.rounds !== 'object') {
    profile = {version: 1, visitor: randomId(), draws: {}, rounds: {}};
  }
  function save() { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch (_) {} }
  save();
  function offer(date) {
    return shuffled(roles, seeded(profile.visitor + ':' + date + ':' + (profile.rounds[date] || 0)))
      .slice(0, 10).map(({id, name, emoji, tagline, intro, gradient, accent}) =>
        ({id, name, emoji, tagline, intro, gradient, accent}));
  }
  function streak() {
    let date = today();
    if (!profile.draws[date]) date = previous(date);
    let count = 0;
    while (profile.draws[date]) { count++; date = previous(date); }
    return count;
  }
  function stats() {
    const draws = Object.values(profile.draws);
    const counts = new Map();
    let totalTasks = 0, doneTasks = 0;
    for (const draw of draws) {
      counts.set(draw.role.id, (counts.get(draw.role.id) || 0) + 1);
      totalTasks += draw.tasks.length;
      doneTasks += draw.checkins.filter(item => item.done).length;
    }
    return {today: today(), streak: streak(), totalDays: draws.length, totalTasks, doneTasks,
      completionRate: totalTasks ? Math.round(doneTasks / totalTasks * 100) : 0,
      collected: [...counts].map(([roleId, times]) => {
        const role = roles.find(item => item.id === roleId);
        return {roleId, name: role.name, emoji: role.emoji, gradient: role.gradient, tagline: role.tagline, times};
      }).sort((a, b) => b.times - a.times)};
  }
  function route(method, url, data) {
    const date = today();
    const path = url.pathname;
    if (method === 'POST' && path === '/api/auth/login') return {token: 'web-preview-' + profile.visitor};
    if (method === 'GET' && path === '/api/draw/today') {
      const draw = profile.draws[date];
      return {date, drawn: Boolean(draw), draw: draw ? {...draw, isNew: false} : null,
        offer: draw ? [] : offer(date), canRedraw: true, round: profile.rounds[date] || 0};
    }
    if (method === 'POST' && path === '/api/draw') {
      if (profile.draws[date]) return {...profile.draws[date], isNew: false};
      if (!offer(date).some(role => role.id === data.roleId)) throw new Error('只能从今天这包牌里选');
      const role = roles.find(item => item.id === data.roleId);
      const seed = randomId();
      const rand = seeded(seed);
      const tasks = shuffled(role.tasks, rand).slice(0, Math.min(role.tasks.length, 3 + (rand() > 0.65 ? 1 : 0)));
      profile.draws[date] = {date, role: clone(role), tasks: clone(tasks), checkins: [], seed};
      save();
      return {...profile.draws[date], isNew: true};
    }
    if (method === 'POST' && path === '/api/draw/redraw') {
      if (!profile.draws[date]) throw new Error('今天还没有抽卡，直接去抽吧');
      delete profile.draws[date];
      profile.rounds[date] = (profile.rounds[date] || 0) + 1;
      save();
      return {date, round: profile.rounds[date]};
    }
    if (method === 'PATCH' && path === '/api/checkin') {
      const draw = profile.draws[data.date];
      if (!draw || !draw.tasks.some(task => task.id === data.taskId)) throw new Error('这条任务不属于已抽到的角色');
      const checkin = {taskId: data.taskId, done: Boolean(data.done), note: String(data.note || '').slice(0, 200)};
      const index = draw.checkins.findIndex(item => item.taskId === data.taskId);
      if (index < 0) draw.checkins.push(checkin); else draw.checkins[index] = checkin;
      save();
      return {checkin};
    }
    if (method === 'GET' && path === '/api/stats') return stats();
    if (method === 'GET' && path === '/api/calendar') {
      const from = url.searchParams.get('from') || '0000-01-01';
      const to = url.searchParams.get('to') || '9999-12-31';
      const entries = Object.values(profile.draws).filter(draw => draw.date >= from && draw.date <= to)
        .map(draw => ({date: draw.date, roleId: draw.role.id, roleName: draw.role.name,
          emoji: draw.role.emoji, gradient: draw.role.gradient, tasksTotal: draw.tasks.length,
          tasksDone: draw.checkins.filter(item => item.done).length}));
      return {today: date, entries, streak: streak()};
    }
    if (method === 'GET' && path.startsWith('/api/draw/')) return profile.draws[path.slice(10)] || null;
    throw new Error('这个预览入口暂不支持该操作');
  }
  return {
    request(method, address, data = {}) {
      try {
        return {statusCode: 200, data: {ok: true, data: clone(route(method.toUpperCase(), new URL(address, location.href), data))}};
      } catch (error) {
        return {statusCode: 400, data: {ok: false, error: {code: 'PREVIEW', message: error.message}}};
      }
    },
    reset() {
      profile = {version: 1, visitor: randomId(), draws: {}, rounds: {}};
      save();
    },
  };
}
