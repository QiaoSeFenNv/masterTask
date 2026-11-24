# 预览与联调(小游戏版)

## 1. 起后端

```
npm run dev
```

默认监听 `http://127.0.0.1:3000`。零 npm 依赖,不需要 `npm install`。
健康检查:`curl http://127.0.0.1:3000/api/health`
本地没配 `WX_APPSECRET` 时自动走 mock 登录(`code` 直接当 openid 用)。

## 2. 跑测试

```
node tools/smoke.mjs               # 后端接口 22 项
node tools/day.test.ts             # 日界 / 连续天数 9 项
node tools/game-check.mjs          # 小游戏渲染 + 触摸 + 接口全链路 22 项(需后端已启动)
```

## 3. 小游戏端

```
node tools/sync-roles.cjs          # 改完 shared/roles.json 后同步到 game/data/roles.js
```

然后 **微信开发者工具 → 导入项目 → `C:\Files\roles`**(AppID 仍是 `wx9fd6453e42bc9d4e`,该账号是小游戏类型)→ 点 **编译**。
`project.config.json` 里 `compileType: game`、`miniprogramRoot: game/`,工具会自动按小游戏打开。

- 根目录下的 `game/` 是当前的小游戏工程
- 根目录下的 `miniprogram/` 是最早的小程序版,已归档。**注意:那是小程序账号的结构,当前 AppID 是小游戏,导入它会报 `game.json` 找不到**(之前排查过的那条 10005 就是它导致的)。小程序账号是另一套工程和入口

## 4. 用 wechatide 命令行驱动工具(能用的部分)

```
& "C:\Program Files (x86)\Tencent\微信web开发者工具\wechatide.cmd" -c Claude project_import --project "C:\Files\roles"
& "...\wechatide.cmd" -c Claude project_list
& "...\wechatide.cmd" -c Claude simulator_screenshot --project "C:\Files\roles"
& "...\wechatide.cmd" -c Claude get_simulator_console --project "C:\Files\roles" --command 'grep -n .'
& "...\wechatide.cmd" -c Claude get_simulator_network --project "C:\Files\roles" --command 'grep -i fail'
```

**已知问题(2026-11-19 排查)**:改成小游戏后 `open_project_window` 不再报 `game.json` 找不到,能返回 winId。
但命令行通道下 `simulator_screenshot` 永远是 **289×625 全白**,`get_simulator_console` 返回空串,`automation_runtime_info` 超时。
对照项目 `C:\Users\8856\WeChatProjects\miniprogram-2` 也是同样全白,所以这是 **命令行通道在这台机器上渲染不出画面**,与项目无关。

**绕过办法**:用开发者工具图形界面打开 `C:\Files\roles`,点 **编译**,把模拟器截图或控制台报错贴给我。
