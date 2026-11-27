# 今日角色双面卡牌

分支：pack-design-refinement。基于 64f6be3，改动留在本地，未提交或推送。

今日页由角色横幅、任务列表、手记和完成统计改为一张居中的竖版角色卡。正面复用现有 cardface.js 的图标、角色名和配色；背面展示原 tagline 与 intro。没有新增插画、修改角色数据或写入新的记录。

横向拖动可完整旋转 360°，纵向拖动在 ±60° 内改变观察角度。松手用共享 animation.js 时钟在 420ms 内停到正面或背面。轻点翻面；Web 上空格或 Enter 也可翻面。卡片有透视、圆角厚边、柔和投影及随角度变化的轻微反光。触摸取消、离开今日页和切后台会释放手势。

今日页只返回 today-card 命中区，没有任务、手记、重抽控件，也没有内容滚动。后台抽卡、历史和原有任务接口保留；回归测试仍检查原任务接口的勾选和还原。旋转、翻面和刷新不更改抽卡数据、任务或手记。

## 实现范围

- game/js/today-card.js：卡面缓存、正背面排版、透视投影及手势状态。
- game/js/render.js：今日页改为双面卡牌。
- game/js/app.js：触摸路由和统一帧循环；开包材质模块未修改。
- web/main.js、web/index.html：更新预览说明，增加键盘翻面和描述标签。
- tools/game-check.mjs、tools/web-check.cjs：验证新的今日页行为；保留服务端接口、开包、日历、图鉴和 PAG 回归。

没有新增依赖。双面最多缓存两张 420×630 位图（≤1.5 DPR），静止时单次绘制，旋转时使用 6×9 的 Canvas 2D 纹理网格。内部三角形覆盖处理消除细缝，卡片厚边使用投影后的圆角轮廓。

## 验证

| 命令 | 结果 |
| --- | --- |
| node tools/smoke.mjs | 27 项通过 |
| node --experimental-strip-types tools/day.test.ts | 9 项通过 |
| node tools/game-check.mjs | 156/156 通过 |
| npm run test:animation | 55/55 通过 |
| npm run test:pag | 13 个真实 SDK/WebGL 场景通过 |
| npm run test:web | 22 个真实浏览器场景通过 |

浏览器检查覆盖鼠标拖动、触摸旋转、松手停稳、点击和键盘翻面、取消手势、刷新后数据保留及正面默认显示、减少动态效果、导航和屏幕尺寸变化。20 个角色的完整描述与文字边界均通过。

浏览器和 PAG 测试使用现有可选 PAG_TEST_RENDERER=native（Windows ANGLE D3D11）。对最终卡面采样 40 次渲染，平均约 1ms，P95 约 2ms。这是本机 Chromium 的绘制调用耗时，不代表手机 FPS。尚未进行微信真机测试。

最新预览：http://127.0.0.1:4173/ 。已确认该服务返回的新 game.bundle.js 包含 today-card.js。

截图位于 tools/.web-preview/today-card/front.png、tilted.png、back.png；绘制采样位于同目录 browser-render.json。六组日志位于 tools/.web-preview/today-*.log。截图和日志均为忽略的本地验证产物。

## 设计指南

本轮读取了 modern-web-guidance 的 motion 和 performance，并按小游戏 Canvas 环境采用适用的建议：

- **motion**：我让卡牌默认静止，动画由用户操作触发，减少动态效果模式直接显示最终可读面（“Default to static views”；“Keep the final state”）。
- **performance**：我缓存正背面，把触摸处理限制为角度更新，复杂绘制交给原有按需帧循环（“DO separate UI updates from heavy computations”）。
