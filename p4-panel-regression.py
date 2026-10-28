"""panel 测试：加 fetch stub、记录回调，覆盖「设为默认 / 启用」按钮真的发请求"""
import io

Q = r'D:\xm\deepseek\dsh-cjgl\test\smoke-panel.mjs'
q = io.open(Q, encoding='utf-8').read()

if 'fetchCalls' in q:
    print('already patched')
    raise SystemExit(0)

old = "let hookIndex = 0\nlet presets = []"
new = "let hookIndex = 0\nlet presets = []\nlet fetchCalls = []"
if old not in q:
    raise SystemExit('var anchor')
q = q.replace(old, new, 1)

old = "  setTimeout,\n  window: { __ModuleLoader__: { load(options) { factory = options.factory } } },"
new = """  setTimeout,
  fetch: function (url) { fetchCalls.push(String(url)); return Promise.reject(new Error('offline in test')) },
  window: { __ModuleLoader__: { load(options) { factory = options.factory } } },"""
if old not in q:
    raise SystemExit('sandbox anchor')
q = q.replace(old, new, 1)

old = "    out.push({ cls: node.props.className, text: textOf(node) })"
new = "    out.push({ cls: node.props.className, text: textOf(node), props: node.props })"
if old not in q:
    raise SystemExit('walk anchor')
q = q.replace(old, new, 1)

old = "check('卡片有「已是默认」按钮', view.some((n) => n.text === '已是默认' || n.text === '设为默认'))"
new = """check('卡片有「已是默认」按钮', view.some((n) => n.text === '已是默认' || n.text === '设为默认'))

/* 设为默认 / 启用 必须真的发请求（曾把设为默认绑成 onManage.default，点了没反应） */
const plainView = render(Object.assign({}, listState, { config: { autoUpdate: false, defaultBoot: '' } }))
const defaultBtn = plainView.find((n) => n.text === '设为默认' && n.props && n.props.onClick)
check('找得到「设为默认」按钮的回调', !!defaultBtn)
if (defaultBtn) {
  fetchCalls = []
  defaultBtn.props.onClick()
  check('设为默认按钮会发请求', fetchCalls.some((u) => u.indexOf('/default-boot') >= 0), JSON.stringify(fetchCalls))
}
const enableBtn = plainView.find((n) => n.text === '启用' && n.props && n.props.onClick)
check('找得到「启用」按钮的回调', !!enableBtn)
if (enableBtn) {
  fetchCalls = []
  enableBtn.props.onClick()
  check('启用按钮会发请求', fetchCalls.some((u) => u.indexOf('/toggle') >= 0), JSON.stringify(fetchCalls))
}"""
if old not in q:
    raise SystemExit('assert anchor')
q = q.replace(old, new, 1)

io.open(Q, 'w', encoding='utf-8', newline='\n').write(q)
print('panel test patched')
