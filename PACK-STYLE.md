# 扁平卡牌补充包（2026-11-27）

## 用户要求与设计规格

用户参考图是窄长的集换式卡牌补充包，不是鼓胀的零食袋。本次只借鉴包装的轮廓、银色封边和印刷构图；不复制参考图的品牌、人物或文字。

- 目的：选包、就位和撕包时都能认出同一种卡牌补充包。
- 外形：375 设计稿内使用 150 × 278 的细长比例，两侧垂直，小圆角；去掉侧面袋褶、鼓包阴影、大面积皱纹。
- 材质：中性银灰铝膜，顶部 34 单位品牌区、底部 18 单位热封区、窄直边；中央 140 × 224 的满幅插画。
- 配色：封边 #B6C2CF / #F1F5F9，品牌字 #172B3C；中央保留已批准的深海、暮色、晨曦油画配色。暮色原有紫色仅限保留的插画，不扩大到页面设计。
- 字体：品牌与系列使用既有中文衬线字体（Songti / STSong / Noto Serif CJK）；英文小字使用 Bahnschrift 与现有中文无衬线回退。没有新字体下载。
- 构图：顶部“每日角色”，底部醒目的系列名和 DAILY ROLES / 10 CARDS。插画居中等比裁切旧装饰边框，不把圆形主题压扁。
- 小屏：选择行等比缩小并给说明文字留空间；较高的撕包包装从旧位置上移 48 单位，提示限制在导航上方。

## 工程范围

- game/js/packet-surface.js：共用扁平表面、银色封边、完整渐变首帧和位图缓存。
- game/js/pack.js / packview.js：统一选择与就位比例；触摸几何与绘制一致。
- game/js/tear-textures.js / pag-tear-runtime.js：PAG 替换纹理使用同一包装尺寸与画法。
- tools/pag/tear-template.json、生成的 pag-tear-template.js、game/assets/pag/tear.pag：重新生成较长的包身，而不是只换静态缩略图。
- tools/build-packet-foil.cjs：可复现 Canvas 封边 PNG；不调用生图服务，不提交参考图或原始大图。

封边图片保持懒加载。PNG 为 300 × 556，每张 27,791 字节；中央区域透明检查为 0 个不透明像素。图没加载/加载失败时仍完整绘制银边、系列渐变与印刷文字；图片或封边稍后就绪时只重建对应系列的缓存。拖动只变换已缓存位图，不另建动画循环。

保留 24 单位撕口、42 单位撕条纹理、150 单位划动阈值、480ms 纸条完成段和 2200ms 错峰出牌。没有改抽卡概率、候选流程、角色数据或服务端。今日仍是整张 3D 双面卡牌，日历和油画图鉴没有回退或重做。

## 生成与验证


环境使用 Node 24；封边和 PAG 是程序构建产物，不是手写二进制。

```powershell
node tools/build-packet-foil.cjs
npm run pag:tear:build
npm run web:build
npm run test:pack
npm run test:pack:web
$env:PAG_TEST_RENDERER='native'
npm run test:web
npm run test:animation
npm run test:pages
$env:PAG_TEST_RENDERER='native'; npm run test:pag
node tools/game-check.mjs
```

本次最终验收（Windows / Node 24.15.0 / Chromium 原生 D3D11）：

| 验证 | 结果 |
| --- | --- |
| npm run test:pack | 11/11 |
| npm run test:pack:web -- --no-build | 3/3，390×844 鼠标右划 / 375×667 触摸左划 / 320×568 缺图 Canvas 回退 |
| npm run test:web（PAG_TEST_RENDERER=native） | 25/25 |
| node tools/game-check.mjs | 177/177 |
| npm run test:animation | 55/55 |
| npm run test:pages | 16/16，今日 3D 卡牌、卡牌日历、油画图鉴保持原需求 |
| npm run test:pag（PAG_TEST_RENDERER=native） | 13/13，真实 PAG SDK、图片替换、左右撕包及失败回退 |
| 修改的 JS 语法 / git diff --check | 通过 |

390/375 宽时提示中心距离包底 32 单位；320 宽实测为 20.9375 单位，距离导航 14 单位，文字没有覆盖封边或导航。图片失败时品牌/系列/银边仍完整可见。

早先一次 Web 测试在启动时报告 rolesPreview 尚不可用，独立冷启动没有复现；最终保留原断言从头完整重跑得到 25/25。中断的较早运行不计入通过结果。

边界：浏览器实测与小游戏渲染测试不等于微信真机或开发者工具 GUI 验收；本次未做真机帧率测试。只发布 web/dist 静态体验，不代理后端、不公开数据库或密钥。

截图与报告写入被忽略的 tools/.web-preview/booster-*.png 和 booster-verification.json，不提交个人体验记录。
