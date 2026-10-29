/* ============================================================================
 * dsh-cjgl — 插件完整性自检
 * ----------------------------------------------------------------------------
 * 插件装坏了最常见的样子是「文件缺了但 package.json 还在」，宿主照常加载，
 * 然后某个路由 404 或首屏白屏。这里在 apply 之前把关键文件挨个验一遍，
 * 有问题就明确报到日志里，而不是等运行到一半才炸。
 *
 * 检查项：
 *   1. 关键文件是否存在、是否为普通文件、大小是否合理
 *   2. package.json 能否解析、name/version 字段是否齐全
 *
 * 注意：这里只做「体检」，不修也不阻断。发现问题只写警告，插件继续加载，
 *       因为半残的插件往往还能提供部分功能，直接拒绝加载反而更糟。
 * ========================================================================== */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 必须存在的文件（相对插件根目录） */
const REQUIRED_FILES = [
  'lib/index.js',
  'lib/client.js',
]

/** 文件最小字节数，小于它基本等于空文件/被截断 */
const MIN_BYTES = 32

/** 插件根目录：lib/ 的上一级 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 执行完整性检查。
 * @returns {{ok: boolean, root: string, problems: Array<{file: string, reason: string, detail?: string}>}}
 */
export function checkIntegrity() {
  const problems = []

  for (const rel of REQUIRED_FILES) {
    const abs = path.join(ROOT, rel)
    let stat = null
    try {
      stat = fs.statSync(abs)
    } catch (err) {
      problems.push({ file: rel, reason: 'missing', detail: err && err.code ? err.code : 'ENOENT' })
      continue
    }
    if (!stat.isFile()) {
      problems.push({ file: rel, reason: 'not-a-file' })
      continue
    }
    if (stat.size < MIN_BYTES) {
      problems.push({ file: rel, reason: 'too-small', detail: stat.size + ' bytes' })
    }
  }

  try {
    const raw = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
    const meta = JSON.parse(raw)
    if (!meta.name) problems.push({ file: 'package.json', reason: 'no-name' })
    if (!meta.version) problems.push({ file: 'package.json', reason: 'no-version' })
  } catch (err) {
    problems.push({ file: 'package.json', reason: 'unparsable', detail: String(err && err.message ? err.message : err) })
  }

  return { ok: problems.length === 0, root: ROOT, problems }
}

/**
 * 检查并上报。返回检查结果，调用方可以据此决定要不要降级。
 * @param {string} tag 日志前缀
 * @param {{warn?: Function, info?: Function}} [logger] 宿主提供的 logger，缺省用 console
 */
export function reportIntegrity(tag, logger) {
  const result = checkIntegrity()
  if (result.ok) return result

  const lines = result.problems.map(function (p) {
    return '  - ' + p.file + ' · ' + p.reason + (p.detail ? ' (' + p.detail + ')' : '')
  })
  const head = '[' + tag + '] 插件完整性检查未通过，共 ' + result.problems.length + ' 个问题：'
  const hint = '[' + tag + '] 建议：在插件管理器里对该插件执行「重装」，或重新安装对应版本包。'

  const write = function (msg) {
    if (logger && typeof logger.warn === 'function') logger.warn(msg)
    else console.warn(msg)
  }
  write(head + '\n' + lines.join('\n'))
  write(hint)

  return result
}
