# 最新页面主线与整合验收

2026-11-27，Node 24.15.0 / Windows Chromium。

## 整合来源与最终页面

- 原 master 的油画图鉴与角色美术：31d134c。
- 原 animation-polish 的动画、音效与轻震动：e4feefe；此前不完整合并版 5a7db65 保留为备份。
- 另一工作目录的新版烫金卡包和 PAG 撕包：64f6be3。
- pack-design-refinement 尚未提交的今日 3D 卡牌、卡牌日历及键盘/触摸交互：先在独立工作树保存为 b2ad30a，再合入主线。来源目录的 11 个文件逐一校验 SHA-256，原目录未被修改。
- 已检查远端所有分支；origin/master 与 origin/animation-polish 都是上述历史的祖先，没有其他遗漏的远端功能分支。

**当前页面以本报告为准，不再是旧的“横幅＋独立任务/手记/刮卡列表”。**

1. 今日：一张居中的竖版双面卡，横向旋转、纵向倾斜、轻点/空格/Enter 翻面；背面完整角色描述。保留卡片厚度、透视、柔和投影和反光，使用一个动画时钟。
2. 日历：日期小卡，点击放大为同一套 3D 双面查看器；支持翻面、旋转、Escape 关闭、关闭缩回和小屏六行滚动。历史与今日的姿态、缓存彼此独立。
3. 开包：新版立体烫金袋、任意位置/方向撕开、2200ms PAG 出牌及同时间轴 Canvas 回退，保持转盘、候选落定和原动画反馈。
4. 图鉴：保留油画 2:3 卡面、锁定状态、角色详情、懒加载和渐变兜底，没有回退成旧的纯 emoji 图鉴。

旧 scratch 模块与本机进度数据保留用于历史兼容，但不接管新的今日页面、不阻挡已有任务/手记 API。旧刮卡 UI 验收已被最新 3D 页面验收替代；specs/scratch-card/ 下的旧验证结果是历史记录，不代表现在的页面布局。

## 合并后的修正

- 渲染器保留最新今日/日历，单独整合油画图鉴，避免旧今日布局覆盖 3D 卡牌；候选提示同步改为“今日页翻面查看描述”，不再指向不存在的刮卡操作。
- 烫金 PNG 同样按需加载，不额外占用首帧请求；现有图鉴懒加载测试的断言未放宽。
- 出牌测试输入按实际 2200ms 完成段采样；PAG 隔离测试禁用了 RAF，图片就绪轮询改用独立测试轮询。两者均未放宽原断言。
- 卡牌身份包含服务端抽卡 seed，同日重抽到同一角色也重置到正面。
- 构建清单明确记录三种页面模式，在线验收同时校验清单、真实 bundle SHA-256 和实际交互，不能只凭 URL 存在就称已发布最新页面。

## 实际测试结果

| 命令 | 结果 |
| --- | --- |
| node tools/smoke.mjs | 27 项通过 |
| node --experimental-strip-types tools/day.test.ts | 9/9 |
| node tools/game-check.mjs | 177/177 |
| npm run test:pages | 16/16（最新页面整合 6 项＋原油画图鉴 10 项） |
| npm run test:animation | 55/55 |
| PAG_TEST_RENDERER=native npm run test:pag | 13/13，真实 SDK/WebGL |
| PAG_TEST_RENDERER=native npm run test:web | 25/25，真实鼠标/CDP 触摸、键盘、日历、PAG、后台恢复、减少动态效果 |
| node tools/collection-web-check.cjs --no-build | 4/4，油画图鉴与图片失败兜底 |
| npm run test:imagegen | 9/9，工具模拟接口测试，没有实际生图或收费请求 |
| 旧 scratch.test.cjs 的纯几何子集 | 6/6，保留历史模型验证；不将旧刮卡 UI 视为新页面验收 |
| 语法检查及 git diff --check | 通过 |
| 公网清单/资源/实际页面交互 | 通过：整张 3D 卡、旋转、翻面、历史卡、油画图鉴；无页面错误 |

后端、shared/roles.json、归档 miniprogram-mp/ 没有修改。没有新增服务端依赖，没有提交密钥、数据库、截图或浏览器资料。此前 stash@{0} 原样保留。

## 在线体验与截图

https://gmc-attempting-traveling-brands.trycloudflare.com

这是临时 HTTPS 链接，依赖本机 4173 静态预览与 tunnel 持续运行。只服务 web/dist，不暴露后端、.env 或数据库；体验记录保存在各自浏览器。重新打开/刷新链接即可加载最新页面，点击“重新体验”可从开包再测。

截图在忽略目录 tools/.web-preview/：public-latest-today-front.png、public-latest-today-tilted.png、public-latest-today-back.png、public-latest-calendar.png、public-latest-history-back.png、public-latest-collection.png；另有 today-card-front/back、calendar-card-front/back 和出牌阶段截图。已实际查看整卡透视、背面排版与历史卡截图。

## 验证边界

Chromium 的 native 参数选择 Windows ANGLE D3D11，仅指桌面浏览器渲染后端，不是微信原生接口或微信真机。尚未做微信开发者工具图形界面/微信真机验收，也不把桌面耗时声称为手机 FPS。
