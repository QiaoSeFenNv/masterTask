# 验证结果

2026-11-27，本地 Node 24.15.0 + Chromium。

- `node --test tools/scratch.test.cjs`：19/19。连续轨迹、重复刮动、面积阈值、JSON 存储恢复、种子隔离、取消、滚轮、防误触、迟到图片、DPR 与离屏回退。
- `node tools/scratch-web-check.cjs --no-build`：4/4。实际鼠标局部像素变化和未刮区保持、刷新/切页/缩放、完整刮开后任务勾选与重抽、320 宽触摸取消/图片失败/无离屏/滚轮隔离。
- `node tools/game-check.mjs`：112/112，真实后端 + Canvas/触摸模拟。使用已有 3000 端口开发服务，健康检查确认后运行。
- `npm run test:web`：17/17。桌面、移动、小屏和 PAG 不支持回退的完整选卡→揭晓→今日刮卡；任务、手记、刷新、日历、图鉴和重启。
- `npm run test:pag`：6/6。真实 PAG 解码、角色位图替换、跳过/自动结束、后台恢复及缺资源回退。
- `npm run test:animation`：31/31。
- `node --test tools/collection.test.cjs`：10/10，图鉴回归。
- 已修改生产脚本的 `node --check` 与 `git diff --check` 通过。

既有测试断言未改；小游戏/Web 既有流程加入真实刮卡手势，动画测试补充新依赖注入。

浏览器截图：`tools/.web-preview/scratch-covered.png`、`scratch-partial.png`、`scratch-revealed.png`、`scratch-fallback-partial.png`、`scratch-mobile-revealed.png`。对照修改前 `scratch-before.png`：原来任务直接显示；现在背景覆盖、仅刮过的区域可见，完成后正常操作。

限制：未做微信开发者工具图形界面/微信真机验收；刮开进度仅保存在本机，不跨设备同步。
