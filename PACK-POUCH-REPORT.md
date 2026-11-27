软包装与自由划动修改记录（2026-11-25）

工作目录 C:/Files/masterTask-animation，分支 animation-polish，HEAD e4feefe。本轮改动保存在本地工作目录，未新增提交或推送。

卡包表现改成装着卡片的软铝箔袋：前面弯曲、中间鼓起，侧边有折褶，上下封边收紧。闭合时绘制完整包面，移除了原先像卡面切线的中部裂缝。封口改在包顶下 24 个设计单位；部分撕开后露出暗色内衬和五层卡片边缘。原有三套系列图片仍用于包面，选包、入场、撕开和 PAG 包身共用同一个绘制函数。

手势改为按实际划动路径的长度推进。包上任意位置可起手，向左、向右、向上、向下、斜划都可撕开；不需要对准包口线。点击和初始不足 4 个设计单位的微小抖动不推进。视觉上仍是上封边剥离，裂口位置不会任意切到包面中部。左划倾斜为负方向，其余方向为正方向；半程 ±4°，撕通 ±8°，松手或撕通后按原 260ms 回正。TEAR_SWIPE 仍为 150，增加了浮点容差，避免像素换算后恰好 150 的手势差极小数而卡在未撕通。

撕通后沿用 PAG 完成段，十张卡背按各自起飞时点从包口升起，再沿弧线逐张飞入原卡圈。完成段仍为 600ms；PAG 不可用或失败时使用原 480ms Canvas 回退。卡片终点和几何参数来自原 pack.ring。新的左划姿态复用同一 PAGFile、PAGView、WebGL 画布和五组缓存 Matrix / PAGLayer 包装对象，不镜像原插画；首帧尚未按新方向 flush 时先画 Canvas 占位，避免错误方向闪现。真实 SDK 验证三次准备共创建 30 个姿态句柄，并全部释放，完成段未发抽卡 POST。

资源通过 npm run pag:tear:build 生成：tear.pag 为 74,054 字节，375×500、60fps、600ms、透明背景、28 层，8 个可编辑图片索引。纸条为 150×42，包口为 160×40；生成的 Base64 数据模块未手改，继续 gitignored。现有 reveal.pag 及其模板契约保持原样。

真实鼠标验收已确认：在包下部起手，向上精确划动 150 设计单位、分成 13 次移动；75 时 p=0.5 / tilt=4，150 时进入 PAG tearFinish，播放完成后进入 ring，候选仍为 10 张，未选中任何角色。新版网页的提示为“在卡包上任意位置、任意方向划动撕开”。

| 验证命令 | 本轮结果 |
| --- | --- |
| node tools/smoke.mjs | 27 项通过 |
| node --experimental-strip-types tools/day.test.ts | 9 项通过 |
| node tools/game-check.mjs | 147 项通过 |
| npm run test:animation | 53 项通过 |
| npm run test:pag | 13 个真实 SDK / WebGL 场景通过 |
| npm run test:web | 20 个真实浏览器场景通过 |

全部六组命令的退出码均为 0，验收完成时间 2026-11-25 20:56:52（上海时间）。Web 验证使用实际鼠标与 CDP 触摸：电脑左划、手机上划、小屏下划、Canvas 回退的斜划以及独立的向右划，均完成撕开并进入十张卡圈。完整流程继续覆盖选三张、候选角色确认、揭晓点击继续 / 自动结束、记录恢复、日历、图鉴和“测绘员”文案，未出现新控制台错误。git diff --check 通过。


分享预览 https://screenshot-fruits-tape-recommendation.trycloudflare.com/ 已在 Chromium 中确认主页面与 manifest 均为 200，served 构建 SHA256 d33cae1f6d27f8f89453baad64239cb03402067fd9a231b4b8bddc682401215f 与本地一致。预览构建时间 2026-11-25 20:45:37（上海时间），使用浏览器本地体验记录。刷新后点击“重新体验”可查看，分享链接依赖本机服务与隧道持续运行；本地地址 http://127.0.0.1:4173/。

效果与证据：

- [闭合的软卡包](tools/.web-preview/pouch/filled-pouch-closed.png)
- [晨曦系列软包装](tools/.web-preview/pouch/filled-pouch-dawn.png)
- [从包下方向上划到一半](tools/.web-preview/pouch/filled-pouch-upward-half.png)
- [打开后露出内衬与叠卡](tools/.web-preview/pouch/filled-pouch-open-stack.png)
- [逐张出卡后进入原卡圈](tools/.web-preview/pouch/filled-pouch-after-opening.png)
- [实际向上手势记录](tools/.web-preview/pouch/manual-upward.json)
- [分享构建核对](tools/.web-preview/pouch/share-check.json)
- [真实 SDK 左向 PAG 完成段](tools/.pag-preview/tear-left-completion.png)

本轮完整验收状态与日志副本保存在 tools/.web-preview/pouch/。

本轮涉及 game/js/app.js、store.js、packview.js、packet-surface.js、tear-flight.js、tear-textures.js、pag-tear.js、pag-tear-runtime.js，tools/build-pag-tear.cjs、tools/pag/tear-template.json、tools/pag/tear-README.md、tools/game-check.mjs、tools/pag-tear.test.cjs、tools/pag-render-check.cjs、tools/web-check.cjs、web/main.js，并通过脚本更新 game/assets/pag/tear.pag 与 game/js/pag-tear-template.js。保留此前本地改动。

服务端、抽卡种子和落定校验、生产重抽开关、角色插画、BASE_URL、RING / FLIP / TOP / OPEN / REVEAL 等原数值、SDK 和归档小程序目录均未修改。密钥、数据库和生成数据继续保留在本地。真实手机帧率、内存与发热尚未实测；浏览器及 SDK 回归结果不能替代真机性能数据。
