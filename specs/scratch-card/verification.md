# 合并验证结果（历史刮卡页面）

> 本报告记录旧布局。当前主线已改为整张 3D 今日卡牌与卡牌日历；最新页面、整合来源和验收见 [LATEST-PAGES.md](../../LATEST-PAGES.md)。

2026-11-27，本地 Node 24.15.0 + Chromium。
将 master 的 `31d134c` 合并到 `animation-polish`，保留另一分支 `e4feefe` 的入场、撕包、音效与轻震动。

## 实际执行结果

| 命令 | 结果 | 验证范围 |
| --- | --- | --- |
| `node tools/smoke.mjs` | 27 项通过 | 真实后端：登录、候选固定、GET 不写库、抽卡幂等、任务、手记、授权、日历、图鉴 |
| `node --experimental-strip-types tools/day.test.ts` | 9/9 | 日界与连续天数 |
| `node tools/game-check.mjs` | 128/128 | 真实后端 + Canvas/触摸模拟，完整抽卡、今日刮卡、任务、日历、图鉴、重抽及动画反馈 |
| `node --test tools/scratch.test.cjs tools/collection.test.cjs` | 33/33 | 刮卡 23 项、图鉴 10 项；含入场坐标逆变换、隐藏内容防泄露、遮罩透明度及任务标签避让 |
| `npm run test:animation` | 38/38 | 单一动画时钟、PAG 生命周期、音效手势门控、后台暂停、资源释放、WAV 格式 |
| `npm run test:pag` | 6/6 | 真实 PAG 解码、位图替换、跳过/自动结束、后台恢复与不支持/缺资源回退 |
| `npm run test:web` | 19/19 | 桌面、移动、小屏、PAG 回退的真实鼠标/CDP 触摸全流程；任务、手记、刷新、日历、图鉴、音效及重启 |
| `npm run web:build` | 通过 | 最终生产 Canvas/PAG、角色图片、音效的静态预览构建 |
| `node tools/scratch-web-check.cjs --no-build` | 5/5 | 局部像素变化、进度恢复/缩放、解锁/重抽、320 宽触摸取消/图片失败/无离屏/滚轮，以及真实字体标签避让 |
| `node tools/collection-web-check.cjs --no-build` | 4/4 | 锁定状态、油画卡面和详情、滚动与提示、320 宽图片失败兜底 |

完整 Web 流程先通过；截图检查发现既有任务标签遮字，修正文字宽度后重新构建，并再次通过 33 项单测、128 项小游戏流程、38 项动画测试、5 项刮卡浏览器验证和 4 项图鉴浏览器验证。
已检查 25 个变更的 JavaScript 文件语法，`git diff --check` 通过；既有测试断言未删除或放宽。布局坐标输入在入场稳定后执行，新增测试另外覆盖动画中的真实坐标逆变换。

## 合并时修复

- 今日内容区裁剪与入场动画的 Canvas save/restore 同时保留。
- 刮卡点按和移动都逆变换到卡背设计坐标，前一个点保存在局部坐标，避免动画中漂移。
- 220ms 淡入期间不绘制遮罩下的任务文字，遮罩继承页面透明度，防止提前泄露内容。
- 后台同时保存刮卡进度、取消手势，并暂停动画/PAG/音效。
- 保留正面仅名称/短句，完整介绍和任务在今日页面刮开后操作。
- 任务文案为右上角标签预留宽度，避免遮字。

## 截图与手工体验

截图位于 `tools/.web-preview/`（忽略目录，不提交生成物）：
`scratch-covered.png`、`scratch-partial.png`、`scratch-revealed.png`、`scratch-fallback-partial.png`、`scratch-mobile-revealed.png`、`collection-after.png`、`collection-detail.png`、`collection-fallback.png`，以及桌面/移动/小屏/回退的选卡和揭晓截图。已人工检查背景覆盖、局部刮开、完成状态、文字避让和图鉴卡面。

本地预览：`http://127.0.0.1:4173`。需要重启时运行 `npm run web:dev`。

手工流程：选择卡包 → 拖动撕开 → 转盘翻三张 → 选一张落定 → 今日卡背刮开 → 勾选任务/填写手记 → 查看日历/图鉴 → 刷新检查进度 → 点击“重新体验”从头再测。
预览采用浏览器本地数据，不连接正式后端、不改真实账号记录；后端已另用 smoke 和 game-check 验证。

## 限制

未做微信开发者工具图形界面或微信真机验收；Chromium 的 PAG、音效与触摸测试不能替代微信原生接口/真机性能验证。
刮开进度仅保存在本机，不跨设备同步；没有新增后端依赖、改动共享角色数据或触碰归档的小程序版。
