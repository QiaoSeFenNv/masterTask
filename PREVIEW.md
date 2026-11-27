# 预览与联调（小游戏版）

## 1. 起后端

```bash
npm run dev
```

默认监听 `http://127.0.0.1:3000`。后端使用 Node 内置模块，启动无需安装 npm 依赖。健康检查：`curl http://127.0.0.1:3000/api/health`。本地没配 `WX_APPSECRET` 时自动走 mock 登录。

## 2. 跑测试

```bash
node tools/smoke.mjs                  # 后端接口全流程
node --experimental-strip-types tools/day.test.ts  # 日期与连续天数
node tools/game-check.mjs             # 游戏渲染、触摸与接口；需后端已启动
npm ci                               # PAG 构建与浏览器测试所需开发依赖
npm run test:animation               # 动画时钟、缓动、PAG 生命周期；无需后端
npm run test:pag                     # 真实 PAG SDK 与 WebGL；无需后端
```

动画验证重点：第三张翻完才起飞、三张保持正面；落定后先保存角色，再播放 1 秒揭晓；聚焦 380 ms 后可点击继续；后台恢复、自动结束和失败回退后任务流程正常。动画时钟测试覆盖 30/60/120 FPS 下的时长一致性，设备实际帧率需要真机测量。

PAG 构建、AE 替换与资源契约见 [PAG.md](PAG.md)。`test:pag` 输出角色预览图和验证报告到 `tools/.pag-preview/`。

## 3. 小游戏端

```bash
node tools/sync-roles.cjs   # 首次克隆或改完 shared/roles.json 后同步到 game/data/roles.js
```

揭晓与撕包的 PAG 数据模块、SDK 和图片已随代码提交，无需先运行 Web 构建补资源。替换撕包动画源文件后执行 `npm run pag:tear:pack`。

微信开发者工具 → 导入项目 → `C:\Files\roles`，AppID 为 `wx9fd6453e42bc9d4e`，然后点编译。`project.config.json` 已设置 `compileType: game`、`miniprogramRoot: game/`。本地联调需在“详情 → 本地设置”勾选“不校验合法域名”。

`game/` 是当前小游戏工程；`miniprogram/` 是归档的小程序实现。当前 AppID 登记为小游戏，导入归档的小程序结构会报 `game.json` 找不到。

## 4. 用 wechatide 命令行驱动工具

本机 Codex 客户端已完成微信开发者工具 CLI 授权。

```powershell
& "C:\Program Files (x86)\Tencent\微信web开发者工具\wechatide.cmd" -c Codex open_project_window --project "C:\Files\roles" --window-mode fullMode
& "C:\Program Files (x86)\Tencent\微信web开发者工具\wechatide.cmd" -c Codex simulator_refresh --project "C:\Files\roles"
& "C:\Program Files (x86)\Tencent\微信web开发者工具\wechatide.cmd" -c Codex simulator_screenshot --project "C:\Files\roles" --path "C:\Files\roles\tools\.pag-preview\game.png" --optimize false
```

2026-11-24 用完整窗口模式和隔离的 PAG 工程，已成功编译并取得 390 × 844 的模拟器截图，确认卡面、光环和星光实际显示。早期“命令行截图一直全白”的现象已经不能作为当前限制。

仍观察到 `automation_runtime_info` 超时和控制台查询返回空串，重复刷新有时会沿用缓存。首次打开时需等待编译完成；有缓存疑问时，用 `npm run pag:native` 创建新的临时验证工程，再打开打印出的路径。此副本不请求后端，适合检查 PAG 绘制，主工程的触摸与接口流程由自动回归覆盖。

关键帧截图：[wechat-pag-reveal.png](tools/.pag-preview/wechat-pag-reveal.png)。模拟器播放已验证，物理设备的帧率、内存和发热尚未测量。

## 5. 浏览器体验预览

运行 `npm run web:dev`,打开 http://127.0.0.1:4173。其他人可打开 [WEB.md 中的当前 HTTPS 分享链接](WEB.md) 体验。网页复用当前 Canvas 与 PAG 动画,无需微信登录和本地后端;演示记录保存在每位体验者自己的浏览器里。

使用鼠标或触摸完成选包、沿包口向右拖动、转盘点三张、选定角色与揭晓。页面顶部可复制链接或重新体验。运行 `npm run test:web` 验证真实浏览器流程,详见 [WEB.md](WEB.md)。临时分享地址依赖本机服务持续运行。
