# dsh-cjgl

DSH 的**启动与插件管理器**（"cjgl" = 插件管理）。在设置页里列出当前 profile 的所有插件，逐个开关；
每张卡片右下角有「管理」，点开是这个插件的独立配置详情。

## 两类插件

- **开机动画** —— 互斥。这类插件靠往 `index.html` 注入首屏生效，同时开两个会两个根节点、两套 CSS、
  两段动画一起上。启用一个会自动把其他开机动画停用。
- **其他插件** —— 各自独立，**可以同时开任意多个**，互不影响。

管理器自己也在列表里（标记 `self`），不可停用。

## 界面

设置 →「启动与插件」：

| 位置 | 内容 |
|---|---|
| 卡片正文 | 包名、版本、状态徽章、描述、**设置面板名**（如「开机动画」） |
| 卡片左下 | 启用 / 停用（点即写入） |
| **卡片右下** | **管理** —— 展开该插件的独立详情 |
| 详情面板 | 包名、版本、状态、设置面板名、**独立配置文件路径**、启用/停用并应用 |
| 顶部 | 多个开机动画同时启用时告警 |
| 底部 | 刷新、profile 路径 |

点「管理」后展开的详情里，可以直接看到这个插件有没有自己的配置文件（如
`~/.dsh/hdd-console.json`），以及它在设置侧栏叫什么名字，方便跳到对应设置页。

## 独立配置页

点卡片右下角「管理」后，打开的是这个插件自己的配置页（不是一小段说明），布局与插件原生设置页一致：

- 顶部：`← 返回列表`、包名、版本、状态徽章
- 配置文件路径（如 `~/.dsh/dsh-startup.json`）
- 表单：按字段 schema 渲染成复选框 / 下拉 / 数字框 / 文本框 / 取色器 / JSON 文本域
- 底部：保存、取消、保存结果提示

字段从哪来：

| 插件 | 来源 |
|---|---|
| `dsh-startup-screen` | 内置中文 schema（33 项：播放时机、速度、身份、主题、语音、品牌文案、色散色…） |
| `hdd-console-boot` | 内置中文 schema（17 项：操作员、设备代号、启动语、音量、强调色…） |
| 其他插件 | 读它的配置文件，按 JSON 值类型自动推断（布尔→复选框、数字→数字框、字符串→文本框、对象→JSON） |

字段的**默认值**也会一起显示：即使插件配置文件里还没写这一项，配置页也会用插件本身的默认值补上（`dsh-startup-screen` 33 项、`hdd-console-boot` 17 项全部有默认值），改动后保存即落盘。\n\n保存时只接受 schema 里声明过的键，其余忽略；写前备份 `.bak`，写入是 `tmp + rename`。

中文按 UTF-8 原样落盘（已用码点验证：`寒语` → `0x5bd2 0x8bed`）。

## 启用后怎么生效

- 点击「启用并应用 / 停用并应用」→ **立刻写入** profile 的 `dsh.profile.bundles`，面板即时更新
- **开机动画**：刷新页面即可看到（Host 路由已加载的情况下）
- **其他插件**：bundle 在应用启动时组装，需要重启应用才会加载/卸载

面板里每一步都写明了这一点，不做「假装已经生效」的假象。

## 怎么识别

从 profile 的 `dependencies` 出发，逐个读 `node_modules/<name>/package.json`：

- **开机动画**：包名匹配 `startup` / `splash` / `boot`，或描述/关键词提到启动动画类词汇
- **其他插件**：其余能读到 `package.json` 的包
- **设置面板名**：从插件浏览器半侧源码里匹配 `settings.section` 附近的 `label: '...'`
- **配置文件**：按约定探测 `~/.dsh/<包名>.json`、去掉 `dsh-` 前缀、去掉 `-boot/-manager/-startup/-screen` 后缀

## 安全边界

| 规则 | 说明 |
|---|---|
| 只改一处 | 仅 profile `package.json` 的 `dsh.profile.bundles` |
| 不动依赖 | `dependencies` 不增不删，不跑 pnpm，不安装、不删除任何包 |
| 核心保护 | `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app` 拒绝操作 |
| 自身保护 | 管理器不能停用自己 |
| 名字白名单 | 只接受扫描出来的名字 |
| 原子写入 | 先备份 `.bak`，再 `tmp + rename` |

## 管理器版本下载

管理器绑定自己的仓库 [`hanqi007/dsh-cjgl`](https://github.com/hanqi007/dsh-cjgl)，可以在面板里直接选版本下载：

- 设置 →「启动与插件」→「管理器版本」→「读取仓库版本」
- 会列出仓库 `dist/` 下所有 `dsh-cjgl-*.tgz`，按版本号倒序
- 每行显示版本号、包大小；当前版本标「当前」
- 点「下载」→ 从 GitHub 拉取该版本 → 写入 `~/.dsh/packages/` → 更新 `dependencies` 指向新包 → 解压覆盖自身

接口：

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/dsh-cjgl/versions` | 列出仓库 dist 里的版本 |
| POST | `/dsh-cjgl/install-version` | 下载并安装指定版本 |

注意：

- 安装的是**管理器自身**，覆盖当前文件，重启应用后生效
- 下载源是 `raw.githubusercontent.com`，需要能访问该域
- 只接受 `x.y.z` 格式的版本号

## 安装来源与重新下载

管理器会在扫描时自动记下每个插件的**安装包路径**（`dependencies` 里的 `file:` 来源），存进 `~/.dsh/dsh-cjgl.json` 的 `sources`：

```json
{
  "sources": {
    "dsh-startup-screen": "C:/Users/hanlin/.dsh/packages/dsh-startup-screen-1.2.0.tgz",
    "hdd-console-boot": "C:/Users/hanlin/.dsh/packages/hdd-console-boot-1.1.0.tgz"
  }
}
```

第一次发现某个插件时（`sources` 里还没有它），面板顶部会给出「**检测到新插件（来源已记录）**」提示，并为每个新插件提供一个「**重新下载 xxx**」按钮：

- 点它 → 按记录的路径重新解压安装（相当于重装）
- 不点 → 保持现状，记录仍然保留

每个插件的详情里（点「管理」）也会显示「安装来源」路径，鼠标悬停可看完整路径。

这样即使 `node_modules` 被清空、或者包文件被改坏，也能凭记录把插件恢复回来。

## 兼容范围

管理器尽量把所有「装着的东西」都列出来，而不是只认自己人：

| 来源 | 是否列出 |
|---|---|
| `dependencies` 里的包 | ✅ |
| `dsh.profile.bundles` 里出现、但没写进 dependencies 的包 | ✅（标 `仅 bundles`） |
| 核心 bundle（dsh-base / dsh-web-app） | ❌ 受保护，不列 |
| `node_modules` 里但既不在依赖也不在 bundles 的包 | ❌ 不列（避免把整棵依赖树列出来） |

容错：

- `package.json` 带 UTF-8 BOM 也能解析（读入时自动剥掉）
- 解析失败或文件缺失的包仍会列出，标 `文件缺失`，可以卸载/重装但不能启用
- 开机动画识别按包名（startup/splash/boot）与描述/关键词，不依赖固定包名

## 重装插件

每张插件卡片（**包括管理器自己**）都有「**重装**」按钮。行为：

1. 从 `dependencies` 读该包的 `file:` 路径
2. 删除 `node_modules/<包名>` 目录
3. 用 `tar -xzf` 把 tgz 解压到临时目录，再把 `package/` 移入 `node_modules/<包名>`
4. 重新读取装好的版本号返回

适用场景：包文件被改坏、想恢复官方原版、或者切换版本后想强制刷新。

注意：

- 只支持 `file:` 形式的依赖（本地上传的 tgz），不支持 npm 仓库形式的包
- 重装**不会**改 `package.json` 的依赖声明、也不会动 `bundles`
- 重装管理器自身时，正在运行的代码在内存里不受影响，重启后才会用新文件

## 卸载插件

每张插件卡片右下角（「管理」旁边）有「**卸载**」按钮，点击后二次确认，然后：

1. 从 `dependencies` 移除该包
2. 从 `dsh.profile.bundles` 移除
3. 删除 `node_modules/<包名>` 目录
4. 删除 `pnpm-lock.yaml`（下次安装时由 pnpm 重建）

写回前备份 `package.json.bak`，写入仍是 tmp + rename。

保护规则：

| 对象 | 结果 |
|---|---|
| 核心 bundle（dsh-base / dsh-web-app） | 拒绝 |
| 管理器自身（dsh-cjgl） | 拒绝 |
| 不在扫描列表里的名字 | 拒绝 |

删除后需要**重启应用**才彻底生效（运行中的模块不会立即卸载）。

## 插件健康检查

设置页底部有「检查」按钮，点击调用 `GET /dsh-cjgl/check`，逐个插件核对：

| 检查项 | 说明 |
|---|---|
| 包目录 | `node_modules/<name>` 是否存在 |
| package.json | 能否解析 |
| 配置文件 | JSON 是否损坏（未创建则标注「使用默认值」） |
| 已启用 | 是否在 bundles 里 |

报告会列出每个插件的结果，并对「多个开机动画同时启用」「核心 bundle 缺失」给出告警。

## 新开机动画默认不启用

`dsh plugin add` 会把新装的开机动画写进 `dsh.profile.bundles`，导致它自动抢首屏。管理器对此做了两件事：

- **默认停用**：打开管理器时，凡是不在 `confirmedBoots` 名单里的开机动画，都会被自动移出 bundles，并在面板顶部提示「已自动停用新检测到的开机动画：xxx」
- **手动确认**：点面板里的「使用 xxx」按钮，才会把它登记进 `confirmedBoots` 并启用（其他开机动画自动停用）

配置项 `autoEnableNewBoot`（默认 `false`）控制这个策略；改成 `true` 就回到「装了什么就启用什么」的原生行为。

`~/.dsh/dsh-cjgl.json`：

```json
{
  "autoUpdate": false,
  "confirmedBoots": [],
  "autoEnableNewBoot": false
}
```

接口：

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/dsh-cjgl/list` | 扫描插件、返回状态（并执行默认停用） |
| GET | `/dsh-cjgl/check` | 健康检查报告 |
| POST | `/dsh-cjgl/confirm-boot` | 确认使用某个开机动画 |
| POST | `/dsh-cjgl/toggle` | 启用 / 停用 |
| POST | `/dsh-cjgl/config` | 读写管理器配置 |
| GET | `/dsh-cjgl/update` | 检查管理器自身更新 |

## 自动更新（默认关闭）

设置 →「启动与插件」→ 更新：

- 默认不勾；开启后最多 24 小时查一次 GitHub 上的版本
- 只提示「发现 vX.Y.Z，去 GitHub 下载」，**不自动下载或替换插件**
- 状态存 `~/.dsh/dsh-cjgl.json`（默认 `{"autoUpdate": false}`）

## 安装

```bash
dsh plugin --profile desktop add ./dsh-cjgl-2.0.0.tgz
# 或 web profile
dsh plugin --profile web add ./dsh-cjgl-2.0.0.tgz
```

装完重启应用，设置页会多出「启动与插件」。

> 从 `boot-animation-manager` 升级时：先装 `dsh-cjgl`，再移除旧包，避免两个管理器同时在线。

## 环境要求

| 项 | 要求 |
|---|---|
| 平台 | DSH web / desktop profile |
| Node | >= 20 |
| 依赖 | 无 |

## 测试

```bash
node test/smoke-host.mjs    # 扫描两类 / 互斥 / 其他插件可多开 / 保护名单 / 配置开关 / 设置名与配置文件探测
node test/smoke-panel.mjs   # 面板：三分区 / 卡片 / 管理按钮展开详情 / 空态 / 警告
```

当前全绿：55 + 36 = 91 项。

## License

MIT
