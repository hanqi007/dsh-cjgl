#!/usr/bin/env node
/**
 * zjhqgx-security.json 签名工具（单签名）
 * ----------------------------------------------------------------------------
 * 公告用 Ed25519 签名，插件内置对应公钥。
 * 另附 SHA-512 内容指纹，先校指纹再验签。
 *
 * 用法：
 *   node sign-security.mjs                    # 用默认路径签名
 *   node sign-security.mjs --key D:\a.pem     # 指定私钥
 *   node sign-security.mjs --file x.json      # 指定公告文件
 *   node sign-security.mjs --verify           # 只校验，不签
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import readline from 'node:readline'
import path from 'node:path'

const DEFAULT_FILE = 'D:\\xm\\deepseek\\01\\zjhqgx-security.json'
const DEFAULT_KEY = path.join(os.homedir(), '.dsh', 'zjhqgx-key-a.pem')

const KEY_ID = 'zjhqgx-key-a'

/* 已授予的公钥；换密钥时同步改插件里的常量 */
const PUBLIC_KEY = 'MCowBQYDK2VwAyEATOoFQQwv8VFoxDfrwN0XQ6vMy0an97IOD1sDz0OGTHY='

/* ── 参数解析 ─────────────────────────────────────────────────────────── */
function parseArgs(argv) {
  const out = { file: DEFAULT_FILE, key: DEFAULT_KEY, verify: false, pass: '' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--verify') out.verify = true
    else if (a === '--file') out.file = argv[++i]
    else if (a === '--key') out.key = argv[++i]
    else if (a === '--pass') out.pass = argv[++i]
    else if (a === '--help' || a === '-h') out.help = true
  }
  return out
}

/* 私钥口令：优先命令行，其次环境变量，最后交互输入 */
function resolvePassphrase(explicit) {
  if (explicit) return Promise.resolve(explicit)
  if (process.env.ZJHQGX_KEY_PASS) return Promise.resolve(process.env.ZJHQGX_KEY_PASS)
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const origWrite = process.stdout.write.bind(process.stdout)
    rl.question('私钥口令: ', (answer) => {
      rl.close()
      process.stdout.write('\n')
      resolve(answer)
    })
    rl._writeToOutput = function (str) {
      if (str.includes('\n')) origWrite(str)
      else origWrite('*')
    }
  })
}

/* 读私钥：先试无口令，失败再要口令 */
async function loadPrivateKey(keyPath, passHint) {
  const pem = fs.readFileSync(keyPath, 'utf8')
  try {
    return crypto.createPrivateKey(pem)
  } catch (err) {
    /* 需要口令 */
  }
  const pass = await resolvePassphrase(passHint)
  if (!pass) throw new Error('私钥已加密，但没有提供口令')
  return crypto.createPrivateKey({ key: pem, passphrase: pass })
}

/* ── 规范化：对象键递归排序，数组保序 ──────────────────────────────────── */
function canonicalize(v) {
  if (Array.isArray(v)) return v.map(canonicalize)
  if (v && typeof v === 'object') {
    const out = {}
    for (const k of Object.keys(v).sort()) out[k] = canonicalize(v[k])
    return out
  }
  return v
}

/* 签名对象 = 文档剔除 integrity / signature / signatures / signedAt 之后的规范化 JSON */
function payloadOf(doc) {
  const copy = Object.assign({}, doc)
  delete copy.integrity
  delete copy.signature
  delete copy.signatures
  delete copy.signedAt
  return JSON.stringify(canonicalize(copy))
}

/* ── 校验 ─────────────────────────────────────────────────────────────── */
function verifyDoc(doc) {
  const problems = []

  if (!doc || typeof doc !== 'object') return ['不是对象']
  if (!Array.isArray(doc.advisories)) problems.push('advisories 不是数组')

  /* 1) 指纹 */
  const integ = doc.integrity
  if (!integ || !integ.sha512) {
    problems.push('缺少 integrity.sha512')
  } else {
    const actual = crypto.createHash('sha512').update(payloadOf(doc), 'utf8').digest('base64')
    if (actual !== String(integ.sha512)) problems.push('integrity.sha512 不匹配')
  }

  /* 2) 签名 */
  const sig = doc.signature
  if (!sig || !sig.value) {
    problems.push('缺少 signature')
    return problems
  }
  if (String(sig.keyId || '') !== KEY_ID) problems.push('signature.keyId 不匹配')
  if (String(sig.alg || '') !== 'ed25519') problems.push('signature.alg 不是 ed25519')

  if (problems.length === 0) {
    try {
      const key = crypto.createPublicKey({
        key: Buffer.from(PUBLIC_KEY, 'base64'),
        format: 'der',
        type: 'spki'
      })
      const ok = crypto.verify(
        null,
        Buffer.from(payloadOf(doc), 'utf8'),
        key,
        Buffer.from(String(sig.value), 'base64')
      )
      if (!ok) problems.push('签名无效')
    } catch (err) {
      problems.push('验签异常：' + (err && err.message ? err.message : err))
    }
  }

  return problems
}

/* ── 签名 ─────────────────────────────────────────────────────────────── */
function signDoc(doc, priv) {
  const payload = payloadOf(doc)

  const sha512 = crypto.createHash('sha512').update(payload, 'utf8').digest('base64')
  doc.integrity = { sha512, alg: 'sha512' }

  const sig = crypto.sign(null, Buffer.from(payload, 'utf8'), priv)
  doc.signature = {
    alg: 'ed25519',
    keyId: KEY_ID,
    value: sig.toString('base64')
  }
  doc.signedAt = new Date().toISOString()

  const ordered = {}
  const preferred = ['schema', 'updated', 'policy', 'changelog', 'fieldSpec', 'channels', 'advisories', 'decoys', 'integrity', 'signature', 'signedAt']
  for (const k of preferred) {
    if (doc[k] !== undefined) ordered[k] = doc[k]
  }
  /* 兜底：新增字段不会被漏掉，否则「签名时算了、写回时丢了」会导致自检失败 */
  for (const k of Object.keys(doc)) {
    if (ordered[k] === undefined) ordered[k] = doc[k]
  }
  return ordered
}

/* ── 主流程 ───────────────────────────────────────────────────────────── */
async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    console.log('用法: node sign-security.mjs [--file <json>] [--key <pem>] [--pass <口令>] [--verify]')
    return
  }

  if (!fs.existsSync(args.file)) {
    console.error('找不到公告文件: ' + args.file)
    process.exit(1)
  }

  const doc = JSON.parse(fs.readFileSync(args.file, 'utf8'))

  /* 只校验 */
  if (args.verify) {
    const problems = verifyDoc(doc)
    if (problems.length === 0) {
      console.log('校验通过：指纹与签名均有效')
      return
    }
    console.error('校验失败：')
    for (const p of problems) console.error('  - ' + p)
    process.exit(1)
  }

  /* 签名 */
  if (!fs.existsSync(args.key)) {
    console.error('找不到私钥: ' + args.key)
    process.exit(1)
  }

  let priv
  try {
    priv = await loadPrivateKey(args.key, args.pass)
  } catch (err) {
    console.error('读取私钥失败：' + (err && err.message ? err.message : err))
    process.exit(1)
  }
  const signed = signDoc(doc, priv)

  /* 先自检，通过了才落盘——避免写出半成品把原文件覆盖掉 */
  const problems = verifyDoc(signed)
  if (problems.length > 0) {
    console.error('自检失败，未写入文件：')
    for (const p of problems) console.error('  - ' + p)
    process.exit(1)
  }

  fs.writeFileSync(args.file, JSON.stringify(signed, null, 2) + '\n', 'utf8')
  console.log('已签名: ' + args.file)
  console.log('公告条数: ' + signed.advisories.length)
  console.log('签发时间: ' + signed.signedAt)
  console.log('自检: 通过')
}

main()
