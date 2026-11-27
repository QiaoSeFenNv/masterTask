这个工具使用配置的 TeleAPI 生图服务，在开发电脑上生成候选素材。小游戏、Web 预览和服务端不会调用该接口，也不会携带 API Key。

当前环境已把用户提供的 Key 保存到仓库根目录的 .env.imagegen.local。该文件及 tools/.image-preview/ 输出目录都被 Git 忽略。默认服务地址为 https://ai01.teleapi.top/draw-api/v1/images/generations；Key 有效期以提供商为准，本次提供的有效期至 2026-11-28 14:37:41（Asia/Shanghai）。额度与有效期由服务端判断，工具不会自动续期或重试。

首次配置可复制 [config.example](config.example) 到仓库根目录的 .env.imagegen.local，再在本机填入 TELEAPI_IMAGEGEN_API_KEY。已有环境配置时不要覆盖该文件。Key 只发送到配置的生图 endpoint；下载返回的图片 URL 时不发送 Authorization，也不跟随 HTTP 重定向。

默认可直接使用 Node 22.5+。本机需要复用系统代理时，启用 .env.imagegen.local 中的 HTTPS_PROXY 与 NODE_USE_ENV_PROXY=1；该功能使用 Node 24.15+ 的原生代理支持。代理只影响此开发命令。

在仓库根目录执行：

```powershell
npm run imagegen -- --prompt-file tools/imagegen/prompts/bg-deep.txt --out tools/.image-preview/bg-deep-v2.png
npm run imagegen -- --prompt-file tools/imagegen/prompts/bg-dusk.txt --out tools/.image-preview/bg-dusk-v2.png
npm run imagegen -- --prompt-file tools/imagegen/prompts/bg-dawn.txt --out tools/.image-preview/bg-dawn-v2.png
```

也可以直接输入提示词：

```powershell
npm run imagegen -- --prompt "宁静的深青蓝水下空间，中心低对比留白，无文字、无人物、无水印" --size "1*1" --out tools/.image-preview/deep-study.png
```

- --prompt 与 --prompt-file 二选一；--out 必填。提示词文件按 UTF-8 读取。
- --size 默认 1*1。工具检查比例格式，其他比例是否可用由提供商决定；本次接口示例只明确了 1*1。
- --timeout 默认 180000ms，可设 1000–600000ms。网关先超时时，增加客户端超时无法解决服务端等待问题。
- 返回 data[0].b64_json 或 data[0].url 时保存第一张图；输出扩展名按真实 PNG / JPEG / WebP 格式确定。
- 图片旁生成 .json 文件，保存提示词、时间、大小与 SHA256，不保存 Key、原始响应或临时图片下载 URL。
- 已存在的文件不会覆盖；需要新版本时用新的文件名。

已经提供三套提示词：[深海](prompts/bg-deep.txt)、[暮色](prompts/bg-dusk.txt)、[晨曦](prompts/bg-dawn.txt)。它们使用同一套“低对比中心留白、克制光照、无文字水印”的背景规范，供开包场景叠加卡牌。生成结果先在 tools/.image-preview/ 检查清晰度、颜色、留白及是否出现文字，选定后再作为独立的新版本资源使用。

本次接入保留现有 game/assets/、角色插画和 PAG 模板。当前端点只提供文生图 generations 示例，参考图编辑、透明背景和模型选择尚未核实，工具没有添加这些参数。

运行离线验证：

```powershell
npm run test:imagegen
```

测试检查记录格式、凭据不会传到图片 CDN、既有文件保护、超时不重试、错误脱敏及无效响应拒绝。测试只使用内存响应和临时文件，不消耗提供商额度。

若出现 ECONNRESET，检查当前网络是否需要本地代理；HTTP 401 通常需检查 Key / 有效期，429 表示额度或限流。HTTP 502 / 503 / 504 / 524 属于提供商网关失败，服务端任务可能仍在继续，工具不会立即补发请求。
