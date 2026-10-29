/**
 * dsh-cjgl — 启动与插件管理器
 * Copyright 2026 hanlin (hanqi007)
 *
 * Licensed under the Apache License, Version 2.0, with additional terms:
 *   - Apache 2.0 full text .... LICENSE
 *   - Additional restrictions . LICENSE-CUSTOM.md
 *
 * 允许免费使用与分发；不得以本软件为收费主体，
 * 也不得在自身不是收费主体的前提下进行收费分发。
 * Free to use and distribute, but you may not charge for the software
 * itself, nor charge for distributing it.
 */
﻿/* ============================================================================
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
      '.__bm_mask{position:fixed;inset:0;z-index:2147483002;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center}',
      '.__bm_modal{width:min(420px,86vw);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:14px;padding:18px 20px;display:flex;flex-direction:column;gap:12px;box-shadow:0 18px 50px rgba(0,0,0,.35)}',
      '.__bm_modalTitle{font-size:14px;font-weight:600}',
      '.__bm_modalBody{display:flex;flex-direction:column;gap:8px;font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-secondary)}',
      '.__bm_defaultTag{font-size:10px;font-weight:600;letter-spacing:.04em;padding:1px 7px;border-radius:999px;background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-inverse,#fff)}',
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
      '.__bm_danger{color:#d9534f;border-color:#d9534f}',
      '.__bm_danger:hover{background:#d9534f;color:#fff}',
      '.__bm_health{margin-top:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:10px 12px;background:var(--dsw-alias-bg-layer-3);display:flex;flex-direction:column;gap:6px}',
      '.__bm_healthHead{font-size:12px;font-weight:600}',
      '.__bm_healthPre{margin:0;font-family:ui-monospace,Consolas,monospace;font-size:11.5px;line-height:1.7;white-space:pre-wrap;color:var(--dsw-alias-label-tertiary)}',
      '.__bm_path{font-family:ui-monospace,Consolas,monospace;font-size:10.5px;color:var(--dsw-alias-label-tertiary);word-break:break-all}'
    ].join('\n')

    var FALLBACK_VERSION = '3.6.11'

    /* ── 时间格式化 ──────────────────────────────────────────────────────── */
    function formatWhen(iso) {
      if (!iso) return ''
      try {
        var d = new Date(iso)
        if (isNaN(d.getTime())) return ''
        var pad = function (n) { return (n < 10 ? '0' : '') + n }
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
          ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
      } catch (e) { return '' }
    }

    /* ── 卡片 ────────────────────────────────────────────────────────────── */
    function card(item, busy, onToggle, expanded, onManage, onUninstall, onReinstall, isDefault, onDefault, sourceMode, onChangeSource) {
      var tag = item.self ? '管理器' : (item.enabled ? '生效中' : '已停用')
      return h('div', { key: item.name, className: '__bm_card' + (item.enabled ? ' on' : '') },
        h('div', { className: '__bm_head' },
          h('span', { className: '__bm_name' }, item.name),
          isDefault ? h('span', { className: '__bm_defaultTag' }, '默认') : null,
          h('span', { className: '__bm_ver' }, 'v' + (item.version || '?')),
          h('span', { className: '__bm_badge' + (item.self ? ' self' : (item.enabled ? ' on' : '')) }, tag),
          item.missing
            ? h('span', { className: '__bm_badge', style: { color: '#d9534f', borderColor: '#d9534f' } }, '文件缺失')
            : null,
          (!item.self && !item.inDeps)
            ? h('span', { className: '__bm_badge', title: '这个包出现在 bundles 里，但没有写进 dependencies' }, '仅 bundles')
            : null
        ),
        item.description ? h('div', { className: '__bm_desc' }, item.description) : null,
        item.settingsLabel
          ? h('div', { className: '__bm_setting' }, '设置面板：', h('b', null, item.settingsLabel), '（在设置侧栏按这个名字找）')
          : null,
        formatWhen(item.installedAt)
          ? h('div', { className: '__bm_setting' },
            item.self ? '当前版本落盘于 ' : '安装于 ',
            h('b', null, formatWhen(item.installedAt)),
            item.version ? ' · v' + item.version : '')
          : null,
        h('div', { className: '__bm_foot' },
          item.self
            ? h('span', { className: '__bm_status' }, '管理器的管理 / 重装 / 更新源在面板底部')
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
          item.self
            ? null
            : h('button', {
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
          h('div', { className: '__bm_kv' }, h('span', null, '安装时间'), h('b', null, formatWhen(item.installedAt) || '未知')),
          h('div', { className: '__bm_kv' }, h('span', null, '安装来源'), h('b', { title: item.source || '' }, item.source || '未记录（非 file: 依赖）')),
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

    /* ── 更新询问弹窗 ────────────────────────────────────────────────────── */
    function UpdateModal(props) {
      var info = props.info
      var [busy, setBusy] = react.useState(false)
      var [msg, setMsg] = react.useState('')
      var [done, setDone] = react.useState(false)

      function install() {
        setBusy(true)
        setMsg('')
        fetch(API + '/install-version', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: info.latest })
        })
          .then(function (r) { return r.json() })
          .then(function (j) {
            if (!j || j.ok !== true) throw new Error((j && j.error) || '更新失败')
            setDone(true)
            setMsg('已更新到 v' + (j.installed || info.latest) + ' · 重启应用后生效')
          })
          .catch(function (e) { setMsg('更新失败：' + String(e && e.message ? e.message : e)) })
          .then(function () { setBusy(false) })
      }

      return h('div', { className: '__bm_mask' },
        h('div', { className: '__bm_modal' },
          h('div', { className: '__bm_modalTitle' },
            info.kind === 'security' ? '安全补丁' : '发现新版本'),
          h('div', { className: '__bm_modalBody' },
            info.kind === 'security' && info.advisory
              ? h('div', null,
                h('div', { style: { color: '#e4483c', fontWeight: 600 } },
                  info.advisory.id + ' · ' + (info.advisory.severity || '') + ' 级'),
                h('div', null, info.advisory.summary || ''),
                h('div', { className: '__bm_note' },
                  '受影响版本 ' + (info.advisory.affected || '?') +
                  ' → 修复版本 v' + (info.advisory.fixed || info.latest)))
              : null,
            h('div', null, 'dsh-cjgl ', h('b', null, 'v' + info.latest), ' 可用（当前 v' + info.current + '）。'),
            h('div', { className: '__bm_note' },
              '更新会下载新的安装包并覆盖管理器自身，重启应用后生效。插件配置与开关状态保留。')
          ),
          msg ? h('div', { className: '__bm_notice' }, msg) : null,
          h('div', { className: '__bm_row' },
            h('button', {
              className: '__bm_btn primary',
              disabled: busy || done,
              onClick: install
            }, busy ? '更新中…' : (done ? '已更新' : '立即更新')),
            h('button', { className: '__bm_btn', onClick: props.onClose }, done ? '知道了' : '稍后')
          )
        )
      )
    }

    /* ── 单个插件的配置页 ────────────────────────────────────────────────── */
    function DetailPage(props) {
      var detail = props.detail
      var [draft, setDraft] = react.useState(detail.config || {})
      var [saving, setSaving] = react.useState(false)
      var [msg, setMsg] = react.useState('')
      var [enabled, setEnabled] = react.useState(detail.enabled)

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

      /* 更新源：本地包 / 仓库；以及"检查更新"的结果 */
      var [sourceMode, setSourceMode] = react.useState('local')
      var [checkState, setCheckState] = react.useState(null)

      react.useEffect(function () {
        fetch(API + '/source', { headers: { Accept: 'application/json' } })
          .then(function (r) { return r.json() })
          .then(function (j) {
            if (j && j.ok && j.sourceMode) setSourceMode(j.sourceMode[detail.name] === 'remote' ? 'remote' : 'local')
          })
          .catch(function () {})
      }, [detail.name])

      function changeSource(mode) {
        setSourceMode(mode)
        fetch(API + '/source', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: detail.name, mode: mode })
        })
          .then(function (r) { return r.json() })
          .catch(function () {})
      }

      function checkUpdate() {
        setCheckState({ loading: true })
        fetch(API + '/plugin-update?name=' + encodeURIComponent(detail.name), { headers: { Accept: 'application/json' } })
          .then(function (r) { return r.json() })
          .then(function (j) { setCheckState(Object.assign({ loading: false }, j || {})) })
          .catch(function (e) { setCheckState({ loading: false, ok: false, error: String(e && e.message ? e.message : e) }) })
      }

      return h('div', { className: '__bm_root' },
        h('div', { className: '__bm_row' },
          h('button', { className: '__bm_btn', onClick: props.onBack }, '← 返回列表'),
          h('span', { className: '__bm_name' }, detail.name),
          h('span', { className: '__bm_ver' }, 'v' + (detail.version || '?')),
          h('span', { className: '__bm_badge' + (detail.enabled ? ' on' : '') },
            detail.enabled ? '生效中' : '已停用'),
          detail.isDefault ? h('span', { className: '__bm_defaultTag' }, '默认') : null
        ),
        h('div', { className: '__bm_row' },
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
        h('div', { className: '__bm_kv' },
          h('span', null, '仓库'),
          h('b', { title: detail.repo || '' }, detail.repo || '未收录（插件包内没有 repository，也不在映射表里）')
        ),
        h('div', { className: '__bm_row' },
          h('span', { className: '__bm_status' }, '更新源'),
          h('select', {
            className: '__bm_input',
            style: { maxWidth: '160px' },
            value: sourceMode,
            onChange: function (e) { changeSource(e.target.value) }
          },
            h('option', { value: 'local' }, '本地包'),
            h('option', { value: 'remote' }, '仓库')
          ),
          h('button', {
            className: '__bm_btn',
            disabled: !!(checkState && checkState.loading),
            onClick: checkUpdate
          }, checkState && checkState.loading ? '检查中…' : '检查更新'),
          checkState && checkState.ok
            ? h('span', { className: '__bm_status' },
                checkState.hasUpdate
                  ? '发现 v' + checkState.latest + '（当前 v' + checkState.current + '）'
                  : '已是最新 v' + checkState.current)
            : null,
          checkState && checkState.ok && checkState.repo
            ? h('span', { className: '__bm_ver' }, checkState.repo)
            : null,
          checkState && checkState.ok === false
            ? h('span', { className: '__bm_notice' }, '检查失败：' + (checkState.error || '未知'))
            : null
        ),
        h('div', { className: '__bm_note' },
          '「重装」会先体检本地包：完好就直接解压；损坏或缺失时自动从该插件的 GitHub 仓库 dist/ 下载同版本。'
          + '「更新源」设成仓库则每次重装都回源下载。仓库路径在安装时从插件包内的 repository 字段自动收录。'),
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
    var [health, setHealth] = react.useState(null)
    var [versions, setVersions] = react.useState(null)
    var [localPkgs, setLocalPkgs] = react.useState(null)
    var [installBusy, setInstallBusy] = react.useState('')
      var [detail, setDetail] = react.useState(null)
      var [updatePrompt, setUpdatePrompt] = react.useState(null)

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

      function checkUpdates(auto) {
        setUpdate({ checking: true })
        fetch(API + '/update?force=1', { headers: { Accept: 'application/json' } })
          .then((r) => r.json())
          .then((j) => {
            setUpdate(Object.assign({ checking: false }, j || {}))
            if (auto !== true || !j || j.ok !== true) return
            /* 安全公告走强制静默更新：Host 已经在后台下载安装，这里不弹窗 */
            if (j.hasUpdate) {
              setUpdatePrompt({ kind: 'update', latest: j.latest, current: j.current })
            }
          })
          .catch((e) => setUpdate({ checking: false, ok: false, error: String(e && e.message ? e.message : e) }))
      }

      /* 自动检查：默认关；开了也最多 24 小时一次，且只提示不安装 */
      function maybeAutoCheck() {
        var key = 'boot-manager:update-checked'
        var last = 0
        try { last = Number(localStorage.getItem(key) || 0) } catch (e) { last = 0 }
        if (Date.now() - last < 24 * 3600 * 1000) return
        try { localStorage.setItem(key, String(Date.now())) } catch (e) { /* 隐私模式 */ }
        checkUpdates(true)
      }

      function runCheck() {
      setHealth({ checking: true })
      fetch(API + '/check', { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json() })
        .then(function (j) { setHealth(Object.assign({ checking: false }, j || {})) })
        .catch(function (e) { setHealth({ checking: false, ok: false, error: String(e && e.message ? e.message : e) }) })
    }

    function setAutoEnableNewBoot(enabled) {
      setState(function (s) {
        return Object.assign({}, s, { config: Object.assign({}, s.config, { autoEnableNewBoot: enabled }) })
      })
      fetch(API + '/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoEnableNewBoot: enabled })
      })
        .then(function (r) { return r.json() })
        .then(function (j) {
          if (j && j.config) {
            setState(function (s) { return Object.assign({}, s, { config: j.config }) })
          }
        })
        .catch(function () {})
    }

    function setChannel(mode) {
      setState(function (s) {
        return Object.assign({}, s, { config: Object.assign({}, s.config, { channel: mode }) })
      })
      fetch(API + '/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: mode })
      })
        .then(function (r) { return r.json() })
        .then(function (j) {
          if (j && j.ok) {
        var label = mode === 'beta' ? '测试版（dev 分支）'
          : (mode === 'preview' ? '预览版（yl 分支）' : '稳定版（main 分支）')
        setNotice('更新通道已切到' + label)
      }
          else setNotice('切换失败：' + (j && j.error ? j.error : '未知'))
        })
        .catch(function (e) { setNotice('切换失败：' + String(e && e.message ? e.message : e)) })
    }

    function setSkipBoot(enabled) {
      setState(function (s) {
        return Object.assign({}, s, { config: Object.assign({}, s.config, { skipBoot: enabled }) })
      })
      fetch(API + '/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skipBoot: enabled })
      })
        .then(function (r) { return r.json() })
        .then(function (j) {
          if (j && j.ok) {
            setNotice(enabled ? '已开启启动时跳过开机动画' : '已关闭启动时跳过开机动画')
            if (enabled) skipBootAnimation()
          }
        })
        .catch(function (e) { setNotice('保存失败：' + String(e && e.message ? e.message : e)) })
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

      function healthReport(hh) {
      if (!hh) return null
      if (hh.checking) return h('div', { className: '__bm_health' }, '正在检查…')
      if (hh.error) return h('div', { className: '__bm_health' }, '检查失败：' + hh.error)
      var lines = []
      ;(hh.items || []).forEach(function (it) {
        var bad = (it.bad && it.bad.length) ? it.bad : null
        lines.push((bad ? '✗ ' : '✓ ') + it.name + '  v' + it.version +
          '  ' + (it.enabled ? '已启用' : '未启用') +
          (bad ? '  异常：' + bad.join('、') : ''))
      })
      ;(hh.warnings || []).forEach(function (w) { lines.push('⚠ ' + w) })
      if (!lines.length) lines.push('没有可检查的插件。')
      return h('div', { className: '__bm_health' },
        h('div', { className: '__bm_healthHead' },
          (hh.ok ? '检查通过' : '发现问题') + ' · ' + (hh.items ? hh.items.length : 0) + ' 个插件'),
        h('pre', { className: '__bm_healthPre' }, lines.join('\n'))
      )
    }

    function updateLine() {
        if (!update) return null
        if (update.checking) return h('span', { className: '__bm_notice' }, '检查中…')
        if (update.ok === false) {
          return h('span', { className: '__bm_notice' }, '检查失败：' + (update.error || '网络不可达'))
        }
        var applied = update.securityApply || {}
        if (applied && applied.ok === true) {
          return h('span', { className: '__bm_notice', style: { color: '#e4483c' } },
            '安全补丁 ' + applied.advisory + ' 已静默更新到 v' + (applied.version || applied.fixed) + ' · 重启应用生效')
        }
        if (applied && applied.ok === false) {
          return h('span', { className: '__bm_notice', style: { color: '#e4483c' } },
            '安全补丁 ' + applied.advisory + ' 静默更新失败：' + (applied.error || '未知原因'))
        }
        var sec = update.security || {}
        if (sec.ok && sec.hasSecurityFix && sec.top) {
          return h('span', { className: '__bm_notice', style: { color: '#e4483c' } },
            '安全更新 ' + sec.top.id + '（' + (sec.top.severity || '') + '）正在后台安装…')
        }
        if (update.hasUpdate) {
          return h('span', { className: '__bm_notice' },
            '发现新版本 v' + update.latest + '（当前 v' + update.current + '）· ',
            h('a', {
              href: update.url || 'https://github.com/hanqi007/dsh-cjgl',
              target: '_blank',
              rel: 'noreferrer',
              style: { color: 'var(--dsw-alias-state-business-primary)' }
            }, '去 GitHub 下载')
          )
        }
        return h('span', { className: '__bm_notice' }, '已是最新（v' + (update.current || FALLBACK_VERSION) + '）')
      }

      function sourceModeOf(name) {
        var map = (state && state.config && state.config.sourceMode) || {}
        return map[name] === 'remote' ? 'remote' : 'local'
      }

      function changeSourceOf(name) {
        return function (mode) {
          setState(function (s) {
            var cfg = Object.assign({}, s.config)
            cfg.sourceMode = Object.assign({}, cfg.sourceMode)
            cfg.sourceMode[name] = mode
            return Object.assign({}, s, { config: cfg })
          })
          fetch(API + '/source', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, mode: mode })
          })
            .then(function (r) { return r.json() })
            .then(function (j) {
              if (j && j.ok) setNotice(name + ' 的更新源已设为' + (mode === 'remote' ? '仓库' : '本地包'))
              else setNotice('设置失败：' + (j && j.error ? j.error : '未知'))
            })
            .catch(function (e) { setNotice('设置失败：' + String(e && e.message ? e.message : e)) })
        }
      }

      function openDetail(item) {
        setDetail({
          name: item.name,
          version: item.version,
          enabled: item.enabled,
          loading: true,
          config: {},
          schema: [],
          file: '',
          source: item.source || '',
          repo: item.repo || '',
          inDeps: item.inDeps,
          missing: item.missing,
          isBoot: !!item.isBoot,
          isDefault: !!item.isDefault
        })
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
              file: j.file || '',
              source: item.source || '',
              repo: item.repo || '',
              inDeps: item.inDeps,
              missing: item.missing,
              isBoot: !!item.isBoot,
              isDefault: !!item.isDefault
            })
          })
          .catch(function (e) {
            setDetail(null)
            setNotice('读取配置失败：' + String(e && e.message ? e.message : e))
          })
      }

      function setDefault(item) {
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

      function useBoot(name) {
        setBusy(name)
        setNotice(null)
        fetch(API + '/confirm-boot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name })
        })
          .then((r) => r.json())
          .then((j) => {
            if (!j || j.ok !== true) throw new Error((j && j.error) || '启用失败')
            setNotice('已启用 ' + name + '（其他开机动画已自动停用）· 刷新页面后生效')
            return fetch(API + '/list', { headers: { Accept: 'application/json' } }).then((r) => r.json())
          })
          .then((j) => { if (j && j.ok) setState(j) })
          .catch((e) => setNotice('启用失败：' + String(e && e.message ? e.message : e)))
          .then(function () { setBusy('') })
      }

      function uninstall(item) {
        var ok = window.confirm('确定卸载 ' + item.name + ' 吗？\n\n' +
          '会从 dependencies 和 bundles 移除，删除 node_modules 里的包目录，并删除 pnpm-lock.yaml（下次安装时重建）。\n此操作不可撤销。')
        if (!ok) return
        setBusy(item.name)
        setNotice(null)
        fetch(API + '/uninstall', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: item.name })
        })
          .then(function (r) { return r.json() })
          .then(function (j) {
            if (!j || j.ok !== true) throw new Error((j && j.error) || '卸载失败')
            setState(function (s) {
              return Object.assign({}, s, { boots: j.boots, others: j.others, bundles: j.bundles })
            })
            setNotice('已卸载 ' + item.name + ' · 重启应用后彻底生效')
          })
          .catch(function (e) { setNotice('卸载失败：' + String(e && e.message ? e.message : e)) })
          .then(function () { setBusy('') })
      }

      function scanPackages() {
        setLocalPkgs({ loading: true })
        fetch(API + '/local-packages', { headers: { Accept: 'application/json' } })
          .then(function (r) { return r.json() })
          .then(function (j) { setLocalPkgs(Object.assign({ loading: false }, j || {})) })
          .catch(function (e) { setLocalPkgs({ loading: false, ok: false, error: String(e && e.message ? e.message : e) }) })
      }

      function installPkg(p) {
        setInstallBusy(p.file)
        setNotice(null)
        fetch(API + '/install-local', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: p.file })
        })
          .then(function (r) { return r.json() })
          .then(function (j) {
            if (!j || j.ok !== true) throw new Error((j && j.error) || '安装失败')
            setNotice('已安装 ' + (j.name || p.name) + (j.version ? ' v' + j.version : '') + ' · 重启应用后生效')
            return fetch(API + '/local-packages', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json() })
          })
          .then(function (j) { if (j) setLocalPkgs(Object.assign({ loading: false }, j)) })
          .catch(function (e) { setNotice('安装失败：' + String(e && e.message ? e.message : e)) })
          .then(function () { setInstallBusy('') })
      }

      function loadVersions() {
        setVersions({ loading: true })
        fetch(API + '/versions', { headers: { Accept: 'application/json' } })
          .then(function (r) { return r.json() })
          .then(function (j) { setVersions(Object.assign({ loading: false }, j || {})) })
          .catch(function (e) { setVersions({ loading: false, ok: false, error: String(e && e.message ? e.message : e) }) })
      }

      function installVersion(v) {
        var ok = window.confirm('下载并安装 dsh-cjgl v' + v + ' ？\n\n会覆盖当前管理器文件，重启应用后生效。')
        if (!ok) return
        setBusy('__version')
        setNotice(null)
        fetch(API + '/install-version', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: v })
        })
          .then(function (r) { return r.json() })
          .then(function (j) {
            if (!j || j.ok !== true) throw new Error((j && j.error) || '安装失败')
            setNotice('已下载并安装 v' + v + ' · 重启应用后生效')
          })
          .catch(function (e) { setNotice('安装失败：' + String(e && e.message ? e.message : e)) })
          .then(function () { setBusy('') })
      }

      function redownload(name) {
        setBusy(name)
        setNotice(null)
        fetch(API + '/reinstall', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name })
        })
          .then(function (r) { return r.json() })
          .then(function (j) {
            if (!j || j.ok !== true) throw new Error((j && j.error) || '重新下载失败')
            setNotice('已重新下载 ' + name + (j.version ? ' v' + j.version : '') + ' · 重启应用后生效')
            return fetch(API + '/list', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json() })
          })
          .then(function (j) { if (j && j.ok) setState(j) })
          .catch(function (e) { setNotice('重新下载失败：' + String(e && e.message ? e.message : e)) })
          .then(function () { setBusy('') })
      }

      function reinstall(item) {
        setBusy(item.name)
        setNotice(null)
        fetch(API + '/reinstall', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: item.name })
        })
          .then(function (r) { return r.json() })
          .then(function (j) {
            if (!j || j.ok !== true) throw new Error((j && j.error) || '重装失败')
            setNotice('已重装 ' + item.name + (j.version ? ' v' + j.version : '') +
              (j.self ? '（管理器自身：重启后生效）' : ' · 重启应用后生效'))
            return fetch(API + '/list', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json() })
          })
          .then(function (j) { if (j && j.ok) setState(j) })
          .catch(function (e) { setNotice('重装失败：' + String(e && e.message ? e.message : e)) })
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
          onNotice: setNotice,
          onToggle: toggle,
          onReinstall: reinstall,
          onUninstall: uninstall,
          onSetDefault: function (name) {
            fetch(API + '/default-boot', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: name })
            })
              .then(function (r) { return r.json() })
              .then(function (j) {
                if (!j || j.ok !== true) throw new Error((j && j.error) || '设置失败')
                setNotice('已把 ' + name + ' 设为默认开机动画')
                return fetch(API + '/list').then(function (r) { return r.json() })
              })
              .then(function (j) { if (j && j.ok) setState(j) })
              .catch(function (e) { setNotice('设置失败：' + String(e && e.message ? e.message : e)) })
          }
        })
      }

      var boots = state.boots || []
      var others = state.others || []
      var activeBoots = boots.filter(function (p) { return p.enabled })
      var newBoots = state.newBoots || []
      var newPackages = state.newPackages || []

      return h('div', { className: '__bm_root' },
        h('div', { className: '__bm_version' }, '版本 v' + (state.version || FALLBACK_VERSION)),
        h('div', { className: '__bm_lead' },
          '管理当前 profile 里的所有插件（含管理器自己与开机动画）。每个都能单独开关；开机动画互斥——',
          '启用一个会自动停用其他开机动画；其他插件互不影响，可以同时开多个。改动只调整 bundles 列表，不安装、不删除包，重启后生效。'
        ),

        activeBoots.length > 1 ? h('div', { className: '__bm_note', style: { color: 'var(--dsw-alias-state-warning,#e6a23c)' } },
          '检测到 ' + activeBoots.length + ' 个开机动画同时启用，首屏可能重叠；建议只留一个。'
        ) : null,

        state.autoDisabled && state.autoDisabled.length
          ? h('div', { className: '__bm_note', style: { color: 'var(--dsw-alias-state-warning,#e6a23c)' } },
              '已自动停用新检测到的开机动画：' + state.autoDisabled.join('、') + '（默认不启用）')
          : null,

        newBoots.length
          ? h('div', { className: '__bm_health' },
              h('div', { className: '__bm_healthHead' }, '检测到新的开机动画（默认不启用）'),
              h('div', { className: '__bm_row' },
                newBoots.map(function (n) {
                  return h('button', {
                    key: n,
                    className: '__bm_btn',
                    disabled: !!busy,
                    onClick: function () { useBoot(n) }
                  }, '使用 ' + n)
                })
              ),
              h('div', { className: '__bm_note' }, '点「使用」后它会登记到已确认名单并启用，其他开机动画自动停用；不点就保持停用。')
            )
          : null,

        newPackages.length
          ? h('div', { className: '__bm_health' },
              h('div', { className: '__bm_healthHead' }, '检测到新插件（来源已记录）'),
              h('div', { className: '__bm_row' },
                newPackages.map(function (n) {
                  return h('button', {
                    key: n,
                    className: '__bm_btn',
                    disabled: !!busy,
                    onClick: function () { redownload(n) }
                  }, '重新下载 ' + n)
                })
              ),
              h('div', { className: '__bm_note' },
                '管理器已自动记录这些插件的安装包路径（保存在 dsh-cjgl.json 的 sources 里）。点「重新下载」会按记录的路径重新解压安装；不点就保持现状。')
            )
          : null,

        h('div', { className: '__bm_section' },
          h('div', { className: '__bm_sectionTitle' }, '开机动画', h('b', null, boots.length + ' 个 · 互斥')),
          h('label', { className: '__bm_check' },
            h('input', {
              type: 'checkbox',
              checked: !!(state.config && state.config.autoEnableNewBoot),
              onChange: function (e) { setAutoEnableNewBoot(e.target.checked) }
            }),
            h('span', null, '自动启用新检测到的开机动画',
              h('span', { className: '__bm_checkHint' }, '默认关闭：新装的开机动画会被自动停用，需在下方点「使用」才启用。'))
          ),
          boots.length === 0
            ? h('div', { className: '__bm_empty' }, '没有识别到开机动画插件。')
            : boots.map(function (p) {
              p.isBoot = true
              p.isDefault = !!(state.config && state.config.defaultBoot === p.name)
              return card(p, busy, toggle, false, openDetail, uninstall, reinstall, p.isDefault, setDefault, sourceModeOf(p.name), changeSourceOf(p.name))
            })
        ),

        h('div', { className: '__bm_section' },
          h('div', { className: '__bm_sectionTitle' }, '其他插件', h('b', null, others.length + ' 个 · 独立开关')),
          others.length === 0
            ? h('div', { className: '__bm_empty' }, '没有其他可管理的插件。')
            : others.map(function (p) {
              p.isBoot = false
              p.isDefault = false
              return card(p, busy, toggle, false, openDetail, uninstall, reinstall, false, setDefault, sourceModeOf(p.name), changeSourceOf(p.name))
            })
        ),

        h('div', { className: '__bm_section' },
          h('div', { className: '__bm_sectionTitle' }, '开机动画', h('b', null, '跳过')),
          h('label', { className: '__bm_check' },
            h('input', {
              type: 'checkbox',
              checked: !!(state.config && state.config.skipBoot),
              onChange: function (e) { setSkipBoot(e.target.checked) }
            }),
            h('span', null, '启动时跳过开机动画',
              h('span', { className: '__bm_checkHint' }, '勾上后打开应用直接进主界面。播放中也可以按 Ctrl + Shift + X 临时跳过（不显示按钮）。'))
          )
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

        h('div', { className: '__bm_section' },
          h('div', { className: '__bm_sectionTitle' }, '管理器版本', h('b', null, 'hanqi007/dsh-cjgl')),
          h('div', { className: '__bm_row' },
            h('span', { className: '__bm_status' }, '更新通道'),
            h('select', {
              className: '__bm_input',
              style: { maxWidth: '150px' },
              title: '稳定版拉 main，测试版拉 dev，预览版拉 yl',
              value: (state.config && state.config.channel) === 'beta' ? 'beta'
                : ((state.config && state.config.channel) === 'preview' ? 'preview' : 'stable'),
              onChange: function (e) { setChannel(e.target.value) }
            },
              h('option', { value: 'stable' }, '稳定版 main'),
              h('option', { value: 'beta' }, '测试版 dev'),
              h('option', { value: 'preview' }, '预览版 yl')
            ),
            h('span', { className: '__bm_ver' },
              (state.config && state.config.channel) === 'beta' ? 'dev'
                : ((state.config && state.config.channel) === 'preview' ? 'yl' : 'main'))
          ),
          h('div', { className: '__bm_row' },
            h('button', {
              className: '__bm_btn',
              disabled: !!(versions && versions.loading),
              onClick: loadVersions
            }, versions && versions.loading ? '读取中…' : '读取仓库版本'),
            h('span', { className: '__bm_status' }, '当前 v' + (state.version || FALLBACK_VERSION)),
            versions && versions.error ? h('span', { className: '__bm_notice' }, '读取失败：' + versions.error) : null
          ),
          versions && versions.ok && versions.versions && versions.versions.length
            ? h('div', { className: '__bm_versions' },
                versions.versions.map(function (v) {
                  var cur = v.version === versions.current
                  return h('div', { key: v.name, className: '__bm_versionRow' },
                    h('span', { className: '__bm_verName' }, 'v' + v.version),
                    h('span', { className: '__bm_verMeta' }, (v.size / 1024).toFixed(1) + ' KB'),
                    cur ? h('span', { className: '__bm_badge on' }, '当前') : null,
                    cur ? null : h('button', {
                      className: '__bm_btn',
                      disabled: busy === '__version',
                      onClick: function () { installVersion(v.version) }
                    }, busy === '__version' ? '下载中…' : '下载')
                  )
                })
              )
            : null,
          h('div', { className: '__bm_note' },
            '版本来自管理器自己的 GitHub 仓库（dist/ 目录）。下载后写到本地 packages 并重装管理器自身，重启应用后生效。')
        ),

        h('div', { className: '__bm_section' },
          h('div', { className: '__bm_sectionTitle' }, '管理器自身', h('b', null, 'v' + (state.version || FALLBACK_VERSION))),
          h('div', { className: '__bm_row' },
            h('button', {
              className: '__bm_btn',
              onClick: function () {
                var self = (state.others || []).filter(function (p) { return p.self })[0]
                if (self) openDetail(self)
              }
            }, '管理'),
            h('button', {
              className: '__bm_btn',
              disabled: busy === 'dsh-cjgl',
              title: '体检本地包并按收录的仓库路径重装管理器自身',
              onClick: function () {
                var self = (state.others || []).filter(function (p) { return p.self })[0]
                if (self) reinstall(self)
              }
            }, busy === 'dsh-cjgl' ? '处理中…' : '重装'),
            h('select', {
              className: '__bm_input',
              style: { maxWidth: '120px' },
              title: '管理器自身的更新源',
              value: sourceModeOf('dsh-cjgl'),
              onChange: function (e) { changeSourceOf('dsh-cjgl')(e.target.value) }
            },
              h('option', { value: 'local' }, '本地包'),
              h('option', { value: 'remote' }, '仓库')
            ),
            h('span', { className: '__bm_status' }, '当前 v' + (state.version || FALLBACK_VERSION))
          )
        ),

        h('div', { className: '__bm_section' },
          h('div', { className: '__bm_sectionTitle' }, '本地安装包', h('b', null, '扫描 packages 目录')),
          h('div', { className: '__bm_row' },
            h('button', {
              className: '__bm_btn',
              disabled: !!(localPkgs && localPkgs.loading),
              onClick: scanPackages
            }, localPkgs && localPkgs.loading ? '扫描中…' : '扫描本地安装包'),
            localPkgs && localPkgs.ok ? h('span', { className: '__bm_status' }, '共 ' + localPkgs.packages.length + ' 个包') : null,
            localPkgs && localPkgs.error ? h('span', { className: '__bm_notice' }, localPkgs.error) : null
          ),
          localPkgs && localPkgs.ok && localPkgs.packages.length
            ? h('div', { className: '__bm_versions' },
                localPkgs.packages.map(function (p) {
                  return h('div', { key: p.file, className: '__bm_versionRow' },
                    h('span', { className: '__bm_verName' }, p.name || p.file),
                    h('span', { className: '__bm_verMeta' },
                      (p.version ? 'v' + p.version + ' · ' : '') + (p.size / 1024).toFixed(1) + ' KB'),
                    p.installed
                      ? h('span', { className: '__bm_badge' + (p.sameVersion ? ' on' : '') },
                          p.sameVersion ? '已安装' : '已装 ' + (p.installedVersion || '?'))
                      : h('span', { className: '__bm_badge' }, '未安装'),
                    p.installed
                      ? null
                      : h('button', {
                        className: '__bm_btn',
                        disabled: !!installBusy,
                        onClick: function () { installPkg(p) }
                      }, installBusy === p.file ? '安装中…' : '安装')
                  )
                })
              )
            : null,
          h('div', { className: '__bm_note' },
            '扫描 ' + '~/.dsh/packages' + ' 下的 .tgz：已装的标出版本，没装的可以直接安装（写入 dependencies 与 bundles）。')
        ),

        h('div', { className: '__bm_row' },
          h('button', { className: '__bm_btn', onClick: load }, '刷新'),
          h('button', {
            className: '__bm_btn',
            disabled: !!(health && health.checking),
            onClick: runCheck
          }, health && health.checking ? '检查中…' : '检查'),
          notice ? h('span', { className: '__bm_notice' }, notice) : null
        ),
        healthReport(health),
        h('div', { className: '__bm_note' },
          '改动写进 profile 的 package.json（已备份 .bak），只调整 dsh.profile.bundles；核心 bundle 与管理器自身不可停用。'),
        h('div', { className: '__bm_path' }, 'profile: ' + (state.profile || '?')),
        updatePrompt ? h(UpdateModal, {
          info: updatePrompt,
          onClose: function () { setUpdatePrompt(null) }
        }) : null
      )
    }

    /* ── 插件 ────────────────────────────────────────────────────────────── */
    var inject = ['slots']

    var CSS_ID = 'dsh-cjgl/main.css'
    function ensureStyle() {
      if (typeof document === 'undefined' || !document.head) return function () {}

      var cancelled = false
      var tag = null
      var waited = 0

      function inject() {
        if (cancelled) return
        if (document.querySelector('style[data-plugin-css="' + CSS_ID + '"]')) return
        tag = document.createElement('style')
        tag.dataset.pluginCss = CSS_ID
        tag.textContent = CSS
        document.head.appendChild(tag)
      }

      /* 开机动画播放期间不要往 <head> 插 <style>：
         桌面端 preload 在监听 head 的 childList，用它给 titleBarOverlay 测色；
         我们插一次样式就会触发重算，把动画刚透明化的标题栏刷回主题色，
         表现就是右上角三个窗口按钮底下出现一块灰/白底 —— 暖白阶段尤其明显。
         等 #dsh-startup-root 消失再注入，管理器自己的样式晚一点到位没有副作用。 */
      function waitForSplash() {
        if (cancelled) return
        /* 最多等 60 秒：万一动画卡住，也不能让设置页一直没样式 */
        if (document.getElementById('dsh-startup-root') && waited < 60000) {
          waited += 300
          setTimeout(waitForSplash, 300)
          return
        }
        inject()
      }

      if (document.getElementById('dsh-startup-root')) waitForSplash()
      else inject()

      return function () {
        cancelled = true
        try { if (tag && tag.parentNode) tag.parentNode.removeChild(tag) } catch (e) {}
      }
    }

    /* ── 开机画面标题栏适配 ────────────────────────────────────────────────
       Windows 桌面端的标题栏是 overlay，右上角三个按钮画在白底上。第三方开机
       动画（如 dsh-startup-screen）没处理这块，动画铺满全屏时右上角会留一块
       白色矩形，和深色画面撞得很明显。
       这里在管理器侧做一层通用适配：页面上出现已知的开机动画根节点时把标题栏
       透明化，全部消失后还原。不依赖具体插件，也不改它们的代码。 */
    var BOOT_ROOTS = '#dsh-startup-root, #hdd-root, #dsh-gd-root'
    var TITLE_VARS = ['--dsw-specific-sidebar-fill', '--dsw-alias-label-primary']
    var TITLE_CLEAR = 'rgba(0, 0, 0, 0)'

    function startTitlebarCompat() {
      try {
        if (typeof document === 'undefined' || typeof MutationObserver !== 'function') return
        var nav = typeof navigator !== 'undefined' ? navigator : null
        if (!nav || !/Win/.test(nav.userAgent || '')) return
        var loc = typeof location !== 'undefined' ? location : null
        var isDesktop = (loc && loc.protocol === 'dsh-app:') ||
          !!(document.documentElement && document.documentElement.hasAttribute &&
            document.documentElement.hasAttribute('data-windows-titlebar'))
        if (!isDesktop) return

        var applied = false
        var saved = {}

        function findProbe() {
          try {
            return document.querySelector('span[style*="dsw-specific-sidebar-fill"]')
          } catch (e) { return null }
        }

        /* preload 只有在它盯着的 DOM 变动时才会重新测色并下发 setTitleBarOverlay，
           所以单纯改内联样式不够，必须"戳"一下：插一个空 style 再删掉，
           顺带抖一下 body 的 CSS 变量。两条通道任一生效即可。 */
        function poke() {
          try {
            if (document.head) {
              var st = document.createElement('style')
              st.setAttribute('data-cjgl-title-poke', '1')
              st.textContent = '/*cjgl-poke*/'
              document.head.appendChild(st)
              if (st.parentNode) st.parentNode.removeChild(st)
            }
          } catch (e) { /* noop */ }
          try {
            if (document.body && document.body.style) {
              document.body.style.setProperty('--cjgl-title-poke', String(Date.now() % 100000))
              document.body.style.removeProperty('--cjgl-title-poke')
            }
          } catch (e) { /* noop */ }
        }

        function paint() {
          var de = document.documentElement
          for (var i = 0; i < TITLE_VARS.length; i++) de.style.setProperty(TITLE_VARS[i], TITLE_CLEAR)
          var probe = findProbe()
          if (probe && probe.style) {
            probe.style.setProperty('background-color', TITLE_CLEAR)
            probe.style.setProperty('color', TITLE_CLEAR)
          }
        }

        function hide() {
          if (applied) return
          applied = true
          var de = document.documentElement
          for (var i = 0; i < TITLE_VARS.length; i++) saved[TITLE_VARS[i]] = de.style.getPropertyValue(TITLE_VARS[i])
          paint()
          poke()
        }

        function show() {
          if (!applied) return
          applied = false
          var de = document.documentElement
          for (var i = 0; i < TITLE_VARS.length; i++) {
            if (saved[TITLE_VARS[i]]) de.style.setProperty(TITLE_VARS[i], saved[TITLE_VARS[i]])
            else de.style.removeProperty(TITLE_VARS[i])
          }
          var probe = findProbe()
          if (probe && probe.style) {
            probe.style.removeProperty('background-color')
            probe.style.removeProperty('color')
          }
        }

        var scheduled = false
        function tick() {
          if (scheduled) return
          scheduled = true
          var run = function () {
            scheduled = false
            var root = null
            try { root = document.querySelector(BOOT_ROOTS) } catch (e) { root = null }
            if (root) hide()
            else if (applied) show()
          }
          if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
          else setTimeout(run, 16)
        }

        var mo = new MutationObserver(tick)
        mo.observe(document.documentElement, { childList: true, subtree: true })
        if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', tick)
        tick()

        /* 桌面端可能在任何时刻重算标题栏（主题切换、窗口激活），
           动画播放期间保持每 400ms 重刷一次，直到根节点消失。 */
        var guard = setInterval(function () {
          var root = null
          try { root = document.querySelector(BOOT_ROOTS) } catch (e) { root = null }
          if (root) {
            if (!applied) hide()
            else { paint(); poke() }
          } else if (applied) {
            show()
            clearInterval(guard)
          }
        }, 400)
      } catch (e) { /* 适配层失败不影响管理器本身 */ }
    }

    /* ── 开机动画跳过 ────────────────────────────────────────────────────
       两种用法：
         1) 配置里勾了「启动时跳过开机动画」→ 页面一加载就把动画根节点摘掉
         2) 播放期间按 Ctrl + Shift + X 临时跳过（动画上不画任何控件）
       跳过优先按插件自己的约定派发 click（各插件都监听它结束动画），
       250ms 后根节点还在就强制移除并解除滚动锁，保证一定能跳过。 */
    var BOOT_SELECTOR = '#dsh-startup-root, #hdd-root, #dsh-gd-root'

    function bootRoots() {
      try { return Array.prototype.slice.call(document.querySelectorAll(BOOT_SELECTOR)) } catch (e) { return [] }
    }

    function forceRemoveBoot() {
      try {
        var roots = bootRoots()
        for (var i = 0; i < roots.length; i++) {
          var el = roots[i]
          if (el && el.parentNode) el.parentNode.removeChild(el)
        }
        var de = document.documentElement
        de.classList.remove('gd-lock', 'dsu-lock')
        de.style.removeProperty('overflow')
        if (document.body) document.body.style.removeProperty('overflow')
      } catch (e) { /* noop */ }
    }

    function skipBootAnimation() {
      var roots = bootRoots()
      if (!roots.length) return false
      for (var i = 0; i < roots.length; i++) {
        try {
          var ev = new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
          roots[i].dispatchEvent(ev)
        } catch (e) { /* 不支持就等兜底 */ }
      }
      setTimeout(function () {
        if (bootRoots().length) forceRemoveBoot()
      }, 260)
      return true
    }

    function startBootSkip(skipOnStart) {
      if (typeof document === 'undefined') return

      if (skipOnStart) {
        var tries = 0
        var t = setInterval(function () {
          tries++
          if (bootRoots().length) { skipBootAnimation(); clearInterval(t) }
          else if (tries > 60) clearInterval(t)
        }, 80)
        return
      }

      /* 只在键盘上留一个入口，不在动画上画任何东西。
         用组合键而不是 Esc / 空格：那两个是动画插件自己的跳过键，
         抢了会让它们的「跳过」提示与实际行为对不上。捕获阶段监听，
         免得被插件在半路 stopPropagation 挡掉。 */
      var onKey = function (e) {
        if (!e || !e.ctrlKey || !e.shiftKey) return
        var k = String(e.key || '').toLowerCase()
        if (k !== 'x') return
        if (!bootRoots().length) return
        e.preventDefault()
        e.stopPropagation()
        skipBootAnimation()
      }
      document.addEventListener('keydown', onKey, true)
    }

    function apply(ctx) {
      /* 开机画面标题栏适配：跟管理器自己的面板样式无关，启动即生效 */
      startTitlebarCompat()
      /* 跳过能力：先挂上快捷键监听，拿到配置后如果开了 skipBoot 立即摘掉动画 */
      startBootSkip(false)
      try {
        fetch(API + '/config', { headers: { Accept: 'application/json' } })
          .then(function (r) { return r.json() })
          .then(function (j) {
            if (j && j.ok && j.config && j.config.skipBoot === true) skipBootAnimation()
          })
          .catch(function () {})
      } catch (e) { /* noop */ }
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
