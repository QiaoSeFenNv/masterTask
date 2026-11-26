本轮重新设计卡包的比例、材质和文字排布，保留深海海浪、暮色月亮、晨曦日出三幅原插画。完成时间：2026/11/26 13:01:16（Asia/Shanghai）。

工作目录为 C:\Files\masterTask-animation，分支 animation-polish，基准 HEAD e4feefe。本轮改动未提交、未推送，之前的动画、PAG、音效和预览工作均保留。

选包页使用与撕包页一致的 150:210 比例，取消横向挤压；姓名和说明移到包装下方，图形与说明都能点击选包，选中后仍使用原来的 480ms 入场过渡。说明使用现有 theme.bodyBright，适配晨雾、晴空、夜间主题；晨雾截图抽样背景 #c8c0c3 与 #413a56 的对比约 6.00:1。

包面改成连续印刷的柔光膜，不再把插画塞进反光边框。封口缩细，使用同色压纹、少量边角折痕、轻微侧面和柔和地面阴影。品牌位于 y=39，完整字形在原有 y=24 撕口下方，避免完成段把字的上缘截断。三幅 JPG 文件和 reveal.pag 与 HEAD 的 SHA256 一致。

包装和地面阴影在离屏 Canvas 预绘后缓存；拖动时移动缓存位图。三张透明材质 PNG 合计 98,754 字节（96.4 KiB），旧材质合计 357,034 字节（348.7 KiB），减少约 72.3%。材质只包含封口和折边的光影，中心印刷区透明，不生成或替换角色插画。

PAG 撕开贴图通过 npm run pag:tear:build 重新生成，未运行 pag:build，未修改揭晓模板。撕通后的逐张滑出仍为 2200ms，撕通距离 150、纸条 480ms、翻面 420ms、飞行 620ms、揭晓 1000ms、聚焦 380ms 和 RING 几何均保持原值。PAG 与 Canvas 共用包装画法，SDK 失败时仍可走回退流程。

本轮文件：

- .agents/skills/modern-web-guidance/、skills-lock.json：安装用户指定的 skill。
- game/js/packet-surface.js：统一包装印刷、封口、立体边缘和缓存。
- game/js/packview.js：正常比例、包外说明、主题色和整组选包命中区。
- game/js/assets.js：更新材质说明，资源加载逻辑保留。
- tools/build-packet-foil.cjs、game/assets/packet-foil-*.png：生成轻量、透明的膜材质光影。
- game/assets/pag/tear.pag、game/data/tear-pag.js：脚本生成的完成段资源；数据模块仍在忽略范围内。
- tools/web-check.cjs、tools/pag-render-check.cjs：增加可选 PAG_TEST_RENDERER=native 模式，所有断言保留，默认仍是原来的 SwiftShader 参数。

最终版本使用 Windows GPU（ANGLE D3D11）完成以下六组验证。默认软件渲染模式也在本轮前面的构建通过；未把软件渲染或桌面 GPU 的结果当作手机性能数据。

| 验证命令 | 结果 |
| --- | --- |
| node tools/smoke.mjs | 27 项通过 |
| node --experimental-strip-types tools/day.test.ts | 9 项通过 |
| node tools/game-check.mjs | 148/148 通过 |
| npm run test:animation | 55/55 通过 |
| npm run test:pag | 13 组真实 SDK/WebGL 场景通过 |
| npm run test:web | 20 组真实浏览器流程通过 |

本机 GPU 测试选项（不改变默认方式）：

~~~powershell
$env:PAG_TEST_RENDERER = 'native'
npm run test:pag
npm run test:web
~~~

浏览器手动检查确认：包外起手推进至 p=0.5 时 tilt=4；松手回正；撕通进入 PAG，finishMs=2200；完成后进入 ring 并释放 PAG（ready=false，无错误）。对比图、半撕、滑出和分享页截图位于 tools/.web-preview/modern-pack/。最新自动验证日志位于该目录的 final-validation/。无连接的微信真机，本轮未测机型、真实 FPS、内存或发热。

最新分享地址：https://textiles-exploring-signing-additionally.trycloudflare.com/?build=packet-20261126-final2

真实浏览器已验证页面、game.bundle.js 和三张材质 PNG 均为 HTTP 200，内容 SHA256 与本地 web/dist 一致；点暮色包下方文字可进入撕包，未发现页面脚本错误。证据是 tools/.web-preview/modern-pack/share-check.json。后台和预览服务继续运行。

已安装并使用 modern-web-guidance，读取 color、motion、performance；本轮具体应用 color 和 performance，Canvas/PAG 继续采用现有统一时钟。

- color：我使用现有主题文字令牌，并核对文字与浅色背景的对比，按“existing, predefined, design token”保持三时段一致。
- performance：我把材质生成放在构建时、包装和阴影放在离屏缓存中，按“DO separate UI updates from heavy computations”避免触摸时重新处理像素。

服务端、shared/roles.json、BASE_URL、角色插画、游戏数值、揭晓 SDK/模板、miniprogram-mp/ 均不在本轮改动中；密钥、数据库和生成角色数据未提交或输出。
