# Unto Browser — full browser for Windows & Linux (Chromium engine)

A complete, cross-platform browser built on **Electron** — which embeds the
real **Chromium** engine — with a clean, readable base: no frameworks, no
bundler, six plain files.

Native on both target platforms from one codebase:
- **Windows 10/11** (x64) — NSIS installer (`.exe`)
- **Linux** (x64) — `.deb` (Debian, Ubuntu, Mint, Pop!_OS, Kali, …) and
  `.rpm` (Fedora, openSUSE, RHEL, ALT, …) packages

## Install — one command

### Linux (any major distro)

**Debian / Ubuntu / Mint / Pop!_OS / Kali / Zorin / Deepin / Astra:**

```bash
curl -fsSL https://raw.githubusercontent.com/Hernansed/UntoBrowser/main/scripts/install.sh | bash
```

The script detects your distro, downloads the latest `.deb` or `.rpm` from
GitHub Releases and installs it with the right package manager (asking for
your password via sudo). Also works for **Fedora / RHEL / openSUSE / ALT**:
the same one-liner picks the `.rpm` automatically.

Prefer doing it manually?

```bash
# Debian-family
curl -fsSLo unto.deb https://github.com/Hernansed/UntoBrowser/releases/latest/download/unto-browser-latest.deb
sudo apt install ./unto.deb && rm unto.deb

# Fedora / RHEL / openSUSE
curl -fsSLo unto.rpm https://github.com/Hernansed/UntoBrowser/releases/latest/download/unto-browser-latest.rpm
sudo dnf install ./unto.rpm && rm unto.rpm      # or: sudo zypper in ./unto.rpm
```

After install, launch **Unto** from your application menu, or run `unto`
in a terminal. Updates: the browser checks GitHub on every start and offers
to update itself from Settings → Updates (installs the new .deb/.rpm for you).

### Windows 10/11

Download [`Unto.Browser.Setup.<version>.exe`](https://github.com/Hernansed/UntoBrowser/releases/latest)
and run it — Start-menu entry, uninstaller in "Apps & Features".
The browser updates itself the same way (Settings → Updates).

## Run it (development)

Requires [Node.js](https://nodejs.org/) 18+ on Windows or Linux.

```bash
npm install
npm start
```

That's it — a working browser window.

## Package — build installers yourself

```bash
npm run dist:linux   # -> dist/unto-browser_<ver>_amd64.deb + dist/unto-browser_<ver>.x86_64.rpm
npm run dist:win     # -> dist/"Unto Browser Setup <ver>.exe"   (Wine needed on Linux for NSIS)
npm run dist         # both
```

## Features

- Real Chromium rendering: modern sites, JS, video, WebRTC all work
- Tabbed browsing with titles, close buttons, `+` new tab
- Smart address bar: URL → load, text → DuckDuckGo search
- Back / Forward / Reload-Stop / Home
- **History** (persisted on disk, capped at 5000 entries, clearable)
- **Bookmarks** (persisted, star toggle in the toolbar)
- **Private tabs** — in-memory session partition: no cookies, cache, or
  history persisted
- Popups and `target=_blank` open as new tabs
- **Auto-update** — checks GitHub Releases on start; new version installs
  right from Settings → Updates (deb/rpm via polkit prompt, NSIS silent)
- Zoom (Ctrl+/-/0), DevTools per tab, keyboard shortcuts throughout
- Error pages, single-instance lock, external links (mailto: etc.) handed to
  the OS

## Keyboard shortcuts

| Keys | Action |
|---|---|
| Ctrl+T / Ctrl+W | new tab / close tab |
| Ctrl+Shift+T | reopen last closed tab |
| Ctrl+N / Ctrl+Shift+N | new window / new private tab |
| Ctrl+Tab / Ctrl+Shift+Tab | next / previous tab |
| Ctrl+1…8 / Ctrl+9 | jump to tab N / last tab |
| Ctrl+L or Alt+D | focus address bar |
| Ctrl+R or F5 | reload |
| Ctrl+J | downloads panel |
| Ctrl+H | history |
| Ctrl+Shift+O | bookmarks |
| Ctrl+D | bookmark this page |
| Ctrl+, | settings |
| Ctrl+F | find in page |
| Ctrl+P | print |
| Ctrl+Plus / Ctrl+Minus / Ctrl+0 | zoom in / out / reset |
| Alt+Left / Alt+Right / Alt+Home | back / forward / home |
| F12 | DevTools |

## Project layout (the whole thing)

```
unto/
├── main.js            main process: window, IPC API, history/bookmarks storage, auto-update
├── preload.js         security bridge (contextIsolation on, sandbox on)
└── renderer/
    ├── index.html     chrome UI: toolbar, tab strip, menu
    ├── style.css      all styling, small and flat
    └── app.js         tab manager, navigation, menu, hotkeys
└── package.json       run/build scripts + electron-builder config
```

## Where to extend

| Want… | Edit |
|---|---|
| Search engine | `normalizeInput()` in `main.js` |
| Start page | `renderStartPage()` in `renderer/app.js` |
| Styling / theme | `renderer/style.css` |
| More persisted data | IPC handlers in `main.js` + `preload.js` |
| Ad blocking | `session.defaultSession.webRequest` filtering in `main.js` |
| Downloads UI | `session.on('will-download')` in `main.js` |
| Auto-update | `update:*` handlers in `main.js`, Updates section in `renderer/settings.html` |

## Security posture

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- Renderer talks to main only through the explicit `window.unto`
  API (see `preload.js`) — no raw IPC surface
- Pages run in `<webview>` with their own process per site
- CSP set on the chrome document itself

---

Just started, no hate pls
