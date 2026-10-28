"""修 3.0.2：卡片「设为默认」绑错了回调（onManage.default 恒为 undefined）"""
import io

P = r'D:\xm\deepseek\dsh-cjgl\lib\client.js'
s = io.open(P, encoding='utf-8').read()

if 'onDefault' in s:
    print('already patched')
    raise SystemExit(0)

# 1) 卡片签名加 onDefault
old = "    function card(item, busy, onToggle, expanded, onManage, onUninstall, onReinstall, isDefault) {"
new = "    function card(item, busy, onToggle, expanded, onManage, onUninstall, onReinstall, isDefault, onDefault) {"
if old not in s:
    raise SystemExit('card sig')
s = s.replace(old, new, 1)

# 2) 修按钮绑定
old = """              onClick: function () { onManage && onManage.default && onManage.default(item) }"""
new = """              onClick: function () { onDefault(item) }"""
if old not in s:
    raise SystemExit('card onClick')
s = s.replace(old, new, 1)

# 3) 渲染时传 onDefault
old = """            : boots.map(function (p) {
              p.isBoot = true
              p.isDefault = !!(state.config && state.config.defaultBoot === p.name)
              return card(p, busy, toggle, false, openDetail, uninstall, reinstall, p.isDefault)
            })"""
new = """            : boots.map(function (p) {
              p.isBoot = true
              p.isDefault = !!(state.config && state.config.defaultBoot === p.name)
              return card(p, busy, toggle, false, openDetail, uninstall, reinstall, p.isDefault, setDefault)
            })"""
if old not in s:
    raise SystemExit('boots map')
s = s.replace(old, new, 1)

old = """            : others.map(function (p) {
              p.isBoot = false
              p.isDefault = false
              return card(p, busy, toggle, false, openDetail, uninstall, reinstall, false)
            })"""
new = """            : others.map(function (p) {
              p.isBoot = false
              p.isDefault = false
              return card(p, busy, toggle, false, openDetail, uninstall, reinstall, false, setDefault)
            })"""
if old not in s:
    raise SystemExit('others map')
s = s.replace(old, new, 1)

# 4) Panel 加 setDefault（与 DetailPage 的 onSetDefault 共用一套逻辑）
old = """      function toggle(item, enabled) {"""
new = """      function setDefault(item) {
        setBusy(item.name)
        setNotice(null)
        fetch(API + '/default-boot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: item.name })
        })
          .then(function (r) { return r.json() })
          .then(function (j) {
            if (!j || j.ok !== true) throw new Error((j && j.error) || '设置失败')
            setNotice('已把 ' + item.name + ' 设为默认开机动画')
            return fetch(API + '/list', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json() })
          })
          .then(function (j) { if (j && j.ok) setState(j) })
          .catch(function (e) { setNotice('设置失败：' + String(e && e.message ? e.message : e)) })
          .then(function () { setBusy('') })
      }

      function toggle(item, enabled) {"""
if old not in s:
    raise SystemExit('toggle anchor')
s = s.replace(old, new, 1)

io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('client patched, size:', len(s))
