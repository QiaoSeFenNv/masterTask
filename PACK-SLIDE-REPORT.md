柔和卡包与缓慢滑出修改记录（2026-11-26）

本轮针对“卡包难看、出卡不流畅”的反馈重做了包装材质与出卡节奏。工作目录 C:/Files/masterTask-animation，分支 animation-polish，HEAD e4feefe，修改留在本地。

设计方向：精致的软铝箔包装，保留原系列插画与颜色，利用宽而淡的受光、窄侧边和低对比封口表示厚度。清除手绘的硬皱褶、亮白包边和密集封口齿纹。包面从原图片中裁切印刷主体，封边遮住原图破损的卡边；原始图片文件没有变。布局仍采用 375 设计宽度和原 contentTop / tearRect / ring 参数。字体继续使用既有 Songti SC / STSong / Noto Serif CJK SC 与 PingFang SC 字体链；配色继续遵守 game/js/pack.js 的深海、暮色、晨曦系列令牌，未因通用设计技能的默认字体与颜色偏好重做全站。

出卡时间线从原 600ms 完成段改为纯表现的 2200ms：第一张在 120ms 起动，每隔 90ms 开始下一张，每张用 600ms 竖直滑出；包装缓慢下沉，卡片先叠在一起，最后 660ms 用连续的曲线展开成原卡圈。卡片始终正立，去掉向上抛出、旋转和快速扩大造成的“炸开”感。起手位置与方向仍自由，TEAR_SWIPE=150、回正 260ms、原纸条飘走 480ms、FLIP/TOP/OPEN/REVEAL 的参数没有修改。新 2200ms 来自本轮“慢慢滑出”的要求，只延长出卡表现。

PAG 与 Canvas 用同一套提取、卡摞和展开坐标，两种模式都在 2200ms 进入卡圈；PAG 中途失败时保留已有进度和截止时刻。模板仍为 375×500、60fps、透明背景、8 个可编辑图片索引、28 个图层。原 reveal.pag 与揭晓契约、SDK 均未更改。

另修复了已复现的撕开纹理透明度问题：libpag-miniprogram@4.3.51 的 OffscreenCanvas 上传路径直接使用 ImageData 的直通 RGBA 字节，却按预乘透明度处理，造成包边与叠卡白框。撕开运行时改用 SDK 的 PAGImage.fromPixels，显式声明 RGBA_8888 / Unpremultiplied；不修改 SDK 文件。像素扫描确认所有输出的 RGB 都不超过 alpha（容差 2），仍保留半透明边缘。类型信息在 SDK 已加载后才读取，Node 环境继续无需 WXWebAssembly。tear.pag 与生成的 Base64 模块通过 pag:tear:build 更新，未手改 game/data/。

流畅度改动：选包移动时即准备撕开 PAG；首帧里不可见的卷边、纤维、光晕和卡背提前采样解码，预热后恢复到首帧；撕开缓冲上限从 2x 降到 1.5x（同等设备像素数约减少 44%），每次 flush 后存一张完成的 2D 快照，主画布复用快照；包面也按系列和图片缓存，每帧不再重画 16 条图片切片与大量皱褶路径。出卡阶段移除覆盖包装的“撕开了”字样，保留网页下方的体验提示。

实际显卡对照：Chromium，Intel UHD Graphics 620 / D3D11，真实 RAF 和实际鼠标向上撕开。对照保持相同的新版 2200ms 动画，只替换上一轮运行时与本轮运行时。旧运行时 282 个正式阶段帧，中位帧间隔 7.0ms、P95 7.4ms；本轮 311 帧，中位 6.9ms、P95 7.4ms，两组正式阶段均没有 >50ms 的 long task。这是当前电脑的浏览器数据，不能解释成微信真机帧率。软件 SwiftShader 下的暂停时钟测试主要用于兼容性与图像校验；其耗时包含虚拟时钟和软件渲染影响，不作为设备 FPS 结论。

真实时钟分解采样还确认：未预热时头三次新图层 flush 分别约 868/655/576ms；预热后 20 次手动采样中，flush 为 0.9–5.1ms。这些是同一软件渲染环境下请求帧的调用耗时，不是完整实时浏览器 FPS。

最终验证于 2026-11-26 02:15（Asia/Shanghai）完成，以下六个命令全部 exit 0：

| 命令 | 结果 |
| --- | --- |
| node tools/smoke.mjs | 27 项通过 |
| node --experimental-strip-types tools/day.test.ts | 9 项通过 |
| node tools/game-check.mjs | 148 / 148 通过 |
| npm run test:animation | 55 / 55 通过 |
| npm run test:pag | 13 个真实 SDK / WebGL 场景通过 |
| npm run test:web | 20 个浏览器场景通过 |

回归包括撕开任意方向、逐张滑出与原卡圈对齐、PAG / Canvas 同进度回退、异步 flush 时复用完整快照、揭晓点击与自动结束、全流程接口和渲染。真实 PAG 透明度回归的 RGB 超过 alpha 像素数为 0，半透明像素为 44,067。日志与最终状态已归档在 [final-validation](tools/.web-preview/smooth-pack/final-validation/)。

透明度修复后的最终显卡复测采用真实 RAF 与鼠标输入：Intel UHD Graphics 620 / D3D11 的 Chromium 在完成段记录 309 帧，帧间隔中位数 6.9ms、P95 7.6ms，播放期间没有超过 50ms 的 long task。数据见 [hardware-final.json](tools/.web-preview/smooth-pack/hardware-final.json)。这是桌面无头浏览器样本，不作为微信或低端手机 FPS、内存、发热结论；前面的对照数字来自透明度修复之前的受控对照，仅用于说明预热与绘制优化。

公开预览：[每日角色 · 体验预览](https://screenshot-fruits-tape-recommendation.trycloudflare.com/)。2026-11-26 02:34 已使用真实 Chromium 取回页面、构建清单与实际 game.bundle.js，三项均 HTTP 200；实际 bundle 与本地 SHA256 一致：2c69e13488b3864795a34399fbe67d48677bd05d08b0888d75679975ac01c59f。证据见 [share-check.json](tools/.web-preview/smooth-pack/share-check.json)。预览依赖本机 API、web:dev 和分享隧道持续运行；体验数据存在浏览器本地。

最终效果：[完整慢速出卡动画（APNG，68 帧）](tools/.web-preview/smooth-pack/slow-card-slide.png)、[封口卡包](tools/.web-preview/smooth-pack/quiet-foil-closed.png)、[透明度修复后的滑出画面](tools/.web-preview/smooth-pack/correct-alpha-frame.png)。旧 slide-520 / slide-1400 截图属于透明度修复之前，不作为本轮最终效果。

修改仍在 animation-polish 的本地工作目录，HEAD e4feefe，未暂存、未新建提交、未 push。

核心修改：game/js/packet-surface.js、tear-flight.js、packview.js、app.js、store.js、pag-tear-runtime.js、pag-tear.js、tear-textures.js；tools/build-pag-tear.cjs、pack-pag-tear.cjs、pag/tear-template.json、pag/tear-README.md。回归在 tools/game-check.mjs、pag-tear.test.cjs、pag-render-check.cjs、web-check.cjs 更新，覆盖新的时长、每帧位移连续、卡片在包口的遮挡、快照合成和同进度回退。生成文件保持由脚本管理。

服务端、抽卡种子、落定校验、稀有度、角色插画、BASE_URL、原 RING 几何和归档小程序未修改。真实手机性能仍需设备实测；密钥、数据库和生成的数据模块均继续保留在本地与 gitignored。
