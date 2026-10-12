# 梦想家（mengxiangjia）开发说明

SillyTavern 第三方扩展：按角色人设盖一个用户和角色共同的家，一起布置；角色会回家、和用户互动、回小纸条。每个角色一个家。

## 作者的规矩（每次都要遵守）

- **不加会让生成失败的限制或校验。** 模型返回缺字段、格式不对时用默认值兜底，能用的部分照常用；只有完全没有正文时才报错。
- **不限制温度。** 温度只做 0–2 的接口范围钳制，不另外压低或封顶。
- **界面和 README 里不写任何具体的接口名、模型名、服务商名**，输入框占位只写「API 地址」「模型 ID」这类通用词。
- **「有入口就能点进去」**：界面上画成按钮、标签、卡片等看起来能点的东西，必须真的能打开对应内容；还没做的功能不放入口。
- **入口是魔法棒菜单里的「梦想家」**，扩展设置里另有一个「打开梦想家」按钮和副 API 设置。
- 酒馆的 `menu_button` 在窄屏的竖排容器里会变成竖排文字，放进抽屉的按钮要加 `writing-mode: horizontal-tb` 和 `white-space: nowrap`（已写在 style.css）。
- **三处都要能用**：PC 浏览器、手机浏览器访问的（云）酒馆、TT（TauriTavern，iOS WebView）。手机优先：触控目标 ≥44px，面板按 visualViewport 定尺寸。
- **每次发版都更新 README**：在最上面加 `## 版本号 标题`，下面只写这次的变动，用作者看得懂的话，不写代码细节。插件设置页的「更新日志」读的就是 README 里第一个 `##` 段落。
- **发版打包**（作者要 zip 时）：根目录只放运行文件——`manifest.json`、`index.js`、`style.css`、`README.md`、`src/`。不放 `.github`、测试脚本、CLAUDE.md，README 里也不要写「没有工作流」之类的话。
- **推送**：作者让直接推到 `main`（2026-10）。
- 不从外网加载字体（国内用户访问不了），字体都用系统字体栈。

## 版本号

改版本时三处一起改，否则酒馆会缓存旧模块：

1. `manifest.json` 的 `version`，以及 `js`、`css` 后面的 `?mxj=版本`
2. 所有相对路径 import 的 `?mxj=版本`（`index.js` 和 `src/*.js`，包括动态 `import()`）
3. README 新增的 `## 版本` 段落

批量改 import 可以用：

```bash
python3 - <<'EOF'
import re, pathlib
ver = '0.3.0'
pat = re.compile(r"""((?:from\s+|import\s*\(\s*)['"])(\.{1,2}/[^'"?]+\.js)(?:\?mxj=[^'"]*)?(['"])""")
for p in [pathlib.Path('index.js'), *pathlib.Path('src').glob('*.js')]:
    t = p.read_text()
    p.write_text(pat.sub(lambda m: m.group(0) if m.group(2).startswith('../../') else f"{m.group(1)}{m.group(2)}?mxj={ver}{m.group(3)}", t))
EOF
```

（指向酒馆本体的 `../../../../../script.js` 不加版本号。）

## 结构

| 文件 | 作用 |
| - | - |
| `index.js` | 入口：魔法棒菜单项、扩展设置里的打开按钮、`CHAT_CHANGED` 监听；界面模块按需动态加载 |
| `src/settings.js` | 设置默认值与读写；每个角色的家存在 `extension_settings.mengxiangjia.homes[角色头像文件名]` |
| `src/api.js` | 生成通道：跟随当前 API（`ctx.generateRaw`），或副 API（酒馆连接配置 `ConnectionManagerRequestService.sendRequest` / 手动接口经 `/api/backends/chat-completions/generate` 转发）。副 API 出错直接报，不退回主 API |
| `src/character.js` | 读角色卡、用户人设、角色世界书（`/api/worldinfo/get`）、最近聊天 |
| `src/home.js` | 家的数据和所有生成：盖房子、回家、回应、纸条回信、布置改动记录、「他挑的」、按描述做家具 |
| `src/furniture.js` | 家具图库（`CATALOG` + 每种的 SVG 画法）、房间正面图绘制、平面图、小预览 |
| `src/apiSettings.js` | 扩展设置抽屉里的 API 设置（用酒馆自己的 text_pole / menu_button 样式），和面板设置读写同一份 |
| `src/sprite.js` | Q 版像素小人：16×24 像素格，按形象数据画；`poseFor` 按家具和他在做的事定站/坐/拿书/拿杯/闭眼 |
| `src/decorate.js` | 布置模式：拖动吸附、工具条、抽屉、仓库、墙面地板颜色、撤销重做 |
| `src/ui.js` | 全屏 `<dialog>` 面板与各页面：首页、盖房子、纸条、回家记录、设置 |
| `src/util.js` | 小工具，含宽松 JSON 解析 `parseJsonLoose` |
| `style.css` | 全部样式限定在 `#mxj-root` 内；已经抵消了酒馆全局对 button/input/select/checkbox 的主题样式 |

只用 `SillyTavern.getContext()` 拿宿主能力，不静态 import 酒馆模块。

### 家的数据（`homes[key]`）

- `house`：`name`、`story`、`size`、`palette{wall,floor,accent,trim}`、`rooms[{id,name,note,wall,floor,arranged}]`、`furniture[{id,type,name,room,x(0–100),color,by:'ai'|'user'|'char',z,row,flip,scale,dy}]`、`storage[]`
- `presence`：`atHome`、`activity`、`mood`、`spot`（家具 id）
- `visits[]`：每次回家 `{event, options, turns[{user,reply}]}`，最多留 40 次
- `notes[]`：`{from:'user'|'char', kind, place, text, at, deferred, readAt, replyTo, replyId}`，最多留 300 张
- `changes[]` + `changesSeenAt`：用户布置的改动，回家时写进提示词
- `suggestions`：「他挑的」当前结果
- `look`：像素小人形象 `{hairStyle, hair, skin, eyes, outfit, accent, pants, shoes, accessory}`；没有时按名字给默认样子
- `diary`：`{mode:'visit'|'daily'|'manual', entries[{author, date, weather, text, quote, stamp}], readAt}`。mode 为 visit 时，他的日记并在回家那次调用里一起生成

房间 `arranged` 为真后完全按用户摆的位置画；否则自动排开防重叠。

### 界面要点

- 面板是挂在 `body` 上的 `<dialog>` + `showModal()`，尺寸跟 `visualViewport`（CSS 变量 `--mxj-vw/vh/vl/vt`），TT 下加 `data-tt-mobile-surface`。
- 事件用 `data-act` 委托；输入用 `data-field`。改界面后调用 `render()`，需要保留滚动位置时先设 `state.keepScroll = true`。
- 生成一律走 `run(提示文字, signal => …)`，自带忙碌条和「取消」。

## 待定

- 交换日记里「贴一张图」：图片怎么存还没定（只存本机浏览器 / 用柏宝绘生成 / 不做），做之前先问作者。入口没放。

## 调用次数

每个动作一次调用：盖房子（含像素小人外形）、回家（含纸条回信、他留的纸条、轮到他时的日记）、每次回应、纸条马上回、他挑的、描述做家具、重新生成形象、叫他写日记。打开小屋本身不调用；只有到了回家时间才会触发回家那一次。

## 测试

这个仓库里没有测试脚本。之前的做法是：用一个模拟页面，加载酒馆 `public/style.css` 和 `public/css/popup.css`，提供假的 `SillyTavern.getContext()`、假的 `/api/backends/chat-completions/generate` 和 `/status`；然后用 Playwright 以 390×844 手机尺寸、触摸模式跑完整流程并截图。能连上真实酒馆时，优先在真实酒馆里测。作者不接受只靠模拟测试全绿就宣布手机兼容；涉及手机或 TT 的问题，要找到真实原因。
