# dsh-cjgl

<p align="left">
  <a href="./README.md"><b>中文</b></a>
  &nbsp;|&nbsp;
  <a href="https://github.com/hanqi007?tab=followers">Follow us</a>
  &nbsp;|&nbsp;
  <a href="https://github.com/hanqi007/dsh-cjgl"><img src="https://img.shields.io/github/stars/hanqi007/dsh-cjgl?style=flat-square&logo=github&label=GitHub" height="18" alt="GitHub"></a>
</p>

<details>
<summary>🌐 Languages</summary>

- [简体中文](./README.md)
- [English](./README.en.md)  ← current

</details>

---

The DSH **startup and plugin manager** ("cjgl" = plugin management). It lists every plugin in the current
profile on the settings page, each with an on/off switch; each card has a "Manage" button in the bottom-right
corner that opens that plugin's own config details.

## Two kinds of plugin

- **Boot animations** — mutually exclusive. These plugins take effect by injecting into the `index.html`
  first screen; turning on two at once means two root nodes, two sets of CSS, and two animations running
  together. Enabling one automatically disables the others.
- **Everything else** — independent, and **any number can run at once** without affecting each other.

The manager itself is also in the list (marked `self`) and cannot be disabled.

## Interface

Settings → "Startup & Plugins":

| Position | Content |
|---|---|
| Card body | Package name, version, status badge, description, **settings panel name** (e.g. "Boot animation") |
| Card bottom-left | Enable / disable (click writes immediately) |
| **Card bottom-right** | **Manage** — expand that plugin's own details |
| Detail panel | Package name, version, status, settings panel name, **config file path**, enable/disable and apply |
| Top | Warning when multiple boot animations are enabled at once |
| Bottom | Refresh, profile path |

In the details opened by "Manage", you can see whether the plugin has its own config file (such as
`~/.dsh/hdd-console.json`) and what it is called in the settings sidebar, making it easy to jump to the right
settings page.

## Standalone config page

Clicking "Manage" opens the plugin's own config page (not a short blurb), laid out like the plugin's native
settings page:

- Top: `← Back to list`, package name, version, status badge
- Config file path (e.g. `~/.dsh/dsh-startup.json`)
- Form: rendered from the field schema as checkboxes / dropdowns / number inputs / text inputs / color pickers
  / JSON text areas
- Bottom: save, cancel, save-result message

Where the fields come from:

| Plugin | Source |
|---|---|
| `dsh-startup-screen` | Built-in Chinese schema (33 fields: playback timing, speed, identity, theme, voice, brand copy, dispersion color…) |
| `hdd-console-boot` | Built-in Chinese schema (17 fields: operator, device code, boot line, volume, accent color…) |
| Other plugins | Read the plugin's config file and infer from JSON value types (boolean→checkbox, number→number input, string→text input, object→JSON) |

Each field's **default value** is also shown: even if the plugin's config file doesn't have that key yet, the
config page fills in the plugin's own default (all 33 fields of `dsh-startup-screen` and 17 of
`hdd-console-boot` have defaults), and saving writes the change to disk.

When saving, only keys declared in the schema are accepted, the rest are ignored; a `.bak` backup is made
before writing, and writes are `tmp + rename`.

Chinese characters are written as UTF-8 unchanged (verified by code point: `寒语` → `0x5bd2 0x8bed`).

## How enabling takes effect

- Clicking "Enable and apply / Disable and apply" → **writes immediately** to the profile's
  `dsh.profile.bundles`, and the panel updates at once
- **Boot animations**: refresh the page to see it (assuming the Host route is loaded)
- **Other plugins**: bundles are assembled at app startup, so a restart is needed to load/unload

The panel states this at every step, and never pretends something has already taken effect.

## How plugins are identified

Starting from the profile's `dependencies`, it reads each `node_modules/<name>/package.json`:

- **Boot animation**: package name matches `startup` / `splash` / `boot`, or the description/keywords
  mention boot-animation terms
- **Other plugins**: any other package whose `package.json` can be read
- **Settings panel name**: matched from the plugin's browser-side source near `settings.section` as
  `label: '...'`
- **Config file**: probed by convention at `~/.dsh/<package>.json`, with the `dsh-` prefix and the
  `-boot/-manager/-startup/-screen` suffixes stripped

## Safety boundaries

| Rule | Description |
|---|---|
| Only one place changed | Only `dsh.profile.bundles` in the profile `package.json` |
| No dependency changes | `dependencies` is never added to or removed from; no pnpm runs, no packages installed or deleted |
| Core protection | `@deepseek-ai/dsh-base` and `@deepseek-ai/dsh-web-app` are refused |
| Self protection | The manager cannot disable itself |
| Name whitelist | Only names found by scanning are accepted |
| Atomic writes | Back up `.bak` first, then `tmp + rename` |

## Manager version download

The manager is bound to its own repo [`hanqi007/dsh-cjgl`](https://github.com/hanqi007/dsh-cjgl) and can
download versions directly from the panel:

- Settings → "Startup & Plugins" → "Manager versions" → "Read repo versions"
- Lists every `dsh-cjgl-*.tgz` under the repo's `dist/`, newest first
- Each row shows the version and package size; the current version is marked "current"
- Click "Download" → fetch that version from GitHub → write to `~/.dsh/packages/` → update `dependencies` to
  point at the new package → extract and overwrite itself

Endpoints:

| Method | Path | Purpose |
|---|---|---|
| GET | `/dsh-cjgl/versions` | List versions in the repo's dist |
| POST | `/dsh-cjgl/install-version` | Download and install a given version |

Notes:

- This installs **the manager itself**, overwriting the current files; takes effect after restarting the app
- The download source is `raw.githubusercontent.com`, which must be reachable
- Only `x.y.z` version strings are accepted

## Install source and re-download

During scanning the manager records each plugin's **installer path** (the `file:` source in `dependencies`)
into `sources` in `~/.dsh/dsh-cjgl.json`:

```json
{
  "sources": {
    "dsh-startup-screen": "C:/Users/hanlin/.dsh/packages/dsh-startup-screen-1.2.0.tgz",
    "hdd-console-boot": "C:/Users/hanlin/.dsh/packages/hdd-console-boot-1.1.0.tgz"
  }
}
```

The first time a plugin is seen (not yet in `sources`), the panel shows a "**New plugin detected (source
recorded)**" notice and offers a "**Re-download xxx**" button for each new plugin:

- Click it → re-extract and install from the recorded path (equivalent to a reinstall)
- Don't click → leave as is; the record is kept

Each plugin's details (via "Manage") also show the "install source" path, with the full path on hover.

This way, even if `node_modules` is wiped or a package file is corrupted, the plugin can be restored from the
record.

## Compatibility

The manager tries to list everything that is installed, not just its own kind:

| Source | Listed |
|---|---|
| Packages in `dependencies` | ✅ |
| Packages in `dsh.profile.bundles` but not in dependencies | ✅ (marked `bundles only`) |
| Core bundles (dsh-base / dsh-web-app) | ❌ protected, not listed |
| Packages in `node_modules` but in neither dependencies nor bundles | ❌ not listed (avoids dumping the whole tree) |

Fault tolerance:

- `package.json` with a UTF-8 BOM still parses (stripped on read)
- Packages that fail to parse or whose files are missing are still listed, marked `files missing`; they can be
  uninstalled/reinstalled but not enabled
- Boot animation detection uses package name (startup/splash/boot) plus description/keywords, not a fixed
  package name

## Reinstalling plugins

Every plugin card (**including the manager itself**) has a "**Reinstall**" button. It:

1. Reads the package's `file:` path from `dependencies`
2. Deletes the `node_modules/<package>` directory
3. Extracts the tgz with `tar -xzf` to a temp directory, then moves `package/` into `node_modules/<package>`
4. Re-reads and returns the installed version

Useful when a package file is corrupted, you want to restore the official original, or you want to force a
refresh after switching versions.

Notes:

- Only `file:` dependencies (locally uploaded tgz) are supported, not npm registry packages
- Reinstalling does **not** change the dependency declaration in `package.json` or `bundles`
- When reinstalling the manager itself, the running code in memory is unaffected; the new files are used
  after a restart

## Uninstalling plugins

Every plugin card has an "**Uninstall**" button next to "Manage". After a confirmation it:

1. Removes the package from `dependencies`
2. Removes it from `dsh.profile.bundles`
3. Deletes the `node_modules/<package>` directory
4. Deletes `pnpm-lock.yaml` (rebuilt by pnpm on the next install)

`package.json.bak` is backed up before writing back, and writes are still tmp + rename.

Protection rules:

| Target | Result |
|---|---|
| Core bundles (dsh-base / dsh-web-app) | Refused |
| The manager itself (dsh-cjgl) | Refused |
| Names not in the scan list | Refused |

After deleting, a **restart is required** for it to fully take effect (running modules are not unloaded
immediately).

## Plugin health check

There is a "Check" button at the bottom of the settings page. It calls `GET /dsh-cjgl/check`, which verifies
each plugin:

| Check | Description |
|---|---|
| Package directory | Whether `node_modules/<name>` exists |
| package.json | Whether it parses |
| Config file | Whether the JSON is corrupted (if not created, marked "using defaults") |
| Enabled | Whether it is in bundles |

The report lists each plugin's result and warns about "multiple boot animations enabled" and "core bundle
missing".

## New boot animations are off by default

`dsh plugin add` writes a newly installed boot animation into `dsh.profile.bundles`, so it grabs the first
screen automatically. The manager does two things about this:

- **Disabled by default**: when the manager opens, any boot animation not in the `confirmedBoots` list is
  moved out of bundles, and a notice appears at the top: "Automatically disabled newly detected boot
  animations: xxx"
- **Manual confirmation**: click "Use xxx" in the panel to register it in `confirmedBoots` and enable it (other
  boot animations are disabled automatically)

The `autoEnableNewBoot` option (default `false`) controls this policy; set it to `true` to go back to the
native "whatever is installed is enabled" behavior.

`~/.dsh/dsh-cjgl.json`:

```json
{
  "autoUpdate": false,
  "confirmedBoots": [],
  "autoEnableNewBoot": false
}
```

Endpoints:

| Method | Path | Purpose |
|---|---|---|
| GET | `/dsh-cjgl/list` | Scan plugins and return status (and apply default disabling) |
| GET | `/dsh-cjgl/check` | Health check report |
| POST | `/dsh-cjgl/confirm-boot` | Confirm a boot animation for use |
| POST | `/dsh-cjgl/toggle` | Enable / disable |
| POST | `/dsh-cjgl/config` | Read/write manager config |
| GET | `/dsh-cjgl/update` | Check for manager updates |

## Default boot animation

Boot animations are mutually exclusive, and one can be designated as the **default**:

- Click **Set as default** on any boot animation card or its "Manage" page; a "default" badge appears
- Stored as `defaultBoot` in `~/.dsh/dsh-cjgl.json`
- Cleared automatically when the default is uninstalled
- It is only a marker and does not enable anything (the mutual-exclusion rule is unchanged)

## Security advisory channel

Besides reading its own repo's `package.json` for regular updates, the plugin also reads the `security.json`
in the **shared security advisory repo** `hanqi007/zjhqgx`:

- That repo is only updated for **shared vulnerabilities / urgent security patches**, and is not a regular
  release channel
- Advisories matching the current version are marked "security update", and the panel shows the advisory ID
  and fixed version in red
- During automatic checks, **security advisories pop up first** (even if the regular version is already
  latest)

## Auto-update (off by default)

When enabled, opening the settings page queries GitHub for the version (at most once every 24 hours).
**When a new version is found, a dialog asks you**: "Update now" → download the new package from `dist/`,
overwrite the manager itself, effective after restart; "Later" → don't prompt again this time. Clicking
"Check for updates" manually only shows the result in the status row without a dialog.

Settings → "Startup & Plugins" → Update:

- Unchecked by default; when enabled, checks GitHub at most once every 24 hours
- Only prompts "Found vX.Y.Z, download on GitHub", **never auto-downloads or replaces plugins**
- State is stored in `~/.dsh/dsh-cjgl.json` (default `{"autoUpdate": false}`)

## Installation

**Direct download**: [`dsh-cjgl-3.8.1.tgz`](https://github.com/hanqi007/dsh-cjgl/releases/download/v3.8.1/dsh-cjgl-3.8.1.tgz) (latest stable)

Or pick a version from the [Releases page](https://github.com/hanqi007/dsh-cjgl/releases).

Install with the command shipped with DSH. **Fully quit DSH** before installing, then restart it afterwards.

```powershell
# Official desktop app (profile is always "desktop")
D:\DSH\resources\runtime\cli\bin\dsh.cmd plugin --profile desktop add "C:\Downloads\dsh-cjgl-3.8.1.tgz"

# Browser WebUI (profile is "web")
npx -y @deepseek-ai/dsh plugin --profile web add "C:\Downloads\dsh-cjgl-3.8.1.tgz"
```

After installing, the config entry appears under **Settings → Startup & Plugins**.

> `dsh.cmd` lives in the DSH installation directory. If yours is elsewhere, replace the path with
> `<DSH install dir>\resources\runtime\cli\bin\dsh.cmd`.

## Requirements

| Item | Requirement |
|---|---|
| Platform | DSH web / desktop profile |
| Node | >= 20 |
| Dependencies | None |

## Tests

```bash
node test/smoke-host.mjs    # two kinds / mutual exclusion / multiple other plugins / protection list / config switches / settings name and config file detection
node test/smoke-panel.mjs   # panel: three sections / cards / Manage expands details / empty state / warnings
```

Currently all green: 55 + 36 = 91 checks.

## Commit convention

Update notes consist of a "content line" plus a "version line". Content lines are split by change type and
are **never merged into one line or expanded into a list**:

| Case | Format |
|---|---|
| Fix only | One line "Fixed … bug" + version line |
| Add only | One line "Added … feature" + version line |
| Both | Fix and add **each on its own line**, followed by the version line |

The version line is always "Version updated to" + a three-part version number, matching `version` in
`package.json`.

Examples:

Fix only:

```
Fixed a bug where reinstall didn't check the local package and couldn't recover from corruption
Version updated to 3.3.2
```

Add only:

```
Added per-plugin choice of local or repo update source
Version updated to 3.3.2
```

Both:

```
Fixed a bug where reinstall didn't check the local package
Added per-plugin choice of local or repo update source
Version updated to 3.3.2
```

Multiple changes of the same type go on one line joined by "、". Different types each get their own line.

## License

MIT

## Version history

| Version | Description |
|---|---|
| 3.0.3 | Cards keep only "Enable/Disable" + "Manage"; set-as-default / reinstall / uninstall moved into the manage page, so narrow windows no longer wrap to two lines; fixed the UI version fallback |
| 3.0.2 | Fixed two interaction bugs: the card's "Set as default" was bound to the wrong callback (clicking did nothing); enabling a boot animation was immediately reverted by `/list`'s "auto-disable newly detected animations" — manual enable now also records it into `confirmedBoots` |
| 3.0.1 | Fixed the 3.0.0 release mistake: 3.0.0 was mistakenly built on the 2.2.1 baseline and lost version management, health checks, confirmed boots, and other features from 2.2.2–2.2.9; this version rebuilds on the **2.2.9 baseline** and keeps the new "default boot animation" |
| 3.0.0 | Default boot animation (defaultBoot) |
| 2.2.9 | Version store and per-version rollback |

## Licensing

This project uses a **custom license** based on Apache License 2.0 with additional restrictions. See
[LICENSE-CUSTOM.md](./LICENSE-CUSTOM.md) for details.

In short:

- ✅ Free to use, modify, and distribute
- ✅ Charge for services around this software (support, customization, hosting, training)
- ❌ Do not make this software itself the subject of paid sale (selling installers, download links, or
  charging for it separately)
- ❌ Do not charge distribution fees unless you are the seller of the service

The full Apache 2.0 text is in [LICENSE](./LICENSE).
