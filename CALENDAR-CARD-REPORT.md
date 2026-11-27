# 卡牌日历

分支：pack-design-refinement，基于 64f6be3。包括此前今日双面卡牌的本地改动；本次改动未提交、未推送。

日历改为按日期排列的小卡片：已有角色的日期展示原卡面配色、图标和角色名，日期放在角落；没有抽卡的日期只显示日期，没有补签或未完成提示。今天使用细描边。页面保留月份切换与周标，移除连续天数和任务统计。

点击一张历史小卡会用统一时钟从原格子放大到中心（240ms）。大卡和今日卡使用同一渲染组件：可左右旋转 360°、上下倾斜，轻点或键盘翻面，背面显示角色完整描述。标题只有日期、星期和关闭按钮。关闭在 200ms 内缩回原格子，过渡期间也可以关闭；切页会释放历史卡。Web 上 Escape 关闭，空格/Enter 翻面；减少动态效果模式直接到达最终状态。

历史角色通过日历已有 roleId 读取生成角色模块，未增加接口或写入历史数据。服务端抽卡、任务接口、角色数据、插画、BASE_URL、PAG 资源与开包几何未修改。

## 文件

- game/js/render.js：卡牌月视图、日期标记、网格裁剪与空态。
- game/js/layout.js：日历小卡采用 2:3 比例，六行月份在小屏上可滚动。
- game/js/calendar-card.js：独立的历史卡控制器、放大/缩回、角色查询和生命周期。
- game/js/today-card.js：提供独立 viewer 工厂，今日卡与历史卡各自维护旋转和纹理；改善中文标点换行。
- game/js/app.js：历史卡触摸和帧循环，移除日历标题里的连续天数；日期源矩形跟随已有页面入场变换。
- web/main.js：历史卡的键盘翻面和关闭。
- tools/game-check.mjs、tools/web-check.cjs：新交互及历史数据保护回归。

## 最终验证

| 命令 | 结果 |
| --- | --- |
| node tools/smoke.mjs | 27 项通过 |
| node --experimental-strip-types tools/day.test.ts | 9 项通过 |
| node tools/game-check.mjs | 168/168 通过 |
| npm run test:animation | 55/55 通过 |
| npm run test:web | 25 个真实浏览器场景通过 |
| npm run test:pag | 13 个真实 SDK/WebGL 场景通过 |

测试覆盖历史角色匹配、背面完整描述、鼠标和触摸旋转、放大期间关闭、Escape 关闭、跨年翻月、关闭回原格子、六行月份滚动与裁剪、减少动态效果、今日和历史卡状态隔离、切页释放，以及回看不修改抽卡和历史记录。原开包与今日页回归仍通过。浏览器测试中的短屏月份用例使用内存日期样本，没有写入本地存储或 API。

PAG 与浏览器测试使用现有可选 PAG_TEST_RENDERER=native（Windows ANGLE D3D11）。尚未进行微信真机手感或设备帧率测试。

## 预览与证据

本地预览：http://127.0.0.1:4173/。

- tools/.web-preview/calendar-card-month.png：真实浏览器流程的月份，只有本轮抽到的日期。
- tools/.web-preview/calendar-card-front.png、calendar-card-back.png：日期卡的正背面。
- tools/.web-preview/calendar-small-phone.png：短屏触摸查看背面。
- tools/.web-preview/calendar/sample-month.png：多张小卡的视觉样例，仅内存示例日期，不代表真实历史记录。
- tools/.web-preview/calendar-*.log：六组最终验证日志。

截图与日志为 Git 忽略的验证产物。

### Modern Web Guidance

- **motion**：我让回看默认静止，由用户触发放大、旋转和关闭；减少动态效果模式保持最终可读状态（“Default to static views”；“Keep the final state”）。
- **performance**：我复用缓存卡面并创建独立查看器，事件只更新手势参数，动画继续使用原有统一时钟；关闭释放历史纹理，避免两个页面互相覆盖（“DO separate UI updates from heavy computations”）。
