/**
 * dsh-cjgl — 启动与插件管理器
 * Copyright 2026 hanlin (hanqi007)
 *
 * Licensed under the Apache License, Version 2.0, with additional terms:
 *   - Apache 2.0 full text .... LICENSE
 *   - Additional restrictions . LICENSE-CUSTOM.md
 *
 * 允许免费使用与分发；不得以本软件为收费主体，
 * 也不得在自身不是收费主体的前提下进行收费分发。
 * Free to use and distribute, but you may not charge for the software
 * itself, nor charge for distributing it.
 */
﻿/* ============================================================================
 * boot-animation-manager — Host 半侧
 * ----------------------------------------------------------------------------
 * 管理当前 profile 里的插件，分两类：
 *
 *   开机动画   靠往 index.html 注入首屏生效。同时启用多个会打架，所以切换时
 *              互斥：启用一个就把其他开机动画从 bundles 里移除。
 *   其他插件   各自独立开关，**允许同时启用任意多个**。停用只是从 bundles 里
 *              移除，包仍然装着，随时能开回来。
 *
 * 安全边界：
 *   - 只改 profile package.json 的 dsh.profile.bundles
 *   - 不动 dependencies、不跑 pnpm、不安装、不删除任何包
 *   - 核心 bundle（dsh-base / dsh-web-app）与管理器自身拒绝停用
 *   - 写回前备份 .bak，写回是 tmp + rename 原子替换
 *   - 只接受扫描出来的名字，其他一律拒绝
 *
 * 自动更新：默认关闭。开了最多 24 小时查一次 GitHub 上的版本，只提示、不替换。
 * ========================================================================== */

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SELF = 'dsh-cjgl'
const ROUTE_BASE = '/dsh-cjgl'

const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const CONFIG_FILE = path.join(DSH_HOME, 'dsh-cjgl.json')

/* 这两个 bundle 是应用的地基，停用会直接打不开界面 */
const PROTECTED = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']

/* 管理器自己的更新来源：同一个仓库里的 boot-manager 目录 */
const UPDATE_REPO = 'hanqi007/dsh-cjgl'
/* 紧急安全公告的共用仓库：只在出现共同漏洞、需要紧急补丁时才更新。
   三个插件都读它，常规版本更新仍然走各自的 UPDATE_REPO。 */
const SECURITY_REPO = 'hanqi007/zjhqgx'
const SECURITY_URL = 'https://api.github.com/repos/' + SECURITY_REPO + '/contents/security.json'
const SEVERITY = ['low', 'medium', 'high', 'critical']
const UPDATE_PATH = 'package.json'
const UPDATE_TTL = 10 * 60 * 1000

/**
 * 更新通道 → Git 分支：
 *   stable  → main（正式版）
 *   beta    → dev（测试版）
 *   preview → yl（预览版）
 * 所有从 GitHub 拉包、查版本的地方都走它，切通道即切分支。
 */
function branchOf(channel) {
  if (channel === 'beta') return 'dev'
  if (channel === 'preview') return 'yl'
  return 'main'
}

function currentBranch() {
  try { return branchOf(readCfg().channel) } catch (err) { return 'main' }
}

const PLUGIN_VERSION = (() => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'))
    return String(pkg.version || '').trim() || '0.0.0'
  } catch (err) {
    return '0.0.0'
  }
})()

/* ── 配置 ──────────────────────────────────────────────────────────────── */
function readCfg() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    return {
      autoUpdate: raw && raw.autoUpdate === true,
      confirmedBoots: Array.isArray(raw && raw.confirmedBoots)
        ? raw.confirmedBoots.filter((x) => typeof x === 'string')
        : [],
      /* 默认 false：新检测到的开机动画不自动启用 */
      autoEnableNewBoot: raw && raw.autoEnableNewBoot === true,
      /* 默认开机动画：只做标记，不自动启用；被卸载时自动清空 */
      defaultBoot: raw && typeof raw.defaultBoot === 'string' ? raw.defaultBoot : '',
      /* 每个插件的安装来源（dependencies 里的 file: 路径），首次扫描时自动补齐 */
      sources: (raw && raw.sources && typeof raw.sources === 'object' && !Array.isArray(raw.sources))
        ? raw.sources
        : {},
      /* 每个插件的重装/更新源：local（只用本地包）或 remote（每次从仓库下载） */
      sourceMode: (raw && raw.sourceMode && typeof raw.sourceMode === 'object' && !Array.isArray(raw.sourceMode))
        ? raw.sourceMode
        : {},
      /* 收录的仓库路径：安装/扫描时从插件包内的 repository 字段自动记下来 */
      repos: (raw && raw.repos && typeof raw.repos === 'object' && !Array.isArray(raw.repos))
        ? raw.repos
        : {},
      /* 启动时跳过开机动画 */
      skipBoot: raw && raw.skipBoot === true,
      /* 更新通道：stable（main）/ beta（dev）/ preview（yl） */
      channel: raw && raw.channel === 'beta' ? 'beta'
        : (raw && raw.channel === 'preview' ? 'preview' : 'stable')
    }
  } catch (err) {
    return { autoUpdate: false, confirmedBoots: [], autoEnableNewBoot: false, defaultBoot: '', sources: {}, sourceMode: {}, repos: {}, skipBoot: false, channel: 'stable' }
  }
}

function writeCfg(patch) {
  const next = Object.assign(readCfg(), patch && typeof patch === 'object' ? patch : {})
  next.autoUpdate = next.autoUpdate === true
  next.autoEnableNewBoot = next.autoEnableNewBoot === true
  next.confirmedBoots = Array.isArray(next.confirmedBoots)
    ? next.confirmedBoots.filter((x) => typeof x === 'string')
    : []
  next.defaultBoot = typeof next.defaultBoot === 'string' ? next.defaultBoot.trim() : ''
  next.sources = (next.sources && typeof next.sources === 'object' && !Array.isArray(next.sources))
    ? next.sources
    : {}
  next.sourceMode = (next.sourceMode && typeof next.sourceMode === 'object' && !Array.isArray(next.sourceMode))
    ? next.sourceMode
    : {}
  next.repos = (next.repos && typeof next.repos === 'object' && !Array.isArray(next.repos))
    ? next.repos
    : {}
  next.skipBoot = next.skipBoot === true
  next.channel = next.channel === 'beta' ? 'beta'
    : (next.channel === 'preview' ? 'preview' : 'stable')
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true })
  const tmp = CONFIG_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', 'utf8')
  fs.renameSync(tmp, CONFIG_FILE)
  return next
}

/** <profile>/node_modules/boot-animation-manager/lib → <profile> */
function profileDir() {
  /* 测试与特殊部署可以用 DSH_PROFILE_DIR 指到别处；正常情况从包位置反推 */
  if (process.env.DSH_PROFILE_DIR) return path.resolve(process.env.DSH_PROFILE_DIR)
  return path.resolve(PACKAGE_ROOT, '..', '..')
}

function readJson(file) {
  try {
    let text = fs.readFileSync(file, 'utf8')
    /* 容错：有些包（或被其它工具改过的 package.json）带 UTF-8 BOM，JSON.parse 会直接失败 */
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
    return JSON.parse(text)
  } catch (err) {
    return null
  }
}

/**
 * 是不是「开机动画」：包名关键词优先，其次看描述/关键词。
 * 这类插件通常都注入首屏，所以需要互斥。
 */
function isBootPlugin(name, meta) {
  if (!name || name === SELF) return false
  if (/startup|splash|boot/i.test(name)) return true
  const text = [
    meta && meta.description,
    meta && Array.isArray(meta.keywords) ? meta.keywords.join(' ') : ''
  ].filter(Boolean).join(' ')
  return /启动动画|开机动画|启动界面|startup animation|boot animation|splash/i.test(text)
}

/**
 * 从插件的浏览器半侧源码里找它注册设置面板时用的 label。
 * 只做静态正则匹配（label: '开机动画'），拿不到就返回空串——
 * 用来在管理器里告诉用户「这个插件在设置侧栏叫什么」。
 */
function settingsLabelOf(dir, name, meta) {
  try {
    let entry = 'lib/client.js'
    if (meta && meta.exports && meta.exports['./client']) {
      const e = meta.exports['./client']
      entry = typeof e === 'string' ? e : (e && (e.import || e.default)) || entry
    }
    entry = String(entry).replace(/^\.\//, '')
    const file = path.join(dir, 'node_modules', name, entry)
    const src = fs.readFileSync(file, 'utf8').slice(0, 200000)
    /* 只认 settings.section 注册附近的 label，否则会误抓字段标签（如「中文主字」） */
    const m = src.match(/settings\.section[\s\S]{0,240}?label:\s*['"]([^'"]+)['"]/)
    return m ? m[1] : ''
  } catch (err) {
    return ''
  }
}

/** 探测某个插件的独立配置文件（约定都放在 DSH_HOME 下，名字各不相同）。 */
function configFileOf(name) {
  const base = String(name || '').replace(/^@[^/]+\//, '')
  const stem = base.replace(/^dsh-/, '')
  const candidates = [
    path.join(DSH_HOME, base + '.json'),
    path.join(DSH_HOME, stem + '.json'),
    path.join(DSH_HOME, stem.replace(/-(boot|manager|startup|screen)$/, '') + '.json'),
    path.join(DSH_HOME, base.replace(/-(boot|manager|startup|screen)$/, '') + '.json')
  ]
  const seen = {}
  for (const f of candidates) {
    if (seen[f]) continue
    seen[f] = 1
    try { if (fs.statSync(f).isFile()) return f } catch (err) { /* 不存在 */ }
  }
  return ''
}

/** 目录/文件的最后修改时间（ISO），读不到返回空串 */
function statTimeOf(target) {
  try {
    return fs.statSync(target).mtime.toISOString()
  } catch (err) {
    return ''
  }
}

function scan() {
  const dir = profileDir()
  const pkgPath = path.join(dir, 'package.json')
  const pkg = readJson(pkgPath)
  if (!pkg) {
    return {
      ok: false,
      error: '读不到 profile 的 package.json：' + pkgPath,
      profile: dir,
      bundles: [],
      boots: [],
      others: [],
      protected: PROTECTED
    }
  }
  const deps = Object.keys(pkg.dependencies || {})
  const bundles = (pkg.dsh && pkg.dsh.profile && Array.isArray(pkg.dsh.profile.bundles))
    ? pkg.dsh.profile.bundles.slice()
    : []

  /* 兼容：不只扫 dependencies。bundles 里出现、但没写进 dependencies 的插件
     （手动塞进 bundles 的包）同样列出来；两者去重，核心 bundle 排除。 */
  const names = []
  const seen = {}
  for (const n of deps.concat(bundles)) {
    if (!n || seen[n]) continue
    seen[n] = 1
    if (PROTECTED.indexOf(n) !== -1) continue
    names.push(n)
  }

  const boots = []
  const others = []
  /* 安装来源登记：第一次见到的插件自动记下它的 file: 路径，
     之后即使 node_modules 被清掉，也能凭这条记录重新下载回来。 */
  const cfgIn = readCfg()
  const sources = Object.assign({}, cfgIn.sources || {})
  const repoUpdates = {}
  const newPackages = []
  let sourcesChanged = false

  for (const name of names) {
    const meta = readJson(path.join(dir, 'node_modules', name, 'package.json'))
    const spec = String((pkg.dependencies || {})[name] || '')
    const filePath = spec.indexOf('file:') === 0 ? spec.slice('file:'.length) : ''
    const isFirstSeen = !Object.prototype.hasOwnProperty.call(sources, name)
    if (filePath && sources[name] !== filePath) {
      sources[name] = filePath
      sourcesChanged = true
    }
    /* 自动收录仓库路径：插件包里有 repository 就记下来，用于后续回源下载 */
    const repoFromPkg = parseRepoFromMeta(meta)
    if (repoFromPkg && cfgIn.repos[name] !== repoFromPkg) {
      sourcesChanged = true
      repoUpdates[name] = repoFromPkg
    }
    if (isFirstSeen && filePath) newPackages.push(name)

    const item = {
      name,
      version: meta ? String(meta.version || '') : '',
      description: meta ? String(meta.description || '') : '',
      settingsLabel: meta ? settingsLabelOf(dir, name, meta) : '',
      configFile: configFileOf(name),
      enabled: bundles.indexOf(name) !== -1,
      inDeps: deps.indexOf(name) !== -1,
      missing: !meta,
      source: sources[name] || '',
      sourceExists: !!(sources[name] && fs.existsSync(sources[name])),
      repo: (cfgIn.repos && cfgIn.repos[name]) || parseRepoFromMeta(meta) || REPO_MAP[name] || '',
      /* 当前这份代码落盘的时间：pnpm 安装 / 解压覆盖 / 静默更新都会刷新目录 mtime */
      installedAt: statTimeOf(path.join(dir, 'node_modules', name)),
      spec
    }
    if (name === SELF) {
      item.self = true
      others.push(item)
      continue
    }
    if (isBootPlugin(name, meta || {})) {
      item.isBoot = true
      item.isDefault = cfgIn.defaultBoot === name
      boots.push(item)
    } else {
      others.push(item)
    }
  }
  if (sourcesChanged) {
    try {
      const patch = { sources }
      if (Object.keys(repoUpdates).length) {
        patch.repos = Object.assign({}, cfgIn.repos || {}, repoUpdates)
      }
      writeCfg(patch)
    } catch (err) { /* 写不进去不影响显示 */ }
  }
  boots.sort((a, b) => a.name.localeCompare(b.name))
  others.sort((a, b) => a.name.localeCompare(b.name))
  const cfg = readCfg()
  const confirmed = cfg.confirmedBoots || []
  const newBoots = boots
    .filter((b) => confirmed.indexOf(b.name) === -1)
    .map((b) => b.name)
  return {
    ok: true,
    profile: dir,
    bundles,
    boots,
    others,
    protected: PROTECTED,
    newBoots,
    confirmedBoots: confirmed,
    newPackages,
    sources
  }
}

/**
 * 切换某个插件。
 * 开机动画启用时互斥（其他开机动画一并移出）；其他插件只动自己，允许多个同时开。
 */

/* ── 插件审核：源代码 + 文档 ─────────────────────────────────────────────── */

/* ── 完整性：安装时记下每个文件的 SHA-256，之后审核时对比，发现改动就报 ── */

const BASELINE_FILE = path.join(DSH_HOME, 'cjgl-baseline.json')

function sha256File(file) {
  const h = crypto.createHash('sha256')
  h.update(fs.readFileSync(file))
  return h.digest('hex')
}

/** 对目录做指纹：相对路径 → sha256 */
function fingerprintDir(dir, base) {
  const root = base || dir
  const out = {}
  const walk = (d) => {
    let list = []
    try { list = fs.readdirSync(d, { withFileTypes: true }) } catch (err) { return }
    for (const ent of list) {
      if (ent.name === 'node_modules' || ent.name === '.git') continue
      const full = path.join(d, ent.name)
      if (ent.isDirectory()) walk(full)
      else if (/\.(js|mjs|cjs|json|css|html|md)$/.test(ent.name)) {
        try { out[path.relative(root, full).replace(/\\/g, '/')] = sha256File(full) } catch (err) { /* 读不到就不记 */ }
      }
    }
  }
  walk(dir)
  return out
}

function readBaseline() {
  return readJson(BASELINE_FILE) || {}
}

function saveBaseline(name, fp) {
  const all = readBaseline()
  all[name] = { files: fp, at: new Date().toISOString() }
  const tmp = BASELINE_FILE + '.tmp'
  fs.mkdirSync(path.dirname(BASELINE_FILE), { recursive: true })
  fs.writeFileSync(tmp, JSON.stringify(all, null, 2) + '\n', 'utf8')
  fs.renameSync(tmp, BASELINE_FILE)
}

/** 对比基准，返回改动清单 */
function diffBaseline(name, dir) {
  const base = readBaseline()[name]
  if (!base || !base.files) return null
  const now = fingerprintDir(dir)
  const changed = []
  const added = []
  const removed = []
  for (const f of Object.keys(now)) {
    if (!(f in base.files)) added.push(f)
    else if (base.files[f] !== now[f]) changed.push(f)
  }
  for (const f of Object.keys(base.files)) {
    if (!(f in now)) removed.push(f)
  }
  return { changed, added, removed, baseAt: base.at, total: Object.keys(base.files).length }
}

/* 这些命令在插件里属于「固定用途」，比如解压安装包、取 git 信息。
   判定方式是看 execFileSync/spawn 的第一个参数是不是字面量、且在白名单里。 */
const SAFE_EXEC_CMDS = ['tar', 'git', 'node', 'node.exe', 'python', 'python.exe', 'where', 'where.exe']

/* 危险 API：命中就提示，具体看上下文 */
/* @@AUDIT-DEF-BEGIN@@ */
const AUDIT_DANGER = [
  { re: /\beval\s*\(/, label: 'eval()', title: 'eval() 执行字符串', level: 'high',
    why: '把字符串当代码跑。',
    impact: '字符串只要来自用户输入或远程内容，攻击者就能让你执行任意代码——读文件、发请求、改配置。' },
  { re: /new\s+Function\s*\(/, label: 'new Function()', title: 'new Function() 动态建函数', level: 'medium',
    why: '运行时把字符串编译成函数。',
    impact: '效果类似 eval。构建脚本里用它（把配置字符串求值）很正常；产品代码里用就值得看一眼。' },
  { re: /child_process/, label: 'child_process', title: 'child_process 调外部命令', level: 'medium',
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
/* @@AUDIT-DEF-END@@ */

/* 外部 URL 判定：这些域名算「正常引用」 */
const AUDIT_OK_HOST = [
  'w3.org', 'github.com', 'githubusercontent.com', 'npmjs.com', 'npmjs.org',
  'deepseek.com', 'localhost', '127.0.0.1', 'schema.org', 'json-schema.org',
  'opensource.org', 'apache.org', 'mozilla.org'
]

function auditWalk(dir, out) {
  let list = []
  try { list = fs.readdirSync(dir, { withFileTypes: true }) } catch (err) { return out }
  for (const ent of list) {
    if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'dist') continue
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) auditWalk(full, out)
    else out.push(full)
  }
  return out
}

/** 审核一个已装插件：代码安全 + 文档完整 + 依赖与权限。 */
function auditDir(dir) {
  if (!dir || !fs.existsSync(dir)) return { ok: false, error: '目录不存在：' + dir }
  const pkg = readJson(path.join(dir, 'package.json'))
  if (!pkg) return { ok: false, error: '缺少 package.json' }
  const name = pkg.name || path.basename(dir)

  const checks = []
  const push = (id, level, title, detail) => checks.push({ id, level, title, detail })

  /* 1) 基本信息 */
  push('meta', 'pass', '包信息',
    [pkg.name, 'v' + (pkg.version || '?'), pkg.license || '未声明许可',
     pkg.repository && pkg.repository.url ? '有仓库' : '无仓库'].join(' · '))

  /* 2) 依赖 */
  const deps = Object.keys(pkg.dependencies || {})
  const peers = Object.keys(pkg.peerDependencies || {})
  if (deps.length === 0 && peers.length === 0) {
    push('deps', 'pass', '依赖', '零依赖（不需要 npm install）')
  } else {
    push('deps', 'warn', '依赖', 'dependencies ' + deps.length + ' 个 / peer ' + peers.length + ' 个：' +
      deps.concat(peers).slice(0, 6).join(', '))
  }

  /* 3) 权限声明 */
  const inj = Array.isArray(pkg.dsh && pkg.dsh.client && pkg.dsh.client.inject)
    ? pkg.dsh.client.inject : []
  const hasBundle = !!(pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch)
  push('perm', 'pass', '能力声明',
    (hasBundle ? '含 bundle patch' : '无 bundle patch') +
    (inj.length ? ' · 客户端 inject: ' + inj.join(', ') : ' · 客户端无 inject'))

  /* 4) 文件完整性 */
  const filesField = Array.isArray(pkg.files) ? pkg.files : []
  if (!filesField.length) {
    push('files', 'warn', '文件完整性', 'package.json 没写 files 字段，无法核对')
  } else {
    const missing = []
    for (const item of filesField) {
      const full = path.join(dir, item)
      if (!fs.existsSync(full)) missing.push(item)
    }
    if (missing.length) push('files', 'fail', '文件完整性', '缺 ' + missing.length + ' 项：' + missing.slice(0, 5).join(', '))
    else push('files', 'pass', '文件完整性', filesField.length + ' 项声明全部存在')
  }

  /* 4.5) 防篡改：与安装时记录的指纹比对 */
  try {
    const diff = diffBaseline(name, dir)
    if (!diff) {
      push('tamper', 'warn', '防篡改', '没有安装时的基准记录（这个插件是在加指纹功能之前装的）')
    } else if (diff.changed.length || diff.added.length || diff.removed.length) {
      const parts = []
      if (diff.changed.length) parts.push('改动 ' + diff.changed.length)
      if (diff.added.length) parts.push('新增 ' + diff.added.length)
      if (diff.removed.length) parts.push('删除 ' + diff.removed.length)
      const sample = diff.changed.concat(diff.added, diff.removed).slice(0, 3).join(', ')
      push('tamper', 'fail', '防篡改', '与安装时不一致（' + parts.join(' / ') + '）：' + sample)
    } else {
      push('tamper', 'pass', '防篡改', diff.total + ' 个文件与安装时完全一致（基准 ' + String(diff.baseAt || '').slice(0, 10) + '）')
    }
  } catch (err) {
    push('tamper', 'warn', '防篡改', '比对失败：' + String(err && err.message ? err.message : err))
  }

  /* 5) 文档 */
  const DOC_NAMES = ['README.md', 'README.MD', 'readme.md']
  const docHits = []
  for (const n of DOC_NAMES) {
    const full = path.join(dir, n)
    if (fs.existsSync(full)) { docHits.push({ name: n, size: fs.statSync(full).size }); break }
  }
  for (const n of ['INSTALL.md', 'DESKTOP.md', 'CHANGELOG.md', 'LICENSE', 'LICENSE.md']) {
    const full = path.join(dir, n)
    if (fs.existsSync(full)) docHits.push({ name: n, size: fs.statSync(full).size })
  }
  if (!docHits.length) push('docs', 'warn', '文档', '没找到 README / INSTALL / LICENSE')
  else {
    const total = docHits.reduce((a, b) => a + b.size, 0)
    push('docs', 'pass', '文档', docHits.map((d) => d.name + ' ' + Math.round(d.size / 1024) + 'KB').join(' · ') +
      '（合计 ' + Math.round(total / 1024) + 'KB）')
  }

  /* 6) 测试 */
  const testDir = path.join(dir, 'test')
  let testFiles = []
  if (fs.existsSync(testDir)) {
    testFiles = fs.readdirSync(testDir).filter((f) => /\.(mjs|js|cjs)$/.test(f))
  }
  if (testFiles.length) push('test', 'pass', '测试', testFiles.length + ' 个测试文件')
  else push('test', 'warn', '测试', '没有 test/ 目录')

  /* 7) 代码扫描：只看会真正运行的产品代码，test/ 与 preview/ 里的 exec 是测试用例。
     审核器自己会被跳过——它的源码里就写着 AUDIT_DANGER 那些关键词，扫自己必然误报。 */
  const allFiles = auditWalk(dir, [])
  /* 测试、预览、文档、构建脚本都不算产品代码：
     build.mjs 里的 new Function 是打包器用的（把源码字符串求值成对象），跑不到用户机器上 */
  const isBuildScript = (f) => /[\\/](build|scripts|tools)\.(mjs|js|cjs)$/.test(f) ||
                               /[\\/][^\\/]*\.config\.(mjs|js|cjs)$/.test(f)
  const isTestPath = (f) => /[\\/](test|tests|preview|docs)[\\/]/.test(f) ||
                            /[\\/][^\\/]*\.test\.(js|mjs|cjs)$/.test(f) ||
                            isBuildScript(f)
  const prodFiles = allFiles.filter((f) => !isTestPath(f))
  const files = allFiles
  const jsFiles = prodFiles.filter((f) => /\.(js|mjs|cjs)$/.test(f))
  const dangers = []
  const externalUrls = []
  for (const f of jsFiles) {
    let text = ''
    try { text = fs.readFileSync(f, 'utf8') } catch (err) { continue }
    /* 审核器自己的模式定义里有这些关键词，剥掉再扫，避免自我指涉 */
    text = text.replace(/\/\* @@AUDIT-DEF-BEGIN@@[\s\S]*?@@AUDIT-DEF-END@@ \*\//g, '')
    for (const d of AUDIT_DANGER) {
      if (!d.re.test(text)) continue
      /* exec/spawn 看一眼调的是谁：固定白名单命令（tar/git/...）算合理用途 */
      if (d.label === 'exec/spawn') {
        const cmds = []
        const re = /(?:execFileSync|execSync|spawnSync|execFile|spawn)\s*\(\s*['"]([^'"]+)['"]/g
        let m
        while ((m = re.exec(text))) cmds.push(m[1])
        if (cmds.length && cmds.every((c) => SAFE_EXEC_CMDS.indexOf(c) !== -1)) {
          continue /* 全是白名单命令，不报 */
        }
        dangers.push({ file: path.relative(dir, f), label: d.label, why: d.why + (cmds.length ? '（' + cmds.slice(0, 3).join(', ') + '）' : '') })
        continue
      }
      if (d.label === 'child_process') {
        /* 只 import 了 child_process 但实际调用都在白名单里，也放过 */
        const re = /(?:execFileSync|execSync|spawnSync|execFile|spawn)\s*\(\s*['"]([^'"]+)['"]/g
        const cmds = []
        let m
        while ((m = re.exec(text))) cmds.push(m[1])
        if (cmds.length && cmds.every((c) => SAFE_EXEC_CMDS.indexOf(c) !== -1)) continue
        dangers.push({ file: path.relative(dir, f), label: d.label, title: d.title || d.label, level: d.level || 'medium', why: d.why, impact: d.impact || '' })
        continue
      }
      dangers.push({ file: path.relative(dir, f), label: d.label, title: d.title || d.label, level: d.level || 'medium', why: d.why, impact: d.impact || '' })
    }
    const urls = text.match(/https?:\/\/[^\s"'`)\]]+/g) || []
    for (const u of urls) {
      let host = ''
      try { host = new URL(u).hostname.toLowerCase() } catch (err) { continue }
      if (AUDIT_OK_HOST.some((h) => host === h || host.endsWith('.' + h))) continue
      externalUrls.push({ file: path.relative(dir, f), url: u.slice(0, 120), host })
    }
  }
  if (dangers.length) {
    const uniq = []
    const seen = new Set()
    for (const d of dangers) {
      const key = d.label + '@' + d.file
      if (seen.has(key)) continue
      seen.add(key); uniq.push(d)
    }
    const high = uniq.filter((d) => d.level === 'high')
    const text = uniq.slice(0, 3).map((d) => d.title + '（' + d.file + '）：' + d.why + ' ' + d.impact).join(' ｜ ')
    push('danger', high.length ? 'fail' : 'warn', '危险 API',
      '发现 ' + uniq.length + ' 处' + (high.length ? '（其中高危 ' + high.length + ' 处）' : '') + '：' + text)
  } else {
    push('danger', 'pass', '危险 API', '没有能执行任意代码、读 Cookie 或私自外发数据的调用')
  }
  if (externalUrls.length) {
    const hosts = Array.from(new Set(externalUrls.map((x) => x.host))).slice(0, 8)
    push('net', 'warn', '外部网络引用', externalUrls.length + ' 处，涉及域名：' + hosts.join(', '))
  } else {
    push('net', 'pass', '外部网络引用', '没有引用外部域名')
  }

  /* 8) 文档里提到的可疑声明 */
  const readmeText = (() => {
    for (const n of DOC_NAMES) {
      try { return fs.readFileSync(path.join(dir, n), 'utf8') } catch (err) { /* 下一个 */ }
    }
    return ''
  })()
  if (readmeText) {
    /* 这一栏只看「文档里写了什么」，不因为没写就报警。
       只有真的用了第三方素材才算风险；其余情况一律放行并给出概述。 */
    const found = []
    if (/MIT|Apache|BSD|GPL/i.test(readmeText)) {
      const m = readmeText.match(/\b(MIT|Apache-?\s*2\.0|BSD|GPL-?[\d.]*)\b/i)
      if (m) found.push('许可：' + m[1])
    }
    if (/免责声明/.test(readmeText)) found.push('含免责声明')
    if (/未授权任何商业用途|商业使用风险|禁止商用/.test(readmeText)) found.push('限制商用')
    if (/第三方素材|素材取自|音频素材|图片素材/.test(readmeText)) found.push('声明了第三方素材')
    if (/版权|著作权|copyright/i.test(readmeText)) found.push('有版权说明')
    const risks = /第三方素材|素材取自|音频素材/.test(readmeText)

    if (risks) {
      push('license-risk', 'warn', '文档里的权利声明',
        found.join(' · ') + ' —— 第三方素材的权利需使用者自行确认，其余无风险')
    } else if (found.length) {
      push('license-risk', 'pass', '文档里的权利声明', found.join(' · ') + ' —— 没有攻击性行为或数据外发相关内容')
    } else {
      push('license-risk', 'pass', '文档里的权利声明', '文档未声明版权/免责条款（不影响使用，也没有额外限制）')
    }
  } else {
    push('license-risk', 'pass', '文档里的权利声明', '没有 README，无从声明（不影响使用）')
  }

  /* 放行条件：文件完整性、防篡改这两项必须是 pass。
     其余的（文档、测试、危险 API）只影响评分，不作为放行门槛。 */
  const MANDATORY_CHECKS = ['files', 'tamper']
  const mandatory = checks.filter((c) => MANDATORY_CHECKS.indexOf(c.id) !== -1)
  const passed = mandatory.every((c) => c.level === 'pass')
  const blockers = mandatory.filter((c) => c.level !== 'pass').map((c) => c.title)

  /* 评分：fail 扣 25，warn 扣 8 */
  let score = 100
  for (const c of checks) {
    if (c.level === 'fail') score -= 25
    else if (c.level === 'warn') score -= 8
  }
  score = Math.max(0, score)

  return {
    ok: true,
    name: pkg.name || name,
    version: pkg.version || '',
    dir,
    score,
    passed,
    blockers,
    checks,
    summary: {
      pass: checks.filter((c) => c.level === 'pass').length,
      warn: checks.filter((c) => c.level === 'warn').length,
      fail: checks.filter((c) => c.level === 'fail').length,
      jsFiles: jsFiles.length,
      totalFiles: files.length
    }
  }
}

/** 按插件名审核（装在 profile 里的那个） */
function auditPlugin(name) {
  if (!name) return { ok: false, error: '需要插件名' }
  const dir = path.join(profileDir(), 'node_modules', String(name))
  if (!fs.existsSync(dir)) return { ok: false, error: '没有这个插件：' + name }
  return auditDir(dir)
}

/* ── 开机动画检测：找出「被设为默认」的那个，并处理同时启用多个的情况 ── */

/** 当前开机动画的全景：谁装着、谁在启用、有没有冲突、默认是谁 */
function detectBoots() {
  const state = scan()
  if (!state.ok) return { ok: false, error: state.error }
  const cfg = readCfg()
  const bundles = state.bundles || []
  const list = state.boots.map((p) => ({
    name: p.name,
    version: p.version || '',
    enabled: bundles.indexOf(p.name) !== -1,
    preferred: p.name === cfg.defaultBoot
  }))
  const enabled = list.filter((x) => x.enabled)
  /* 默认规则：配置里指定的 > 已启用里的第一个 > 空 */
  let current = ''
  if (cfg.defaultBoot && enabled.some((x) => x.name === cfg.defaultBoot)) {
    current = cfg.defaultBoot
  } else if (enabled.length) {
    current = enabled[0].name
  }
  return {
    ok: true,
    defaultBoot: cfg.defaultBoot || '',
    current,
    enabledCount: enabled.length,
    conflict: enabled.length > 1,
    plugins: list,
    note: enabled.length > 1
      ? '同时启用了 ' + enabled.length + ' 个开机动画，实际只会播其中一个，建议修复'
      : (current ? '当前使用：' + current : '没有启用任何开机动画')
  }
}

/** 多个开机动画同时启用时，只保留一个（优先保留被设为默认的那个） */
function repairBootConflicts() {
  const info = detectBoots()
  if (!info.ok) return info
  if (!info.conflict) {
    return { ok: true, changed: false, current: info.current, removed: [], note: '没有冲突，无需修复' }
  }
  const cfg = readCfg()
  const enabled = info.plugins.filter((x) => x.enabled)
  const keep = (cfg.defaultBoot && enabled.some((x) => x.name === cfg.defaultBoot))
    ? cfg.defaultBoot
    : enabled[0].name
  const removed = []
  for (const x of enabled) {
    if (x.name === keep) continue
    try { setEnabled(x.name, false); removed.push(x.name) } catch (err) { /* 单个失败不影响其他 */ }
  }
  return { ok: true, changed: removed.length > 0, current: keep, removed, note: '已保留 ' + keep + '，停用 ' + removed.length + ' 个' }
}

function setEnabled(name, enabled) {
  const dir = profileDir()
  const pkgPath = path.join(dir, 'package.json')
  const pkg = readJson(pkgPath)
  if (!pkg) throw new Error('读不到 profile 配置：' + pkgPath)
  const state = scan()
  if (!state.ok) throw new Error(state.error)

  if (name === SELF) throw new Error('管理器自身不能停用')
  if (PROTECTED.indexOf(name) !== -1) throw new Error('核心 bundle 不能在这里操作：' + name)

  const boot = state.boots.filter((p) => p.name === name)[0]
  const other = state.others.filter((p) => p.name === name)[0]
  if (!boot && !other) throw new Error('不是可管理的插件：' + name)

  let bundles = state.bundles.slice()
  if (boot && enabled) {
    /* 互斥：把其他开机动画移出，保证同时只有一个生效 */
    const rivals = state.boots.filter((p) => p.name !== name).map((p) => p.name)
    bundles = bundles.filter((b) => rivals.indexOf(b) === -1)
    if (bundles.indexOf(name) === -1) bundles.push(name)
    /* 手动启用的开机动画视为已确认：否则 /list 的「自动停用新检测到的动画」
       会在下一次刷新时把它打回停用，看起来就像「点了启用没生效」 */
    try {
      const cfg = readCfg()
      if (cfg.confirmedBoots.indexOf(name) === -1) {
        writeCfg({ confirmedBoots: cfg.confirmedBoots.concat([name]) })
      }
    } catch (err) { /* 配置写失败不阻断启用 */ }
  } else if (enabled) {
    /* 其他插件：只加自己，不动别人 —— 允许多个同时启用 */
    if (bundles.indexOf(name) === -1) bundles.push(name)
  } else {
    bundles = bundles.filter((b) => b !== name)
  }

  pkg.dsh = pkg.dsh || {}
  pkg.dsh.profile = pkg.dsh.profile || {}
  pkg.dsh.profile.bundles = bundles

  fs.copyFileSync(pkgPath, pkgPath + '.bak')
  const tmp = pkgPath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  fs.renameSync(tmp, pkgPath)

  const next = scan()
  return {
    ok: true,
    bundles,
    boots: next.boots,
    others: next.others,
    profile: dir,
    restartRequired: true
  }
}

/**
 * 卸载某个插件：从 dependencies 与 bundles 移除，删除 node_modules 目录，
 * 并删除 pnpm-lock.yaml（下次安装时由 pnpm 重建，避免 lock 与 package.json 不一致）。
 */
function uninstallPlugin(name) {
  const dir = profileDir()
  const pkgPath = path.join(dir, 'package.json')
  const pkg = readJson(pkgPath)
  if (!pkg) throw new Error('读不到 profile 配置：' + pkgPath)
  const state = scan()
  if (!state.ok) throw new Error(state.error)

  if (name === SELF) throw new Error('管理器自身不能卸载')
  if (PROTECTED.indexOf(name) !== -1) throw new Error('核心 bundle 不能卸载：' + name)

  const known = [].concat(state.boots || [], state.others || []).some((p) => p.name === name)
  if (!known) throw new Error('不是可管理的插件：' + name)

  const deps = Object.assign({}, pkg.dependencies || {})
  if (!Object.prototype.hasOwnProperty.call(deps, name)) throw new Error('依赖里没有这个包：' + name)
  delete deps[name]
  pkg.dependencies = deps

  pkg.dsh = pkg.dsh || {}
  pkg.dsh.profile = pkg.dsh.profile || {}
  const before = Array.isArray(pkg.dsh.profile.bundles) ? pkg.dsh.profile.bundles : []
  pkg.dsh.profile.bundles = before.filter((b) => b !== name)

  fs.copyFileSync(pkgPath, pkgPath + '.bak')
  const tmp = pkgPath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  fs.renameSync(tmp, pkgPath)

  /* 卸载的正好是默认开机动画：把标记一并清掉 */
  try {
    if (readCfg().defaultBoot === name) writeCfg({ defaultBoot: '' })
  } catch (err) { /* 配置读写失败不阻断卸载 */ }

  const target = path.join(dir, 'node_modules', name)
  let removedDir = false
  try {
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true })
      removedDir = true
    }
  } catch (err) { /* 目录被占用时保留，不阻断卸载 */ }

  try { fs.rmSync(path.join(dir, 'pnpm-lock.yaml'), { force: true }) } catch (err) { /* 没有就算了 */ }

  const next = scan()
  return {
    ok: true,
    name,
    removedDir,
    bundles: next.bundles,
    boots: next.boots,
    others: next.others,
    profile: dir,
    restartRequired: true
  }
}

/**
 * 重装某个插件：按 dependencies 里记录的 file: tgz 重新解压到 node_modules。
 * 支持管理器自身（重新覆盖自己的文件，下次启动生效）。
 */
/* 已知插件的 GitHub 仓库：本地包损坏时按这里回源下载 */
const REPO_MAP = {
  'dsh-cjgl': 'hanqi007/dsh-cjgl',
  'hdd-console-boot': 'hanqi007/dsh-hdd',
  'dsh-gd': 'hanqi007/dsh-gd',
  'dsh-startup-screen': '6shenhonghong9/dsh-startup-screen'
}

/** 从插件包的 package.json 里解析 GitHub 仓库（支持 repository 为字符串或对象） */
function parseRepoFromMeta(meta) {
  if (!meta) return ''
  const repo = meta.repository
  const url = typeof repo === 'string' ? repo : (repo && repo.url)
  if (url) {
    const m = String(url).match(/github\.com[/:]([^/]+)\/([^/.#]+)/)
    if (m) return m[1] + '/' + m[2]
  }
  return ''
}

/**
 * 解析插件对应的 GitHub 仓库，优先级：
 *   1) 管理器收录的仓库路径（安装时从包内 repository 自动记下的）
 *   2) 现场读插件包内 package.json 的 repository
 *   3) 内置映射 REPO_MAP
 */
function resolveRepo(name) {
  const cfg = readCfg()
  const recorded = cfg.repos && cfg.repos[name]
  if (recorded) return String(recorded)
  const meta = readJson(path.join(profileDir(), 'node_modules', name, 'package.json'))
  const parsed = parseRepoFromMeta(meta)
  if (parsed) {
    try { writeCfg({ repos: Object.assign({}, cfg.repos, { [name]: parsed }) }) } catch (err) { /* 写不进去不影响本次使用 */ }
    return parsed
  }
  return REPO_MAP[name] || ''
}

/** 体检本地安装包：存在、大小合理、能列出目录、含 package/package.json */
function inspectLocalPackage(name) {
  const dir = profileDir()
  const pkg = readJson(path.join(dir, 'package.json'))
  const spec = String((pkg && pkg.dependencies && pkg.dependencies[name]) || '')
  if (spec.indexOf('file:') !== 0) {
    return { ok: false, reason: '不是 file: 依赖（' + (spec || '未登记') + '）' }
  }
  let file = spec.slice('file:'.length)
  if (!path.isAbsolute(file)) file = path.resolve(dir, file)
  if (!fs.existsSync(file)) return { ok: false, reason: '安装包不存在', file }
  let size = 0
  try { size = fs.statSync(file).size } catch (err) { return { ok: false, reason: '读不到文件大小', file } }
  if (size < 512) return { ok: false, reason: '文件过小（' + size + ' 字节）', file }
  try {
    const list = execFileSync('tar', ['-tzf', file], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 8 * 1024 * 1024
    })
    if (list.indexOf('package/package.json') === -1) {
      return { ok: false, reason: '包内缺少 package/package.json', file }
    }
  } catch (err) {
    return { ok: false, reason: '解压失败（' + String(err && err.message ? err.message : err) + '）', file }
  }
  return { ok: true, file, size }
}

/** 从插件仓库的 dist/ 下载指定版本（不传版本就取仓库 package.json 的最新版） */
async function downloadFromRepo(name, version) {
  const repo = resolveRepo(name)
  if (!repo) throw new Error('没有找到 ' + name + ' 的仓库地址，无法回源下载')
  let ver = String(version || '').replace(/^v/, '').trim()
  if (!ver) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10000)
    try {
      const res = await fetch('https://api.github.com/repos/' + repo + '/contents/package.json?ref=' + currentBranch(), {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'dsh-cjgl', Accept: 'application/vnd.github.raw' }
      })
      if (!res.ok) throw new Error('读取仓库版本失败 HTTP ' + res.status)
      ver = String(JSON.parse(await res.text()).version || '').trim()
    } finally { clearTimeout(timer) }
  }
  if (!ver) throw new Error('无法确定 ' + name + ' 的版本号')
  const fileName = name + '-' + ver + '.tgz'
  const url = 'https://raw.githubusercontent.com/' + repo + '/' + currentBranch() + '/dist/' + fileName

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 60000)
  let buf
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'dsh-cjgl' } })
    if (!res.ok) throw new Error('下载失败 HTTP ' + res.status + ' · ' + fileName)
    buf = Buffer.from(await res.arrayBuffer())
  } finally { clearTimeout(timer) }
  if (!buf || buf.length < 512) throw new Error('下载内容异常（' + (buf ? buf.length : 0) + ' 字节）')

  const dest = path.join(DSH_HOME, 'packages', fileName)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, buf)
  return { file: dest, version: ver, repo }
}

/** 检查某个插件在它自己的仓库里有没有更新的版本 */
async function checkPluginUpdate(name) {
  const repo = resolveRepo(name)
  if (!repo) return { ok: false, name, error: '没有找到仓库地址' }
  const current = String((readJson(path.join(profileDir(), 'node_modules', name, 'package.json')) || {}).version || '')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10000)
  try {
    const res = await fetch('https://api.github.com/repos/' + repo + '/contents/package.json?ref=' + currentBranch(), {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'dsh-cjgl', Accept: 'application/vnd.github.raw' }
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const latest = String(JSON.parse(await res.text()).version || '')
    return {
      ok: true,
      name,
      repo,
      current,
      latest,
      hasUpdate: !!latest && cmpVersion(latest, current) > 0
    }
  } finally {
    clearTimeout(timer)
  }
}

/** 读 tgz 里的 package/package.json（不解压整包） */
function readTgzMeta(file) {
  try {
    const text = execFileSync('tar', ['-xzOf', file, 'package/package.json'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 4 * 1024 * 1024
    })
    const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
    const meta = JSON.parse(clean)
    return meta && typeof meta === 'object' ? meta : null
  } catch (err) {
    return null
  }
}

/** 扫描 ~/.dsh/packages 下的 .tgz，标出哪些已安装、哪些没装 */
function scanLocalPackages() {
  const dir = path.join(DSH_HOME, 'packages')
  let files = []
  try { files = fs.readdirSync(dir) } catch (err) {
    return { ok: false, dir, error: '读不到 packages 目录：' + String(err && err.message ? err.message : err), packages: [] }
  }
  const pkg = readJson(path.join(profileDir(), 'package.json')) || {}
  const installed = Object.keys(pkg.dependencies || {})
  const list = []
  for (const name of files) {
    if (!/\.tgz$/i.test(name)) continue
    const full = path.join(dir, name)
    let size = 0
    try { size = fs.statSync(full).size } catch (err) { continue }
    const meta = readTgzMeta(full)
    const pkgName = meta ? String(meta.name || '') : ''
    const pkgVersion = meta ? String(meta.version || '') : ''
    const installedVersion = pkgName
      ? String((readJson(path.join(profileDir(), 'node_modules', pkgName, 'package.json')) || {}).version || '')
      : ''
    list.push({
      file: name,
      path: full,
      size,
      name: pkgName,
      version: pkgVersion,
      description: meta ? String(meta.description || '').slice(0, 140) : '',
      valid: !!meta,
      installed: !!pkgName && installed.indexOf(pkgName) !== -1,
      installedVersion,
      sameVersion: !!pkgName && installedVersion === pkgVersion && !!pkgVersion
    })
  }
  list.sort((a, b) => (a.name || a.file).localeCompare(b.name || b.file))
  return { ok: true, dir, packages: list }
}

/** 把 packages 目录里的某个 tgz 装进当前 profile */
function installLocalPackage(fileName, force) {
  const dir = profileDir()
  const base = path.basename(String(fileName || ''))
  if (!/\.tgz$/i.test(base)) throw new Error('只接受 .tgz 安装包')
  const full = path.join(DSH_HOME, 'packages', base)
  if (!fs.existsSync(full)) throw new Error('找不到安装包：' + base)

  const meta = readTgzMeta(full)
  if (!meta || !meta.name) throw new Error('安装包里没有可用的 package.json')
  const name = String(meta.name)
  const version = String(meta.version || '')

  if (PROTECTED.indexOf(name) !== -1) throw new Error('核心 bundle 不能这样安装：' + name)

  const pkgPath = path.join(dir, 'package.json')
  const pkg = readJson(pkgPath)
  if (!pkg) throw new Error('读不到 profile 配置：' + pkgPath)

  pkg.dependencies = pkg.dependencies || {}
  pkg.dependencies[name] = 'file:' + full.replace(/\\/g, '/')
  pkg.dsh = pkg.dsh || {}
  pkg.dsh.profile = pkg.dsh.profile || {}
  const bundles = Array.isArray(pkg.dsh.profile.bundles) ? pkg.dsh.profile.bundles.slice() : []
  if (bundles.indexOf(name) === -1) bundles.push(name)
  pkg.dsh.profile.bundles = bundles

  fs.copyFileSync(pkgPath, pkgPath + '.bak')
  const tmpPkg = pkgPath + '.tmp'
  fs.writeFileSync(tmpPkg, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  fs.renameSync(tmpPkg, pkgPath)

  const target = path.join(dir, 'node_modules', name)
  const tmp = path.join(dir, '.install-' + Date.now())
  fs.mkdirSync(tmp, { recursive: true })
  try {
    execFileSync('tar', ['-xzf', full, '-C', tmp], { stdio: 'ignore' })
  } catch (err) {
    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch (e) {}
    throw new Error('解压失败：' + String(err && err.message ? err.message : err))
  }
  const unpacked = path.join(tmp, 'package')
  if (!fs.existsSync(unpacked)) {
    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch (e) {}
    throw new Error('包结构异常：缺少 package/ 目录')
  }
  /* 安装前先审一遍：解压出来的目录就是即将装进去的内容 */
  let auditReport = null
  try { auditReport = auditDir(unpacked) } catch (err) { auditReport = { ok: false, error: String(err && err.message ? err.message : err) } }

  /* 有风险先问：fail 至少 1 项，或 warn 达到 2 项 */
  if (auditReport && auditReport.ok && force !== true) {
    const sum = auditReport.summary || {}
    /* 文件完整性 / 防篡改不通过 → 一定要问；其他 fail 或 2 项以上 warn 也问 */
    const blocked = auditReport.passed === false
    if (blocked || (sum.fail || 0) > 0 || (sum.warn || 0) >= 2) {
      try { fs.rmSync(tmp, { recursive: true, force: true }) } catch (e) {}
      return {
        ok: false,
        needConfirm: true,
        name, version,
        audit: auditReport,
        score: auditReport.score,
        message: (auditReport.blockers && auditReport.blockers.length
          ? '文件完整性未通过：' + auditReport.blockers.join('、') + '。'
          : '') + '审核发现风险：失败 ' + (sum.fail || 0) + ' 项 / 提示 ' + (sum.warn || 0) + ' 项（' + auditReport.score + ' 分）'
      }
    }
  }
  try {
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true })
    fs.renameSync(unpacked, target)
  } catch (err) {
    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch (e) {}
    throw new Error('写入失败：' + String(err && err.message ? err.message : err))
  }
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch (err) {}

  /* 记下这次的指纹，之后审核对比用 */
  try { saveBaseline(name, fingerprintDir(target)) } catch (err) { /* 记不下不影响安装 */ }

  try { fs.rmSync(path.join(dir, 'pnpm-lock.yaml'), { force: true }) } catch (err) {}

  return { ok: true, name, version, file: full, restartRequired: true, audit: auditReport }
}

/**
 * 重装：先体检本地包，完好就直接解压；损坏/缺失或指定 remote 时从仓库回源下载。
 */
async function reinstallPlugin(name, options) {
  const opts = options || {}
  const dir = profileDir()
  const pkgPath = path.join(dir, 'package.json')
  const pkg = readJson(pkgPath)
  if (!pkg) throw new Error('读不到 profile 配置：' + pkgPath)

  const state = scan()
  if (!state.ok) throw new Error(state.error)
  const known = [].concat(state.boots || [], state.others || []).some((p) => p.name === name)
  if (!known) throw new Error('不是可管理的插件：' + name)

  const cfg = readCfg()
  const preferred = String(opts.source || (cfg.sourceMode && cfg.sourceMode[name]) || 'local')
  const local = inspectLocalPackage(name)

  let chosen
  if (local.ok && preferred !== 'remote') {
    chosen = { file: local.file, from: 'local', repo: resolveRepo(name), note: '本地包完好，直接解压' }
  } else {
    const meta = readJson(path.join(dir, 'node_modules', name, 'package.json'))
    const version = meta ? String(meta.version || '') : ''
    const dl = await downloadFromRepo(name, version)
    chosen = {
      file: dl.file,
      from: 'remote',
      repo: dl.repo,
      version: dl.version,
      note: local.ok ? '按设置强制从仓库下载' : '本地包不可用，已从仓库下载',
      localReason: local.ok ? '' : (local.reason || '')
    }
    /* 依赖指向新下载的包 */
    pkg.dependencies = pkg.dependencies || {}
    pkg.dependencies[name] = 'file:' + dl.file.replace(/\\/g, '/')
    fs.copyFileSync(pkgPath, pkgPath + '.bak')
    const tmpPkg = pkgPath + '.tmp'
    fs.writeFileSync(tmpPkg, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
    fs.renameSync(tmpPkg, pkgPath)
  }

  const target = path.join(dir, 'node_modules', name)
  const tmp = path.join(dir, '.reinstall-' + Date.now())
  fs.mkdirSync(tmp, { recursive: true })

  try {
    execFileSync('tar', ['-xzf', chosen.file, '-C', tmp], { stdio: 'ignore' })
  } catch (err) {
    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch (e) {}
    throw new Error('解压失败：' + String(err && err.message ? err.message : err))
  }

  const unpacked = path.join(tmp, 'package')
  if (!fs.existsSync(unpacked)) {
    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch (e) {}
    throw new Error('包结构异常：缺少 package/ 目录')
  }

  try {
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true })
    fs.renameSync(unpacked, target)
  } catch (err) {
    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch (e) {}
    throw new Error('替换失败：' + String(err && err.message ? err.message : err))
  }

  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch (err) {}

  const meta = readJson(path.join(target, 'package.json'))
  return {
    ok: true,
    name,
    version: meta ? String(meta.version || '') : '',
    source: chosen.file,
    from: chosen.from,
    repo: chosen.repo || '',
    note: chosen.note || '',
    localReason: chosen.localReason || '',
    self: name === SELF,
    restartRequired: true
  }
}


/* ── 自身仓库：版本列表与按版本下载 ────────────────────────────────────── */

/** 版本号比较：a > b 返回 1，相等 0，小于 -1 */
function cmpVersion(a, b) {
  const pa = String(a || '0').replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0)
  const pb = String(b || '0').replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0)
  const n = Math.max(pa.length, pb.length)
  for (let i = 0; i < n; i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
}

function distUrl(fileName) {
  return 'https://raw.githubusercontent.com/' + UPDATE_REPO + '/' + currentBranch() + '/dist/' + fileName
}

async function listVersions() {
  if (typeof fetch !== 'function') throw new Error('当前 Node 没有全局 fetch')
  const url = 'https://api.github.com/repos/' + UPDATE_REPO + '/contents/dist?ref=' + currentBranch()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10000)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'dsh-cjgl', Accept: 'application/vnd.github+json' }
    })
    if (!res.ok) throw new Error('GitHub API ' + res.status)
    const list = await res.json()
    const versions = (Array.isArray(list) ? list : [])
      .filter((f) => f && /^dsh-cjgl-.*\.tgz$/.test(String(f.name || '')))
      .map((f) => ({
        name: f.name,
        version: String(f.name).replace(/^dsh-cjgl-/, '').replace(/\.tgz$/, ''),
        size: f.size,
        url: distUrl(f.name)
      }))
      .sort((a, b) => cmpVersion(b.version, a.version))
    return { ok: true, current: PLUGIN_VERSION, repo: UPDATE_REPO, versions }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 首次从仓库安装时自动对齐到最新版：配置里没有 bootstrapVersion 就是第一次跑，
 * 查仓库 dist 里最新的版本，比当前新就静默装上，然后记下来，之后不再自动动。
 */
async function bootstrapLatest(ctx) {
  const cfg = readCfg()
  if (cfg.bootstrapVersion) return null
  /* 网络失败过就等 24 小时再试，别每次启动都去撞限流 */
  const lastTry = Number(cfg.bootstrapAttemptAt) || 0
  if (lastTry && Date.now() - lastTry < 24 * 3600 * 1000) return null
  try { writeCfg({ bootstrapAttemptAt: Date.now() }) } catch (err) { /* 写不进去也无所谓 */ }
  let latest = PLUGIN_VERSION
  try {
    const list = await listVersions()
    const top = (list.versions || [])[0]
    if (top && top.version && cmpVersion(top.version, PLUGIN_VERSION) > 0) {
      latest = top.version
      const result = await installVersion(latest)
      if (ctx && ctx.logger && typeof ctx.logger.warn === 'function') {
        ctx.logger.warn('[dsh-cjgl] 首次运行，已自动升级到最新版 ' + latest + '，重启后生效')
      }
      try { writeCfg({ bootstrapVersion: latest }) } catch (err) { /* 下次再试 */ }
      return result
    }
  } catch (err) {
    /* 网络失败：不写 bootstrapVersion，24 小时后重试 */
    return null
  }
  try { writeCfg({ bootstrapVersion: latest }) } catch (err) { /* 下次再试 */ }
  return null
}

/** 下载指定版本的包并重装管理器自身（改 dependencies 指向新包，再解压覆盖）。 */
async function installVersion(version) {
  const v = String(version || '').replace(/^v/, '').trim()
  if (!/^\d+\.\d+\.\d+$/.test(v)) throw new Error('版本号格式不对：' + version)
  if (typeof fetch !== 'function') throw new Error('当前 Node 没有全局 fetch')

  const url = distUrl('dsh-cjgl-' + v + '.tgz')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 60000)
  let buf
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'dsh-cjgl' } })
    if (!res.ok) throw new Error('下载失败 HTTP ' + res.status)
    buf = Buffer.from(await res.arrayBuffer())
  } finally {
    clearTimeout(timer)
  }
  if (!buf || buf.length < 1024) throw new Error('下载内容不像是个 tar 包（' + (buf ? buf.length : 0) + ' 字节）')

  const dir = profileDir()
  const pkgPath = path.join(dir, 'package.json')
  const pkg = readJson(pkgPath)
  if (!pkg) throw new Error('读不到 profile 配置：' + pkgPath)

  const dest = path.join(DSH_HOME, 'packages', 'dsh-cjgl-' + v + '.tgz')
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, buf)

  pkg.dependencies = pkg.dependencies || {}
  pkg.dependencies[SELF] = 'file:' + dest.replace(/\\/g, '/')
  fs.copyFileSync(pkgPath, pkgPath + '.bak')
  fs.writeFileSync(pkgPath + '.tmp', JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  fs.renameSync(pkgPath + '.tmp', pkgPath)

  const result = reinstallPlugin(SELF)
  let auditReport = null
  try { auditReport = auditDir(path.join(profileDir(), 'node_modules', SELF)) } catch (err) { auditReport = { ok: false, error: String(err && err.message ? err.message : err) } }
  return Object.assign({ ok: true, installed: v, file: dest, audit: auditReport }, result)
}

/* ── 每个插件的独立配置 ────────────────────────────────────────────────────
   「管理」点开后要能像插件自己的设置页那样改配置。字段的含义只有插件自己
   知道，所以这里给已知插件写了一份中文 schema；不认识的插件按 JSON 值的
   类型自动推断（布尔→复选框、数字→数字框、字符串→文本框、对象→JSON）。
   写回时只允许改已存在的键，不动新增字段，写前备份 .bak。 */
const SCHEMAS = {
  'dsh-startup-screen': [
    { key: 'enabled', label: '启用启动动画', type: 'boolean', default: true, hint: '关闭后直接进主界面' },
    { key: 'mode', label: '播放时机', type: 'enum', default: 'session', options: [['session', '每个浏览器会话一次'], ['always', '每次打开都播放'], ['daily', '每天一次'], ['once', '只播放一次']] },
    { key: 'theme', label: '主题', type: 'enum', default: 'light', options: [['light', '浅色'], ['dark', '深色']] },
    { key: 'speed', label: '速度倍率', type: 'number', default: 1, min: 0.35, max: 3, step: 0.05, hint: '0.35 慢放 · 1 原速 · 3 快放' },
    { key: 'requireInteraction', label: '需要人工确认', type: 'boolean', default: true, hint: '第 1、2 步停下来等按钮 / Enter / 空格' },
    { key: 'allowSkip', label: '允许跳过', type: 'boolean', default: true, hint: '右上角显示 SKIP，按 Esc 也能跳过' },
    { key: 'identity', label: '身份名称', type: 'text', default: 'JOYCE MOORE' },
    { key: 'identityId', label: '身份编号', type: 'text', default: '0087' },
    { key: 'accessLevel', label: '权限等级', type: 'text', default: '3' },
    { key: 'sound', label: '界面音效', type: 'boolean', default: true },
    { key: 'soundVolume', label: '音效音量', type: 'number', default: 0.5, min: 0, max: 1, step: 0.05 },
    { key: 'voice', label: '语音播报', type: 'boolean', default: true },
    { key: 'voiceLang', label: '语音语言', type: 'enum', default: 'en', options: [['en', 'English'], ['zh', '中文'], ['both', '中英双语']] },
    { key: 'voiceName', label: '语音名', type: 'text', default: '', hint: '留空自动挑选音色' },
    { key: 'voiceRate', label: '语速', type: 'number', default: 0.88, min: 0.5, max: 2, step: 0.01 },
    { key: 'voicePitch', label: '音调', type: 'number', default: 0.85, min: 0.5, max: 2, step: 0.01 },
    { key: 'voiceVolume', label: '语音音量', type: 'number', default: 0.9, min: 0, max: 1, step: 0.05 },
    { key: 'voiceCue', label: '语音提示音', type: 'boolean', default: true },
    { key: 'voiceLead', label: '语音留白（毫秒）', type: 'number', default: 240, min: 0, max: 2000, step: 10 },
    { key: 'sfx', label: '音效来源', type: 'enum', default: 'audio', options: [['audio', '素材文件'], ['synth', '现场合成']] },
    { key: 'voiceSource', label: '语音来源', type: 'enum', default: 'asset', options: [['asset', '优先素材'], ['tts', '全部 TTS']] },
    { key: 'brand1', label: '品牌主字', type: 'text', default: 'DEEPSEEK' },
    { key: 'brand2', label: '品牌副字', type: 'text', default: 'SYNTHESIZE INTELLIGENCE' },
    { key: 'brand3a', label: '标语前段', type: 'text', default: 'HARNESS' },
    { key: 'brand3b', label: '标语后段', type: 'text', default: 'OS' },
    { key: 'orgZh', label: '机构中文', type: 'text', default: '深度求索' },
    { key: 'orgEn', label: '机构英文', type: 'text', default: 'DEEPSEEK' },
    { key: 'orgSub', label: '机构副标', type: 'text', default: 'DEEPSEEK HARNESS' },
    { key: 'welcomeBox', label: '欢迎框文字', type: 'text', default: 'DEEPSEEK HARNESS' },
    { key: 'footer', label: '页脚', type: 'text', default: 'POWERED BY DEEPSEEK' },
    { key: 'accent', label: '强调色', type: 'color', default: '#ff7500' },
    { key: 'glitchA', label: '色散色 A', type: 'color', default: '#ff3b30' },
    { key: 'glitchB', label: '色散色 B', type: 'color', default: '#2971b8' }
  ],
  'hdd-console-boot': [
    { key: 'enabled', label: '启用开机动画', type: 'boolean', default: true },
    { key: 'mode', label: '播放时机', type: 'enum', default: 'session', options: [['session', '每个浏览器会话一次'], ['always', '每次打开都播放'], ['daily', '每天一次']] },
    { key: 'speed', label: '速度倍率', type: 'number', default: 1, min: 0.35, max: 3, step: 0.05 },
    { key: 'requireGate', label: '停下等待放行', type: 'boolean', default: true, hint: '第四幕停住，等按钮或 Enter' },
    { key: 'allowSkip', label: '允许跳过', type: 'boolean', default: true },
    { key: 'autoUpdate', label: '自动检查更新', type: 'boolean', default: false },
    { key: 'sound', label: '合成音效', type: 'boolean', default: true },
    { key: 'volume', label: '音量', type: 'number', default: 0.6, min: 0, max: 1, step: 0.05 },
    { key: 'accent', label: '强调色', type: 'enum', default: 'amber', options: [['amber', '琥珀'], ['jade', '青绿']] },
    { key: 'identity', label: '操作员', type: 'text', default: 'HANLIN' },
    { key: 'station', label: '站位', type: 'text', default: 'STATION 07' },
    { key: 'build', label: '版本号', type: 'text', default: '1.0.0' },
    { key: 'title', label: '设备代号', type: 'text', default: 'HDD' },
    { key: 'subtitle', label: '设备副标题', type: 'text', default: 'HARD DISK DRIVE CONTROL' },
    { key: 'bootLine', label: '启动语', type: 'text', default: '启动深空检索终端' },
    { key: 'bootLineEn', label: '启动语（英文）', type: 'text', default: 'BOOTING DEEP-SPACE RETRIEVAL TERMINAL' },
    { key: 'footer', label: '页脚', type: 'text', default: 'DEEPSEEK HARNESS · ORIGINAL BOOT SEQUENCE' }
  ]
}

function inferSchema(config) {
  const out = []
  for (const key of Object.keys(config || {})) {
    const v = config[key]
    let type = 'text'
    if (typeof v === 'boolean') type = 'boolean'
    else if (typeof v === 'number') type = 'number'
    else if (v && typeof v === 'object') type = 'json'
    out.push({ key, label: key, type })
  }
  return out
}

function schemaFor(name, config) {
  const known = SCHEMAS[name]
  if (!known) return inferSchema(config)
  /* 已知插件：schema 里没有的字段也补在末尾，避免漏掉新加的键 */
  const listed = {}
  known.forEach((f) => { listed[f.key] = 1 })
  const extra = Object.keys(config || {}).filter((k) => !listed[k]).map((k) => {
    const v = config[k]
    return {
      key: k,
      label: k,
      type: typeof v === 'boolean' ? 'boolean' : typeof v === 'number' ? 'number' : (v && typeof v === 'object') ? 'json' : 'text'
    }
  })
  return known.concat(extra)
}

function readPluginConfig(name) {
  const file = configFileOf(name)
  const stored = file ? (readJson(file) || {}) : {}
  const schema = schemaFor(name, stored)
  /* 用 schema 的默认值补齐：插件本来就有、只是配置文件里没写的字段也要显示 */
  const config = {}
  schema.forEach((f) => {
    if (f.default !== undefined) config[f.key] = f.default
  })
  Object.assign(config, stored)
  return { file, config, schema }
}

function writePluginConfig(name, patch) {
  const file = configFileOf(name)
  if (!file) throw new Error('该插件没有独立配置文件，管理器无从编辑')
  const cur = readJson(file)
  if (!cur) throw new Error('配置文件不是合法 JSON：' + file)
  const allowed = {}
  Object.keys(cur).forEach((k) => { allowed[k] = 1 })
  schemaFor(name, cur).forEach((f) => { allowed[f.key] = 1 })
  const next = Object.assign({}, cur)
  for (const key of Object.keys(patch || {})) {
    if (!allowed[key]) continue
    next[key] = patch[key]
  }
  fs.copyFileSync(file, file + '.bak')
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', 'utf8')
  fs.renameSync(tmp, file)
  return next
}

/* ── HTTP 小工具 ─────────────────────────────────────────────────────────── */
function sendJson(res, status, value) {
  try {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(value))
  } catch (err) { /* 客户端已断开 */ }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 64 * 1024) { reject(new Error('payload too large')); req.destroy(); return }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/* ── 插件本体 ────────────────────────────────────────────────────────────── */
export const name = SELF
export const inject = ['webServer']

/** 健康检查：逐个插件核对包目录、package.json、配置文件、启用状态，并给出全局告警 */
/* ── 完整性自检：管理器和已装插件的关键文件 ──────────────────────────────── */

const SELF_REQUIRED = ['package.json', 'lib/index.js', 'lib/client.js', 'lib/cli.js', 'README.md', 'LICENSE']
const PLUGIN_REQUIRED = ['package.json', 'lib/index.js']
const MIN_BYTES = 32

function fileProblem(full, label) {
  try {
    const st = fs.statSync(full)
    if (!st.isFile()) return label + ' 不是文件'
    if (st.size < MIN_BYTES) return label + ' 太小（' + st.size + ' 字节）'
    return ''
  } catch (err) {
    return label + ' 缺失'
  }
}

/** 管理器自身 + 所有已装插件的关键文件体检；只报告问题，不阻断任何功能 */
function checkIntegrity() {
  const selfProblems = []
  for (const rel of SELF_REQUIRED) {
    const msg = fileProblem(path.join(PACKAGE_ROOT, rel), rel)
    if (msg) selfProblems.push(msg)
  }
  const dir = profileDir()
  const pkg = readJson(path.join(dir, 'package.json'))
  const names = []
  if (pkg) {
    for (const n of Object.keys(pkg.dependencies || {})) names.push(n)
    const bundles = (pkg.dsh && pkg.dsh.profile && Array.isArray(pkg.dsh.profile.bundles)) ? pkg.dsh.profile.bundles : []
    for (const n of bundles) if (names.indexOf(n) === -1) names.push(n)
  }
  const plugins = []
  for (const name of names) {
    if (PROTECTED.indexOf(name) !== -1) continue
    const base = path.join(dir, 'node_modules', name)
    const problems = []
    for (const rel of PLUGIN_REQUIRED) {
      const msg = fileProblem(path.join(base, rel), rel)
      if (msg) problems.push(msg)
    }
    const meta = readJson(path.join(base, 'package.json'))
    plugins.push({
      name,
      version: meta ? String(meta.version || '') : '',
      installed: !!meta,
      enabled: pkg ? (pkg.dsh && pkg.dsh.profile && Array.isArray(pkg.dsh.profile.bundles)
        ? pkg.dsh.profile.bundles.indexOf(name) !== -1 : false) : false,
      ok: problems.length === 0,
      problems
    })
  }
  const badPlugins = plugins.filter((x) => !x.ok)
  return {
    self: { ok: selfProblems.length === 0, problems: selfProblems },
    plugins,
    summary: {
      total: plugins.length,
      broken: badPlugins.length,
      ok: selfProblems.length === 0 && badPlugins.length === 0
    }
  }
}

/* ── 运行时密钥扫描：配置文件里不该出现明文 token ────────────────────────── */

const SECRET_KEY_PAT = /(token|secret|passwd|password|api[_-]?key|apikey|credential|private[_-]?key|access[_-]?key)/i
const SECRET_VALUE_PAT = /(sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/
const SECRET_KEY_ALLOW = /^(hasToken|tokenCount|tokens|token_?limit|secretName|secretInput)$/i

function deepScan(value, trail) {
  const hits = []
  if (value == null) return hits
  if (typeof value === 'string') {
    if (SECRET_VALUE_PAT.test(value)) hits.push({ path: trail || '(root)', reason: '值像明文密钥' })
    return hits
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) hits.push(...deepScan(value[i], (trail || '') + '[' + i + ']'))
    return hits
  }
  if (typeof value === 'object') {
    for (const k of Object.keys(value)) {
      const path2 = trail ? trail + '.' + k : k
      if (SECRET_KEY_PAT.test(k) && !SECRET_KEY_ALLOW.test(k)) {
        const v = value[k]
        if (typeof v === 'string' && v.length >= 8) hits.push({ path: path2, reason: '键名像凭据且值不为空（' + v.length + ' 字符）' })
        else if (v && typeof v === 'object' && Object.keys(v).length > 0) hits.push({ path: path2, reason: '键名像凭据且是对象' })
      }
      hits.push(...deepScan(value[k], path2))
    }
  }
  return hits
}

function scanSecrets() {
  const files = []
  try {
    for (const name of fs.readdirSync(DSH_HOME)) {
      if (!name.endsWith('.json')) continue
      files.push(path.join(DSH_HOME, name))
    }
  } catch (err) { /* ignore */ }
  try { files.push(path.join(profileDir(), 'package.json')) } catch (err) { /* ignore */ }

  const findings = []
  let scanned = 0
  for (const file of files) {
    let text = ''
    try { text = fs.readFileSync(file, 'utf8') } catch (err) { continue }
    if (!text) continue
    scanned += 1
    let doc = null
    try { doc = JSON.parse(text) } catch (err) { doc = null }
    if (doc) {
      for (const hit of deepScan(doc, '')) findings.push({ file: path.basename(file), path: hit.path, reason: hit.reason })
    } else if (SECRET_VALUE_PAT.test(text)) {
      findings.push({ file: path.basename(file), path: '(整文件)', reason: '文件里出现密钥格式的字符串' })
    }
  }
  return {
    ok: findings.length === 0,
    scanned,
    findings,
    note: findings.length ? '发现 ' + findings.length + ' 处疑似明文凭据，建议改放到系统凭据管理器' : '没发现明文凭据'
  }
}

function checkHealth() {
  const state = scan()
  if (!state.ok) return { ok: false, error: state.error || '扫描失败', items: [], problems: [], warnings: [] }
  const dir = profileDir()
  const items = []
  const problems = []
  const bootNames = (state.boots || []).map((b) => b.name)
  const list = [].concat(state.boots || [], state.others || [])
  for (const p of list) {
    const checks = []
    const pkgFile = path.join(dir, 'node_modules', p.name, 'package.json')
    const pkgOk = !!readJson(pkgFile)
    checks.push({ label: '包目录', ok: fs.existsSync(path.join(dir, 'node_modules', p.name)) })
    checks.push({ label: 'package.json', ok: pkgOk })
    let cfgOk = true
    let cfgDetail = '未创建（使用默认值）'
    if (p.configFile) {
      try { JSON.parse(fs.readFileSync(p.configFile, 'utf8')); cfgDetail = '可解析' }
      catch (err) { cfgOk = false; cfgDetail = 'JSON 损坏' }
    }
    checks.push({ label: '配置文件', ok: cfgOk, detail: cfgDetail })
    checks.push({ label: '已启用', ok: !!p.enabled, neutral: !p.enabled })
    const bad = checks.filter((c) => !c.ok && !c.neutral)
    if (bad.length) problems.push(p.name)
    items.push({
      name: p.name,
      version: p.version,
      kind: p.self ? 'self' : (bootNames.indexOf(p.name) !== -1 ? 'boot' : 'other'),
      enabled: !!p.enabled,
      checks,
      bad: bad.map((c) => c.label)
    })
  }
  const warnings = []
  const bootOn = (state.boots || []).filter((b) => b.enabled)
  if (bootOn.length > 1) {
    warnings.push('有 ' + bootOn.length + ' 个开机动画同时启用：' + bootOn.map((b) => b.name).join('、'))
  }
  ;['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'].forEach((core) => {
    if (state.bundles.indexOf(core) === -1) warnings.push('核心 bundle 缺失：' + core)
  })
  return {
    ok: problems.length === 0 && warnings.length === 0,
    profile: state.profile,
    checkedAt: new Date().toISOString(),
    items,
    problems,
    warnings
  }
}

export function apply(ctx) {

  /* 首次运行：延迟几秒自动对齐仓库最新版，不阻塞启动 */
  try {
    const bootTimer = setTimeout(() => { bootstrapLatest(ctx).catch(() => {}) }, 8000)
    if (bootTimer && typeof bootTimer.unref === 'function') bootTimer.unref()
  } catch (err) { /* 没有定时器能力就不做 */ }

  /* 运行时密钥扫描 */
  /* 插件审核：源代码 + 文档 */
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/audit',
    handler: (req, res) => {
      try {
        const q = String(req.url || '').split('?')[1] || ''
        const params = new URLSearchParams(q)
        sendJson(res, 200, auditPlugin(params.get('name') || ''))
      } catch (err) {
        sendJson(res, 200, { ok: false, error: String(err && err.message ? err.message : err) })
      }
    }
  }))

  /* 开机动画状态与冲突修复 */
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/boot',
    handler: async (req, res) => {
      try {
        const method = (req.method || 'GET').toUpperCase()
        if (method === 'GET') {
          sendJson(res, 200, detectBoots())
          return
        }
        const input = JSON.parse((await readBody(req)) || '{}')
        const action = String(input.action || 'repair')
        if (action === 'repair') {
          sendJson(res, 200, repairBootConflicts())
          return
        }
        if (action === 'set-default') {
          const name = String(input.name || '').trim()
          if (!name) throw new Error('需要 name')
          const info = detectBoots()
          if (!info.ok) throw new Error(info.error)
          if (!info.plugins.some((x) => x.name === name)) throw new Error('不是已安装的开机动画：' + name)
          writeCfg({ defaultBoot: name })
          /* 设为默认时顺便启用它并停用其他，避免「设了默认却不生效」 */
          setEnabled(name, true)
          sendJson(res, 200, Object.assign({ ok: true }, detectBoots()))
          return
        }
        throw new Error('未知动作：' + action)
      } catch (err) {
        sendJson(res, 200, { ok: false, error: String(err && err.message ? err.message : err) })
      }
    }
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/scan',
    handler: (req, res) => {
      try {
        sendJson(res, 200, Object.assign({ ok: true }, scanSecrets()))
      } catch (err) {
        sendJson(res, 200, { ok: false, error: String(err && err.message ? err.message : err) })
      }
    }
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/check',
    handler: (req, res) => {
      try {
        /* 兼容性自检：Node 版本和几个关键 API 是否齐备，缺了就在面板上说清楚 */
        const compat = {
          node: typeof process !== 'undefined' ? process.version : '',
          fetch: typeof fetch === 'function',
          abortController: typeof AbortController === 'function',
          nodeMajor: typeof process !== 'undefined' ? Number(String(process.version).replace(/^v/, '').split('.')[0]) || 0 : 0
        }
        compat.ok = compat.fetch && compat.abortController && compat.nodeMajor >= 18
        compat.note = compat.ok ? '' : '当前 Node ' + compat.node + ' 缺少 fetch/AbortController，检查更新与静默安装会不可用；建议升级到 Node 18+'
        let integrity = null
        try { integrity = checkIntegrity() } catch (err) { integrity = { error: String(err && err.message ? err.message : err) } }
        let secrets = null
        try { const sc = scanSecrets(); secrets = { ok: sc.ok, scanned: sc.scanned, count: sc.findings.length, note: sc.note } } catch (err) { secrets = null }
        sendJson(res, 200, Object.assign({ ok: true }, checkHealth(), { compat, integrity, secrets }))
      } catch (err) {
        sendJson(res, 200, { ok: false, error: String(err && err.message ? err.message : err) })
      }
    }
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/settings',
    handler: async (req, res) => {
      try {
        const name = (req.url || '').match(/[?&]name=([^&]+)/)
        const target = name ? decodeURIComponent(name[1]) : ''
        if (!target) throw new Error('缺少 name')
        if ((req.method || 'GET').toUpperCase() === 'POST') {
          const raw = await readBody(req)
          const patch = JSON.parse(raw || '{}')
          const saved = writePluginConfig(target, patch)
          sendJson(res, 200, { ok: true, config: saved, schema: schemaFor(target, saved), file: configFileOf(target) })
          return
        }
        sendJson(res, 200, Object.assign({ ok: true, name: target }, readPluginConfig(target)))
      } catch (err) {
        sendJson(res, 200, { ok: false, error: String(err && err.message ? err.message : err) })
      }
    }
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/list',
    handler: (req, res) => {
      let state = scan()
      /* 默认：新检测到的开机动画不启用。
         未在 confirmedBoots 里登记的开机动画，即使被 dsh plugin add 写进了 bundles，
         这里也把它移出去，等用户点「使用此开机动画」再登记并启用。 */
      const cfg = readCfg()
      const autoDisabled = []
      if (cfg.autoEnableNewBoot !== true) {
        for (const b of (state.boots || [])) {
          if (b.enabled && cfg.confirmedBoots.indexOf(b.name) === -1) {
            try { setEnabled(b.name, false); autoDisabled.push(b.name) } catch (err) { /* 忽略 */ }
          }
        }
      }
      if (autoDisabled.length) state = scan()
      sendJson(res, 200, Object.assign({ version: PLUGIN_VERSION, config: readCfg(), autoDisabled }, state))
    }
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/confirm-boot',
    handler: async (req, res) => {
      if ((req.method || 'GET').toUpperCase() !== 'POST') {
        sendJson(res, 405, { ok: false, error: '只支持 POST' })
        return
      }
      try {
        const raw = await readBody(req)
        const input = JSON.parse(raw || '{}')
        const target = String(input.name || '').trim()
        if (!target) throw new Error('缺少 name')
        const state = scan()
        const known = (state.boots || []).some((b) => b.name === target)
        if (!known) throw new Error('不是扫描到的开机动画：' + target)
        const cfg = readCfg()
        const list = cfg.confirmedBoots.slice()
        if (list.indexOf(target) === -1) list.push(target)
        writeCfg({ confirmedBoots: list })
        const result = setEnabled(target, true)
        sendJson(res, 200, Object.assign({ ok: true, confirmedBoots: readCfg().confirmedBoots }, result))
      } catch (err) {
        sendJson(res, 200, { ok: false, error: String(err && err.message ? err.message : err) })
      }
    }
  }))


  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/default-boot',
    handler: async (req, res) => {
      if ((req.method || 'GET').toUpperCase() !== 'POST') {
        sendJson(res, 405, { ok: false, error: '只支持 POST' })
        return
      }
      try {
        const raw = await readBody(req)
        const input = JSON.parse(raw || '{}')
        const target = String(input.name || '').trim()
        if (target) {
          const state = scan()
          if (!state.ok) throw new Error(state.error)
          if (!(state.boots || []).some((b) => b.name === target)) {
            throw new Error('不是扫描到的开机动画：' + target)
          }
        }
        sendJson(res, 200, { ok: true, config: writeCfg({ defaultBoot: target }) })
      } catch (err) {
        sendJson(res, 200, { ok: false, error: String(err && err.message ? err.message : err) })
      }
    }
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/plugin-update',
    handler: async (req, res) => {
      try {
        const name = (req.url || '').match(/[?&]name=([^&]+)/)
        const target = name ? decodeURIComponent(name[1]) : ''
        if (!target) throw new Error('缺少 name')
        sendJson(res, 200, await checkPluginUpdate(target))
      } catch (err) {
        sendJson(res, 200, { ok: false, error: String(err && err.message ? err.message : err) })
      }
    }
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/source',
    handler: async (req, res) => {
      try {
        if ((req.method || 'GET').toUpperCase() === 'GET') {
          sendJson(res, 200, { ok: true, sourceMode: readCfg().sourceMode })
          return
        }
        const raw = await readBody(req)
        const input = JSON.parse(raw || '{}')
        const target = String(input.name || '').trim()
        const mode = input.mode === 'remote' ? 'remote' : 'local'
        if (!target) throw new Error('缺少 name')
        const cfg = readCfg()
        const map = Object.assign({}, cfg.sourceMode || {})
        map[target] = mode
        writeCfg({ sourceMode: map })
        sendJson(res, 200, { ok: true, name: target, mode, sourceMode: readCfg().sourceMode })
      } catch (err) {
        sendJson(res, 200, { ok: false, error: String(err && err.message ? err.message : err) })
      }
    }
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/local-packages',
    handler: (req, res) => {
      try { sendJson(res, 200, scanLocalPackages()) }
      catch (err) { sendJson(res, 200, { ok: false, error: String(err && err.message ? err.message : err) }) }
    }
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/install-local',
    handler: async (req, res) => {
      if ((req.method || 'GET').toUpperCase() !== 'POST') {
        sendJson(res, 405, { ok: false, error: '只支持 POST' })
        return
      }
      try {
        const raw = await readBody(req)
        const input = JSON.parse(raw || '{}')
        sendJson(res, 200, installLocalPackage(input.file, input.force === true))
      } catch (err) {
        sendJson(res, 200, { ok: false, error: String(err && err.message ? err.message : err) })
      }
    }
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/reinstall',
    handler: async (req, res) => {
      if ((req.method || 'GET').toUpperCase() !== 'POST') {
        sendJson(res, 405, { ok: false, error: '只支持 POST' })
        return
      }
      try {
        const raw = await readBody(req)
        const input = JSON.parse(raw || '{}')
        const target = String(input.name || '').trim()
        if (!target) throw new Error('缺少 name')
        sendJson(res, 200, await reinstallPlugin(target, { source: input.source }))
      } catch (err) {
        sendJson(res, 200, { ok: false, error: String(err && err.message ? err.message : err) })
      }
    }
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/uninstall',
    handler: async (req, res) => {
      if ((req.method || 'GET').toUpperCase() !== 'POST') {
        sendJson(res, 405, { ok: false, error: '只支持 POST' })
        return
      }
      try {
        const raw = await readBody(req)
        const input = JSON.parse(raw || '{}')
        const target = String(input.name || '').trim()
        if (!target) throw new Error('缺少 name')
        sendJson(res, 200, uninstallPlugin(target))
      } catch (err) {
        sendJson(res, 200, { ok: false, error: String(err && err.message ? err.message : err) })
      }
    }
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/toggle',
    handler: async (req, res) => {
      if ((req.method || 'GET').toUpperCase() !== 'POST') {
        sendJson(res, 405, { ok: false, error: '只支持 POST' })
        return
      }
      try {
        const raw = await readBody(req)
        const input = JSON.parse(raw || '{}')
        const target = String(input.name || '').trim()
        if (!target) throw new Error('缺少 name')
        sendJson(res, 200, setEnabled(target, input.enabled !== false))
      } catch (err) {
        sendJson(res, 200, { ok: false, error: String(err && err.message ? err.message : err) })
      }
    }
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/config',
    handler: async (req, res) => {
      try {
        if ((req.method || 'GET').toUpperCase() === 'POST') {
          const raw = await readBody(req)
          const input = JSON.parse(raw || '{}')
          sendJson(res, 200, { ok: true, config: writeCfg(input) })
          return
        }
        sendJson(res, 200, { ok: true, config: readCfg() })
      } catch (err) {
        sendJson(res, 200, { ok: false, error: String(err && err.message ? err.message : err) })
      }
    }
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/versions',
    handler: async (req, res) => {
      try { sendJson(res, 200, await listVersions()) }
      catch (err) {
        sendJson(res, 200, { ok: false, repo: UPDATE_REPO, error: String(err && err.message ? err.message : err) })
      }
    }
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/install-version',
    handler: async (req, res) => {
      if ((req.method || 'GET').toUpperCase() !== 'POST') {
        sendJson(res, 405, { ok: false, error: '只支持 POST' })
        return
      }
      try {
        const raw = await readBody(req)
        const input = JSON.parse(raw || '{}')
        sendJson(res, 200, await installVersion(input.version))
      } catch (err) {
        sendJson(res, 200, { ok: false, error: String(err && err.message ? err.message : err) })
      }
    }
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/update',
    handler: async (req, res) => {
      try {
        const force = /[?&]force=1/.test(req.url || '')
        const result = await checkUpdate(force)
        sendJson(res, 200, result)
      } catch (err) {
        sendJson(res, 200, {
          ok: false,
          current: PLUGIN_VERSION,
          error: String(err && err.message ? err.message : err),
          repo: UPDATE_REPO,
          url: 'https://github.com/' + UPDATE_REPO
        })
      }
    }
  }))
}

export default { name, inject, apply }
