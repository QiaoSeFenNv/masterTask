Component({
  data: {
    selected: 0,
    list: [
      { pagePath: "/pages/home/home", text: "今日" },
      { pagePath: "/pages/calendar/calendar", text: "日历" },
      { pagePath: "/pages/collection/collection", text: "图鉴" },
    ],
  },

  methods: {
    onTap(e) {
      const index = e.currentTarget.dataset.index;
      const item = this.data.list[index];
      if (!item || index === this.data.selected) return;
      wx.switchTab({ url: item.pagePath });
    },
  },
});