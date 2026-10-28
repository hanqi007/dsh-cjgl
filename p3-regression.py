"""3.0.2 回归测试：启用即确认 / 设为默认按钮真的发请求"""
import io

# ── host ───────────────────────────────────────────────────────────────────
P = r'D:\xm\deepseek\dsh-cjgl\test\smoke-host.mjs'
s = io.open(P, encoding='utf-8').read()

if '启用后不会被自动停用' not in s:
    old = "const after = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))"
    new = """console.log('\\n[10] 启用即确认（不再被自动停用）')
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

const after = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))"""
    if old not in s:
        raise SystemExit('host tail anchor')
    s = s.replace(old, new, 1)
    io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
    print('host test patched')

# ── panel ──────────────────────────────────────────────────────────────────
Q = r'D:\xm\deepseek\dsh-cjgl\test\smoke-panel.mjs'
q = io.open(Q, encoding='utf-8').read()

if '设为默认按钮会发请求' not in q:
    # walk 记录 props，便于直接触发 onClick
    old = "    out.push({ cls: node.props.className, text: textOf(node) })"
    new = "    out.push({ cls: node.props.className, text: textOf(node), props: node.props })"
    if old not in q:
        raise SystemExit('walk anchor')
    q = q.replace(old, new, 1)

    old = """  fetch: function () { return Promise.reject(new Error('no network in test')) },"""
    new = """  fetch: function (url) { fetchCalls.push(String(url)); return Promise.reject(new Error('no network in test')) },"""
    if old not in q:
        raise SystemExit('fetch anchor')
    q = q.replace(old, new, 1)

    old = "let hookIndex = 0"
    new = "let fetchCalls = []\nlet hookIndex = 0"
    if old not in q:
        raise SystemExit('hook anchor')
    q = q.replace(old, new, 1)

    old = "check('卡片有「已是默认」按钮', view.some((n) => n.text === '已是默认' || n.text === '设为默认'))"
    new = """check('卡片有「已是默认」按钮', view.some((n) => n.text === '已是默认' || n.text === '设为默认'))

/* 点「设为默认」必须真的发请求（曾经绑成 onManage.default，点了没反应） */
const nonDefaultView = render(Object.assign({}, listState, { config: { autoUpdate: false, defaultBoot: '' } }))
const defaultBtn = nonDefaultView.find((n) => n.text === '设为默认' && n.props && n.props.onClick)
check('找得到「设为默认」按钮的回调', !!defaultBtn)
if (defaultBtn) {
  fetchCalls = []
  defaultBtn.props.onClick()
  check('设为默认按钮会发请求', fetchCalls.some((u) => u.indexOf('/default-boot') >= 0), JSON.stringify(fetchCalls))
}

/* 点「启用」必须发 /toggle */
const enableBtn = nonDefaultView.find((n) => n.text === '启用' && n.props && n.props.onClick)
check('找得到「启用」按钮的回调', !!enableBtn)
if (enableBtn) {
  fetchCalls = []
  enableBtn.props.onClick()
  check('启用按钮会发请求', fetchCalls.some((u) => u.indexOf('/toggle') >= 0), JSON.stringify(fetchCalls))
}"""
    if old not in q:
        raise SystemExit('panel assert anchor')
    q = q.replace(old, new, 1)

    io.open(Q, 'w', encoding='utf-8', newline='\n').write(q)
    print('panel test patched')
