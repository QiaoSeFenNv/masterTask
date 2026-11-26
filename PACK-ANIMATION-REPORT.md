本轮开包动画验收记录（2026-11-25）

代码位于 C:/Files/masterTask-animation，分支 animation-polish，起点为 e4feefe “Polish pack animations and feedback”。本轮改动保存在本地，未新增提交或推送；原有本地生图工具改动已保留。

三个问题已经完成，按“确认构建 → 倾斜 → PAG 完成段 → 阴影”的顺序实施并分别跑完验收。

| 本项 | smoke | day | game-check | test:animation | test:pag | test:web |
| --- | --- | --- | --- | --- | --- | --- |
| 包外起手倾斜 | 27 通过 | 9 通过 | 123 通过 | 38 通过 | 6 通过 | 15 通过 |
| PAG 撕开完成段 | 27 通过 | 9 通过 | 130 通过 | 48 通过 | 12 通过 | 15 通过 |
| 柔和阴影 | 27 通过 | 9 通过 | 135 通过 | 48 通过 | 12 通过 | 19 通过 |

**构建确认。** 修改渲染前重启了 npm run web:dev。服务中的 game.bundle.js 与本地文件逐字节一致，包含 tiltTear 和 sfx，基准构建 SHA256 为 b6ecdb691db34e734868a278da84ad7ec896c61cad6713b180598e349fe396df。最终构建 SHA256 为 c9998df00fdc435904e3e50ae6b408cacd5c0ec064b6b8145b345308c6f5138e；再次确认服务包含倾斜修复、tear-pag 数据和柔和阴影。

原分享链接 https://screenshot-fruits-tape-recommendation.trycloudflare.com/ 在 Chromium 浏览器导航中返回 200，标题“每日角色 · 体验预览”，manifest 的构建哈希与上述本地最终构建一致。本地预览 http://127.0.0.1:4173/ 继续运行。点击右上“重新体验”可重走完整流程；电脑与预览、隧道进程需保持运行。

**倾斜修复。** 修改 game/js/app.js、game/js/store.js，并在 tools/game-check.mjs、tools/web-check.cjs 补充回归。临时诊断确认：包外起手 x≈98 时，旧代码 p≈0.5、tilting=false、tilt=0；包内起手 p≈0.5 时能正常绘制约 4°。现在包口横向命中范围扩展 12 单位，入场期间同时接受原坐标与逆缩放坐标，scale=1 时直接使用原坐标。右向撕开由累计进度补齐 tilt=p×8°，包内的左向把玩仍走距离；浏览器确认半程约 4°、撕通 8°、260ms 回正。临时运行时诊断已删除。TEAR_SWIPE=150 与回弹时长保持原值。

**PAG 完成段。** 修改 game/js/app.js、game/js/store.js、game/js/packview.js、tools/build-web.cjs、web/main.js。新增 game/assets/pag/tear.pag、game/js/pag-tear.js、game/js/pag-tear-runtime.js、game/js/tear-textures.js、game/js/pag-tear-template.js、tools/pag/tear-template.json、tools/build-pag-tear.cjs、tools/pack-pag-tear.cjs、tools/pag-tear.test.cjs，并更新 package.json 的构建与验证命令。补充 tools/pag-render-check.cjs 的真实 SDK 验证。

模板为 375×500、60fps、600ms、透明背景，21 层、70,302 字节；图像来自现有包面图的裁切与卷边形变，包含纤维、系列色辉光、包口与三张卡背，不需要可编辑角色卡面。开包预热、进入 tear 准备，撕通后进入 tearFinish 并锁定渲染器：准备成功播放 600ms，准备过晚、SDK/模板/flush 失败时保持 480ms Canvas 纸条平移 + burst/halo。完成段不发抽卡 POST。版本标记与串行队列保护准备、flush 和释放；撕开控制器同一时刻最多一次 flush；后台暂停绘制，恢复按统一时钟采样；播放完成或离开页面后释放图片、PAGFile、PAGView、画布与 WebGL。真 SDK 验证了透明度、时间轴变化、系列图像替换、后台恢复、资源释放和失败回退，绘制缓冲不超过 2 倍像素密度。

没有找到独立提示词文件或 AE 工程，本次是可复现的内置 PAG，不是 AE 导出稿。设计稿替换契约与可编辑图片索引见 [tools/pag/tear-README.md](tools/pag/tear-README.md)。npm run pag:tear:build 仅重建内置 tear.pag；替换 AE 导出文件后运行 npm run pag:tear:pack，只打包现有文件。未运行会覆盖旧揭晓的 pag:build。game/data/tear-pag.js 由脚本生成并继续 gitignored，未手改。

**阴影。** 修改 game/js/packview.js 的 cardShadow，采用 Canvas 径向渐变。投影中心固定在卡底，宽度乘 wscale，高度随 scale 并限制为宽半径的 0.24，深度透明度为 0.10+depth×0.22。四个渐变色标把中心黑色柔和淡到透明边缘。tools/game-check.mjs 验证十张投影的宽窄、锚点、透明度与画布状态恢复；新增 tools/shadow-check.cjs 并在 tools/web-check.cjs 检查真实梯度像素。前卡示例 alpha 从中心 50 → 半径中段 18 → 边缘 1 → 外沿 0，侧卡均保持扁椭圆，背卡更淡。

效果对比：

- [包外起手：修复前](tools/.web-preview/tear-polish/tilt-before-outside.png)
- [包外起手：半程 4°](tools/.web-preview/tear-polish/tilt-after-outside-half.png)
- [深海 PAG 完成段](tools/.pag-preview/tear-deep-completion.png)
- [暮色 PAG 完成段](tools/.pag-preview/tear-dusk-completion.png)
- [阴影：修改前](tools/.web-preview/tear-polish/ring-before-shadows.png)
- [阴影：修改后](tools/.web-preview/tear-polish/ring-after-shadows.png)

验证细节在 tools/.web-preview/tear-polish/，包含各项日志、真实 SDK 与 Web 报告、构建证明、分享链接证明和阴影像素。测试时发现验证后端的 watch 重启导致会话失效，已改用同一验证入口的不带 watch 进程，仍在 127.0.0.1:3000；稳定后端下重跑全部基础检查通过。没有修改服务端代码、种子、落定校验、生产重抽限制、玩法数值、RING 几何、BASE_URL、原始插画、旧 reveal.pag、既有 pag-reveal.js/pag-runtime.js 或归档小程序。ALLOW_REDRAW=0，密钥与数据库保持本地。

浏览器实拖、真实 PAG SDK/WebGL 和完整流程验收均通过；真实手机帧率、总内存与发热仍未实测。这里的 60fps 是模板规格，30/60/120 FPS 是时钟单测采样率，均不代表真机测得帧率。
