/* Host 冒烟：两类插件 / 开机动画互斥 / 其他插件可多开 / 保护名单 / 配置开关 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'

let pass = 0
let fail = 0
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name) } else { fail++; console.log('  FAIL ' + name + (detail ? '  → ' + detail : '')) }
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'boot-manager-'))
const pkgs = {
  'hdd-console-boot': { version: '1.2.3', description: 'HDD 控制台开机动画' },
  'beta-startup': { version: '2.0.0', description: '另一个启动界面与启动动画插件' },
  'unrelated-pkg': { version: '9.9.9', description: '一个普通的工具插件' },
  'gamma-tool': { version: '0.4.1', description: '日志导出工具' },
  'dsh-cjgl': { version: '1.2.0', description: '开机动画管理器' }
}
for (const name of Object.keys(pkgs)) {
  const dir = path.join(profile, 'node_modules', name)
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(Object.assign({ name }, pkgs[name])), 'utf8')
}
/* 两个插件带设置面板：label 应被提取出来 */
fs.writeFileSync(path.join(profile, 'node_modules', 'hdd-console-boot', 'lib', 'client.js'),
  "window.__ModuleLoader__.load({ id: 'hdd-console-boot', factory: () => ({}) })\n" +
  "// ctx.slots.register({ name: 'settings.section', id: 'boot', label: '开机动画' })\n", 'utf8')
fs.writeFileSync(path.join(profile, 'node_modules', 'gamma-tool', 'lib', 'client.js'),
  "ctx.slots.register({ name: 'settings.section', id: 'log', label: '日志导出' }, () => null)\n", 'utf8')
const profilePkg = {
  name: 'dsh-profile-desktop',
  private: true,
  dependencies: Object.fromEntries(Object.keys(pkgs).map((n) => [n, 'file:./' + n + '.tgz'])),
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'hdd-console-boot', 'gamma-tool', 'dsh-cjgl'] } }
}
const pkgPath = path.join(profile, 'package.json')
fs.writeFileSync(pkgPath, JSON.stringify(profilePkg, null, 2), 'utf8')

/* hdd-console-boot 的独立配置文件，用来测 settings 读写 */
const dshHome = path.join(profile, 'dsh-home')
fs.mkdirSync(dshHome, { recursive: true })
const alphaCfgPath = path.join(dshHome, 'hdd-console.json')
fs.writeFileSync(alphaCfgPath, JSON.stringify({
  enabled: true,
  mode: 'session',
  speed: 1,
  requireInteraction: true,
  identity: '寒语'
}, null, 2), 'utf8')

process.env.DSH_PROFILE_DIR = profile
process.env.DSH_HOME = path.join(profile, 'dsh-home')
const mod = await import('../lib/index.js')

console.log('\n[1] 插件形状')
check('name 正确', mod.name === 'dsh-cjgl', String(mod.name))
check('inject 含 webServer', Array.isArray(mod.inject) && mod.inject.includes('webServer'))
check('导出 apply', typeof mod.apply === 'function')

const routes = []
const ctx = {
  webServer: { register(route) { routes.push(route); return () => {} } },
  effect(fn) { return fn() }
}
mod.apply(ctx)
const byPath = Object.fromEntries(routes.map((r) => [r.path, r]))
check('注册了 17 条路由', routes.length === 17, String(routes.length))
check('有 /dsh-cjgl/list', !!byPath['/dsh-cjgl/list'])
check('有 /dsh-cjgl/toggle', !!byPath['/dsh-cjgl/toggle'])
check('有 /dsh-cjgl/config', !!byPath['/dsh-cjgl/config'])
check('有 /dsh-cjgl/update', !!byPath['/dsh-cjgl/update', '/dsh-cjgl/scan'])
check('有 /dsh-cjgl/settings', !!byPath['/dsh-cjgl/settings'])
check('有 /dsh-cjgl/default-boot', !!byPath['/dsh-cjgl/default-boot'])

function fakeReq(method, body, url) {
  const req = Readable.from(body ? [Buffer.from(body)] : [])
  req.method = method
  req.url = url || ''
  return req
}
function fakeRes() {
  return { statusCode: 0, body: '', setHeader() {}, end(t) { this.body = t || '' } }
}
async function call(pathname, method, body) {
  const res = fakeRes()
  const routePath = pathname.split('?')[0]
  await byPath[routePath].handler(fakeReq(method, body, pathname), res)
  return JSON.parse(res.body)
}

console.log('\n[2] 扫描：两类分开')
const list = await call('/dsh-cjgl/list', 'GET')
check('ok', list.ok === true)
check('开机动画 2 个', list.boots.length === 2, JSON.stringify(list.boots.map((p) => p.name)))
check('其他插件 3 个（含管理器自己）', list.others.length === 3, JSON.stringify(list.others.map((p) => p.name)))
check('普通插件没被当成开机动画', !list.boots.some((p) => p.name === 'unrelated-pkg'))
check('管理器标记 self', list.others.some((p) => p.name === 'dsh-cjgl' && p.self === true))
check('带保护名单', Array.isArray(list.protected) && list.protected.includes('@deepseek-ai/dsh-base'))
check('提取开机动画的设置面板名', list.boots.find((p) => p.name === 'hdd-console-boot').settingsLabel === '开机动画',
  JSON.stringify(list.boots.map((p) => p.settingsLabel)))
check('提取其他插件的设置面板名', list.others.find((p) => p.name === 'gamma-tool').settingsLabel === '日志导出')
check('没有设置面板的插件为空串', list.boots.find((p) => p.name === 'beta-startup').settingsLabel === '')
check('列表里带配置', !!list.config && list.config.autoUpdate === false, JSON.stringify(list.config))

console.log('\n[3] 开机动画互斥')
const sw = await call('/dsh-cjgl/toggle', 'POST', JSON.stringify({ name: 'beta-startup', enabled: true }))
check('切换成功', sw.ok === true)
check('beta 进 bundles', sw.bundles.includes('beta-startup'))
check('alpha 被移出', !sw.bundles.includes('hdd-console-boot'))
check('核心 bundle 保留', sw.bundles.includes('@deepseek-ai/dsh-base'))

console.log('\n[4] 其他插件：允许同时开多个')
const on1 = await call('/dsh-cjgl/toggle', 'POST', JSON.stringify({ name: 'unrelated-pkg', enabled: true }))
check('启用第一个其他插件', on1.ok === true && on1.bundles.includes('unrelated-pkg'))
const on2 = await call('/dsh-cjgl/toggle', 'POST', JSON.stringify({ name: 'gamma-tool', enabled: true }))
check('启用第二个其他插件', on2.ok === true && on2.bundles.includes('gamma-tool'))
check('两个其他插件同时存在', on2.bundles.includes('unrelated-pkg') && on2.bundles.includes('gamma-tool'))
check('开机动画不受影响', on2.bundles.includes('beta-startup'))
const off1 = await call('/dsh-cjgl/toggle', 'POST', JSON.stringify({ name: 'unrelated-pkg', enabled: false }))
check('停用其中一个', off1.ok === true && !off1.bundles.includes('unrelated-pkg'))
check('另一个仍然启用', off1.bundles.includes('gamma-tool'))

console.log('\n[5] 保护与错误')
const selfOff = await call('/dsh-cjgl/toggle', 'POST', JSON.stringify({ name: 'dsh-cjgl', enabled: false }))
check('拒绝停用管理器自身', selfOff.ok === false && /自身/.test(selfOff.error), selfOff.error)
const coreOff = await call('/dsh-cjgl/toggle', 'POST', JSON.stringify({ name: '@deepseek-ai/dsh-base', enabled: false }))
check('拒绝操作核心 bundle', coreOff.ok === false && /核心/.test(coreOff.error), coreOff.error)
const unknown = await call('/dsh-cjgl/toggle', 'POST', JSON.stringify({ name: 'not-installed', enabled: true }))
check('拒绝未知插件', unknown.ok === false)
const wrongMethod = await call('/dsh-cjgl/toggle', 'GET')
check('GET 返回 405', wrongMethod.ok === false)

console.log('\n[6] 配置：自动更新默认关闭')
const cfg0 = await call('/dsh-cjgl/config', 'GET')
check('默认 autoUpdate=false', cfg0.ok === true && cfg0.config.autoUpdate === false, JSON.stringify(cfg0.config))
const cfg1 = await call('/dsh-cjgl/config', 'POST', JSON.stringify({ autoUpdate: true }))
check('可以打开', cfg1.ok === true && cfg1.config.autoUpdate === true)
const cfg2 = await call('/dsh-cjgl/config', 'GET')
check('打开后能读回', cfg2.config.autoUpdate === true)
check('写到了 DSH_HOME 下的文件', fs.existsSync(path.join(profile, 'dsh-home', 'dsh-cjgl.json')))
const cfg3 = await call('/dsh-cjgl/config', 'POST', JSON.stringify({ autoUpdate: false }))
check('可以关回去', cfg3.config.autoUpdate === false)

console.log('\n[6.5] 首次安装自动对齐最新版')
const bootSrc = fs.readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
check('有版本比较函数', bootSrc.indexOf('function cmpVersion') !== -1)
check('有首次引导逻辑', bootSrc.indexOf('async function bootstrapLatest') !== -1)
check('引导会查最新版本', bootSrc.indexOf('const list = await listVersions()') !== -1)
check('引导有一次性标记', bootSrc.indexOf('cfg.bootstrapVersion') !== -1)
check('引导只在首次跑', bootSrc.indexOf('if (cfg.bootstrapVersion) return null') !== -1)
check('apply 里挂了延迟触发', bootSrc.indexOf('bootstrapLatest(ctx).catch') !== -1)

console.log('\n[6.8] 运行环境兼容性自检')
const health = await call('/dsh-cjgl/check', 'GET')
check('health 带 compat', !!health.compat, JSON.stringify(health.compat))
check('compat 有 node 版本', typeof health.compat.node === 'string' && health.compat.node.length > 0, health.compat.node)
check('compat 判断 fetch', typeof health.compat.fetch === 'boolean')
check('compat 判断 abortController', typeof health.compat.abortController === 'boolean')
check('compat 有 nodeMajor', typeof health.compat.nodeMajor === 'number')
check('compat 给结论', typeof health.compat.ok === 'boolean')
check('缺能力时有提示', health.compat.ok === true ? health.compat.note === '' : health.compat.note.length > 10)

console.log('\n[6.9] 完整性自检')
check('health 带 integrity', !!health.integrity, JSON.stringify(health.integrity && health.integrity.summary))
const integ = health.integrity || {}
check('自身有结论', !!integ.self && typeof integ.self.ok === 'boolean')
check('自身检查 6 个关键文件', Array.isArray(integ.self.problems) && integ.self.ok === true, JSON.stringify(integ.self.problems))
check('插件列表是数组', Array.isArray(integ.plugins))
check('summary 有统计', !!integ.summary && typeof integ.summary.total === 'number' && typeof integ.summary.broken === 'number')
/* 测试环境没有真实 node_modules，所以插件都会被判成缺文件——这本身就是要验证的行为 */
const broken = (integ.plugins || []).filter((x) => !x.ok)
check('缺文件的插件能被识别', broken.length > 0, 'broken=' + broken.length)
check('每个坏插件都带原因', broken.every((x) => Array.isArray(x.problems) && x.problems.length > 0), JSON.stringify(broken[0]))
check('插件带 installed 标记', (integ.plugins || []).every((x) => typeof x.installed === 'boolean'))
check('插件带 enabled 标记', (integ.plugins || []).every((x) => typeof x.enabled === 'boolean'))

console.log('\n[6.95] 运行时密钥扫描')
const scan0 = await call('/dsh-cjgl/scan', 'GET')
check('扫描接口可用', scan0.ok === true, JSON.stringify(scan0).slice(0, 100))
check('返回扫描文件数', typeof scan0.scanned === 'number', String(scan0.scanned))
check('返回 findings 数组', Array.isArray(scan0.findings))
check('返回结论文案', typeof scan0.note === 'string' && scan0.note.length > 0, scan0.note)
check('health 带 secrets 摘要', !!health.secrets, JSON.stringify(health.secrets))

console.log('\n[7] 更新接口（网络失败也是正常返回）')
const upd = await call('/dsh-cjgl/update', '/dsh-cjgl/scan', 'GET')
check('返回带 current', typeof upd.current === 'string' && upd.current.length > 0, JSON.stringify(upd).slice(0, 120))
check('带 repo 信息', upd.repo === 'hanqi007/dsh-cjgl')

console.log('\n[8] 独立配置读写')
const one = await call('/dsh-cjgl/settings?name=hdd-console-boot', 'GET')
check('读到配置', one.ok === true && one.config.identity === '寒语', JSON.stringify(one.config))
check('带配置文件路径', String(one.file).endsWith('hdd-console.json'), one.file)
check('带 schema', Array.isArray(one.schema) && one.schema.length >= 5, String((one.schema || []).length))
check('schema 有中文标签', (one.schema || []).some((f) => f.label === '操作员' || f.label === '启用开机动画'),
  JSON.stringify((one.schema || []).slice(0, 3)))
const two = await call('/dsh-cjgl/settings?name=hdd-console-boot', 'POST', JSON.stringify({ identity: '新名字', speed: 1.5, unknownKey: 'x' }))
check('保存成功', two.ok === true && two.config.identity === '新名字')
check('数字字段已更新', two.config.speed === 1.5)
check('未知键被忽略', !('unknownKey' in two.config))
check('生成了 .bak', fs.existsSync(alphaCfgPath + '.bak'))
const three = await call('/dsh-cjgl/settings?name=beta-startup', 'GET')
check('没有配置文件的插件不报错', three.ok === true && three.config && typeof three.config === 'object')
const four = await call('/dsh-cjgl/settings', 'GET')
check('缺 name 报错', four.ok === false)

console.log('\n[9] 默认开机动画')
const cfgD0 = await call('/dsh-cjgl/config', 'GET')
check('默认 defaultBoot 为空', (cfgD0.config || {}).defaultBoot === '', JSON.stringify(cfgD0.config))
const setD = await call('/dsh-cjgl/default-boot', 'POST', JSON.stringify({ name: 'hdd-console-boot' }))
check('设为默认成功', setD.ok === true && setD.config.defaultBoot === 'hdd-console-boot', JSON.stringify(setD))
const cfgD1 = await call('/dsh-cjgl/config', 'GET')
check('默认值已落盘', (cfgD1.config || {}).defaultBoot === 'hdd-console-boot')
const badD = await call('/dsh-cjgl/default-boot', 'POST', JSON.stringify({ name: 'gamma-tool' }))
check('非开机动画不能设为默认', badD.ok === false && /不是扫描到的开机动画/.test(badD.error), badD.error)
const clearD = await call('/dsh-cjgl/default-boot', 'POST', JSON.stringify({ name: '' }))
check('可以清空默认', clearD.ok === true && clearD.config.defaultBoot === '')

console.log('\n[10] 启用即确认（不再被自动停用）')
await call('/dsh-cjgl/toggle', 'POST', JSON.stringify({ name: 'hdd-console-boot', enabled: false }))
const onBoot = await call('/dsh-cjgl/toggle', 'POST', JSON.stringify({ name: 'hdd-console-boot', enabled: true }))
check('启用成功', onBoot.ok === true)
const cfgAfterOn = await call('/dsh-cjgl/config', 'GET')
check('已记入 confirmedBoots', (cfgAfterOn.config.confirmedBoots || []).indexOf('hdd-console-boot') !== -1,
  JSON.stringify(cfgAfterOn.config.confirmedBoots))
const listAfterOn = await call('/dsh-cjgl/list', 'GET')
const bootAfterOn = (listAfterOn.boots || []).find((b) => b.name === 'hdd-console-boot')
check('/list 不会把它自动停用', !!bootAfterOn && bootAfterOn.enabled === true, JSON.stringify(bootAfterOn))
check('autoDisabled 里没有它', (listAfterOn.autoDisabled || []).indexOf('hdd-console-boot') === -1,
  JSON.stringify(listAfterOn.autoDisabled))

console.log('\n[11] 安全公告通道')
const hostSrc = fs.readFileSync(path.join('lib', 'index.js'), 'utf8')
check('指向 zjhqgx 仓库', hostSrc.indexOf("SECURITY_REPO = 'hanqi007/zjhqgx'") !== -1)

console.log('\n[12] 安装时间')
const listAt = await call('/dsh-cjgl/list', 'GET')
const firstBoot = (listAt.boots || [])[0]
check('插件带 installedAt', !!firstBoot && /^\d{4}-\d{2}-\d{2}T/.test(firstBoot.installedAt || ''),
  JSON.stringify(firstBoot && firstBoot.installedAt))
const selfItem = (listAt.others || []).find((p) => p.self)
check('管理器自身也带 installedAt', !!selfItem && /^\d{4}-\d{2}-\d{2}T/.test(selfItem.installedAt || ''),
  JSON.stringify(selfItem && selfItem.installedAt))

const after = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
check('写回后 bundles 合法', Array.isArray(after.dsh.profile.bundles) && after.dsh.profile.bundles.length > 0)
check('dependencies 未被动', Object.keys(after.dependencies).length === Object.keys(pkgs).length)
check('生成了 .bak', fs.existsSync(pkgPath + '.bak'))
check('没有残留 .tmp', !fs.existsSync(pkgPath + '.tmp'))

fs.rmSync(profile, { recursive: true, force: true })
check('临时 profile 已清理', !fs.existsSync(profile))

console.log('\n============================')
console.log(`  通过 ${pass} / 失败 ${fail}`)
console.log('============================')
process.exit(fail ? 1 : 0)
