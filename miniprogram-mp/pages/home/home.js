const api = require("../../utils/request.js");
const fmt = require("../../utils/format.js");
const poster = require("../../utils/poster.js");

Page({
  data: {
    statusBarHeight: 20,
    loading: true,
    drawn: false,
    shuffling: false,
    entering: false,
    draw: null,
    taskViews: [],
    doneCount: 0,
    monthLabel: "",
    dayLabel: "",
    weekday: "",
    stats: { streak: 0 },
    noteDraft: "",
    noteSaving: false,
    cardBg: "",
    cardTextColor: "#ffffff",
  },

  noteTimer: null,

  onLoad() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({ statusBarHeight: info.statusBarHeight || 20 });
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    this.loadToday();
  },

  async loadToday() {
    try {
      const res = await api.get("/api/draw/today");
      this.applyDraw(res.date, res.drawn ? res.draw : null);
    } catch (err) {
      this.setData({ loading: false });
      api.toastError(err);
    }
  },

  applyDraw(date, draw) {
    const parts = fmt.splitDate(date);
    const base = {
      loading: false,
      drawn: Boolean(draw),
      monthLabel: parts.m,
      dayLabel: parts.d,
      weekday: fmt.weekdayZh(date),
    };

    if (!draw) {
      this.setData(Object.assign({}, base, { draw: null, taskViews: [], doneCount: 0 }));
      this.loadStats();
      return;
    }

    const checkinMap = {};
    draw.checkins.forEach((c) => {
      checkinMap[c.taskId] = c;
    });

    const taskViews = draw.tasks.map((t) => {
      const c = checkinMap[t.id];
      return {
        id: t.id,
        text: t.text,
        tag: t.tag,
        done: Boolean(c && c.done),
        note: (c && c.note) || "",
      };
    });

    const firstNote = draw.checkins.find((c) => c.note);

    this.setData(
      Object.assign({}, base, {
        draw,
        taskViews,
        doneCount: taskViews.filter((t) => t.done).length,
        cardBg: fmt.gradientCss(draw.role.gradient, 150),
        cardTextColor: "#1a1420",
        noteDraft: (firstNote && firstNote.note) || "",
        entering: true,
      })
    );

    setTimeout(() => this.setData({ entering: false }), 900);
    this.loadStats();
  },

  async loadStats() {
    try {
      const stats = await api.get("/api/stats");
      this.setData({ stats });
    } catch (err) {
      // 统计失败不影响主流程
    }
  },

  onDraw() {
    if (this.data.shuffling) return;
    this.setData({ shuffling: true });

    // 先播 600ms 洗卡动画，再发请求
    setTimeout(async () => {
      try {
        const draw = await api.post("/api/draw", {});
        this.setData({ shuffling: false });
        this.applyDraw(draw.date, draw);
      } catch (err) {
        this.setData({ shuffling: false });
        api.toastError(err);
      }
    }, 600);
  },

  async onToggleTask(e) {
    const taskId = e.currentTarget.dataset.id;
    const task = this.data.taskViews.find((t) => t.id === taskId);
    if (!task) return;

    const nextDone = !task.done;
    const taskViews = this.data.taskViews.map((t) =>
      t.id === taskId ? Object.assign({}, t, { done: nextDone }) : t
    );

    this.setData({
      taskViews,
      doneCount: taskViews.filter((t) => t.done).length,
    });

    if (nextDone) {
      wx.vibrateShort({ type: "light" });
    }

    try {
      await api.patch("/api/checkin", {
        date: this.data.draw.date,
        taskId,
        done: nextDone,
        note: task.note || "",
      });
      if (nextDone && this.data.doneCount === taskViews.length) {
        wx.showToast({ title: "今日任务全部完成", icon: "none" });
      }
    } catch (err) {
      // 回滚
      const rolled = this.data.taskViews.map((t) =>
        t.id === taskId ? Object.assign({}, t, { done: task.done }) : t
      );
      this.setData({ taskViews: rolled, doneCount: rolled.filter((t) => t.done).length });
      api.toastError(err);
    }
  },

  onNoteInput(e) {
    this.setData({ noteDraft: e.detail.value });
  },

  onNoteBlur() {
    this.saveNote();
  },

  onSaveNote() {
    this.saveNote(true);
  },

  async saveNote(manual) {
    const note = (this.data.noteDraft || "").trim();
    const draw = this.data.draw;
    if (!draw) return;

    const target = this.data.taskViews.find((t) => t.done) || this.data.taskViews[0];
    if (!target) return;

    if (!manual && note === (target.note || "")) return;

    this.setData({ noteSaving: true });
    try {
      await api.patch("/api/checkin", {
        date: draw.date,
        taskId: target.id,
        done: target.done,
        note,
      });
      const taskViews = this.data.taskViews.map((t) =>
        t.id === target.id ? Object.assign({}, t, { note }) : t
      );
      this.setData({ taskViews, noteSaving: false });
      if (manual) wx.showToast({ title: "已保存", icon: "none" });
    } catch (err) {
      this.setData({ noteSaving: false });
      api.toastError(err);
    }
  },

  async onSharePoster() {
    if (!this.data.draw) return;
    wx.showLoading({ title: "生成中", mask: true });
    try {
      const tempPath = await poster.build(this, this.data.draw, this.data.taskViews);
      wx.hideLoading();
      wx.previewImage({ urls: [tempPath] });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: "生成失败，可长按截图保存", icon: "none" });
    }
  },

  onShareAppMessage() {
    const draw = this.data.draw;
    if (!draw) {
      return { title: "今天你扮演什么角色？", path: "/pages/home/home" };
    }
    return {
      title: "今天我抽到了「" + draw.role.name + "」" + draw.role.emoji,
      path: "/pages/home/home",
    };
  },

  onShareTimeline() {
    const draw = this.data.draw;
    return {
      title: draw ? "今天我抽到了「" + draw.role.name + "」" : "今天你扮演什么角色？",
    };
  },
});