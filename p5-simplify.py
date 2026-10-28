"""3.0.3：卡片只留「启用/停用 + 管理」，其余操作收进管理页；顺带修 FALLBACK 版本号"""
import io

P = r'D:\xm\deepseek\dsh-cjgl\lib\client.js'
s = io.open(P, encoding='utf-8').read()

if 'onReinstall(detail)' in s:
    print('already patched')
    raise SystemExit(0)

# 1) 版本兜底
s = s.replace("var FALLBACK_VERSION = '2.2.1'", "var FALLBACK_VERSION = '3.0.3'", 1)
s = s.replace("var FALLBACK_VERSION = '2.2.9'", "var FALLBACK_VERSION = '3.0.3'", 1)

# 2) 卡片：只留 启用/停用 + 管理
old_start = """        h('div', { className: '__bm_foot' },
          item.self"""
idx = s.find(old_start)
if idx == -1:
    raise SystemExit('foot anchor')
# 找到该 div 的结束（下一个 "        )," 之前）
end_marker = "        ),\n        expanded ? h('div', { className: '__bm_detail' },"
end_idx = s.find(end_marker, idx)
if end_idx == -1:
    raise SystemExit('foot end anchor')
new_foot = """        h('div', { className: '__bm_foot' },
          item.self
            ? h('button', { className: '__bm_btn', disabled: true, title: '管理器自身不能停用' }, '不可停用')
            : item.enabled
              ? h('button', {
                className: '__bm_btn',
                disabled: busy === item.name,
                onClick: function () { onToggle(item, false) }
              }, busy === item.name ? '处理中…' : '停用')
              : h('button', {
                className: '__bm_btn primary',
                disabled: busy === item.name,
                onClick: function () { onToggle(item, true) }
              }, busy === item.name ? '处理中…' : '启用'),
          h('button', {
            className: '__bm_btn __bm_manage',
            onClick: function () { onManage(item) }
          }, expanded ? '收起' : '管理')
        ),
        expanded ? h('div', { className: '__bm_detail' },"""
s = s[:idx] + new_foot + s[end_idx + len(end_marker):]

# 3) DetailPage：加操作区
old = """      var [saving, setSaving] = react.useState(false)
      var [msg, setMsg] = react.useState('')"""
new = """      var [saving, setSaving] = react.useState(false)
      var [msg, setMsg] = react.useState('')
      var [enabled, setEnabled] = react.useState(detail.enabled)"""
if old not in s:
    raise SystemExit('detail state anchor')
s = s.replace(old, new, 1)

old = """        h('div', { className: '__bm_path' }, '配置文件：' + (detail.file || '无独立配置文件')),"""
new = """        h('div', { className: '__bm_row' },
          h('button', {
            className: '__bm_btn' + (enabled ? '' : ' primary'),
            onClick: function () {
              if (props.onToggle) props.onToggle({ name: detail.name, enabled: enabled }, !enabled)
              setEnabled(!enabled)
            }
          }, enabled ? '停用' : '启用'),
          detail.isBoot
            ? h('button', {
              className: '__bm_btn' + (detail.isDefault ? ' primary' : ''),
              disabled: !!detail.isDefault,
              onClick: function () { props.onSetDefault && props.onSetDefault(detail.name) }
            }, detail.isDefault ? '已是默认' : '设为默认')
            : null,
          h('button', {
            className: '__bm_btn',
            onClick: function () { props.onReinstall && props.onReinstall(detail) }
          }, '重装'),
          h('button', {
            className: '__bm_btn __bm_danger',
            onClick: function () { props.onUninstall && props.onUninstall(detail) }
          }, '卸载')
        ),
        h('div', { className: '__bm_path' }, '配置文件：' + (detail.file || '无独立配置文件')),"""
if old not in s:
    raise SystemExit('detail path anchor')
s = s.replace(old, new, 1)

# 4) DetailPage 顶部去掉旧的「设为默认」单按钮（改到操作区）
old = """          detail.isDefault ? h('span', { className: '__bm_defaultTag' }, '默认') : null,
          detail.isBoot && !detail.isDefault
            ? h('button', {
              className: '__bm_btn',
              onClick: function () { props.onSetDefault && props.onSetDefault(detail.name) }
            }, '设为默认')
            : null
        ),"""
new = """          detail.isDefault ? h('span', { className: '__bm_defaultTag' }, '默认') : null
        ),"""
if old not in s:
    raise SystemExit('detail header anchor')
s = s.replace(old, new, 1)

# 5) Panel 传回调
old = """        return h(DetailPage, {
          detail: detail,
          onBack: function () { setDetail(null) },
          onNotice: setNotice,
          onSetDefault: function (name) {"""
new = """        return h(DetailPage, {
          detail: detail,
          onBack: function () { setDetail(null) },
          onNotice: setNotice,
          onToggle: toggle,
          onReinstall: reinstall,
          onUninstall: uninstall,
          onSetDefault: function (name) {"""
if old not in s:
    raise SystemExit('detail props anchor')
s = s.replace(old, new, 1)

io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('client patched, size:', len(s))
