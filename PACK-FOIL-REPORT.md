铝箔卡包材质修改记录（2026-11-26）

针对用户提供的金属卡包参考图，只调整包装材质。工作目录 C:/Files/masterTask-animation，分支 animation-polish，HEAD e4feefe；修改留在本地。

设计场景是开包操作。材质采用金属铝箔软袋，封口与边角呈现真实褶皱、亮暗折面和压封纹理，中心保留原系列印刷图案。深海、暮色、晨曦的色相沿用 game/js/pack.js 的 SERIES 令牌；暮色的品牌色属于既有令牌约束，因此沿用其色相。字体、字号、布局与触摸位置保持现有设计，选择页的名称和简介下增加渐变衬色，避免封边反光降低可读性。

材质来自参考图中未印人物与文字的四个边缘区域，提取脚本为 tools/build-packet-foil.cjs。裁切坐标使用给定的 516×697 图片：上边 [86,61,340,65]，下边 [85,588,341,60]，左边 [85,103,29,490]，右边 [414,103,12,490]。未将参考图的人物或标题作为游戏印刷图案；图案窗口在材质 PNG 中为透明。脚本验证中心窗口 alpha 全为 0，三款均通过。原 pack-deep.jpg / pack-dusk.jpg / pack-dawn.jpg 没有改写。

输出为三张 300×420 的透明包装材质：packet-foil-deep.png（121,219 字节）、packet-foil-dusk.png（119,047 字节）、packet-foil-dawn.png（116,768 字节）。每款只加载一次。packet-surface.js 在包面缓存中叠上对应 PNG，材质晚加载时更新缓存；主循环仍只绘制已完成的包面位图。未加载或解码失败时沿用原 Canvas 材质回退，Node 没有 wx.createImage 时继续正常运行。

撕开纹理生成与 PAG 运行时均使用同一个 packet-surface.js 绘制函数和对应材质，确保纸条、包身、Canvas 回退一致。原揭晓 PAG、SDK、模板契约和统一时钟未更改。撕开 PAG 通过 node tools/build-pag-tear.cjs 重新生成（150,287 字节，375×500 / 60fps / 2200ms / 28 图层），Base64 数据仍由打包脚本生成。没有执行 pag:build，没有手改 game/data/。

预览检查中确认两处资源问题：web 构建只复制六张 JPG，静态服务只允许已有文件类型。构建改为按 assets.js 的图片清单复制；静态服务新增 PNG MIME 类型，并略过对 PNG 的重复压缩。当前本地 4173 服务已重启。test:web 现在要求三款材质都成功解码，避免静默回退把缺失资产隐藏起来；真实 PAG 检查也等待对应材质加载后再创建完成段。

实际浏览器检查：选系列 → 放大就位 → 撕开，三款原图案正确、材质已加载、PAG 预备完成；横划半程得到 p=0.5 / 倾斜 4°，撕通后使用 PAG 完成段，2200ms 后进入原卡圈，未记录浏览器错误。截图见 [三款选包](tools/.web-preview/foil-material/series-selection.png)、[深海封口卡包](tools/.web-preview/foil-material/deep-closed.png)、[暮色](tools/.web-preview/foil-material/dusk-closed.png)、[晨曦](tools/.web-preview/foil-material/dawn-closed.png)、[半程撕开](tools/.web-preview/foil-material/deep-half-tear.png)。手动检查记录见 [manual-verification.json](tools/.web-preview/foil-material/manual-verification.json)。

最终验证于 2026-11-26 10:14（Asia/Shanghai）完成，六个命令全部 exit 0：

| 命令 | 结果 |
| --- | --- |
| node tools/smoke.mjs | 27 项通过 |
| node --experimental-strip-types tools/day.test.ts | 9 项通过 |
| node tools/game-check.mjs | 148 / 148 通过 |
| npm run test:animation | 55 / 55 通过 |
| npm run test:pag | 13 个真实 SDK / WebGL 场景通过 |
| npm run test:web | 20 个浏览器场景通过 |

真实 PAG 验证包括三款系列替换、透明度、完整撕开时间轴、点击继续 / 自动结束、后台恢复和失败回退；浏览器验证覆盖鼠标 / 触摸、任意方向撕开、倾斜回正、卡片滑出、环形选择与落定，并要求新材质图片成功解码。日志与 JSON 已归档在 [final-validation](tools/.web-preview/foil-material/final-validation/)。

公开预览：[每日角色 · 铝箔卡包预览](https://textiles-exploring-signing-additionally.trycloudflare.com/)。旧 screenshot-fruits-tape-recommendation 分享隧道返回“Unauthorized: Tunnel not found”，已建立新的临时分享隧道，游戏 BASE_URL 与域名配置没有修改。

2026-11-26 10:26（Asia/Shanghai）使用真实 Chromium 打开新分享页并取回实际 game.bundle.js 与三张材质 PNG。页面、清单、bundle 和材质图片均 HTTP 200；材质 MIME 为 image/png 并成功解码。实际 bundle SHA256 与本地一致：e164a916d1d51f4bdcb6de1207459a36d9a9acc70ff34905650299a259b515b3；三张材质的 SHA256 也与本地源文件一致。证据见 [share-check.json](tools/.web-preview/foil-material/share-check.json)，效果见 [三款铝箔卡包](tools/.web-preview/foil-material/foil-packets.png)。链接依赖本机静态服务与临时隧道持续运行，体验数据仍存于浏览器本地。

修改未暂存、未新建提交、未 push，仍留在 animation-polish 的本地工作目录。

核心改动：game/js/packet-surface.js、assets.js、tear-textures.js、pag-tear-runtime.js、packview.js；三张 game/assets/packet-foil-*.png；tools/build-packet-foil.cjs、build-pag-tear.cjs、build-web.cjs、serve-web.cjs、web-check.cjs、pag-render-check.cjs；脚本生成的 tear.pag。

TEAR_SWIPE、TEAR_FINISH_MS、翻面 / 飞候选 / 选包 / 揭晓时长、RING 参数、统一时钟与逐张出卡的 2200ms 节奏保持原值。服务端、抽卡种子、落定校验、数值、角色插画、BASE_URL、原揭晓 PAG、vendor SDK、归档小程序均没有修改。本轮未做微信真机帧率、内存、发热测试，不把浏览器预览作为真机数据。
