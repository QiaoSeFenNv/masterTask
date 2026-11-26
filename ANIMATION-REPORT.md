本轮动画修改及 Web 复测已完成，所有自动验证通过。**P1 真机验收仍待实测，整体不能按“全部验收完成”结项。**

记录时间：2026年11月25日 13:15:10（Asia/Shanghai）。

本地工作目录：C:\Files\masterTask-animation，分支 animation-polish。从公开仓库新 clone 后，以 a0d5d3f1717a7ecfbfe3a56166b810e292a99df9（pag project）为基准。本轮代码已按用户后续授权提交并推送到 origin/animation-polish，commit 为 e4feefeccf4f043e818647336200f237d89f905f。本地验收报告和截图保留在本机。原工作目录 C:\Files\roles 保留。

Web 体验链接：https://screenshot-fruits-tape-recommendation.trycloudflare.com/

本地预览：http://127.0.0.1:4173/。后端验证服务：http://127.0.0.1:3000/。分享地址已返回 200，构建清单与本地一致；它依赖本机预览服务和现有 tunnel 持续运行。Web 使用原有浏览器访客预览数据，每位访客独立，不写生产抽卡记录。可点击“重新体验”重新查看完整开包流程。

本轮按 A4 → A5 → A7 → A8 → P1 → P2 推进。P1 完成隔离工程和扫码入口后，等待实体手机数据；这段等待期间完成 P2。以下“通过”均指自动验证，真机手感另列。

| 阶段 | smoke | day | game-check | animation | PAG | Web | 自动结果 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 基准 | 27 | 9 | 102 | 31 | 6 | 13 | 全通过 |
| A4 | 27 | 9 | 104 | 31 | 6 | 13 | 全通过 |
| A5 | 27 | 9 | 111 | 31 | 6 | 13 | 全通过 |
| A7 | 27 | 9 | 115 | 31 | 6 | 13 | 全通过 |
| A8 | 27 | 9 | 118 | 38 | 6 | 14 | 全通过 |
| P1 自动检查（真机未验收） | 27 | 9 | 118 | 38 | 6 | 14 | 全通过 |
| P2 | 27 | 9 | 118 | 38 | 6 | 15 | 全通过 |

当前脚本的实际项目数高于早期文档中的 22 项；本轮保留原回归断言，并增加本次动画行为检查。ALLOW_REDRAW=0，重抽开发入口相关用例按原脚本条件跳过。

- **A4：环里计数与正前方牌名。** 改动 [packview.js](game/js/packview.js)、[game-check.mjs](tools/game-check.mjs)。读取按深度排序列表的最后一张，显示角色名和“第 n / 10 张”，拖动后实时切换；短屏幕有文字背板。RING 几何与卡牌命中逻辑保持基准。自动结果见表；浏览器已查看初始、拖动和翻面画面，真机手感未测。证据：[环形计数](tools/.web-preview/manual/A4-ring-front.png)。

- **A5：撕包前整包倾斜。** 改动 [store.js](game/js/store.js)、[app.js](game/js/app.js)、packview.js、game-check.mjs。包内开始的横向拖动控制 ±8° 倾斜，松手或取消触摸沿现有 outCubic 曲线 260ms 回正；角度与撕口 p 独立。只旋转仍连在包上的部分，已经撕下的纸条保持平移。自动结果见表；浏览器已查看左右倾斜、回正和纸条飘离，真机手感未测。证据：[左倾](tools/.web-preview/manual/A5-left-tilt.png)、[右倾与纸条](tools/.web-preview/manual/A5-right-tilt-paper.png)。

- **A7：补齐页面入场。** 改动 app.js、[render.js](game/js/render.js)、packview.js、game-check.mjs、[web-check.cjs](tools/web-check.cjs)。切 tab、选系列首次出现、今日卡首次出现走现有 animation.js 时钟，220ms 淡入并从 0.96 缩放到 1。点击区域跟随视觉变换，环与包的命中点做逆变换，入场中可以立即操作。今日卡在揭晓末段衔接入场，提前继续时立即开始；renderOpening 的原 480ms 时间轴保持基准。自动结果见表；真实浏览器输入验证已通过，真机手感未测。

- **A8：轻震动与三个短音。** 新增 [sfx.js](game/js/sfx.js)、game/assets/sfx/tear.wav、flip.wav、settle.wav、[build-sfx.cjs](tools/build-sfx.cjs)、[sfx.test.cjs](tools/sfx.test.cjs)。改动 app.js、store.js、[assets.js](game/js/assets.js)、package.json、animation.test.cjs、game-check.mjs；Web 适配涉及 wx-bridge.js、build-web.cjs、serve-web.cjs、web-check.cjs。撕通、接受翻牌、POST /api/draw 成功落定时调用 light 震动，异常不会打断流程。三个原创合成 WAV 分别约 140 / 90 / 260ms，总计约 21.2KB；缓存三个音频上下文、音量 0.18、不自动播放，只在用户手势后播放。切后台停止声音，恢复不重播旧提示。重复确认及失败响应的反馈时机受回归保护。自动结果见表；浏览器验证声音文件可解码、手势门槛正确、一次撕通/三次翻牌/一次落定，实体设备震动与听感未测。

- **P1：真机验证入口已备好，验收待实体设备。** 改动仅在 [pag-native-probe.cjs](tools/pag-native-probe.cjs)。隔离入口不请求后端，使用生产统一时钟及 PAG 模块，支持重播、切换角色、连续播放和复制实测 JSON；点击继续、自动结束后释放 PAG，后台暂停并标记中断样本。记录 Canvas 绘制 FPS、p95 帧间隔、SDK 帧通知次数及可用时的 JS heap。总内存、发热保持未测，需真机性能面板及实际观察。平台为模拟器时的数据不能代表实体手机；模拟器窗口状态下读数波动，因此没有据此降低 PAG 绘制缓冲或修改回退策略。

- **P2：两个旧问题未在新构建复现。** 定向回归改动 web-check.cjs，使用原访客预览算法生成稳定的测绘员样本，保留所有原有浏览器场景。完整走过选包 → 撕开 → 转环 → 翻三张 → 飞候选 → 选测绘员 → PAG 揭晓 → 点击继续 → 今日页。卡面与候选信息中的“把模糊的东西量出来”完整显示；104.33 单位宽的候选卡中，真实浏览器文字测得 81 单位，左右均有内边距。确认成功后的 toast 为空，揭晓与今日页标题未遮挡。cardface.js 与成功提示逻辑无需额外修改。自动结果见表；浏览器没有 pageerror，记录角色和任务正确。证据：[候选文案](tools/.web-preview/manual/P2-surveyor-candidate.png)、[确认后](tools/.web-preview/manual/P2-confirm-no-toast.png)、[PAG 揭晓](tools/.web-preview/manual/P2-surveyor-pag-reveal.png)、[今日页](tools/.web-preview/manual/P2-surveyor-today.png)。

真机扫码入口：[native-preview-qr.jpg](tools/.pag-preview/native-preview-qr.jpg)。隔离工程已由 npm run pag:native 生成并在开发者工具打开：

C:\Users\8856\AppData\Local\Temp\roles-pag-native-mjbwkB

扫码后请至少验证两名角色卡面替换、380ms 前误点过滤、之后点击继续、1 秒自动结束、切后台再恢复；连续播放观察掉帧与发热。点击“复制实测数据”，回传 JSON，并补充机型、微信版本、总内存和发热观察。低端机应单独记录。主工程新增的震动、声音与各段手感也仍需实体手机确认。

| 真机数据 | 当前记录 |
| --- | --- |
| 机型 / 系统 / 微信版本 | 未连接实体手机，未测 |
| 揭晓 FPS / p95 帧间隔 | 未测 |
| JS heap / 总内存 | 未测 |
| 发热 | 未测 |
| 卡面替换 / 点击继续 / 自动结束 / 后台恢复 | 自动验证通过；实体手机未测 |

待填文件：[device-results-template.json](tools/.pag-preview/device-results-template.json)。扫码失效时，在该本地目录重新运行 npm run pag:native，并由开发者工具的“预览”重新生成二维码。

验证命令均已按阶段运行。依赖 npm ci、角色同步 node tools/sync-roles.cjs 已先完成；本轮角色源数据保持基准，之后无需重复同步。需要重跑时，在 C:\Files\masterTask-animation 下执行（后端需在 3000 端口运行）：

```powershell
node tools/smoke.mjs
node --experimental-strip-types tools/day.test.ts
node tools/game-check.mjs
npm run test:animation
npm run test:pag
npm run test:web
```

浏览器回归覆盖真实鼠标和触摸、桌面/手机/小屏尺寸、PAG 与 Canvas 失败回退、滚动任务、日记、日历、图鉴、恢复记录及重新体验。测试时钟在导航前冻结，避免慢速软件绘制导致原用例启动时钟失效；原有流程断言保留。

最新机器报告：[PAG](tools/.pag-preview/verification.json)、[Web](tools/.web-preview/verification.json)、[逐项数量](tools/.web-preview/manual/verification-counts.json)。每步原始日志保存在 tools/.web-preview/manual/checks/；截图保存在 tools/.web-preview/manual/。这些输出均在 gitignored 目录。

最终范围审查：服务端、shared/roles.json、pack.js 几何和时长、animation.js、effects.js、PAG 控制器/适配/契约/模板/SDK/生成数据、api.js 的 BASE_URL、角色插画、project.config.json、package-lock.json、miniprogram-mp/ 均与基准一致。git diff --check 通过。.env 中 ALLOW_REDRAW=0，凭据和验证数据库保留在本地隔离环境；角色生成数据、数据库和 .env 未加入 Git。

P3 未涉及本轮实现，现有 PAG 模板继续使用。剩余工作仅为上述实体设备验收及依据实测结果必要的调优。
