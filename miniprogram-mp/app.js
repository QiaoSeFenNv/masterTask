const { resolveBaseUrl } = require("./utils/env.js");

App({
  globalData: {
    baseUrl: "",
  },

  onLaunch() {
    this.globalData.baseUrl = resolveBaseUrl();
  },

  /** 供页面同步读取（onLaunch 一定早于页面 onLoad） */
  getBaseUrl() {
    return this.globalData.baseUrl || resolveBaseUrl();
  },
});