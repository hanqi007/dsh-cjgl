/* 面板渲染冒烟：三个分区（开机动画 / 其他插件 / 更新）、self 不可停用、空态、警告 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const ROOT = path.resolve(import.meta.dirname, '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

let pass = 0
let fail = 0
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name) } else { fail++; console.log('  FAIL ' + name + (detail ? '  → ' + detail : '')) }
}

let hookIndex = 0
let presets = []
function createElement(type, props) {
  var children = Array.prototype.slice.call(arguments, 2)
  return { type, props: props || {}, children }
}
function useState(init) {
  var i = hookIndex++
  var value = i < presets.length ? presets[i] : (typeof init === 'function' ? init() : init)
  return [value, function () {}]
}
function useEffect() { hookIndex++ }
const reactShim = { createElement, useState, useEffect }

const source = read('lib/client.js')
let factory = null
const sandbox = {
  console,
  JSON, Object, Array, String, Number, Boolean, Math, Date, RegExp, Error, Symbol,
  setTimeout,
  window: { __ModuleLoader__: { load(options) { factory = options.factory } } },
  document: {
    head: { appendChild: () => {} },
    querySelector: () => null,
    createElement: () => ({ dataset: {}, textContent: '', parentNode: null }),
    body: { appendChild: () => {} }
  }
}
sandbox.globalThis = sandbox
vm.createContext(sandbox)
vm.runInContext(source, sandbox)
check('bundle 被 ModuleLoader 接收', !!factory)

const mod = factory((name) => {
  if (name === 'react') return reactShim
  throw new Error('unexpected require: ' + name)
})
check('导出 apply', !!(mod && typeof mod.apply === 'function'))

let registered = null
const ctx = {
  slots: {
    inject(name, fn) { fn() },
    register(def, render) { registered = { def, render }; return () => {} }
  },
  effect(fn) { return fn() }
}
mod.apply(ctx)
check('注册 id 是 dsh-cjgl', !!registered && registered.def.id === 'dsh-cjgl')
check('section 标签是「启动与插件」', !!registered && registered.def.label === '启动与插件')

const listState = {
  ok: true,
  version: '1.2.0',
  profile: 'C:\\Users\\x\\.dsh\\profiles\\desktop',
  bundles: ['@deepseek-ai/dsh-base', 'alpha-boot', 'gamma-tool', 'boot-animation-manager'],
  config: { autoUpdate: false, defaultBoot: 'alpha-boot' },
  protected: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'],
  boots: [
    { name: 'alpha-boot', version: '1.2.3', description: 'HDD 控制台开机动画', settingsLabel: '开机动画', enabled: true },
    { name: 'beta-startup', version: '2.0.0', description: '另一个启动界面与启动动画插件', enabled: false }
  ],
  others: [
    { name: 'boot-animation-manager', version: '1.2.0', description: '管理器', enabled: true, self: true },
    { name: 'gamma-tool', version: '0.4.1', description: '日志导出工具', enabled: true }
  ]
}

function walk(node, out) {
  if (node == null || node === false) return
  if (Array.isArray(node)) { node.forEach((n) => walk(n, out)); return }
  if (typeof node !== 'object') return
  if (typeof node.type === 'function') {
    let rendered = null
    try {
      rendered = node.type(Object.assign({}, node.props, { children: node.children }))
    } catch (e) {
      out.push({ cls: '__render_error', text: String(e && e.message ? e.message : e) })
      return
    }
    walk(rendered, out)
    return
  }
  if (node.props && typeof node.props.className === 'string') {
    out.push({ cls: node.props.className, text: textOf(node) })
  }
  ;(node.children || []).forEach((c) => walk(c, out))
}
function textOf(node) {
  let s = ''
  ;(node.children || []).forEach((c) => {
    if (typeof c === 'string' || typeof c === 'number') s += String(c)
    else if (Array.isArray(c)) c.forEach((x) => { if (typeof x === 'string') s += x })
    else if (c && typeof c === 'object') s += textOf(c)
  })
  return s
}

function render(state) {
  hookIndex = 0
  presets = [state, null, null, '', null, null]
  const out = []
  walk(registered.render(), out)
  return out
}

const view = render(listState)
check('渲染不抛错', view.length > 0)
check('没有渲染错误', !view.some((n) => n.cls === '__render_error'), (view.find((n) => n.cls === '__render_error') || {}).text)

const titles = view.filter((n) => n.cls === '__bm_sectionTitle').map((n) => n.text)
check('三个分区', titles.length === 3, titles.join('|'))
check('有「开机动画」分区', titles.some((t) => t.indexOf('开机动画') >= 0))
check('有「其他插件」分区', titles.some((t) => t.indexOf('其他插件') >= 0))
check('有「更新」分区', titles.some((t) => t.indexOf('更新') >= 0))

check('4 张插件卡片', view.filter((n) => n.cls.indexOf('__bm_card') === 0).length === 4, String(view.filter((n) => n.cls.indexOf('__bm_card') === 0).length))
check('显示版本', view.some((n) => n.text === 'v1.2.3'))
check('有「生效中」', view.some((n) => n.text === '生效中'))
check('默认开机动画带「默认」标', view.some((n) => n.cls === '__bm_defaultTag' && n.text === '默认'))
check('有「已停用」', view.some((n) => n.text === '已停用'))
check('管理器有「管理器」徽章', view.some((n) => n.text === '管理器'))
check('卡片显示设置面板名', view.some((n) => n.cls === '__bm_setting' && n.text.indexOf('开机动画') >= 0), '')

check('管理器按钮显示「不可停用」', view.some((n) => n.text === '不可停用'))
check('有「停用」按钮', view.some((n) => n.text === '停用'))
check('有「启用」按钮', view.some((n) => n.text === '启用'))
check('有「刷新」按钮', view.some((n) => n.text === '刷新'))
check('每张卡片有「管理」按钮', view.filter((n) => n.text === '管理').length === 4, String(view.filter((n) => n.text === '管理').length))
check('未展开时没有详情面板', !view.some((n) => n.cls === '__bm_detail'))
check('显示 profile 路径', view.some((n) => n.cls === '__bm_path' && n.text.indexOf('profiles') >= 0))

check('有「自动检查更新」开关', view.some((n) => n.text.indexOf('自动检查更新') >= 0))
check('有「检查更新」按钮', view.some((n) => n.text === '检查更新'))
check('更新开关默认关闭', source.includes('checked: !!(state.config && state.config.autoUpdate)'))
check('说明里写了其他插件可同时开多个', view.some((n) => n.text.indexOf('可以同时开多个') >= 0))

/* 进入单个插件的配置页 */
const detailState = {
  name: 'alpha-boot',
  isBoot: true,
  isDefault: false,
  version: '1.2.3',
  enabled: true,
  loading: false,
  file: 'C:\\Users\\x\\.dsh\\alpha-boot.json',
  config: { enabled: true, speed: 1, identity: '寒语' },
  schema: [
    { key: 'enabled', label: '启用启动动画', type: 'boolean' },
    { key: 'speed', label: '速度倍率', type: 'number', min: 0.35, max: 3 },
    { key: 'identity', label: '身份名称', type: 'text' },
    { key: 'mode', label: '播放时机', type: 'enum', options: [['session', '每个会话一次']] },
    { key: 'accent', label: '强调色', type: 'color' }
  ]
}
hookIndex = 0
presets = [listState, null, null, '', null, detailState]
const detailView = []
walk(registered.render(), detailView)
check('配置页有「← 返回列表」', detailView.some((n) => n.text === '← 返回列表'))
check('配置页显示插件名', detailView.some((n) => n.cls === '__bm_name' && n.text === 'alpha-boot'))
check('配置页显示配置文件', detailView.some((n) => n.cls === '__bm_path' && n.text.indexOf('配置文件') >= 0))
check('详情页有「设为默认」', detailView.some((n) => n.text === '设为默认'))
check('详情页有「重装」', detailView.some((n) => n.text === '重装'))
check('详情页有「卸载」', detailView.some((n) => n.text === '卸载'))
check('详情页有启停按钮', detailView.some((n) => n.text === '停用' || n.text === '启用'))
check('渲染出表单字段', detailView.filter((n) => n.cls === '__bm_field' || n.cls === '__bm_field __bm_fcheck').length === 5,
  String(detailView.filter((n) => n.cls === '__bm_field' || n.cls === '__bm_field __bm_fcheck').length))
check('有中文标签', detailView.some((n) => n.cls === '__bm_flabel' && n.text.indexOf('速度倍率') >= 0))
check('有「保存」按钮', detailView.some((n) => n.text === '保存'))

const both = Object.assign({}, listState, {
  boots: listState.boots.map((p) => Object.assign({}, p, { enabled: true }))
})
const warn = render(both)
check('多个开机动画同时启用时警告', warn.some((n) => n.text.indexOf('可能重叠') >= 0))

const empty = render(Object.assign({}, listState, { boots: [], others: [] }))
check('空态提示（两个分区各一个）', empty.filter((n) => n.cls === '__bm_empty').length === 2, String(empty.filter((n) => n.cls === '__bm_empty').length))

/* 更新结果渲染 */
const withUpdate = render(Object.assign({}, listState, { config: { autoUpdate: true } }))
check('可以渲染开启状态', withUpdate.length > 0 && !withUpdate.some((n) => n.cls === '__render_error'))

console.log('\n============================')
console.log(`  通过 ${pass} / 失败 ${fail}`)
console.log('============================')
process.exit(fail ? 1 : 0)
