#!/usr/bin/env node
/* ============================================================================
 * dsh-cjgl — 独立命令行（管理器插件卸载后依然可用）
 * ----------------------------------------------------------------------------
 * 管理器的功能本质就是「改 profile 的 package.json + 摆弄 node_modules」。
 * 这些不需要 Harness 进程，所以做成 CLI：即使把 dsh-cjgl 自己卸了，
 * 也能继续启用/禁用/卸载/重装其他插件。
 *
 *   dsh-cjgl list                       列出插件与启用状态
 *   dsh-cjgl enable <name>              启用
 *   dsh-cjgl disable <name>             禁用
 *   dsh-cjgl boot <name>                设默认开机动画
 *   dsh-cjgl uninstall <name>           卸载（依赖 + bundles + 目录）
 *   dsh-cjgl reinstall <name>           用 ~/.dsh/packages 里的 tgz 重装
 *   dsh-cjgl info <name>                看单插件详情
 *
 * 不依赖 Host；改完 profile 需要重启 Harness 生效。
 * ========================================================================== */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const PROFILE_DIR = process.env.DSH_PROFILE_DIR || path.join(HOME, 'profiles', 'desktop')
const PKG_FILE = path.join(PROFILE_DIR, 'package.json')
const CFG_FILE = path.join(HOME, 'dsh-cjgl.json')
const PACKAGES = path.join(HOME, 'packages')
const NODE_MODULES = path.join(PROFILE_DIR, 'node_modules')

const PROTECTED = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (err) { return fallback }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8')
  fs.renameSync(tmp, file)
}

function readProfile() {
  const pkg = readJson(PKG_FILE, null)
  if (!pkg) throw new Error('读不到 profile：' + PKG_FILE)
  return pkg
}

function saveProfile(pkg) {
  const backup = PKG_FILE + '.bak'
  try { fs.copyFileSync(PKG_FILE, backup) } catch (err) { /* 首次没有原文件 */ }
  writeJson(PKG_FILE, pkg)
}

function bundlesOf(pkg) {
  if (pkg.dsh && pkg.dsh.profile && Array.isArray(pkg.dsh.profile.bundles)) return pkg.dsh.profile.bundles
  return []
}

function setBundles(pkg, list) {
  pkg.dsh = pkg.dsh || {}
  pkg.dsh.profile = pkg.dsh.profile || {}
  pkg.dsh.profile.bundles = list
  return pkg
}

function isBootPlugin(name, meta) {
  const n = String(name || '').toLowerCase()
  const desc = String((meta && meta.description) || '')
  if (/boot|splash|startup|anim/.test(n)) return true
  /* 描述里写「开机动画」的也算，但管理器自己的描述里也有这个词，排除掉 */
  return /开机动画/.test(desc) && !/管理器|管理插件/.test(desc)
}

function list() {
  const pkg = readProfile()
  const deps = Object.keys(pkg.dependencies || {})
  const bundles = bundlesOf(pkg)
  const names = [...new Set(deps.concat(bundles))].filter((n) => PROTECTED.indexOf(n) === -1)
  if (!names.length) { console.log('（没有插件）'); return }
  names.sort()
  console.log('plugin'.padEnd(26) + 'ver'.padEnd(9) + 'bundle  分类')
  for (const name of names) {
    const meta = readJson(path.join(NODE_MODULES, name, 'package.json'), null)
    const on = bundles.indexOf(name) !== -1
    const boot = isBootPlugin(name, meta)
    console.log(
      name.padEnd(26) +
      String((meta && meta.version) || '—').padEnd(9) +
      (on ? 'yes ' : 'no  ').padEnd(8) +
      (boot ? '开机动画' : '普通插件') + (meta ? '' : '  (缺 package.json)')
    )
  }
}

function enable(name) {
  const pkg = readProfile()
  const bundles = bundlesOf(pkg)
  if (bundles.indexOf(name) !== -1) { console.log(name, '已经是启用状态'); return }
  const meta = readJson(path.join(NODE_MODULES, name, 'package.json'), null)
  if (!meta) throw new Error('没装这个插件：' + name)
  const boot = isBootPlugin(name, meta)
  let next = bundles.slice()
  if (boot) {
    /* 开机动画互斥：先把别的开机动画摘掉 */
    next = next.filter((n) => !(isBootPlugin(n, readJson(path.join(NODE_MODULES, n, 'package.json'), null))))
  }
  next.push(name)
  setBundles(pkg, next)
  saveProfile(pkg)
  console.log('已启用', name, boot ? '（互斥：其他开机动画已停用）' : '')
}

function disable(name) {
  if (PROTECTED.indexOf(name) !== -1) throw new Error('核心 bundle 不能停用：' + name)
  const pkg = readProfile()
  const bundles = bundlesOf(pkg)
  if (bundles.indexOf(name) === -1) { console.log(name, '本来就没启用'); return }
  setBundles(pkg, bundles.filter((n) => n !== name))
  saveProfile(pkg)
  console.log('已停用', name)
}

function boot(name) {
  const cfg = readJson(CFG_FILE, {})
  cfg.defaultBoot = name || ''
  writeJson(CFG_FILE, cfg)
  console.log(name ? '默认开机动画设为 ' + name : '已清空默认开机动画')
}

function info(name) {
  const meta = readJson(path.join(NODE_MODULES, name, 'package.json'), null)
  const pkg = readProfile()
  console.log('插件      ', name)
  console.log('版本      ', (meta && meta.version) || '（未安装）')
  console.log('启用      ', bundlesOf(pkg).indexOf(name) !== -1 ? '是' : '否')
  console.log('dependencies', (pkg.dependencies || {})[name] || '（不在 dependencies）')
  console.log('说明      ', (meta && meta.description) || '—')
  const cfg = readJson(CFG_FILE, {})
  if (cfg.defaultBoot === name) console.log('默认开机动画 是')
}

function uninstall(name) {
  if (PROTECTED.indexOf(name) !== -1) throw new Error('核心 bundle 不能卸载：' + name)
  const pkg = readProfile()
  const bundles = bundlesOf(pkg).filter((n) => n !== name)
  setBundles(pkg, bundles)
  if (pkg.dependencies && pkg.dependencies[name]) delete pkg.dependencies[name]
  saveProfile(pkg)
  const dir = path.join(NODE_MODULES, name)
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch (err) { /* 目录可能不在 */ }
  const cfg = readJson(CFG_FILE, {})
  if (cfg.defaultBoot === name) { cfg.defaultBoot = ''; writeJson(CFG_FILE, cfg) }
  console.log('已卸载', name, '（依赖、bundles、目录都已清）')
}

function upgrade(file) {
  if (!file) throw new Error('用法：dsh-cjgl upgrade <file.tgz>')
  const abs = path.resolve(file)
  if (!fs.existsSync(abs)) throw new Error('找不到文件：' + abs)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cjgl-up-'))
  try {
    execFileSync('tar', ['-xzf', abs, '-C', tmp], { stdio: 'ignore' })
    const src = path.join(tmp, 'package')
    const meta = readJson(path.join(src, 'package.json'), null)
    if (!meta || !meta.name) throw new Error('tgz 里没有有效的 package/package.json')
    const name = meta.name
    const version = meta.version || '0.0.0'
    /* 1) 复制进 packages，留个可重装的源 */
    fs.mkdirSync(PACKAGES, { recursive: true })
    const dstTgz = path.join(PACKAGES, name + '-' + version + '.tgz')
    fs.copyFileSync(abs, dstTgz)
    /* 2) 覆盖 node_modules（先删再放，确保旧文件不残留） */
    const dst = path.join(NODE_MODULES, name)
    fs.rmSync(dst, { recursive: true, force: true })
    fs.cpSync(src, dst, { recursive: true })
    /* 3) 写回 profile 的 dependencies */
    const profile = readProfile()
    profile.dependencies = profile.dependencies || {}
    profile.dependencies[name] = 'file:' + dstTgz.replace(/\\/g, '/')
    saveProfile(profile)
    console.log('已覆盖升级 ' + name + ' → ' + version)
    console.log('  node_modules:', dst)
    console.log('  安装源      :', dstTgz)
    console.log('重启 Harness 后生效。')
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

function reinstall(name) {
  const candidates = fs.existsSync(PACKAGES)
    ? fs.readdirSync(PACKAGES).filter((n) => n === name + '.tgz' || n.startsWith(name + '-')).sort()
    : []
  if (!candidates.length) throw new Error('~/.dsh/packages 里没有 ' + name + ' 的 tgz')
  const tgz = path.join(PACKAGES, candidates[candidates.length - 1])
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cjgl-'))
  try {
    /* 用系统 tar 解压（和 Host 里静默更新同一套做法） */
    execFileSync('tar', ['-xzf', tgz, '-C', tmp], { stdio: 'ignore' })
    const src = path.join(tmp, 'package')
    if (!fs.existsSync(src)) throw new Error('tgz 结构不对：缺少 package/ 目录')
    const dst = path.join(NODE_MODULES, name)
    fs.rmSync(dst, { recursive: true, force: true })
    fs.cpSync(src, dst, { recursive: true })
    console.log('已从', path.basename(tgz), '重装到', dst)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

/* ── 入口 ────────────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2)
const cmd = argv[0] || 'help'
const name = argv[1]

try {
  switch (cmd) {
    case 'list': case 'ls': list(); break
    case 'enable': if (!name) throw new Error('用法：dsh-cjgl enable <name>'); enable(name); break
    case 'disable': if (!name) throw new Error('用法：dsh-cjgl disable <name>'); disable(name); break
    case 'boot': boot(name); break
    case 'info': if (!name) throw new Error('用法：dsh-cjgl info <name>'); info(name); break
    case 'uninstall': case 'rm': if (!name) throw new Error('用法：dsh-cjgl uninstall <name>'); uninstall(name); break
    case 'reinstall': if (!name) throw new Error('用法：dsh-cjgl reinstall <name>'); reinstall(name); break
    case 'upgrade': if (!name) throw new Error('用法：dsh-cjgl upgrade <file.tgz>'); upgrade(name); break
    case 'help': case '-h': case '--help':
      console.log(`dsh-cjgl — 插件管理命令行（不依赖管理器插件本身）

  dsh-cjgl list                  列出插件与启用状态
  dsh-cjgl enable <name>         启用（开机动画互斥）
  dsh-cjgl disable <name>        停用
  dsh-cjgl boot <name>           设默认开机动画
  dsh-cjgl info <name>           看详情
  dsh-cjgl uninstall <name>      卸载
  dsh-cjgl reinstall <name>      从 ~/.dsh/packages 里的 tgz 重装
  dsh-cjgl upgrade <file.tgz>    用指定 tgz 覆盖升级（先删旧目录再放，杜绝残留）

直接改 profile 的 package.json（自动留 .bak）��改完重启 Harness 生效。`)
      break
    default:
      console.error('未知命令：' + cmd + '（试试 dsh-cjgl help）')
      process.exitCode = 1
  }
} catch (err) {
  console.error('出错：' + (err && err.message ? err.message : err))
  process.exitCode = 1
}
