# PAG 揭晓动画

落定后播放 1 秒 PAG 揭晓：角色卡面轻微回弹，背后展开光环与射线，并散出星光。模板由工程内的脚本生成，可以直接使用，也可以替换为设计师从 After Effects 导出的 PAG 文件。

## 运行方式

- 撕包、转盘、翻面和飞行继续由 Canvas 与统一 RAF 时钟驱动。PAG 承接落定后的揭晓，由同一个时钟调用 `setProgress()` / `flush()`。
- 开包时预热 SDK，候选角色确定后用 `cardface.js` 生成位图，替换可编辑卡面。同一份模板用于所有角色，换角色无需重新导出动画。
- `pag-reveal.js` 串行处理准备、flush 和释放；异步回调带版本标记，避免旧角色覆盖新角色。同一时刻最多一次 flush。
- 每轮揭晓开始时固定使用已准备好的 PAG 或 Canvas 回退。SDK、模板、WebGL 或 flush 失败时，抽卡结果与后续任务流程仍可继续。
- 接口成功就保存抽卡结果，揭晓为 1000 ms；前 380 ms 的聚焦阶段过滤过早点击，之后可点击继续。切后台暂停绘制，恢复时按统一时钟采样；跳过、结束或离开当前页面时释放对应 PAG 资源。

入口为 [game/js/pag-reveal.js](game/js/pag-reveal.js)，平台适配为 [game/js/pag-runtime.js](game/js/pag-runtime.js)。

## SDK 与资源

固定使用 `libpag-miniprogram@4.3.51`，JS、Brotli WASM、许可证和 SHA256 清单保存于 `game/vendor/pag/`。WASM 的小游戏包内路径是 `/vendor/pag/libpag.wasm.br`。运行游戏直接使用这些文件。

微信模拟器曾拒绝读取包内原始 `.pag` 文件，返回 `readFile:fail permission denied`。因此运行时加载 `game/data/reveal-pag.js` 中的 Base64 字节，通过 `wx.base64ToArrayBuffer()` 解码；没有该方法时使用内置解码器。`game/assets/pag/reveal.pag` 保留为导出与编辑的原始文件。打包模块已纳入版本管理，`roles.js` 仍由角色同步脚本生成。

PAG 使用透明 WebGL 画布并保留绘制缓冲，再合成到现有 Canvas 2D；绘制缓冲约束在最多 2 倍像素密度。当前 PAG SDK、原始模板与数据模块合计约 1.26 MB。

## 重新生成内置动画

`tools/pag/reveal-template.json` 保存模板参数，`tools/build-pag-template.cjs` 生成纹理与 PAG 时间轴，`tools/pack-pag-template.cjs` 生成运行时数据和契约。

```bash
npm ci
npm run pag:sync       # 从固定版本依赖更新 game/vendor/pag/
npm run pag:build      # 重新生成内置 reveal.pag，并打包为 JS 数据模块
```

构建和浏览器测试使用系统 Chromium、Edge 或 Chrome，也可通过 `PAG_BROWSER` 指定可执行文件。内置模板包含 22 个图层，时长 1 秒、60 fps；纹理与变换关键帧保存在 PAG 文件中，运行时负责替换角色卡面和采样。

## 替换为 AE 导出的动画

导出文件需满足以下契约，配置源位于 [tools/pag/reveal-template.json](tools/pag/reveal-template.json)。运行时会检查尺寸、时长、帧率，以及索引 0 对应的卡面图层。

| 项目 | 要求 |
| --- | --- |
| 合成尺寸 | 375 × 500 |
| 帧率与时长 | 60 fps，1000 ms |
| 背景 | 透明，光效之外的区域保留 alpha |
| 卡面图像尺寸 | 180 × 270 |
| 卡面中心 | x = 187.5，y = 210 |
| 卡面可编辑索引 | 0 |
| 图层名称 | `card`，索引 0 只对应这一个图像图层 |
| 文件编码 | 未加密、未压缩的 PAG 标签体；打包脚本会检查文件头和长度 |

1. 在 AE 中制作合成，用 PAG 导出插件把卡面图像设为可编辑并命名为 `card`，确认导出的可编辑索引是 0。光环、星光和转场可以按设计修改。
2. 将导出的文件复制到 `game/assets/pag/reveal.pag`，保持上述合成和卡面几何。
3. 执行 `npm run pag:pack`，更新 `game/data/reveal-pag.js` 和 `game/js/pag-template.js`。
4. 执行 `npm run test:pag`，验证实际 SDK 解码、图层替换、透明合成及完整揭晓流程，再在微信开发者工具编译查看效果。

`pag:pack` 仅打包现有文件。`pag:build` 会重新生成并覆盖内置动画；替换 AE 文件后用 `pag:pack`。当前仓库提供可用 PAG 模板与生成脚本，没有 AE 工程文件。

## 验证与预览

```bash
npm run test:animation  # 统一动画时钟与 PAG 生命周期
npm run test:pag        # 真实 SDK + WebGL；不需要后端
node tools/game-check.mjs  # 真实游戏模块、触摸与接口；需要本地后端
npm run pag:native      # 生成隔离的微信小游戏验证工程，并打印临时目录
```

`test:pag` 覆盖模板契约、两个角色的卡面替换和时间轴画面变化、点击继续、自动结束、后台恢复，以及运行时或资源不可用时回退。它在浏览器里适配微信接口，不代表真机性能测试。截图与报告写入 `tools/.pag-preview/`。

`pag:native` 将当前生产模块复制到系统临时目录，仅在这份副本中放入 PAG 演示入口，不请求后端。用微信开发者工具打开打印出的目录，编译后先循环播放，再停在 45% 进度便于检查星光与光环。不会修改主工程中的今日抽卡记录。

2026-11-24 已在微信开发者工具模拟器（基础库 3.5.5）确认真实 SDK 播放、旅人卡面替换、透明光环与星光合成。截图为 [tools/.pag-preview/wechat-pag-reveal.png](tools/.pag-preview/wechat-pag-reveal.png)，原生验证报告为 `tools/.pag-preview/native-verification.json`。物理设备上的帧率、内存和发热尚未测量。
