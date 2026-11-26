立体卡包与逐张出牌验收（2026-11-25）

按本轮截图反馈完成两处修改，工作目录 C:/Files/masterTask-animation，分支 animation-polish，基准仍为 e4feefe。本轮改动保存在本地，未新增提交或推送。

卡包已从平面贴图改为带封口压纹、右侧厚度、底部折边、角部折痕、柔和投影和反光的包装。受光随已有 ±8° 倾斜变化，选包、放大入场、撕开和 PAG 包身共用 packet-surface.js，避免切阶段时材质变化。原有包面插画仍作为表面图使用。命中范围与 TEAR_SWIPE=150 不变。

撕通后十张卡背依次离开包口，每张有独立的起飞时点与弧线路径，先升起，再错开散入现有卡圈。目标位置、尺寸、透视与透明度直接来自现有 pack.ring，RING 参数没有改动。包身在出牌后半段淡出，撕开提示随之淡出，避免覆盖最终卡列。纸条继续平移与卷边，不增加翻书式旋转。PAG 完成段仍为 600ms，Canvas 回退仍为 480ms，并使用同一套逐张飞行轨迹。完成段不会调用抽卡接口。

新版 tear.pag 由 npm run pag:tear:build 生成：375×500、60fps、600ms、透明背景、28 个图层、78,028 字节。可编辑图片仍为 8 个索引；card-back 索引 6 现在被十张卡背引用。原始 reveal.pag 与揭晓控制器未改动，生成的 game/data/tear-pag.js 与契约均通过脚本更新。

| 验证命令 | 结果 |
| --- | --- |
| node tools/smoke.mjs | 27 项通过 |
| node --experimental-strip-types tools/day.test.ts | 9 项通过 |
| node tools/game-check.mjs | 135 项通过 |
| npm run test:animation | 51 项通过 |
| npm run test:pag | 12 项通过 |
| npm run test:web | 19 项通过 |

动画新增回归验证错峰出牌、飞行越过包口、十张牌的终点匹配原卡圈、包身退出以及原时长保持。真实 PAG SDK 验证透明度、时间轴变化、十张卡背、系列替换、释放、后台恢复与失败回退。真实浏览器覆盖电脑、手机尺寸、小屏与 Canvas 回退的完整流程。真机帧率、内存与发热尚未实测；模板的 60fps 不代表设备测得帧率。

分享预览 https://screenshot-fruits-tape-recommendation.trycloudflare.com/ 在 Chromium 中返回 200，构建 SHA256 a1cb00bdfdde0e521de0ad979caa3782ba31f4d79e16c0024bac5231067b64ff 与本地一致。刷新页面后点击右上“重新体验”可查看。本地 http://127.0.0.1:4173/ 服务仍在运行，分享依赖本机服务与隧道持续运行。

效果文件：

- [晨曦卡包，与用户截图同色调](tools/.web-preview/packet-volume/dawn-packet-volume-night.png)
- [完整动画效果图，18 帧 APNG](tools/.web-preview/packet-volume/packet-depth-and-emission.png)
- [逐帧记录](tools/.web-preview/packet-volume/night-timeline.json)
- [分享构建确认](tools/.web-preview/packet-volume/share-check.json)

新增 game/js/packet-surface.js 与 game/js/tear-flight.js。修改 game/js/packview.js、game/js/tear-textures.js、game/js/pag-tear-runtime.js、tools/build-pag-tear.cjs、tools/pag/tear-template.json、tools/pag/tear-README.md、tools/pag-tear.test.cjs、tools/pag-render-check.cjs，重新生成 game/assets/pag/tear.pag 与 game/js/pag-tear-template.js。原有本地生图工具改动已保留。

完整验证状态和日志副本在 tools/.web-preview/packet-volume/。服务端、种子、落定校验、生产重抽开关、玩法时长、RING 几何、BASE_URL、角色插画与归档小程序均未修改。密钥、数据库和生成数据仍保持本地与 gitignored。
