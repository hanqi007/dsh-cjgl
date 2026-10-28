"""修 3.0.2：手动「启用」要被记入 confirmedBoots，否则 /list 的自动停用会把它打回去"""
import io

P = r'D:\xm\deepseek\dsh-cjgl\lib\index.js'
s = io.open(P, encoding='utf-8').read()

if '手动启用的开机动画视为已确认' in s:
    print('already patched')
    raise SystemExit(0)

old = """  let bundles = state.bundles.slice()
  if (boot && enabled) {
    /* 互斥：把其他开机动画移出，保证同时只有一个生效 */
    const rivals = state.boots.filter((p) => p.name !== name).map((p) => p.name)
    bundles = bundles.filter((b) => rivals.indexOf(b) === -1)
    if (bundles.indexOf(name) === -1) bundles.push(name)
  } else if (enabled) {"""
new = """  let bundles = state.bundles.slice()
  if (boot && enabled) {
    /* 互斥：把其他开机动画移出，保证同时只有一个生效 */
    const rivals = state.boots.filter((p) => p.name !== name).map((p) => p.name)
    bundles = bundles.filter((b) => rivals.indexOf(b) === -1)
    if (bundles.indexOf(name) === -1) bundles.push(name)
    /* 手动启用的开机动画视为已确认：否则 /list 的「自动停用新检测到的动画」
       会在下一次刷新时把它打回停用，看起来就像「点了启用没生效」 */
    try {
      const cfg = readCfg()
      if (cfg.confirmedBoots.indexOf(name) === -1) {
        writeCfg({ confirmedBoots: cfg.confirmedBoots.concat([name]) })
      }
    } catch (err) { /* 配置写失败不阻断启用 */ }
  } else if (enabled) {"""
if old not in s:
    raise SystemExit('setEnabled anchor')
s = s.replace(old, new, 1)

io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('host patched, size:', len(s))
