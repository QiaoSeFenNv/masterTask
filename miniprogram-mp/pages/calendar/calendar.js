const api = require("../../utils/request.js");
const fmt = require("../../utils/format.js");

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/**
 * 构造月历单元格。
 * 注意：小程序不支持把函数/对象放进 data 再回传，这里只放可序列化的字段。
 */
function buildMonth(year, month, entries, todayStr) {
  const entryMap = {};
  entries.forEach(function (e) {
    entryMap[e.date] = e;
  });

  const startWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells = [];
  let i;
  for (i = 0; i < startWeekday; i++) {
    cells.push({ type: "blank", key: "b" + i });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = year + "-" + fmt.pad(month) + "-" + fmt.pad(d);
    const entry = entryMap[dateStr] || null;
    cells.push({
      type: "day",
      key: dateStr,
      date: dateStr,
      day: d,
      entry: entry,
      bg: entry ? fmt.gradientCss(entry.gradient, 150) : "",
      isToday: dateStr === todayStr,
      future: dateStr > todayStr,
    });
  }
  return cells;
}

function toDetail(entry) {
  if (!entry) return null;
  return {
    roleName: entry.roleName,
    emoji: entry.emoji,
    date: entry.date,
    dateLabel: entry.date.replace(/-/g, " / "),
    tasksDone: entry.tasksDone,
    tasksTotal: entry.tasksTotal,
    bg: fmt.gradientCss(entry.gradient, 150),
    accent: (entry.gradient && entry.gradient[1]) || "#e8dcc8",
  };
}

Page({
  data: {
    statusBarHeight: 20,
    loading: true,
    year: 0,
    month: 0,
    cells: [],
    weekdayNames: WEEKDAYS,
    streak: 0,
    monthDays: 0,
    monthDone: 0,
    monthRate: "—",
    todayStr: "",
    detail: null,
  },

  onLoad() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({ statusBarHeight: info.statusBarHeight || 20 });
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    if (!this.data.year) {
      const now = new Date();
      this.setData({ year: now.getFullYear(), month: now.getMonth() + 1 });
    }
    this.loadMonth();
  },

  loadMonth() {
    const self = this;
    const y = this.data.year;
    const m = this.data.month;
    const from = y + "-" + fmt.pad(m) + "-01";
    const lastDay = new Date(y, m, 0).getDate();
    const to = y + "-" + fmt.pad(m) + "-" + fmt.pad(lastDay);

    api
      .get("/api/calendar?from=" + from + "&to=" + to)
      .then(function (res) {
        const drawn = res.entries.length;
        const completed = res.entries.filter(function (e) {
          return e.tasksTotal > 0 && e.tasksDone === e.tasksTotal;
        }).length;

        self.setData({
          loading: false,
          cells: buildMonth(y, m, res.entries, res.today),
          streak: res.streak,
          todayStr: res.today,
          monthDays: drawn,
          monthDone: completed,
          monthRate: drawn ? Math.round((completed / drawn) * 100) + "%" : "—",
        });
      })
      .catch(function (err) {
        self.setData({ loading: false });
        api.toastError(err);
      });
  },

  onPrevMonth() {
    let y = this.data.year;
    let m = this.data.month - 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    this.setData({ year: y, month: m, detail: null });
    this.loadMonth();
  },

  onNextMonth() {
    let y = this.data.year;
    let m = this.data.month + 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    this.setData({ year: y, month: m, detail: null });
    this.loadMonth();
  },

  onTapDay(e) {
    const index = Number(e.currentTarget.dataset.index);
    const cell = this.data.cells[index];
    if (!cell || !cell.entry) return;
    this.setData({ detail: toDetail(cell.entry) });
  },

  onCloseDetail() {
    this.setData({ detail: null });
  },
});