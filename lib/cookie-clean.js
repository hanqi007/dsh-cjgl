/**
 * DSH Cookie 膨胀清理
 *
 * 背景：DSH 桌面端每次启动用随机端口（--port 0），认证 Cookie 名是
 * `dsh-auth-<hash>`（含端口），但 Domain 都是 127.0.0.1 —— 不区分端口。
 * 于是每次启动都新增一条，旧的 30 天后才过期且从不主动清理，
 * 请求时全部打包发送，累积到 72 条左右就撞上 Node 的 16 KB 请求头上限，
 * 表现为「Web authentication failed」。
 *
 * 这个模块：
 *   1. 定位 Electron 的 Cookies 数据库
 *   2. 统计 dsh-auth-* 数量与估算请求头体积
 *   3. 在 DSH 未运行时，删掉除最新 N 条以外的 dsh-auth-*
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/* Node 22.5+ 才有 node:sqlite；老版本降级为「只能报告不能清理」 */
let DatabaseSync = null
try {
  const m = await import('node:sqlite')
  DatabaseSync = m.DatabaseSync || null
} catch (err) {
  DatabaseSync = null
}

const COOKIE_PREFIX = 'dsh-auth-'
/* 每条 Cookie 在请求头里大约占多少字节（name+value+属性分隔符） */
const BYTES_PER_COOKIE = 227
/* Node 的请求头上限 */
const NODE_HEADER_LIMIT = 16384
/* 只保留最新的这么多条，其余删掉 */
const KEEP_LATEST = 3

function appDataDirs() {
  const out = []
  const add = (p) => { if (p && !out.includes(p)) out.push(p) }
  const roaming = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  for (const root of [roaming, local]) {
    try {
      for (const name of fs.readdirSync(root)) {
        if (!/deepseek/i.test(name)) continue
        add(path.join(root, name))
      }
    } catch (err) { /* 目录读不到就算了 */ }
  }
  return out
}

/** 找出所有 Cookies 数据库 */
function findCookieDbs() {
  const dbs = []
  for (const base of appDataDirs()) {
    const walk = (dir, depth) => {
      if (depth > 4) return
      let list = []
      try { list = fs.readdirSync(dir, { withFileTypes: true }) } catch (err) { return }
      for (const ent of list) {
        const full = path.join(dir, ent.name)
        if (ent.isDirectory()) walk(full, depth + 1)
        else if (ent.name === 'Cookies') dbs.push(full)
      }
    }
    walk(base, 0)
  }
  return dbs
}

/** 只查文件大小——DSH 运行时数据库被独占锁，读不了内容 */
function inspectSize(db) {
  try {
    const st = fs.statSync(db)
    const est = Math.round(st.size / BYTES_PER_COOKIE)
    return {
      path: db,
      bytes: st.size,
      estimatedCookies: est,
      estimatedHeaderBytes: est * BYTES_PER_COOKIE,
      risk: est * BYTES_PER_COOKIE > NODE_HEADER_LIMIT * 0.8 ? 'high'
        : (est * BYTES_PER_COOKIE > NODE_HEADER_LIMIT * 0.5 ? 'medium' : 'low')
    }
  } catch (err) {
    return { path: db, error: String(err && err.message ? err.message : err) }
  }
}

/** 打开数据库读明细；DSH 在跑时会失败，返回 error */
function inspectContent(db) {
  if (!DatabaseSync) return { path: db, error: '当前 Node 没有 node:sqlite（需要 22.5+）' }
  try {
    const d = new DatabaseSync(db, { readOnly: true })
    const rows = d.prepare('SELECT name, host_key, length(encrypted_value) AS sz FROM cookies').all()
    const auth = rows.filter((r) => String(r.name).startsWith(COOKIE_PREFIX))
    const bytes = auth.reduce((a, r) => a + (r.sz || 0), 0)
    d.close()
    return {
      path: db,
      total: rows.length,
      authCount: auth.length,
      authBytes: bytes,
      estimatedHeaderBytes: auth.length * BYTES_PER_COOKIE,
      locked: false
    }
  } catch (err) {
    return {
      path: db,
      locked: true,
      error: String(err && err.message ? err.message : err)
    }
  }
}

/**
 * 拿到 Electron 的 session —— 只在 DSH 主进程里可用。
 * 有 session 就能在运行中直接读删 Cookie，不用退出 DSH。
 */
async function electronSession() {
  try {
    const mod = await import('electron')
    const s = mod && (mod.session || (mod.default && mod.default.session))
    if (!s) return null
    return s.defaultSession || s.fromPartition('persist:default') || null
  } catch (err) {
    return null
  }
}

/**
 * 走 Electron API 清理：不依赖数据库文件锁，DSH 运行中也能生效。
 * 返回 null 表示当前环境没有 Electron，调用方应退回 SQLite 方案。
 */
export async function cleanViaElectron(keep) {
  const sess = await electronSession()
  if (!sess) return null
  const keepN = Number.isFinite(Number(keep)) ? Math.max(1, Number(keep)) : KEEP_LATEST
  try {
    const all = await sess.cookies.get({})
    const auth = all.filter((c) => String(c.name).startsWith(COOKIE_PREFIX))
    if (auth.length <= keepN) {
      return { ok: true, via: 'electron', before: auth.length, deleted: 0, after: auth.length, keepLatest: keepN }
    }
    /* 按创建时间倒序。Electron 的 Cookie 对象有 creationDate（若有），
       否则用 expirationDate —— 有效期固定 30 天，过期越晚即创建越晚。 */
    const stamp = (c) => Number(c.creationDate) || Number(c.expirationDate) || 0
    const sorted = auth.slice().sort((a, b) => stamp(b) - stamp(a))
    const drop = sorted.slice(keepN)
    let deleted = 0
    for (const c of drop) {
      const host = String(c.domain || '127.0.0.1').replace(/^\./, '')
      const url = (c.secure ? 'https://' : 'http://') + host + (c.path || '/')
      try {
        await sess.cookies.remove(url, c.name)
        deleted += 1
      } catch (err) { /* 单条失败继续 */ }
    }
    const after = (await sess.cookies.get({})).filter((c) => String(c.name).startsWith(COOKIE_PREFIX)).length
    return { ok: true, via: 'electron', before: auth.length, deleted, after, keepLatest: keepN }
  } catch (err) {
    return { ok: false, via: 'electron', error: String(err && err.message ? err.message : err) }
  }
}

/**
 * 走 Electron 读状态（不删）：拿到精确条数，比按文件大小估算准。
 */
export async function statusViaElectron() {
  const sess = await electronSession()
  if (!sess) return null
  try {
    const all = await sess.cookies.get({})
    const auth = all.filter((c) => String(c.name).startsWith(COOKIE_PREFIX))
    const bytes = auth.reduce((a, c) => a + String(c.name).length + String(c.value || '').length + 8, 0)
    return {
      ok: true,
      via: 'electron',
      total: all.length,
      authCount: auth.length,
      authBytes: bytes,
      estimatedHeaderBytes: auth.length * BYTES_PER_COOKIE
    }
  } catch (err) {
    return null
  }
}

/** 报告现状：优先读内容，读不了就退回看文件大小 */
export function cookieStatus() {
  const dbs = findCookieDbs()
  const items = dbs.map((db) => {
    const content = inspectContent(db)
    if (content.locked || content.error) {
      const size = inspectSize(db)
      return Object.assign({ locked: true }, size, { note: content.error })
    }
    return content
  })
  const totalAuth = items.reduce((a, x) => a + (x.authCount || 0), 0)
  const estimatedHeader = items.reduce((a, x) => a + (x.estimatedHeaderBytes || 0), 0)
  return {
    ok: true,
    limit: NODE_HEADER_LIMIT,
    bytesPerCookie: BYTES_PER_COOKIE,
    keepLatest: KEEP_LATEST,
    totalAuth,
    estimatedHeaderBytes: estimatedHeader,
    usagePercent: Math.min(100, Math.round((estimatedHeader / NODE_HEADER_LIMIT) * 100)),
    risk: estimatedHeader > NODE_HEADER_LIMIT * 0.8 ? 'high'
      : (estimatedHeader > NODE_HEADER_LIMIT * 0.5 ? 'medium' : 'low'),
    dbs: items
  }
}

/**
 * 清理：只保留最新的 KEEP_LATEST 条 dsh-auth-*，其余删除。
 * DSH 必须在退出状态，否则数据库被锁。
 */
export function cleanCookies(keep) {
  const keepN = Number.isFinite(Number(keep)) ? Math.max(1, Number(keep)) : KEEP_LATEST
  if (!DatabaseSync) {
    return { ok: false, error: '当前 Node 没有 node:sqlite（需要 22.5+），无法清理' }
  }
  const dbs = findCookieDbs()
  if (!dbs.length) return { ok: false, error: '没有找到 DSH 的 Cookies 数据库' }

  const results = []
  for (const db of dbs) {
    try {
      const d = new DatabaseSync(db)
      /* 按「创建时间」倒序取最新的几条。
         Chromium 的 cookies 表有 creation_utc / expires_utc 两列（1601 年起的微秒），
         这里优先用 creation_utc；极老的库没有这一列就退回 expires_utc
         （Cookie 有效期固定 30 天，所以过期越晚 = 创建越晚）。 */
      let rows
      try {
        rows = d.prepare(
          "SELECT rowid, name, creation_utc FROM cookies WHERE name LIKE '" + COOKIE_PREFIX + "%' ORDER BY creation_utc DESC"
        ).all()
      } catch (e1) {
        rows = d.prepare(
          "SELECT rowid, name, expires_utc FROM cookies WHERE name LIKE '" + COOKIE_PREFIX + "%' ORDER BY expires_utc DESC"
        ).all()
      }
      if (rows.length <= keepN) {
        results.push({ path: db, before: rows.length, deleted: 0, after: rows.length })
        d.close()
        continue
      }
      const drop = rows.slice(keepN).map((r) => r.rowid)
      const stmt = d.prepare('DELETE FROM cookies WHERE rowid = ?')
      for (const id of drop) stmt.run(id)
      const after = d.prepare("SELECT count(*) AS c FROM cookies WHERE name LIKE '" + COOKIE_PREFIX + "%'").get()
      results.push({ path: db, before: rows.length, deleted: drop.length, after: after ? after.c : 0 })
      d.close()
    } catch (err) {
      results.push({
        path: db,
        error: /locked|busy/i.test(String(err && err.message))
          ? '数据库被锁——请先完全退出 DSH 再清理'
          : String(err && err.message ? err.message : err)
      })
    }
  }
  const deleted = results.reduce((a, r) => a + (r.deleted || 0), 0)
  return { ok: deleted > 0, deleted, keepLatest: keepN, dbs: results }
}
