/**
 * 不依赖插件市场目录的插件搜索。
 *
 * 背景：`dsh-plugin`（DSH Plugin Hub）的目录数据固定从 `api.dsh-plugin.org` 拉，
 * 那个域名在部分网络下连不通（DNS 能解析但连接被重置），缓存目录又是空的，
 * 于是插件市场只能显示「加载失败」。
 *
 * 但 npm 本身是通的——插件都是 npm 包。所以这里直接搜 npm，
 * 提供一个不依赖那个站点的替代入口。
 */
import { execFileSync } from 'node:child_process'

/* 搜哪些镜像：按顺序试，第一个通的就用 */
const SEARCH_ENDPOINTS = [
  'https://registry.npmmirror.com/-/v1/search',
  'https://registry.npmjs.org/-/v1/search'
]

/* 默认搜索词：插件的命名都很规律，dsh- 开头 */
const DEFAULT_QUERY = 'dsh-plugin'

/* 一次返回多少条 */
const PAGE_SIZE = 25

/** 判断一个包像不像 DSH 插件（看关键词与描述） */
function looksLikeDshPlugin(pkg) {
  const name = String(pkg.name || '').toLowerCase()
  const desc = String(pkg.description || '').toLowerCase()
  const kw = (pkg.keywords || []).map((x) => String(x).toLowerCase())
  if (kw.includes('dsh-plugin') || kw.includes('dsh')) return true
  if (/^dsh[-.]/.test(name)) return true
  if (desc.indexOf('deepseek harness') !== -1) return true
  if (desc.indexOf('harness 插件') !== -1 || desc.indexOf('dsh 插件') !== -1) return true
  return false
}

/** 从 npm 搜索接口里取一条结果，整理成面板能用的形状 */
function shape(obj) {
  const p = obj.package || {}
  return {
    name: String(p.name || ''),
    version: String(p.version || ''),
    description: String(p.description || '').slice(0, 200),
    date: String(p.date || ''),
    publisher: String((p.publisher && p.publisher.username) || ''),
    homepage: String((p.links && p.links.homepage) || ''),
    npm: String((p.links && p.links.npm) || ''),
    score: obj.score && typeof obj.score.final === 'number' ? Math.round(obj.score.final * 100) : 0,
    keywords: (p.keywords || []).slice(0, 8)
  }
}

/** 搜索一次，返回 { ok, endpoint, total, items } */
async function searchOnce(endpoint, text, size) {
  const url = endpoint + '?text=' + encodeURIComponent(text) + '&size=' + size
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'dsh-cjgl-search' },
    signal: AbortSignal.timeout(10000)
  })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const j = await res.json()
  const objects = Array.isArray(j.objects) ? j.objects : []
  return objects.map(shape).filter((x) => x.name)
}

/**
 * 搜插件。只保留看起来像 DSH 插件的包（关键词 / 命名 / 描述命中），
 * 避免把一堆同名的无关包塞给用户。
 *
 * 多个源并行竞速：同时发出去，第一个成功返回的立刻用，其余不等。
 * 串行的话碰到一个超时要白等 10 秒；并行最坏情况只等最快那个，
 * 慢的源在后台自己失败，不影响返回。
 */
export async function searchPlugins(text, opts) {
  const query = String(text || '').trim() || DEFAULT_QUERY
  const size = Number.isFinite(Number(opts && opts.size)) ? Math.max(1, Math.min(50, Number(opts.size))) : PAGE_SIZE
  const keepAll = !!(opts && opts.all)
  const started = Date.now()

  const attempts = SEARCH_ENDPOINTS.map((ep) =>
    searchOnce(ep, query, size).then((items) => ({ ep, items }))
  )

  const errors = []
  /* 逐条收割：谁先回来用谁。不用 Promise.any 是因为要拿「哪个源成功了」，
     而且它只抛 AggregateError，拿不到每个源各自的错因。 */
  const pending = new Set(attempts.map((_, i) => i))
  const results = new Array(attempts.length)

  while (pending.size) {
    const settled = await Promise.race(
      [...pending].map((i) =>
        attempts[i].then(
          (v) => ({ i, ok: true, v }),
          (e) => ({ i, ok: false, e })
        )
      )
    )
    pending.delete(settled.i)
    results[settled.i] = settled.ok ? settled.v : null
    if (settled.ok) {
      const items = settled.v.items
      const filtered = keepAll ? items : items.filter(looksLikeDshPlugin)
      return {
        ok: true,
        query,
        endpoint: settled.v.ep,
        total: items.length,
        items: filtered,
        elapsedMs: Date.now() - started,
        note: keepAll ? '' : ('已从 ' + items.length + ' 条原始结果里筛出 ' + filtered.length + ' 个像插件的包')
      }
    }
    errors.push(settled.e && settled.e.message ? settled.e.message : String(settled.e))
  }

  /* 全部失败：看看有没有「能连通但零结果」的，那也算成功（只是没搜到） */
  const empty = results.find((r) => r && Array.isArray(r.items) && r.items.length === 0)
  if (empty) {
    return { ok: true, query, endpoint: empty.ep, total: 0, items: [], elapsedMs: Date.now() - started, note: '源可达，但没有搜到匹配的包' }
  }
  return { ok: false, query, error: '所有 npm 源都搜不到', detail: errors.join(' ｜ ') }
}

/** 直接装：调 dsh 的插件命令（后台执行，不阻塞） */
export function installByName(name, opts) {
  const pkg = String(name || '').trim()
  if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(pkg)) {
    return { ok: false, error: '包名不合法：' + pkg }
  }
  const profile = String((opts && opts.profile) || 'desktop')
  const dsh = process.platform === 'win32'
    ? 'D:\\DSH\\resources\\runtime\\cli\\bin\\dsh.cmd'
    : 'dsh'
  try {
    execFileSync(dsh, ['plugin', '--profile', profile, 'add', pkg], {
      timeout: 120000,
      encoding: 'utf8',
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    })
    return { ok: true, name: pkg, note: '装好了。重启 DSH 生效。' }
  } catch (err) {
    const stderr = String((err && err.stderr) || '').slice(0, 300)
    return { ok: false, name: pkg, error: stderr || String(err && err.message ? err.message : err) }
  }
}
