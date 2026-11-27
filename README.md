# 每日角色 · Roles(小游戏)

每天抽一张卡,决定今天要扮演谁,并完成这个角色带来的 3–4 条任务。

```
game/          微信小游戏(canvas 渲染,当前主工程)
web/           浏览器体验预览(同一套 Canvas / PAG,独立体验数据)
miniprogram/   早期的小程序版(已归档,当前账号用不了,见下文)
server/        Node.js + TypeScript API(无外部依赖,SQLite 存储)
shared/        角色数据源(前后端共用)
tools/         同步脚本与测试
```

---

## 一、为什么是小游戏

注册时 AppID `wx9fd6453e42bc9d4e` 的服务类目选的是「游戏」,微信平台把它登记成**小游戏**:

- `get_user_appids --type miniprogram` 列不出它,它只出现在 `--type minigame`
- 早期将小程序结构导入这个 AppID 时,开发者工具报 `miniprogram/game.json 未找到 (10005)`;小游戏需要自己的 `game.js` / `game.json` 入口。

当前 `project.config.json` 已按小游戏配置,开发者工具可以正常开窗、编译和截图。

既然账号是小游戏类型,**界面只能用 canvas 画**。`game/` 就是按这个重写的:
服务端、`shared/roles.json`、数据模型、接口、测试全部沿用,只有渲染层从小程序 WXML 换成了 canvas。

`miniprogram/` 保留着,作为小程序账号形态的参考实现;导入它到当前账号会重新触发上面那个报错。

---

## 二、本地跑起来

### 1. 启动后端

```bash
node tools/sync-roles.cjs        # 首次或改了 shared/roles.json 后执行
npm run dev                      # http://127.0.0.1:3000
```

启动后端无需 `npm install`:服务端只用 Node 内置模块(`node:http`、`node:sqlite`、`node:crypto`)。
需要 **Node 24**(用到 `node:sqlite` 与 `--experimental-strip-types`),当前验证版本 Node 24。

首次启动自动创建 `data/roles.db`。本地没有 `WX_APPSECRET` 时登录走 **mock 模式**。

### 2. 打开小游戏

1. 微信开发者工具 → 导入项目 → 选 `C:\Files\roles`(`project.config.json` 已配 `compileType: game`、`miniprogramRoot: game/`)
2. AppID:`wx9fd6453e42bc9d4e`
3. 「详情 → 本地设置」勾选 **不校验合法域名**(本地 http 接口必需)
4. 编译后即可在模拟器里点屏幕抽卡

---

### 3. 浏览器体验预览

```bash
npm run web:dev                   # http://127.0.0.1:4173
```

浏览器版无需后端或微信登录,可用鼠标和触摸体验完整开包流程。最新页面为整张 3D 今日卡牌、卡牌日历与油画图鉴，整合来源和验收见 [LATEST-PAGES.md](LATEST-PAGES.md)。角色、任务与手记只保存在当前浏览器。分享与静态托管说明见 [WEB.md](WEB.md)。

---

## 三、跑测试

```bash
node tools/smoke.mjs             # 后端接口全流程
node --experimental-strip-types tools/day.test.ts   # 日期与连续天数(9 项)
node tools/game-check.mjs        # 小游戏渲染 + 触摸 + 接口(需后端在跑)
npm ci                          # 安装 PAG 构建与浏览器测试所需的开发依赖
npm run test:animation          # 动画时钟 + PAG 生命周期(不需后端)
npm run test:pag                # 真实 PAG SDK + WebGL 绘制与回退(不需后端)
npm run test:web                # 浏览器真实鼠标/触摸与完整体验流程
```

`game-check.mjs` 用假的 canvas 2D context 加载真实的 `game/js/*`,断言:
首屏能画、抽卡拿到角色、任务卡能勾选/还原、tab 能切换、日历格数与当月一致、翻月能请求、图鉴 20 张、详情能开关。`test:pag` 还会解码实际 `.pag` 文件,校验可编辑卡面图层,验证两种角色卡面、点击继续、自动结束、后台恢复和加载失败回退。截图输出到 `tools/.pag-preview/`。

PAG 模板生成、AE 文件替换和微信模拟器验证见 [PAG.md](PAG.md)。运行小游戏使用已随工程保存的 SDK 与动画资源,无需在开发者工具中构建 npm。

---

## 四、game/ 结构

```
game/
├── game.js          入口:require('./js/app.js').start()
├── game.json        小游戏配置(竖屏、超时)
├── package.json     {"type":"commonjs"}(小游戏没有 package.json 语义,只给 Node 测试用)
├── data/roles.js    由 tools/sync-roles.cjs 生成
├── data/reveal-pag.js  已随工程保存的揭晓 PAG 数据,由 pag:build / pag:pack 生成
├── data/tear-pag.js    已随工程保存的撕包 PAG 数据,由 pag:tear:build / pag:tear:pack 生成
├── assets/          pack-*.jpg、bg-*.jpg 与 pag/reveal.pag 模板
├── vendor/pag/      固定版本 PAG SDK、压缩 WASM、许可证与校验清单
└── js/
    ├── env.js       运行时适配:真实 wx / Node mock、屏幕尺寸、RAF/定时器回退
    ├── animation.js 统一时钟、缓动注册与采样、按需帧循环
    ├── effects.js   有数量上限的星尘、扫光、光晕
    ├── cardface.js  共用卡面绘制,也用于 PAG 可编辑图像替换
    ├── pag-runtime.js  SDK 初始化、卡面位图、WebGL 与资源释放
    ├── pag-reveal.js   揭晓准备、逐帧采样、生命周期和失败回退
    ├── pag-template.js  生成的模板契约
    ├── pack.js      开包时长、环形几何与命中
    ├── packview.js  开包、翻面、飞行、揭晓绘制
    ├── draw.js      canvas 封装:缩放、圆角、渐变、文字折行
    ├── theme.js     配色
    ├── layout.js    纯布局计算(375 宽设计稿),可在 Node 里断言
    ├── api.js       wx.request + JWT + 401 重登
    ├── store.js     状态与动作(抽卡、勾选、手记、日历、图鉴)
    ├── render.js    绘制(今日 / 日历 / 图鉴 / 详情 / 提示条)
    ├── assets.js    卡的图片资源:懒加载,没到就退回渐变
    └── app.js       启动、触摸、命中派发、键盘输入
```

坐标一律按 375 宽设计,绘制时按 `屏幕宽 / 375` 整体缩放;`devicePixelRatio` 用于 canvas 像素尺寸。

动画由 app 中唯一的帧循环驱动：状态变化请求一帧，翻面、飞行、背景淡入和提示条还在动时继续排 RAF；静止后停止，切后台时取消，恢复时按经过的时间推进到正确阶段。撕包口和转盘仍严格跟手。第三张翻完后保持正面飞到候选位；落定接口成功后先保存结果，再播放 1 秒 PAG 揭晓；聚焦 380 ms 后可点击继续，自然结束时自动进入任务页。SDK 或模板准备失败时使用 Canvas 揭晓。

新增动画时，在动作开始记录 `animation.now()`，绘制时按时间采样，不再另开推帧定时器：

```js
var animation = require("./animation.js");
var at = animation.now(); // 在动作开始时记录一次
// 每次绘制时采样，始终使用同一个起始时间。
var x = animation.tween(40, 180, at, 620, "outCubic");
```

PAG 由同一帧循环按时间调用 `setProgress()` / `flush()`,不另开播放器时钟;同一时刻只允许一次 flush。候选角色确定时提前替换卡面位图,一轮揭晓开始后固定使用 PAG 或 Canvas,避免迟到的加载结果造成画面跳变。

内置缓动包括 `linear`、`outCubic`、`inOutCubic`、`outBack`，也可用 `animation.register(name, fn)` 注册。位置可以使用 `outBack` 的轻微回弹；宽高、透明度使用不越界的缓动。光效每次最多绘制 24 个粒子，按固定种子和进度计算，不维护逐帧累加的粒子状态。

---

## 五、配置

复制 `.env.example` 为 `.env` 并填写:

| 变量 | 说明 |
| --- | --- |
| `WX_APPID` | 已填好 |
| `WX_APPSECRET` | 后台「开发设置」获取,**只在服务器填** |
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `DAY_ROLLOVER_HOUR` | 日界切换时点,默认 `6`(0–6 点算前一天) |
| `STATIC_BASE_URL` | 角色插画对外地址前缀 |
| `WX_SUBSCRIBE_TEMPLATE_ID` | 订阅消息模板 ID |

`.env` 已被 `.gitignore` 排除,**不要提交、不要发到聊天里**。

---

## 六、接口

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/health` | — | 健康检查 |
| POST | `/api/auth/login` | — | `{code}` → `{token}` |
| GET | `/api/roles` | — | 角色卡面列表 |
| GET | `/api/draw/today` | ✓ | 今天是否已抽(**只读,不创建**);带 `canRedraw` / `round` |
| POST | `/api/draw` | ✓ | 抽卡(幂等,当天重复调用返回同一张) |
| POST | `/api/draw/redraw` | ✓ | **测试专用**:作废今天已落定的卡,重新发一包 |
| GET | `/api/draw/:date` | ✓ | 按日期回看 |
| PATCH | `/api/checkin` | ✓ | `{date, taskId, done, note}` |
| GET | `/api/calendar?from&to` | ✓ | 日历区间 + 连续天数 |
| GET | `/api/stats` | ✓ | 累计统计 + 图鉴收藏 |

鉴权:`Authorization: Bearer <token>`,401 时客户端自动重登一次。

**「重新抽卡」是测试专用口子**:已落定的今日卡面底部会出现一颗「重新抽一次」按钮,
点了就作废今天的记录(连带勾选任务和手记)、重发一包十张。
- 只有 `NODE_ENV` 不是 `production` 时才开放,线上会拒绝;
- 关掉:`.env` 里 `ALLOW_REDRAW=0`(改完重启);
- 重抽过几次记在 `draw_rounds` 表里,`round` 参与候选的随机种子 —— 所以每次重抽都是新的一包;
- **会改统计**:今天这条记录会消失,图鉴里该角色的次数减 1,连续天数按剩余记录重算。

---

## 七、数据模型

```
users        (id, openid UNIQUE, created_at)
draws        (id, user_id, local_date, role_id, seed, task_ids, created_at)   -- UNIQUE(user_id, local_date)
draw_rounds  (user_id, local_date, round)                                     -- 今天重抽过几次
checkins     (id, draw_id, task_id, done, note, updated_at)                  -- UNIQUE(draw_id, task_id)
```

`UNIQUE(user_id, local_date)` 是「一天只能抽一次」的最终保障:并发连点也只会有一张卡。

---

## 八、改角色内容

只改 `shared/roles.json`,然后:

```bash
node tools/sync-roles.cjs    # 同步到 game/data/roles.js
```

脚本会校验角色 id、任务 id 唯一性与文案非空,重复会直接报错。

---

## 九、上线前必做

1. `.env` 填真实 `WX_APPSECRET` 与 `JWT_SECRET`,`NODE_ENV=production`
2. `game/js/api.js` 里 `BASE_URL` 改成你的 **已备案 https 域名**(小游戏要求 https,TLS ≥ 1.2,不能用 IP:端口)
3. 小游戏后台「开发管理 → 服务器域名」配 `request` 合法域名
4. 开发者工具**取消勾选**「不校验合法域名」,真机验证
5. **小游戏账号要发布,需要「游戏」相关资质**(个人主体通常拿不到版号)。这一步在正式上线前绕不过去,建议先确认账号类型和资质路径
6. 隐私指引、分享/海报能力按小游戏规范确认

## 可选图片素材工具

可在开发电脑使用配置的 TeleAPI 服务生成背景候选图：`npm run imagegen -- --help`。配置、三套提示词与用法见 [图片生成工具](tools/imagegen/README.md)。Key 保存在本机忽略文件中，现有小游戏与 Web 资源保持原样。

撕开完成段的资源契约与替换说明见 [tools/pag/tear-README.md](tools/pag/tear-README.md)。Web 构建自动打包现有 tear.pag；用 `npm run pag:tear:pack` 可单独打包 AE 导出文件，用 `npm run pag:tear:build` 可重新生成内置撕开动画。
