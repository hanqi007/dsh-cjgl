/* ============================================================================
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
      skipBoot: raw && raw.skipBoot === true
    }
  } catch (err) {
    return { autoUpdate: false, confirmedBoots: [], autoEnableNewBoot: false, defaultBoot: '', sources: {}, sourceMode: {}, repos: {}, skipBoot: false }
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
      repo: (cfgIn.repos && cfgIn.repos[name]) || parseRepoFromMeta(meta) || REPO_MAP[name] || ''
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
      const res = await fetch('https://api.github.com/repos/' + repo + '/contents/package.json', {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'dsh-cjgl', Accept: 'application/vnd.github.raw' }
      })
      if (!res.ok) throw new Error('读取仓库版本失败 HTTP ' + res.status)
      ver = String(JSON.parse(await res.text()).version || '').trim()
    } finally { clearTimeout(timer) }
  }
  if (!ver) throw new Error('无法确定 ' + name + ' 的版本号')
  const fileName = name + '-' + ver + '.tgz'
  const url = 'https://raw.githubusercontent.com/' + repo + '/main/dist/' + fileName

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
    const res = await fetch('https://api.github.com/repos/' + repo + '/contents/package.json', {
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
function installLocalPackage(fileName) {
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
  try {
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true })
    fs.renameSync(unpacked, target)
  } catch (err) {
    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch (e) {}
    throw new Error('写入失败：' + String(err && err.message ? err.message : err))
  }
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch (err) {}

  try { fs.rmSync(path.join(dir, 'pnpm-lock.yaml'), { force: true }) } catch (err) {}

  return { ok: true, name, version, file: full, restartRequired: true }
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

const DIST_PREFIX = 'https://raw.githubusercontent.com/' + UPDATE_REPO + '/main/dist/'

async function listVersions() {
  if (typeof fetch !== 'function') throw new Error('当前 Node 没有全局 fetch')
  const url = 'https://api.github.com/repos/' + UPDATE_REPO + '/contents/dist'
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
        url: DIST_PREFIX + f.name
      }))
      .sort((a, b) => cmpVersion(b.version, a.version))
    return { ok: true, current: PLUGIN_VERSION, repo: UPDATE_REPO, versions }
  } finally {
    clearTimeout(timer)
  }
}

/** 下载指定版本的包并重装管理器自身（改 dependencies 指向新包，再解压覆盖）。 */
async function installVersion(version) {
  const v = String(version || '').replace(/^v/, '').trim()
  if (!/^\d+\.\d+\.\d+$/.test(v)) throw new Error('版本号格式不对：' + version)
  if (typeof fetch !== 'function') throw new Error('当前 Node 没有全局 fetch')

  const url = DIST_PREFIX + 'dsh-cjgl-' + v + '.tgz'
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
  return Object.assign({ ok: true, installed: v, file: dest }, result)
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

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/check',
    handler: (req, res) => {
      try { sendJson(res, 200, Object.assign({ ok: true }, checkHealth())) }
      catch (err) { sendJson(res, 200, { ok: false, error: String(err && err.message ? err.message : err) }) }
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
        sendJson(res, 200, installLocalPackage(input.file))
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
