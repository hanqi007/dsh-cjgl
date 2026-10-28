"""测试：操作按钮现在在管理页，更新断言"""
import io

Q = r'D:\xm\deepseek\dsh-cjgl\test\smoke-panel.mjs'
q = io.open(Q, encoding='utf-8').read()

# 1) 卡片不再有「设为默认」，改为详情页
old = """check('卡片有「已是默认」按钮', view.some((n) => n.text === '已是默认' || n.text === '设为默认'))

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
new = """/* 卡片只保留 启用/停用 + 管理（其余操作收进管理页） */
check('卡片有「启用」按钮', view.some((n) => n.text === '启用'))
check('卡片有「管理」按钮', view.some((n) => n.text === '管理'))
check('卡片不再有「设为默认」', !view.some((n) => n.text === '设为默认' || n.text === '已是默认'))
check('卡片不再有「卸载」', !view.some((n) => n.text === '卸载'))

/* 点「启用」必须真的发 /toggle */
const enableBtn = view.find((n) => n.text === '启用' && n.props && n.props.onClick)
check('找得到「启用」按钮的回调', !!enableBtn)
if (enableBtn) {
  fetchCalls = []
  enableBtn.props.onClick()
  check('启用按钮会发请求', fetchCalls.some((u) => u.indexOf('/toggle') >= 0), JSON.stringify(fetchCalls))
}"""
if old not in q:
    raise SystemExit('card assertions anchor')
q = q.replace(old, new, 1)

# 2) 详情页断言补全 + 点击测试
old = """check('详情页有「设为默认」', detailView.some((n) => n.text === '设为默认'))"""
if old in q:
    q = q.replace(old, """check('详情页有「设为默认」', detailView.some((n) => n.text === '设为默认'))
check('详情页有「重装」', detailView.some((n) => n.text === '重装'))
check('详情页有「卸载」', detailView.some((n) => n.text === '卸载'))
const detailDefaultBtn = detailView.find((n) => n.text === '设为默认' && n.props && n.props.onClick)
check('找得到「设为默认」按钮的回调', !!detailDefaultBtn)
if (detailDefaultBtn) {
  fetchCalls = []
  detailDefaultBtn.props.onClick()
  check('设为默认按钮会发请求', fetchCalls.some((u) => u.indexOf('/default-boot') >= 0), JSON.stringify(fetchCalls))
}""", 1)

io.open(Q, 'w', encoding='utf-8', newline='\n').write(q)
print('panel test patched')
