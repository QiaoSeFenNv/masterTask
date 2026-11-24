const api = require("../../utils/request.js");
const rolesData = require("../../data/roles.js");
const fmt = require("../../utils/format.js");

Page({
  data: {
    statusBarHeight: 20,
    loading: true,
    stats: {
      streak: 0,
      totalDays: 0,
      totalTasks: 0,
      doneTasks: 0,
      completionRate: 0,
      collected: [],
    },
    cards: [],
    collectedCount: 0,
    totalCount: 0,
    progress: 0,
    accentFallback: "#e8dcc8",
    selected: null,
  },

  onLoad() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({ statusBarHeight: info.statusBarHeight || 20, totalCount: rolesData.roles.length });
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    this.loadStats();
  },

  loadStats() {
    const self = this;
    api
      .get("/api/stats")
      .then(function (stats) {
        const collectedMap = {};
        stats.collected.forEach(function (c) {
          collectedMap[c.roleId] = c;
        });

        const cards = rolesData.roles.map(function (role) {
          const own = collectedMap[role.id];
          return {
            id: role.id,
            name: role.name,
            emoji: role.emoji,
            tagline: role.tagline,
            bg: fmt.gradientCss(role.gradient, 150),
            owned: Boolean(own),
            times: own ? own.times : 0,
          };
        });

        const collectedCount = cards.filter(function (c) {
          return c.owned;
        }).length;

        self.setData({
          loading: false,
          stats: stats,
          cards: cards,
          collectedCount: collectedCount,
          progress: cards.length ? Math.round((collectedCount / cards.length) * 100) : 0,
        });
      })
      .catch(function (err) {
        self.setData({ loading: false });
        api.toastError(err);
      });
  },

  onTapCard(e) {
    const id = e.currentTarget.dataset.id;
    const role = rolesData.roles.find(function (r) {
      return r.id === id;
    });
    if (!role) return;
    this.setData({
      selected: {
        name: role.name,
        emoji: role.emoji,
        tagline: role.tagline,
        intro: role.intro,
        taskCount: role.tasks.length,
        bg: fmt.gradientCss(role.gradient, 150),
        accent: role.accent,
      },
    });
  },

  onClose() {
    this.setData({ selected: null });
  },
});