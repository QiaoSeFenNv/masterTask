# Web 体验预览

浏览器版复用 game/ 的 Canvas 界面、卡包图片、角色数据与 PAG 揭晓。体验者可以用鼠标或手指完成选包、撕包、转盘选三张、确认角色，再操作今日整张 3D 双面卡牌、卡牌日历和油画图鉴。最新主线与整合验收见 [LATEST-PAGES.md](LATEST-PAGES.md)。

## 本地启动

运行环境为 Node 24，当前验证为 Node 24.15.0。

```powershell
npm run web:dev
```

打开 http://127.0.0.1:4173。命令会生成 web/dist 并启动预览服务。网页体验不依赖本地 API 服务，也不需要微信登录。

只重新构建或启动已构建的文件：

```powershell
npm run web:build
npm run web:preview
```

WEB_PREVIEW_PORT 可修改端口，WEB_PREVIEW_HOST 可修改监听地址；默认只监听 127.0.0.1。

## 分享预览

当前临时地址（2026-11-27）：[打开最新 3D 页面预览](https://pas-foo-merely-sin.trycloudflare.com)。

其他人可以直接打开体验，记录保存在各自的浏览器中。“复制链接”可复制当前地址，“重新体验”清空当前浏览器的演示记录并回到选包。

临时分享链接依赖本机预览服务与分享进程持续运行，关闭电脑或停止进程后无法访问。需要长期保留时，将 web/dist 整个目录上传到静态网站托管即可；构建产物使用相对资源地址，不包含后端、数据库或 .env。

## 代码与数据

- web/main.js：浏览器入口、尺寸更新、手记输入弹层与预览操作。
- web/wx-bridge.js：将现有 wx 输入、存储、图片和 WASM 接口适配到浏览器。鼠标与触摸先转换为 Canvas 内的坐标，拖出画面也能正确结束；滚轮可滚动任务页。
- web/preview-api.js：浏览器独立体验数据，沿用游戏 API 的响应格式。候选、落定角色、任务勾选、手记、统计和日历均保存在当前浏览器；按北京时间 06:00 切换日期。
- tools/build-web.cjs：将真实游戏模块打包为浏览器模块，复制必要图片与许可证，将 PAG 的 Brotli WASM 解压为浏览器可加载的 WASM。
- tools/serve-web.cjs：只服务 web/dist，提供正确 MIME、压缩、缓存与 CSP；不代理本地 API。

卡包采用参考图式的扁平补充包：150 × 278 的直边轮廓、银色上下封边、满幅油画印刷，不再使用鼓胀袋身和侧褶。选包、就位、Canvas 撕包和 PAG 出牌使用同一比例；封边 PNG 为 300 × 556，每张约 27 KB，中央插画区域保持透明。

选包新增 480 ms 放大移动过渡，之后才接受撕包。撕包和转盘继续随拖动变化，确认角色后播放同一份 PAG 揭晓；运行时不可用时使用 Canvas 回退。候选说明放到卡片下方，避免遮挡卡面；小屏时把候选区上移，飞行动画的终点与揭晓的起点同步调整，按钮和提示保持在导航栏上方。图鉴卡片随滚动移动，并限制在可见列表区域内绘制和点击。

## 验证

```powershell
npm run test:web
npm run test:pack
npm run test:pack:web
npm run test:pages
npm run test:animation
npm run test:pag
```

首次运行浏览器验证需 npm ci，并使用已安装的 Chromium / Edge / Chrome，也可通过 PAG_BROWSER 指定可执行文件。test:web 自动构建并启动隔离的静态服务器，不需要后端。

浏览器验证使用真实鼠标与 Chromium 触摸输入，检查选包过渡、跟手撕包、转盘选卡、PAG 揭晓、早期点击保护、继续和自动结束、今日 3D 卡牌与历史卡的鼠标/触摸/键盘旋转翻面、卡牌日历和油画图鉴、手机尺寸变化、访客数据隔离、重新体验及运行时回退。为核对过渡中的画面，测试使用可控时间轴；这不代表物理设备的帧率测试。

截图与验证报告在 tools/.web-preview/；设计与验收范围见 [web/DESIGN.md](web/DESIGN.md)。

卡包专项验收：`npm run test:pack` 检查几何、首帧回退、裁切与缓存；`npm run test:pack:web` 用真实鼠标与触摸检查三个手机尺寸、左右撕包、PAG 和缺图 Canvas 回退。截图与报告位于 `tools/.web-preview/booster-*.png` / `booster-verification.json`。
