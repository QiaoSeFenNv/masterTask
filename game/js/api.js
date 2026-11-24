/**
 * 小游戏侧的接口层:和原小程序端 utils/request.js 行为一致。
 * 走 wx.request / wx.login,登录拿 JWT,401 静默重登一次。
 */

const env = require("./env.js");

const TOKEN_KEY = "roles_token";
const BASE_URL = "http://127.0.0.1:3000";

let token = null;
let loginPromise = null;

function wx() {
  return env.getWx();
}

function baseUrl() {
  return BASE_URL;
}

function getToken() {
  if (token !== null) return token;
  try {
    token = wx().getStorageSync(TOKEN_KEY) || "";
  } catch {
    token = "";
  }
  return token;
}

function saveToken(next) {
  token = next || "";
  try {
    if (token) wx().setStorageSync(TOKEN_KEY, token);
    else wx().removeStorageSync(TOKEN_KEY);
  } catch {
    /* 存储不可用不影响本次会话 */
  }
}

function rawRequest(method, path, data, authToken) {
  return new Promise((resolve, reject) => {
    const header = { "content-type": "application/json" };
    if (authToken) header.Authorization = "Bearer " + authToken;

    wx().request({
      url: baseUrl() + path,
      method,
      data: data || {},
      header,
      success(res) {
        const body = res.data || {};
        if (res.statusCode === 200 && body.ok) resolve(body.data);
        else
          reject({
            status: res.statusCode,
            code: body.error && body.error.code,
            message: (body.error && body.error.message) || "请求失败",
          });
      },
      fail(err) {
        reject({ status: 0, code: "NETWORK", message: (err && err.errMsg) || "网络异常" });
      },
    });
  });
}

function wxLoginCode() {
  return new Promise((resolve, reject) => {
    wx().login({
      success(r) {
        if (r.code) resolve(r.code);
        else reject({ status: 0, code: "NO_CODE", message: "wx.login 未返回 code" });
      },
      fail: reject,
    });
  });
}

function login() {
  if (loginPromise) return loginPromise;
  loginPromise = wxLoginCode()
    .then((code) => rawRequest("POST", "/api/auth/login", { code }, ""))
    .then((data) => {
      saveToken(data.token);
      return data.token;
    })
    .then(
      (v) => {
        loginPromise = null;
        return v;
      },
      (e) => {
        loginPromise = null;
        throw e;
      },
    );
  return loginPromise;
}

function request(method, path, data) {
  const start = getToken() ? Promise.resolve(getToken()) : login();
  return start
    .then((current) => rawRequest(method, path, data, current))
    .catch((err) => {
      if (err && err.status === 401) {
        saveToken("");
        return login().then((fresh) => rawRequest(method, path, data, fresh));
      }
      throw err;
    });
}

module.exports = {
  baseUrl,
  get: (path) => request("GET", path),
  post: (path, data) => request("POST", path, data),
  patch: (path, data) => request("PATCH", path, data),
};
