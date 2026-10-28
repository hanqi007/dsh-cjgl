/* ============================================================================
 * boot-animation-manager — 浏览器半侧（设置页「启动与插件」）
 * ----------------------------------------------------------------------------
 * 两块：
 *   开机动画   互斥开关——启用一个，其他开机动画自动停用（避免首屏重叠）
 *   其他插件   各自独立开关；管理器自身与核心 bundle 不可停用
 *
 * 切换只改 profile 的 bundles 列表，改完需要重启应用才生效——面板里会写明。
 * 以 dsh.client bundle 格式加载（手写 ModuleLoader bundle，无需构建）。
 * ========================================================================== */
window.__ModuleLoader__.load({
  id: 'dsh-cjgl',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var react = require('react')
    var h = react.createElement

    var API = '/dsh-cjgl'

    /* ── 样式 ────────────────────────────────────────────────────────────── */
    var CSS = [
      '.__bm_root{max-width:680px;display:flex;flex-direction:column;gap:14px;font-size:13px;color:var(--dsw-alias-label-primary)}',
      '.__bm_version{font-family:ui-monospace,Consolas,monospace;font-size:12px;letter-spacing:.04em;color:var(--dsw-alias-label-tertiary)}',
      '.__bm_lead{font-size:12px;line-height:1.7;color:var(--dsw-alias-label-tertiary)}',
      '.__bm_section{display:flex;flex-direction:column;gap:8px}',
      '.__bm_sectionTitle{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);display:flex;align-items:center;gap:8px}',
      '.__bm_sectionTitle b{font-weight:400;font-size:10.5px;color:var(--dsw-alias-label-tertiary);opacity:.8}',
      '.__bm_card{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;background:var(--dsw-alias-bg-layer-3)}',
      '.__bm_card.on{border-color:var(--dsw-alias-state-business-primary)}',
      '.__bm_head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.__bm_name{font-family:ui-monospace,Consolas,monospace;font-size:13px;font-weight:600;letter-spacing:.01em}',
      '.__bm_ver{font-family:ui-monospace,Consolas,monospace;font-size:11.5px;color:var(--dsw-alias-label-tertiary)}',
      '.__bm_badge{margin-left:auto;font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary)}',
      '.__bm_badge.on{color:var(--dsw-alias-label-inverse,#fff);background:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary);font-weight:600}',
      '.__bm_badge.self{color:var(--dsw-alias-label-tertiary)}',
      '.__bm_field{display:flex;flex-direction:column;gap:6px;padding:7px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}',
      '.__bm_field:last-child{border-bottom:0}',
      '.__bm_fcheck{flex-direction:row;align-items:flex-start;gap:9px;cursor:pointer}',
      '.__bm_fcheck input{margin-top:2px;accent-color:var(--dsw-alias-state-business-primary)}',
      '.__bm_flabel{font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-secondary)}',
      '.__bm_fhint{display:block;margin-top:2px;font-size:11px;font-weight:400;line-height:1.5;color:var(--dsw-alias-label-tertiary)}',
      '.__bm_input{font:inherit;font-size:12.5px;padding:7px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);width:100%}',
      '.__bm_textarea{min-height:88px;resize:vertical;font-family:ui-monospace,Consolas,monospace;font-size:12px}',
      '.__bm_foot{display:flex;align-items:center;gap:10px;justify-content:flex-start;flex-wrap:wrap}',
      '.__bm_manage{margin-left:auto}',
      '.__bm_detail{border-top:1px dashed var(--dsw-alias-border-l2);padding-top:9px;display:flex;flex-direction:column;gap:6px}',
      '.__bm_kv{display:flex;gap:10px;font-size:11.5px;line-height:1.6}',
      '.__bm_kv span{flex:0 0 64px;color:var(--dsw-alias-label-tertiary)}',
      '.__bm_kv b{font-weight:500;color:var(--dsw-alias-label-secondary);word-break:break-all;font-family:ui-monospace,Consolas,monospace}',
      '.__bm_setting{font-size:11px;line-height:1.6;color:var(--dsw-alias-label-tertiary)}',
      '.__bm_setting b{color:var(--dsw-alias-label-secondary);font-weight:600}',
      '.__bm_desc{font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-tertiary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
      '.__bm_row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.__bm_btn{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 14px;font:inherit;font-size:12.5px;cursor:pointer}',
      '.__bm_btn:hover{border-color:var(--dsw-alias-state-business-primary)}',
      '.__bm_btn.primary{background:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-inverse,#fff);font-weight:600}',
      '.__bm_btn[disabled]{opacity:.45;cursor:default}',
      '.__bm_note{font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-tertiary)}',
      '.__bm_notice{font-size:12px;color:var(--dsw-alias-label-tertiary)}',
      '.__bm_check{display:flex;align-items:flex-start;gap:9px;cursor:pointer;font-size:12.5px}',
      '.__bm_check input{margin-top:2px;accent-color:var(--dsw-alias-state-business-primary)}',
      '.__bm_checkHint{display:block;margin-top:3px;font-size:11px;line-height:1.55;color:var(--dsw-alias-label-tertiary)}',
      '.__bm_status{font-family:ui-monospace,Consolas,monospace;font-size:12px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}',
      '.__bm_empty{border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;padding:16px;font-size:12px;color:var(--dsw-alias-label-tertiary)}',
      '.__bm_path{font-family:ui-monospace,Consolas,monospace;font-size:10.5px;color:var(--dsw-alias-label-tertiary);word-break:break-all}'
    ].join('\n')

    var FALLBACK_VERSION = '2.2.0'

    /* ── 卡片 ────────────────────────────────────────────────────────────── */
    function card(item, busy, onToggle, expanded, onManage) {
      var tag = item.self ? '管理器' : (item.enabled ? '生效中' : '已停用')
      return h('div', { key: item.name, className: '__bm_card' + (item.enabled ? ' on' : '') },
        h('div', { className: '__bm_head' },
          h('span', { className: '__bm_name' }, item.name),
          h('span', { className: '__bm_ver' }, 'v' + (item.version || '?')),
          h('span', { className: '__bm_badge' + (item.self ? ' self' : (item.enabled ? ' on' : '')) }, tag)
        ),
        item.description ? h('div', { className: '__bm_desc' }, item.description) : null,
        item.settingsLabel
          ? h('div', { className: '__bm_setting' }, '设置面板：', h('b', null, item.settingsLabel), '（在设置侧栏按这个名字找）')
          : null,
        h('div', { className: '__bm_foot' },
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
        expanded ? h('div', { className: '__bm_detail' },
          h('div', { className: '__bm_kv' }, h('span', null, '包名'), h('b', null, item.name)),
          h('div', { className: '__bm_kv' }, h('span', null, '版本'), h('b', null, 'v' + (item.version || '?'))),
          h('div', { className: '__bm_kv' }, h('span', null, '状态'), h('b', null, item.enabled ? '已启用（生效中）' : '已停用')),
          h('div', { className: '__bm_kv' }, h('span', null, '设置面板'), h('b', null, item.settingsLabel || '无独立设置面板')),
          h('div', { className: '__bm_kv' }, h('span', null, '配置文件'), h('b', null, item.configFile || '无独立配置文件')),
          h('div', { className: '__bm_note' },
            '在这里启停会立刻写入 profile 的 bundles。开机动画刷新页面即可看到；其他插件需要重启应用才会加载。'),
          h('div', { className: '__bm_row' },
            item.self
              ? h('button', { className: '__bm_btn', disabled: true }, '管理器自身不可停用')
              : item.enabled
                ? h('button', {
                  className: '__bm_btn',
                  disabled: busy === item.name,
                  onClick: function () { onToggle(item, false) }
                }, busy === item.name ? '处理中…' : '停用并应用')
                : h('button', {
                  className: '__bm_btn primary',
                  disabled: busy === item.name,
                  onClick: function () { onToggle(item, true) }
                }, busy === item.name ? '处理中…' : '启用并应用')
          )
        ) : null
      )
    }

    /* ── 字段控件 ────────────────────────────────────────────────────────── */
    function renderField(f, draft, set) {
      var v = draft[f.key]
      var label = h('div', { className: '__bm_flabel' }, f.label,
        f.hint ? h('span', { className: '__bm_fhint' }, f.hint) : null)

      if (f.type === 'boolean') {
        return h('label', { className: '__bm_field __bm_fcheck', key: f.key },
          h('input', { type: 'checkbox', checked: v === true, onChange: function (e) { set(f.key, e.target.checked) } }),
          label)
      }
      if (f.type === 'enum') {
        return h('div', { className: '__bm_field', key: f.key }, label,
          h('select', {
            className: '__bm_input',
            value: v == null ? '' : String(v),
            onChange: function (e) { set(f.key, e.target.value) }
          }, (f.options || []).map(function (o) {
            return h('option', { key: o[0], value: o[0] }, o[1])
          })))
      }
      if (f.type === 'number') {
        return h('div', { className: '__bm_field', key: f.key }, label,
          h('input', {
            className: '__bm_input',
            type: 'number',
            min: f.min,
            max: f.max,
            step: f.step,
            value: v == null ? '' : v,
            onChange: function (e) {
              var n = Number(e.target.value)
              set(f.key, isNaN(n) ? 0 : n)
            }
          }))
      }
      if (f.type === 'color') {
        return h('div', { className: '__bm_field', key: f.key }, label,
          h('div', { className: '__bm_row' },
            h('input', {
              type: 'color',
              value: /^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? v : '#000000',
              onChange: function (e) { set(f.key, e.target.value) }
            }),
            h('input', {
              className: '__bm_input',
              value: v == null ? '' : String(v),
              onChange: function (e) { set(f.key, e.target.value) }
            })))
      }
      if (f.type === 'json') {
        return h('div', { className: '__bm_field', key: f.key }, label,
          h('textarea', {
            className: '__bm_input __bm_textarea',
            value: typeof v === 'string' ? v : JSON.stringify(v, null, 2),
            onChange: function (e) {
              var text = e.target.value
              try { set(f.key, JSON.parse(text)) } catch (err) { /* 编辑中不合法的 JSON 先不写 */ }
            }
          }))
      }
      return h('div', { className: '__bm_field', key: f.key }, label,
        h('input', {
          className: '__bm_input',
          value: v == null ? '' : String(v),
          onChange: function (e) { set(f.key, e.target.value) }
        }))
    }

    /* ── 单个插件的配置页 ────────────────────────────────────────────────── */
    function DetailPage(props) {
      var detail = props.detail
      var [draft, setDraft] = react.useState(detail.config || {})
      var [saving, setSaving] = react.useState(false)
      var [msg, setMsg] = react.useState('')

      function set(key, value) {
        setDraft(function (d) {
          var next = Object.assign({}, d)
          next[key] = value
          return next
        })
      }

      function save() {
        setSaving(true)
        setMsg('')
        fetch(API + '/settings?name=' + encodeURIComponent(detail.name), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft)
        })
          .then(function (r) { return r.json() })
          .then(function (j) {
            if (!j || j.ok !== true) throw new Error((j && j.error) || '保存失败')
            setMsg('已保存 · 插件下次读取配置时生效')
          })
          .catch(function (e) { setMsg('保存失败：' + String(e && e.message ? e.message : e)) })
          .then(function () { setSaving(false) })
      }

      var schema = detail.schema || []
      return h('div', { className: '__bm_root' },
        h('div', { className: '__bm_row' },
          h('button', { className: '__bm_btn', onClick: props.onBack }, '← 返回列表'),
          h('span', { className: '__bm_name' }, detail.name),
          h('span', { className: '__bm_ver' }, 'v' + (detail.version || '?')),
          h('span', { className: '__bm_badge' + (detail.enabled ? ' on' : '') },
            detail.enabled ? '生效中' : '已停用')
        ),
        h('div', { className: '__bm_path' }, '配置文件：' + (detail.file || '无独立配置文件')),

        detail.loading
          ? h('div', { className: '__bm_notice' }, '读取中…')
          : schema.length === 0
            ? h('div', { className: '__bm_empty' }, '这个插件没有可编辑的配置字段。')
            : h('div', { className: '__bm_section' },
              h('div', { className: '__bm_sectionTitle' }, '独立配置', h('b', null, schema.length + ' 项')),
              schema.map(function (f) { return renderField(f, draft, set) })
            ),

        h('div', { className: '__bm_row' },
          h('button', { className: '__bm_btn primary', disabled: saving, onClick: save },
            saving ? '保存中…' : '保存'),
          h('button', { className: '__bm_btn', onClick: props.onBack }, '取消'),
          msg ? h('span', { className: '__bm_notice' }, msg) : null
        ),
        h('div', { className: '__bm_note' },
          '这些字段来自插件自己的配置文件，保存时只改已存在的键，并自动备份 .bak。')
      )
    }

    /* ── 面板 ────────────────────────────────────────────────────────────── */
    function Panel() {
      var [state, setState] = react.useState(null)
      var [error, setError] = react.useState(null)
      var [notice, setNotice] = react.useState(null)
      var [busy, setBusy] = react.useState('')
      var [update, setUpdate] = react.useState(null)
      var [detail, setDetail] = react.useState(null)

      function load() {
        setError(null)
        return fetch(API + '/list', { headers: { Accept: 'application/json' } })
          .then((r) => r.json())
          .then((j) => {
            if (!j || j.ok !== true) throw new Error((j && j.error) || '读取失败')
            setState(j)
            if (j.config && j.config.autoUpdate === true) maybeAutoCheck()
          })
          .catch((e) => setError('读取失败：' + String(e && e.message ? e.message : e)))
      }

      react.useEffect(function () { load() }, [])

      function checkUpdates() {
        setUpdate({ checking: true })
        fetch(API + '/update?force=1', { headers: { Accept: 'application/json' } })
          .then((r) => r.json())
          .then((j) => setUpdate(Object.assign({ checking: false }, j || {})))
          .catch((e) => setUpdate({ checking: false, ok: false, error: String(e && e.message ? e.message : e) }))
      }

      /* 自动检查：默认关；开了也最多 24 小时一次，且只提示不安装 */
      function maybeAutoCheck() {
        var key = 'boot-manager:update-checked'
        var last = 0
        try { last = Number(localStorage.getItem(key) || 0) } catch (e) { last = 0 }
        if (Date.now() - last < 24 * 3600 * 1000) return
        try { localStorage.setItem(key, String(Date.now())) } catch (e) { /* 隐私模式 */ }
        checkUpdates()
      }

      function setAutoUpdate(enabled) {
        setState(function (s) { return Object.assign({}, s, { config: Object.assign({}, s.config, { autoUpdate: enabled }) }) })
        fetch(API + '/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ autoUpdate: enabled })
        })
          .then((r) => r.json())
          .then((j) => {
            if (!j || j.ok !== true) throw new Error((j && j.error) || '保存失败')
            setState(function (s) { return Object.assign({}, s, { config: j.config }) })
            setNotice(enabled ? '已开启自动检查更新' : '已关闭自动检查更新')
          })
          .catch((e) => setNotice('保存失败：' + String(e && e.message ? e.message : e)))
      }

      function updateLine() {
        if (!update) return null
        if (update.checking) return h('span', { className: '__bm_notice' }, '检查中…')
        if (update.ok === false) {
          return h('span', { className: '__bm_notice' }, '检查失败：' + (update.error || '网络不可达'))
        }
        if (update.hasUpdate) {
          return h('span', { className: '__bm_notice' },
            '发现新版本 v' + update.latest + '（当前 v' + update.current + '）· ',
            h('a', {
              href: update.url || 'https://github.com/hanqi007/dsh-hdd',
              target: '_blank',
              rel: 'noreferrer',
              style: { color: 'var(--dsw-alias-state-business-primary)' }
            }, '去 GitHub 下载')
          )
        }
        return h('span', { className: '__bm_notice' }, '已是最新（v' + (update.current || FALLBACK_VERSION) + '）')
      }

      function openDetail(item) {
        setDetail({ name: item.name, version: item.version, enabled: item.enabled, loading: true, config: {}, schema: [], file: '' })
        fetch(API + '/settings?name=' + encodeURIComponent(item.name), { headers: { Accept: 'application/json' } })
          .then(function (r) { return r.json() })
          .then(function (j) {
            if (!j || j.ok !== true) throw new Error((j && j.error) || '读取失败')
            setDetail({
              name: item.name,
              version: item.version,
              enabled: item.enabled,
              loading: false,
              config: j.config || {},
              schema: j.schema || [],
              file: j.file || ''
            })
          })
          .catch(function (e) {
            setDetail(null)
            setNotice('读取配置失败：' + String(e && e.message ? e.message : e))
          })
      }

      function toggle(item, enabled) {
        setBusy(item.name)
        setNotice(null)
        fetch(API + '/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: item.name, enabled: enabled })
        })
          .then((r) => r.json())
          .then((j) => {
            if (!j || j.ok !== true) throw new Error((j && j.error) || '切换失败')
            setState(function (s) {
              return Object.assign({}, s, { boots: j.boots, others: j.others, bundles: j.bundles })
            })
            setNotice((enabled ? '已启用 ' : '已停用 ') + item.name +
              (enabled && item.name.indexOf('boot') !== -1 ? '（其他开机动画已自动停用）' : '') +
              ' · 重启应用后生效')
          })
          .catch((e) => setNotice('切换失败：' + String(e && e.message ? e.message : e)))
          .then(function () { setBusy('') })
      }

      if (!state) {
        return h('div', { className: '__bm_root' },
          h('div', { className: '__bm_version' }, '版本 v' + FALLBACK_VERSION),
          h('div', { className: '__bm_notice' }, error || '读取中…'),
          error ? h('div', { className: '__bm_row' },
            h('button', { className: '__bm_btn', onClick: load }, '重试')
          ) : null
        )
      }

      if (detail) {
        return h(DetailPage, {
          detail: detail,
          onBack: function () { setDetail(null) },
          onNotice: setNotice
        })
      }

      var boots = state.boots || []
      var others = state.others || []
      var activeBoots = boots.filter(function (p) { return p.enabled })

      return h('div', { className: '__bm_root' },
        h('div', { className: '__bm_version' }, '版本 v' + (state.version || FALLBACK_VERSION)),
        h('div', { className: '__bm_lead' },
          '管理当前 profile 里的所有插件（含管理器自己与开机动画）。每个都能单独开关；开机动画互斥——',
          '启用一个会自动停用其他开机动画；其他插件互不影响，可以同时开多个。改动只调整 bundles 列表，不安装、不删除包，重启后生效。'
        ),

        activeBoots.length > 1 ? h('div', { className: '__bm_note', style: { color: 'var(--dsw-alias-state-warning,#e6a23c)' } },
          '检测到 ' + activeBoots.length + ' 个开机动画同时启用，首屏可能重叠；建议只留一个。'
        ) : null,

        h('div', { className: '__bm_section' },
          h('div', { className: '__bm_sectionTitle' }, '开机动画', h('b', null, boots.length + ' 个 · 互斥')),
          boots.length === 0
            ? h('div', { className: '__bm_empty' }, '没有识别到开机动画插件。')
            : boots.map(function (p) {
              return card(p, busy, toggle, false, openDetail)
            })
        ),

        h('div', { className: '__bm_section' },
          h('div', { className: '__bm_sectionTitle' }, '其他插件', h('b', null, others.length + ' 个 · 独立开关')),
          others.length === 0
            ? h('div', { className: '__bm_empty' }, '没有其他可管理的插件。')
            : others.map(function (p) {
              return card(p, busy, toggle, false, openDetail)
            })
        ),

        h('div', { className: '__bm_section' },
          h('div', { className: '__bm_sectionTitle' }, '更新', h('b', null, '默认关闭')),
          h('label', { className: '__bm_check' },
            h('input', {
              type: 'checkbox',
              checked: !!(state.config && state.config.autoUpdate),
              onChange: function (e) { setAutoUpdate(e.target.checked) }
            }),
            h('span', null, '自动检查更新',
              h('span', { className: '__bm_checkHint' }, '开启后打开本页会向 GitHub 查一次版本（24 小时最多一次），只提示新版本，不自动下载或替换插件。'))
          ),
          h('div', { className: '__bm_row' },
            h('button', {
              className: '__bm_btn',
              disabled: !!(update && update.checking),
              onClick: checkUpdates
            }, update && update.checking ? '检查中…' : '检查更新'),
            updateLine(),
            h('span', { className: '__bm_status' }, '当前 v' + (state.version || FALLBACK_VERSION))
          )
        ),

        h('div', { className: '__bm_row' },
          h('button', { className: '__bm_btn', onClick: load }, '刷新'),
          notice ? h('span', { className: '__bm_notice' }, notice) : null
        ),
        h('div', { className: '__bm_note' },
          '改动写进 profile 的 package.json（已备份 .bak），只调整 dsh.profile.bundles；核心 bundle 与管理器自身不可停用。'),
        h('div', { className: '__bm_path' }, 'profile: ' + (state.profile || '?'))
      )
    }

    /* ── 插件 ────────────────────────────────────────────────────────────── */
    var inject = ['slots']

    var CSS_ID = 'dsh-cjgl/main.css'
    function ensureStyle() {
      if (typeof document === 'undefined' || !document.head) return function () {}
      if (document.querySelector('style[data-plugin-css="' + CSS_ID + '"]')) return function () {}
      var tag = document.createElement('style')
      tag.dataset.pluginCss = CSS_ID
      tag.textContent = CSS
      document.head.appendChild(tag)
      return function () {
        try { if (tag.parentNode) tag.parentNode.removeChild(tag) } catch (e) {}
      }
    }

    function apply(ctx) {
      var removeStyle = ensureStyle()
      ctx.effect(function () { return removeStyle })
      ctx.slots.inject('settings.section', function () {
        return ctx.slots.register(
          { name: 'settings.section', id: 'dsh-cjgl', order: 28, label: '启动与插件' },
          function () { return h(Panel, {}) }
        )
      })
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
