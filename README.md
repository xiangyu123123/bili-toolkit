# Bilibili 增强工具箱（油猴脚本）

单文件 Tampermonkey / Violentmonkey 脚本，给 B 站桌面端网页加五件事：**界面净化**、**播放增强**、**素材提取**、**弹幕评论**、**线路测速选线与 P2P 阻断**，外加一套**跟随 B 站的皮肤系统**。所有功能都能在控制台里单独关掉。

- 安装页 / 文档：<https://bili-toolkit-ppywmt0k7sa.qoder.website/>
- 直接安装脚本：<https://bili-toolkit-ppywmt0k7sa.qoder.website/bili-toolkit.user.js>
- 仓库：<https://github.com/xiangyu123123/bili-toolkit>
- 当前版本：`1.6.3`

## 安装

1. 先装浏览器扩展 [Tampermonkey](https://www.tampermonkey.net/) 或 Violentmonkey（Edge / Chrome 均可）。
2. 打开上面的「直接安装脚本」链接 → 扩展会弹出安装确认 → 点安装。
3. 进任意 B 站页面，右下角出现 **B+** 悬浮球即成功；<kbd>Alt</kbd>+<kbd>S</kbd> 打开控制台。

脚本头部带 `@downloadURL` / `@updateURL` 指向上面那个地址，所以 Tampermonkey 会按它自己的更新周期检查升级；也可以随时从安装页重新安装覆盖。

生效范围：`www.bilibili.com`、`t.bilibili.com`（动态）、`space.bilibili.com`（UP 主空间）、`live.bilibili.com`（直播）桌面端。`m.bilibili.com` 不在匹配内。

## 模块

| 模块 | 默认 | 做什么 | 已知边界 |
| --- | --- | --- | --- |
| 界面净化 | 开 | 注入一张 `display:none!important` 样式表，六组内置规则各自独立开关，每条实时显示**本页命中数** | 选择器取自 2026-10 现网实测，B 站改版会失效；规则**按子站分别生效**（动态页的 `.left-entry__item` 是频道按钮，不能套首页的顶栏规则） |
| 播放增强 | 开 | 倍速（含 >4x）、跳片头片尾、自动连播、音量微调、快捷键、自动切最高画质、播放器右上角小工具条 | 画质档位从**页面 playinfo / 播放器枚举 / 画质菜单 `data-value`** 三处取并集再选最高（4K 只在播放器那次 `fourk=1` 的请求里给全），只切 B 站给**当前账号**列出来的档，切不过去逐级退回次高一档；未登录时 `requestQuality` 会被静默接受但不生效，面板如实显示降档结果。网页端 4K 是 `qn=120` 不是 116 |
| 素材提取 | 开 | 封面原图 / 多档尺寸、分 P 地址、时间戳链接复制 | 封面直下会被 CDN 的跨域策略拦，此时改为新标签打开 |
| 弹幕评论 | 开 | 弹幕按关键词 DOM 屏蔽 + 整层隐藏；评论关键词高亮与折叠 | B 站弹幕是 DOM 渲染（`.bili-danmaku-x-dm`），不是 canvas；评论组件自身报错时面板显示「未找到评论元素」 |
| 线路测速 / PCDN | **关** | 接管 `playurl` 响应，列出候选节点、逐主机测速表格、手动「用这条」锁定；阻断 P2P 调度会话 | 只在**本次响应给出的地址**里选，不枚举节点；B 站把 PCDN 放在 `base_url`、正规 CDN 放在 `backup_url`，所以是「提升干净备用」而不是删除条目 |
| 外观 | 开 | 跟随 B 站 / 浅色 / 深色三档皮肤 + 自定义强调色 + 面板不透明度 | 「跟随 B 站」直接引用 B 站自己在 `:root` 上的设计变量（`--bg1_float` / `--text1` / `--brand_pink` 等）；不改 B 站页面本身的配色 |

### 关于 PCDN 与 P2P

B 站网页端参与 P2P 调度的唯一可见通道是一条 WebSocket：

```text
wss://ali-web-player-tracker.biliapi.net/socket.io/?...&sdkVersion=2.14.0%3Aleecher
```

脚本包裹 `WebSocket`，命中 `leecher` 特征的会话被换成一个 `readyState = 3` 的死连接（仍然通过 `instanceof WebSocket`，避免播放器自己判定时崩）。聊天广播 `wss://broadcast.chat.bilibili.com:7826` **原样放行**。全程没有 WebRTC / datachannel。

浏览器无法监听端口，所以「PCDN 上传」在网页端表现为上面这条调度会话，而不是本地监听服务。

## 快捷键

| 键 | 作用 |
| --- | --- |
| <kbd>Alt</kbd>+<kbd>S</kbd> | 打开 / 关闭控制台 |
| <kbd>Alt</kbd>+<kbd>P</kbd> | 进入 / 退出拾取模式 |
| <kbd>Esc</kbd> | 关闭面板并退出拾取模式 |
| <kbd>，</kbd> / <kbd>。</kbd> | 上一个 / 下一个分 P |
| <kbd>-</kbd> / <kbd>=</kbd> | 倍速 ±0.25 |
| <kbd>0</kbd> | 回到 1.00x |
| <kbd>[</kbd> / <kbd>]</kbd> | 音量 ±2 |
| <kbd>Alt</kbd>+<kbd>D</kbd> | 弹幕整层显示 / 隐藏 |

前提：播放增强开着、焦点不在输入框、没有组合 <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>/<kbd>Alt</kbd>（<kbd>Alt</kbd>+<kbd>S</kbd> 等显式绑定的除外）。B 站原生的空格、方向键、<kbd>F</kbd>、<kbd>D</kbd> 都不占用。

## 反馈

两条路，都不需要开控制台或截图：

1. **安装页页内表单** —— <https://bili-toolkit-ppywmt0k7sa.qoder.website/#feedback> 填完直接提交，不用登录 GitHub。
   前端走同源 `POST /functions/v1/app?action=submit`，`functions/handler.mjs` 校验后把每条存成站点私有
   Storage 里的 `feedback/<uuid>.json`。站点**不开放列表与下载**，所以访客写得进、读不出（包括自己刚提的）；
   站主侧用后台文件工具 list / download / delete。
2. **反馈包** —— 在跑脚本的页面里：右下角 **B+** → **「关于」** → **「复制反馈包」**，再贴到 Issue
   <https://github.com/xiangyu123123/bili-toolkit/issues>。标题带上页面类型，例如
   `[动态页] 顶栏入口规则把导航删掉了`。

反馈包内容：版本、页面地址与站点前缀、窗口尺寸与 DPR、浏览器 UA、五个模块开关、每条净化规则在本页的命中数、
被本站自动停用了哪几条、顶栏修复策略与重叠像素、搜索框钉宽值、线路锁定与 P2P 拦截计数、主题设置。
**不含** Cookie、凭据、token、观看历史、私信内容；复制走剪贴板，脚本不发任何网络请求。

### Function 的输入边界

| 情况 | 结果 |
| --- | --- |
| 合法提交 | `201 {ok:true,id}` |
| `action` 不是 `submit` | `404 not_found` |
| `GET` / 其他方法 | `405 method_not_allowed`（`allow: POST`） |
| `Content-Type` 非 `application/json` | `415 invalid_content_type` |
| 请求体 > 8192 B | `413 invalid_body_size` |
| 非法 JSON / 非对象 | `400 invalid_json` |
| `page` 不在白名单（含 `../../etc` 这类） | `400 invalid_page` |
| `version` / `browser` 空、`content` < 5 字 | `400` 对应错误码 |
| 控制字符、超长字段 | 清洗 + 截断后接受（上限见 `LIMITS`） |
| 存储写入失败 | `503 save_failed`，**不自动重放** |

对象路径只由服务端用 `crypto.randomUUID()` 生成，浏览器给不出任何路径片段。

## 开发

```text
web/bili-toolkit.user.js   脚本本体（单文件，无构建步骤）
web/index.html             安装页 / 文档 / 反馈表单
web/assets/site.css        安装页样式
web/assets/site.js         安装页交互（复制、源码展开、版本读取、反馈表单提交）
functions/index.ts         Edge Function 入口：Deno.serve + 平台注入的 storage SDK
functions/handler.mjs      反馈校验与写入；storage 以参数注入，便于本地用假实现跑边界
tools/sandbox-check.mjs    无界面回归：在可触发事件的 DOM 桩里执行脚本
tools/serve-cors.py        本地静态服务（127.0.0.1:4174），用于把脚本注进真实页面
```

部署参数（Qoder Sites）：`webDirectory: "web"`、`functionDirectory: "functions"`、
`databaseAccess: "none"`。Function 运行时 `edge`、`authMode: anonymous`，写请求由网关做同源校验。
本地校验 `handler.mjs` 不需要 Deno 或凭据：把假 `storage` 直接传进去即可（见上面的边界表）。

跑回归（需要 Node，脚本用 `node:vm` 起沙箱，无第三方依赖）：

```bash
node tools/sandbox-check.mjs
# 末行形如：总计: 106/106 通过；同时写入 tools/last-run.txt
```

DOM 桩会模拟：元素树、`querySelector` 选择器匹配（含后代组合器）、`getComputedStyle` 读取注入样式表的 `display:none`、`getBoundingClientRect` 几何、可点击的 `click()`、`MutationObserver` 回调驱动、真实 `setInterval`。加新规则时请同时补断言 —— 这个项目里「离线全绿但真实页面是坏的」发生过不止一次。

## 隐私

- **脚本侧**：没有服务端、没有统计、没有第三方库、没有任何远程请求（除了 B 站自己下发的资源）。
  你主动点的「下载封面 / 复制直链 / 测速」除外 —— 测速只会对你这次拿到的 B 站地址发请求。
- **配置存储**：`GM_setValue`（无扩展存储时退到 `localStorage`）的 `btk.cfg.v1` 一个键下。
  线路候选地址表只存在内存，刷新页面即重新采集。
- **安装页的反馈表单**是唯一会把数据发出去的入口，且只发到本站自己的同源 Function；
  不接第三方分析、不写 Cookie、不做跨站请求。你不放心完全可以不用它，改用 Issue。

## 许可

MIT，见 [LICENSE](LICENSE)。
