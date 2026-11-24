const TOKEN_KEY = "roles_token";

let token = wx.getStorageSync(TOKEN_KEY) || "";
let loginPromise = null;

function saveToken(next) {
  token = next || "";
  if (token) wx.setStorageSync(TOKEN_KEY, token);
  else wx.removeStorageSync(TOKEN_KEY);
}

function getAppBaseUrl() {
  const app = getApp();
  if (app && typeof app.getBaseUrl === "function") return app.getBaseUrl();
  const env = require("./env.js");
  return env.resolveBaseUrl();
}

/** 底层请求：本身不触发登录，供 /auth/login 使用 */
function rawRequest(method, path, data, authToken) {
  return new Promise(function (resolve, reject) {
    const header = { "content-type": "application/json" };
    if (authToken) header.Authorization = "Bearer " + authToken;

    wx.request({
      url: getAppBaseUrl() + path,
      method,
      data: data || {},
      header,
      timeout: 10000,
      success(res) {
        const body = res.data || {};
        if (res.statusCode === 200 && body.ok) {
          resolve(body.data);
        } else {
          reject({
            status: res.statusCode,
            code: body.error && body.error.code,
            message: (body.error && body.error.message) || "请求失败",
          });
        }
      },
      fail(err) {
        reject({
          status: 0,
          code: "NETWORK",
          message: (err && err.errMsg) || "网络异常",
        });
      },
    });
  });
}

function wxLoginCode() {
  return new Promise(function (resolve, reject) {
    wx.login({
      success(r) {
        if (r.code) resolve(r.code);
        else reject({ status: 0, code: "NO_CODE", message: "wx.login 未返回 code" });
      },
      fail: reject,
    });
  });
}

/** 登录（并发去重，多次调用只发一次请求） */
function login() {
  if (loginPromise) return loginPromise;

  loginPromise = wxLoginCode()
    .then(function (code) {
      return rawRequest("POST", "/api/auth/login", { code: code }, "");
    })
    .then(function (data) {
      saveToken(data.token);
      return data.token;
    })
    .then(
      function (value) {
        loginPromise = null;
        return value;
      },
      function (err) {
        loginPromise = null;
        throw err;
      }
    );

  return loginPromise;
}

/** 带鉴权的请求：遇到 401 静默重登一次再重试 */
function request(method, path, data) {
  const start = token ? Promise.resolve(token) : login();

  return start
    .then(function (current) {
      return rawRequest(method, path, data, current);
    })
    .catch(function (err) {
      if (err && err.status === 401) {
        saveToken("");
        return login().then(function (fresh) {
          return rawRequest(method, path, data, fresh);
        });
      }
      throw err;
    });
}

function toastError(err) {
  wx.showToast({
    title: (err && err.message) || "出错了，稍后再试",
    icon: "none",
    duration: 2200,
  });
}

module.exports = {
  request,
  login,
  toastError,
  get(path) {
    return request("GET", path);
  },
  post(path, data) {
    return request("POST", path, data);
  },
  patch(path, data) {
    return request("PATCH", path, data);
  },
};