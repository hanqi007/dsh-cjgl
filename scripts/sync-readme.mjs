#!/usr/bin/env node
/**
 * 发版时同步 README 里的下载链接。
 *
 * 读 package.json 的 name / version，把 README 的「## 安装」一节里
 * 的 tgz 直链和命令行里的文件名替换成当前版本。
 *
 * 用法：
 *   node scripts/sync-readme.mjs            写回 README.md
 *   node scripts/sync-readme.mjs --check    只检查，不一致时退出码 1
 *   node scripts/sync-readme.mjs --dry      打印结果，不写文件
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const README = path.join(ROOT, 'README.md')
const PKG = path.join(ROOT, 'package.json')

const argv = process.argv.slice(2)
const CHECK = argv.includes('--check')
const DRY = argv.includes('--dry')

function fail(msg) {
  console.error('[sync-readme] ' + msg)
  process.exit(1)
}

if (!fs.existsSync(PKG)) fail('找不到 package.json：' + PKG)
if (!fs.existsSync(README)) fail('找不到 README.md：' + README)

const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'))
const name = pkg.name
const version = pkg.version
if (!name || !version) fail('package.json 缺 name 或 version')

/* 仓库坐标：优先 repository 字段，其次按仓库名 = 包名推断 */
function repoOf() {
  const r = pkg.repository
  if (typeof r === 'string') return r.replace(/^.*github\.com[:/]/, '').replace(/\.git$/, '')
  if (r && typeof r.url === 'string') return r.url.replace(/^.*github\.com[:/]/, '').replace(/\.git$/, '')
  return 'hanqi007/' + name
}
const REPO = repoOf()
const FILE = name + '-' + version + '.tgz'
const DL_URL = 'https://github.com/' + REPO + '/releases/download/v' + version + '/' + FILE

let text = fs.readFileSync(README, 'utf8')
const before = text

/* 1) 「直接下载」那一行的链接和文件名 */
text = text.replace(
  /(\*\*直接下载\*\*：\[`)[^`]+(`\]\()https?:\/\/[^)]+\.tgz(\))/,
  (m, a, b, c) => a + FILE + b + DL_URL + c
)

/* 2) 安装命令里的文件名 */
text = text.replace(/(C:\\\\?Downloads\\\\?)[^\s"]+\.tgz/g, '$1' + FILE)
text = text.replace(/(C:\\Downloads\\)[^\s"]+\.tgz/g, '$1' + FILE)

/* 3) Releases 页面的仓库路径 */
text = text.replace(/\[Releases 页面\]\(https:\/\/github\.com\/[^/]+\/[^/]+?\/releases\)/,
  '[Releases 页面](https://github.com/' + REPO + '/releases)')

/* 4) 如果「## 安装」里还没有直接下载行，就地补一条 */
if (!/\*\*直接下载\*\*/.test(text) && /^## 安装\s*$/m.test(text)) {
  text = text.replace(/^(## 安装\s*\n)/m,
    '$1\n**直接下载**：[`' + FILE + '`](' + URL + ')（最新正式版）\n')
}

if (text === before) {
  console.log('[sync-readme] 已经是最新（' + name + ' v' + version + '）')
  process.exit(0)
}

if (CHECK) {
  console.error('[sync-readme] README 与实际版本不一致，请运行 node scripts/sync-readme.mjs')
  console.error('  期望链接：' + DL_URL)
  process.exit(1)
}

if (DRY) {
  console.log(text)
  process.exit(0)
}

fs.writeFileSync(README, text, 'utf8')
console.log('[sync-readme] 已更新 README.md')
console.log('  ' + FILE)
console.log('  ' + DL_URL)
