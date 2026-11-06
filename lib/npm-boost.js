/**
 * npm 源加速：只在网络差的时候动，平时不碰配置。
 *
 * 背景：插件市场（dsh-plugin）装包走本机 npm，默认源 registry.npmjs.org
 * 在国内常要 2 秒起步，而镜像只要三四百毫秒。
 * dsh-plugin 自己只在「传输层失败」时换源，能连但很慢的情况它不会动，
 * 所以这里补一个主动测速 + 一键换源。
 *
 * 写入位置是 profile 目录下的 .npmrc（只影响这个 profile，不改全局）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

/* 与 dsh-plugin 的白名单保持一致：只在这些公共源之间切 */
export const REGISTRIES = [
  { host: 'registry.npmjs.org', url: 'https://registry.npmjs.org', label: 'npm 官方' },
  { host: 'registry.npmmirror.com', url: 'https://registry.npmmirror.com', label: 'npmmirror（阿里）' },
  { host: 'mirrors.cloud.tencent.com', url: 'https://mirrors.cloud.tencent.com/npm', label: '腾讯云' },
  { host: 'mirrors.tuna.tsinghua.edu.cn', url: 'https://mirrors.tuna.tsinghua.edu.cn/npm', label: '清华 TUNA' }
]

/* 慢于这个值就认为「网络不好」 */
const SLOW_MS = 1200
/* 测速时拿哪个包做探针：小、稳定、一定存在 */
const PROBE_PKG = 'dsh-plugin'

function profileDir() {
  if (process.env.DSH_PROFILE_DIR) return path.resolve(process.env.DSH_PROFILE_DIR)
  return path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')).split(path.sep).slice(0, -3).join(path.sep))
}

function npmrcPath() {
  return path.join(profileDir(), '.npmrc')
}

/** 本机当前生效的源（在 profile 目录下读，能读到本地 .npmrc） */
export function currentRegistry() {
  /* profile 自己的 .npmrc 优先级最高：dsh-plugin 在 profile 目录里跑 npm，
     会先读它——所以这也最接近实际生效值。 */
  const local = npmrcRegistry()
  if (local) return local
  try {
    const out = execFileSync('npm', ['config', 'get', 'registry'], {
      cwd: profileDir(),
      encoding: 'utf8',
      timeout: 5000,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const v = String(out || '').trim()
    if (/^https?:\/\//i.test(v)) return v.replace(/\/+$/, '')
  } catch (err) { /* npm 不在 PATH 或执行失败，走下面的默认值 */ }
  /* 读不到就按 npm 的出厂默认算——这也是 dsh-plugin 的兜底来源 */
  return 'https://registry.npmjs.org'
}

/** 读 profile 的 .npmrc 里写的源（没有就空串） */
export function npmrcRegistry() {
  try {
    const text = fs.readFileSync(npmrcPath(), 'utf8')
    const m = text.match(/^\s*registry\s*=\s*(\S+)\s*$/m)
    return m ? m[1].replace(/\/+$/, '') : ''
  } catch (err) {
    return ''
  }
}

/** 测一个源的元数据响应时间；失败返回 { error } */
async function probe(url) {
  const target = url.replace(/\/+$/, '') + '/' + PROBE_PKG
  const started = Date.now()
  try {
    const res = await fetch(target, {
      headers: { accept: 'application/vnd.npm.install-v1+json', 'user-agent': 'dsh-cjgl-speedtest' },
      signal: AbortSignal.timeout(8000)
    })
    const ms = Date.now() - started
    if (!res.ok) return { url, ms, ok: false, status: res.status }
    await res.arrayBuffer()
    return { url, ms, ok: true, status: res.status }
  } catch (err) {
    return { url, ms: Date.now() - started, ok: false, error: String(err && err.message ? err.message : err) }
  }
}

/** 并发测所有候选源，按耗时排序 */
export async function speedTest() {
  const results = await Promise.all(REGISTRIES.map((r) => probe(r.url).then((x) => Object.assign({ label: r.label, host: r.host }, x))))
  const ok = results.filter((r) => r.ok).sort((a, b) => a.ms - b.ms)
  const cur = currentRegistry()
  return {
    ok: true,
    current: cur,
    npmrc: npmrcRegistry(),
    slow: SLOW_MS,
    fastest: ok.length ? ok[0] : null,
    /** 当前源慢不慢：拿不到当前源就按「保守不换」处理 */
    currentSlow: (() => {
      const me = results.find((r) => r.url === cur)
      if (!me) return false
      return !me.ok || me.ms > SLOW_MS
    })(),
    results
  }
}

/** 把 profile 的 .npmrc 写成指定源（保留其它行） */
export function setRegistry(url) {
  const target = String(url || '').replace(/\/+$/, '')
  if (!REGISTRIES.some((r) => r.url === target)) {
    return { ok: false, error: '只允许切到已知公共镜像：' + REGISTRIES.map((r) => r.host).join(' / ') }
  }
  const file = npmrcPath()
  let lines = []
  try {
    lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  } catch (err) {
    lines = []
  }
  const kept = lines.filter((l) => !/^\s*registry\s*=/.test(l) && l.trim() !== '')
  kept.push('registry=' + target)
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, kept.join('\n') + '\n', 'utf8')
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) }
  }
  return { ok: true, path: file, registry: target }
}

/** 删掉 .npmrc 里的 registry 行（恢复跟随全局） */
export function clearRegistry() {
  const file = npmrcPath()
  let lines = []
  try {
    lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  } catch (err) {
    return { ok: true, path: file, note: '没有 .npmrc，无需清理' }
  }
  const kept = lines.filter((l) => !/^\s*registry\s*=/.test(l) && l.trim() !== '')
  try {
    if (kept.length) fs.writeFileSync(file, kept.join('\n') + '\n', 'utf8')
    else fs.rmSync(file, { force: true })
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) }
  }
  return { ok: true, path: file }
}

/**
 * 「只在网络不好时加速」：测速 → 当前源确实慢、且有明显更快的 → 才换。
 * 返回 { changed, before, after, reason }。
 */
export async function autoBoost() {
  const st = await speedTest()
  if (!st.currentSlow) {
    return { ok: true, changed: false, before: st.current, reason: '当前源够快，不动配置' }
  }
  const fast = st.fastest
  if (!fast || fast.url === st.current) {
    return { ok: true, changed: false, before: st.current, reason: '没有更快的备用源' }
  }
  if (fast.ms > SLOW_MS) {
    return { ok: true, changed: false, before: st.current, reason: '所有源都慢（' + fast.ms + 'ms），保持原样' }
  }
  const r = setRegistry(fast.url)
  if (!r.ok) return Object.assign({ changed: false, before: st.current }, r)
  return {
    ok: true,
    changed: true,
    before: st.current,
    after: fast.url,
    gain: (st.results.find((x) => x.url === st.current) || {}).ms - fast.ms,
    path: r.path,
    reason: '当前源 ' + ((st.results.find((x) => x.url === st.current) || {}).ms || '?') + 'ms，切到 ' + fast.label + '（' + fast.ms + 'ms）'
  }
}
