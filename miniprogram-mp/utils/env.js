/**
 * 后端地址解析：
 * - 开发 / 体验版：可指向局域网 IP 或 localhost，配合「不校验合法域名」
 * - 正式版：必须改成已备案的 https 域名
 */
const ENV_CONFIG = {
  // 微信开发者工具模拟器里 127.0.0.1 指向本机，可直接跑 `npm run dev`
  develop: "http://127.0.0.1:3000",
  trial: "http://127.0.0.1:3000",
  // ⚠️ 上线前改成你的已备案域名，例如 "https://api.example.com"
  release: "https://api.example.com",
};

function resolveBaseUrl() {
  let envVersion = "develop";
  try {
    const info = wx.getAccountInfoSync();
    if (info && info.miniProgram && info.miniProgram.envVersion) {
      envVersion = info.miniProgram.envVersion;
    }
  } catch (e) {}
  return ENV_CONFIG[envVersion] || ENV_CONFIG.develop;
}

module.exports = { resolveBaseUrl, ENV_CONFIG };
