撕通后的完成段使用独立的 `tear.pag`：375×500、60fps、2200ms、透明背景。内置文件由现有包面图片和静态纹理图层生成，包含卷边纸条、12 组纤维、系列色辉光、包口与十张依次飘出的卡背。卡背每隔 90ms 开始一张，用 600ms 竖直滑出包口，先叠成卡摞，再用最后 660ms 平稳展开到现有卡圈的位置、大小与透视，包身随完成段淡出。Canvas 回退使用同一套轨迹。包身材质复用 packet-surface.js 的弯曲包面、鼓起的侧褶、上下压紧封边与暗色内衬，保持与撕开前一致。它是可复现的内置 PAG，不是 AE 工程。

运行时沿用揭晓已预热的 libpag-miniprogram@4.3.51 SDK，独立管理 PAGFile、图片和透明 WebGL 画布。开包时预热，选包移动阶段即开始准备，并预先采样隐藏的卷边、纤维和卡背图层，完成后恢复到首帧；撕通时锁定本次渲染器。准备尚未成功、模板不可用或 flush 失败时，继续原来的 相同 2200ms 的 Canvas 抽卡与展开，纸条仍在原 480ms 内飘走。完成段不请求抽卡接口。退出、播完或切换页面后串行释放资源；后台暂停绘制，恢复时按 animation.js 的统一时钟采样。撕开绘制缓冲保持最多 1.5 倍像素密度，并把每次已完成的 WebGL 帧缓存到 2D 画布；主画布使用该快照，避免读取正在更新的 WebGL 缓冲。

工具命令：

- `npm run pag:tear:build`：重新生成内置 tear.pag 并打包，仅适用于修改本仓库的内置动画。
- `npm run pag:tear:pack`：只把现有 tear.pag 打包为 game/data/tear-pag.js，同时从契约生成 game/js/pag-tear-template.js。
- `npm run test:animation`：时钟与揭晓、撕开控制器的异步生命周期验证。
- `npm run test:pag`：真实 SDK/WebGL 的透明度、时间轴、系列图片替换、释放、后台恢复和失败回退验证。
- `npm run web:dev`：构建并启动浏览器预览。

首次克隆后，启动微信小游戏前运行 `node tools/sync-roles.cjs` 生成角色模块。撕包的 `game/data/tear-pag.js` 与揭晓的数据模块一样随代码提交，小游戏无需依赖本机的忽略文件或先运行 Web 构建。替换 `tear.pag` 后必须执行 `npm run pag:tear:pack` 并一并提交源文件、模板及生成的数据模块。Web 构建与真实 PAG 验证仍会自动打包现有 tear.pag。不要手改 game/data/tear-pag.js；揭晓的 reveal.pag、SDK 和角色插画不参与该构建。

以后换入 AE 设计稿时，覆盖 game/assets/pag/tear.pag，遵守 tools/pag/tear-template.json，然后运行 pag:tear:pack 与上述测试。图层不需要可编辑角色卡面；以下可编辑图片用于复用三套现有系列包面与色彩。PAG 的可编辑图片索引按图层第一次引用的顺序排列：

| 索引 | 图层名 | 图片尺寸 | 引用数量 |
| --- | --- | --- | --- |
| 0 | strip-flat | 150×42 | 1 |
| 1 | strip-curl | 150×42 | 1 |
| 2 | strip-fold | 150×42 | 1 |
| 3 | fiber-0 … fiber-11 | 18×12 | 12 |
| 4 | packet-mouth | 160×40 | 1 |
| 5 | packet-body | 150×210 | 1 |
| 6 | card-back-0 … card-back-9 | 92×138 | 10 |
| 7 | series-glow | 300×240 | 1 |

文件须未加密、PAG 标签体未压缩。包身坐标 x=112.5、y=96，尺寸 150×210，撕口距包顶 24；包面任意位置的左右、上下、斜向拖动都按实际划动长度推进撕开；撕口实际从上封边剥离。播放期间包身从 ±8° 按原 260ms 回正，左划与右划使用同一份 PAG 和缓存的图层矩阵，纸条通过卷边形变与平移剥离，原包面图片不镜像。运行时校验尺寸、帧率、时长、图片索引和图层名；契约不符会回退 Canvas。

原始文件只通过构建命令更新；game/data/ 下的生成模块继续保持 gitignored。真实手机的帧率、内存和发热需要设备实测，浏览器验证报告不能替代这些数据。

撕开贴图使用 `PAGImage.fromPixels`，颜色类型 `RGBA_8888`、透明度类型 `Unpremultiplied`。这是针对固定 SDK 的 OffscreenCanvas 上传路径修复：该路径把非预乘 ImageData 当作预乘像素，曾导致白色轮廓；显式像素类型保持柔和半透明封边。SDK 本体保持固定版本，未修改。
