/* 标题栏适配层冒烟：桌面环境出现开机根节点 → 标题栏透明化；根节点移除 → 还原 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const ROOT = path.resolve(import.meta.dirname, '..')
const source = fs.readFileSync(path.join(ROOT, 'lib/client.js'), 'utf8')

let pass = 0
let fail = 0
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name) } else { fail++; console.log('  FAIL ' + name + (detail ? '  → ' + detail : '')) }
}

function makeEnv(opts) {
  const styleMap = {}
  const probeStyle = {}
  const rootHolder = { node: opts.hasRoot ? { id: 'dsh-startup-root' } : null }
  const rafQueue = []

  const documentElement = {
    style: {
      setProperty(k, v) { styleMap[k] = v },
      removeProperty(k) { delete styleMap[k] },
      getPropertyValue(k) { return styleMap[k] || '' }
    },
    hasAttribute: () => opts.desktopByAttr === true,
    classList: { add() {}, remove() {} }
  }

  const probe = {
    style: {
      setProperty(k, v) { probeStyle[k] = v },
      removeProperty(k) { delete probeStyle[k] }
    }
  }

  const sandbox = {
    console,
    JSON, Object, Array, String, Number, Boolean, Math, Date, RegExp, Error, Symbol,
    setTimeout: (fn) => { fn(); return 0 },
    clearTimeout() {},
    requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length },
    navigator: { userAgent: opts.win === false ? 'Mozilla/5.0 (Macintosh)' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    location: { protocol: opts.desktopByAttr ? 'http:' : 'dsh-app:' },
    MutationObserver: class { observe() {} disconnect() {} },
    window: {
      __ModuleLoader__: { load(o) { sandbox.__factory = o.factory } },
      addEventListener() {},
      __factory: null
    },
    document: {
      documentElement,
      head: { appendChild: () => {} },
      body: { appendChild: () => {} },
      querySelector(sel) {
        if (sel.indexOf('dsw-specific-sidebar-fill') !== -1) return probe
        if (sel.indexOf('dsh-startup-root') !== -1 || sel.indexOf('hdd-root') !== -1 || sel.indexOf('dsh-gd-root') !== -1) return rootHolder.node
        return null
      },
      getElementById: () => null,
      createElement: () => ({ dataset: {}, setAttribute: () => {}, style: {}, parentNode: null, setAttribute: () => {} }),
      addEventListener() {}
    }
  }
  sandbox.window.__ModuleLoader__.load = (o) => { sandbox.__factory = o.factory }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox)

  const mod = sandbox.__factory((name) => {
    if (name === 'react') {
      return {
        createElement: (t, p) => ({ type: t, props: p || {}, children: [] }),
        useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
        useEffect: () => {}
      }
    }
    throw new Error('unexpected require: ' + name)
  })
  mod.apply({
    slots: { inject(n, fn) { fn() }, register() { return () => {} } },
    effect(fn) { return fn() }
  })

  function flush() {
    while (rafQueue.length) rafQueue.shift()()
  }
  function refresh() {
    /* 模拟根节点出现/消失后，MutationObserver 触发一次 tick */
    rootHolder.node = opts.hasRoot ? { id: 'dsh-startup-root' } : null
    sandbox.__tick && sandbox.__tick()
  }

  return { styleMap, probeStyle, flush, rootHolder, sandbox, documentElement }
}

console.log('\n[1] Windows 桌面端 + 开机根节点 → 隐藏标题栏')
const a = makeEnv({ hasRoot: true, win: true, desktopByAttr: false })
a.flush()
check('设置了侧栏填充变量为透明', a.styleMap['--dsw-specific-sidebar-fill'] === 'rgba(0, 0, 0, 0)', JSON.stringify(a.styleMap))
check('设置了文字变量为透明', a.styleMap['--dsw-alias-label-primary'] === 'rgba(0, 0, 0, 0)')
check('探针底色也清了', a.probeStyle['background-color'] === 'rgba(0, 0, 0, 0)', JSON.stringify(a.probeStyle))

console.log('\n[2] 非 Windows / 非桌面端 → 不动')
const b = makeEnv({ hasRoot: true, win: false, desktopByAttr: false })
b.flush()
check('非 Windows 不设置变量', Object.keys(b.styleMap).length === 0, JSON.stringify(b.styleMap))

console.log('\n[3] 没有开机根节点 → 不动')
const c = makeEnv({ hasRoot: false, win: true, desktopByAttr: false })
c.flush()
check('无根节点不设置变量', Object.keys(c.styleMap).length === 0, JSON.stringify(c.styleMap))

console.log('\n[4] data-windows-titlebar 标记也算桌面端')
const d = makeEnv({ hasRoot: true, win: true, desktopByAttr: true })
d.flush()
check('按属性判定也会隐藏', d.styleMap['--dsw-specific-sidebar-fill'] === 'rgba(0, 0, 0, 0)')

console.log('\n============================')
console.log(`  通过 ${pass} / 失败 ${fail}`)
console.log('============================')
process.exit(fail ? 1 : 0)
