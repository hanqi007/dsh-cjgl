/**
 * 审核规则定义 —— 纯数据，不含可执行逻辑。
 *
 * 单独拆出来的原因：
 *   这些规则的字面量里写着 `eval(`、`child_process`、`__proto__` 等特征串，
 *   如果和扫描逻辑放在同一个文件里，审核器扫自己时会把这些「检测特征」
 *   误判成「插件真的在调用」。拆成独立的数据模块后：
 *     - 扫描逻辑（index.js）里不再出现这些特征串
 *     - 这个文件由审核器显式跳过（它就是规则本身）
 *
 * 新增规则时只改这里，不改 index.js。
 */

/* 危险 API：命中就提示，具体看上下文 */
export const AUDIT_DANGER = [
  { re: /\beval\s*\(/, label: 'eval()', title: 'eval() 执行字符串', level: 'high',
    why: '把字符串当代码跑。',
    impact: '字符串只要来自用户输入或远程内容，攻击者就能让你执行任意代码——读文件、发请求、改配置。' },
  { re: /new\s+Function\s*\(/, label: 'new Function()', title: 'new Function() 动态建函数', level: 'medium',
    why: '运行时把字符串编译成函数。',
    impact: '效果类似 eval。构建脚本里用它（把配置字符串求值）很正常；产品代码里用就值得看一眼。' },
  { re: /child_process/, label: '子进程模块', title: '子进程模块调外部命令', level: 'medium',
    why: '插件能启动系统命令。',
    impact: '命令里拼进用户输入就可能被注入成任意命令。固定命令（tar/git）无害。' },
  { re: /\bexec\s*\(|\bexecSync\s*\(|\bspawn\s*\(|\bexecFileSync\s*\(/, label: 'exec/spawn', title: 'exec/spawn 执行进程', level: 'medium',
    why: '同上，看执行的命令是不是固定值。',
    impact: '固定命令无害；命令或参数来自变量时可能被利用。' },
  { re: /new\s+WebSocket\s*\(/, label: 'WebSocket', title: 'WebSocket 长连接', level: 'medium',
    why: '能和服务端保持双向通信。',
    impact: '如果连外部地址，可能持续把本地数据往外发。' },
  { re: /document\.cookie/, label: 'document.cookie', title: '读取 Cookie', level: 'high',
    why: '能拿到当前站点的 Cookie。',
    impact: 'Cookie 里常有登录态，被读走等于账号被接管。正常插件不该碰。' },
  { re: /atob\s*\(\s*[^)]*\)\s*;?[^\n]*eval/, label: 'atob+eval', title: 'base64 解码后执行', level: 'high',
    why: '先解码再当代码跑。',
    impact: '典型的混淆手法，正常代码用不着这样，看到就该警惕。' }
]

/* 后门与数据外传的特征规则。
   和 AUDIT_DANGER 的区别：那些是「有能力」，这些是「像在干坏事」。 */
export const BACKDOOR_RULES = [
  { re: /\beval\s*\(\s*(?:await\s+)?(?:fetch|axios|https?\.|request|got)\s*\(/, label: 'eval+网络',
    title: '拿网络返回的字符串直接 eval', level: 'critical',
    why: '远程内容当代码执行。',
    impact: '服务端返回什么就执行什么——等于把机器交给对方。正常插件绝不会这么写。' },
  { re: /\bnew\s+Function\s*\([^)]*(?:fetch|axios|https?\.|request)/, label: 'Function+网络',
    title: '拿网络内容动态建函数', level: 'critical',
    why: '同 eval+网络。', impact: '一样是远程代码执行。' },
  { re: /\brequire\s*\(\s*['"]https?:\/\//, label: 'require远程',
    title: 'require 远程模块', level: 'critical',
    why: '从 URL 加载模块。', impact: '加载什么完全由对方决定。' },
  { re: /\bimport\s*\(\s*['"]https?:\/\//, label: 'import远程',
    title: '动态 import 远程模块', level: 'critical',
    why: '从 URL 加载模块。', impact: '同上。' },
  { re: /(?:exec|execSync|execFile|execFileSync|spawn|spawnSync)\s*\([^)]{0,80}['"`](?:curl|wget|nc|ncat|bash|sh)\b[^)]{0,120}(?:\||\/dev\/tcp|\s-i\b|\s-e\b)/,
    label: '反弹shell', title: '疑似反弹 Shell', level: 'critical',
    why: '在 exec/spawn 的参数字符串里出现 curl/wget/nc/bash 连管道或 /dev/tcp。',
    impact: '这是后门最典型的手法：把机器主动连到攻击者。' },
  { re: /(?:readFile|readFileSync|createReadStream)\s*\([^)]*(?:\.ssh|id_rsa|id_ed25519|\.npmrc|\.pgpass|\.aws|\.git-credentials|\.docker\/config|shadow|passwd)/,
    label: '读凭据文件', title: '读取凭据文件', level: 'critical',
    why: '直接读 SSH 私钥、npm token、云凭据这类文件。',
    impact: '读出来只有一个用途——外传。正常插件的合法场景极少。' },
  { re: /process\.env\s*[\[.]\s*['"`]?\w*(?:TOKEN|API_?KEY|SECRET|PASSWORD|CREDENTIAL|AUTH)/i,
    label: '读环境凭据', title: '读取环境变量里的凭据', level: 'high',
    why: '拿到部署在环境里的密钥。',
    impact: '合法插件也会读（比如拿 API Key 调模型），但配合外传就不对劲了。' },
  { re: /\bcrontab\b|(?:^|[\/\s'"`])\.bashrc(?:$|[\s'"`])|(?:^|[\/\s'"`])\.zshrc(?:$|[\s'"`])|(?:^|[\/\s'"`])\.profile(?:$|[\s'"`])|\/etc\/systemd|LaunchAgents/,
    label: '持久化', title: '写入开机自启 / 计划任务', level: 'high',
    why: '让代码在重装插件后依然运行。',
    impact: '正常插件卸载就该干净，写自启动留后门。' },
  { re: /\bchmod\s+0?777/, label: 'chmod777', title: '把文件权限放到最宽（777）', level: 'medium',
    why: '任何人都能改这个文件。', impact: '常被用来给后门留可写的落脚点。' },
  { re: /[A-Za-z0-9+\/]{300,}={0,2}[\s\S]{0,200}(?:eval|new\s+Function)\s*\(/,
    label: '长base64+执行', title: '超长 base64 后紧接着执行', level: 'critical',
    why: '典型的混淆执行壳。', impact: '把载荷藏成一大段 base64，运行时才解开跑。' },
  { re: /(?:\\x[0-9a-fA-F]{2}){30,}/, label: '十六进制载荷', title: '大段十六进制编码的字符串', level: 'high',
    why: '混淆代码。', impact: '正常代码不需要把整段逻辑写成 \\xNN。' },
  { re: /(?:atob\s*\([^)]*\)[\s\S]{0,200}(?:eval|new\s+Function)\s*\(|(?:eval|new\s+Function)\s*\(\s*(?:await\s+)?atob\s*\()/,
    label: 'atob执行', title: 'base64 解码后立即执行', level: 'critical',
    why: '同 base64 执行壳。', impact: '一样是隐藏载荷。' },
  /* ── 供应链 / 运行时投毒 ────────────────────────────────── */
  { re: /["']postinstall["']\s*:\s*["'][^"']*(?:curl|wget|Invoke-WebRequest|node\s+-e|bash\s+-c|powershell)[^"']*["']/i,
    label: 'postinstall投毒', title: '安装脚本里下载并执行远程内容', level: 'critical',
    why: 'package.json 的 postinstall 直接拉远程脚本执行。',
    impact: '`npm install` 那一刻就会跑起来——用户还没打开插件，机器就已经被控。' },
  { re: /\b(?:__proto__)\s*(?:\[\s*['"][^'"]+['"]\s*\]|\.\s*\w+)\s*=/,
    label: '原型链污染', title: '直接改写 __proto__', level: 'high',
    why: '给 Object 原型加属性。',
    impact: '被用来污染所有对象的默认行为，常见于绕过鉴权或注入配置；正常插件不需要这么做。' },
  { re: /Object\.prototype\s*\[\s*['"][^'"]+['"]\s*\]\s*=/,
    label: '改原型', title: '改写 Object.prototype', level: 'high',
    why: '同上，换一种写法。',
    impact: '一次污染，全局生效。' },
  { re: /for\s*\(\s*(?:const|let|var)?\s*\w+\s+in\s+process\.env\s*\)[\s\S]{0,300}(?:fetch|axios|https?\.request|net\.connect)\s*\(/,
    label: 'env批量导出', title: '遍历环境变量并发往网络', level: 'critical',
    why: '把整个 process.env 打包外发。',
    impact: '环境变量里通常有 API Key、数据库口令、CI 令牌——逐个挑太慢，遍历就是一次性全拿走。' }
]

/* 外部 URL 判定：这些域名算「正常引用」 */
export const AUDIT_OK_HOST = [
  'w3.org', 'github.com', 'githubusercontent.com', 'npmjs.com', 'npmjs.org',
  /* npm 镜像：包管理与元数据查询的必要来源 */
  'npmmirror.com', 'tencent.com', 'tsinghua.edu.cn',
  'deepseek.com', 'localhost', '127.0.0.1', 'schema.org', 'json-schema.org',
  'opensource.org', 'apache.org', 'mozilla.org'
]

/* 固定用途的外部命令：第一个参数是字面量、且在这个名单里，视为合理用途 */
export const SAFE_EXEC_CMDS = [
  'tar', 'git', 'node', 'node.exe', 'npm', 'npm.cmd', 'npx', 'npx.cmd',
  'python', 'python.exe', 'python3', 'where', 'where.exe',
  /* 打开文件夹：只是唤起系统文件管理器，不接受任意命令 */
  'explorer', 'explorer.exe', 'open', 'xdg-open',
  /* DSH 自己的 CLI：用来装插件，包名有正则校验 */
  'dsh', 'dsh.cmd', 'dsh.exe'
]

/* 依赖混淆检测用的知名包名单 */
export const POPULAR_NAMES = [
  'lodash', 'react', 'react-dom', 'express', 'axios', 'request', 'chalk',
  'debug', 'moment', 'webpack', 'typescript', 'node-fetch', 'uuid',
  'dotenv', 'commander', 'yargs', 'cheerio', 'puppeteer', 'electron'
]

/* 组合检测用的正则：这些也必须放在数据文件里，
   否则它们出现在 index.js 中时会被自己的规则命中。 */
export const COMBO_RULES = {
  /* 有动态执行能力 */
  dynamicExec: /\beval\s*\(|new\s+Function\s*\(/,
  /* 读敏感文件 */
  readsSensitive: /(?:readFile|readFileSync|createReadStream)\s*\([^)]*(?:\.ssh|id_rsa|id_ed25519|\.npmrc|\.pgpass|\.aws|\.git-credentials|\.docker[\/\\]config|shadow|passwd)/,
  /* 发网络请求 */
  sendsOut: /(?:\bfetch\s*\(|\baxios(?:\.|\s*\()|https?\.request\s*\(|\bnet\.connect\s*\(|new\s+WebSocket\s*\()/
}
