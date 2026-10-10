# Unto Browser — full browser for Windows & Linux (Chromium engine)

A complete, cross-platform browser built on **Electron** — which embeds the
real **Chromium** engine — with a clean, readable base: no frameworks, no
bundler, six plain files.

Native on both target platforms from one codebase:
- **Windows 10/11** (x64) — NSIS installer (`.exe`)
- **Linux** (x64) — `.rpm` package **and** a self-extracting `.sh` installer

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
- Zoom (Ctrl+/-/0), DevTools per tab, keyboard shortcuts throughout
- Error pages, single-instance lock, external links (mailto: etc.) handed to
  the OS

## Run it (development)

Requires [Node.js](https://nodejs.org/) 18+ on Windows or Linux.

```bash
npm install
npm start
```

That's it — a working browser window.

## Package — two files, one per OS

```bash
npm run dist:win     # Windows -> dist/"Unto Browser Setup 0.1.0.exe"
npm run dist:sh      # Linux   -> dist/Unto Browser-0.1.0.sh
npm run dist         # both (sh first, then exe)
```

**Windows `.exe`** — full NSIS installer: Start-menu entry, uninstaller in
"Apps & Features", per-user or per-machine choice.
Building the `.exe` on Linux needs Wine (`sudo pacman -S wine` on Arch,
`sudo apt install wine` on Debian/Ubuntu) because the NSIS compiler is a
Windows tool. On a Windows machine it builds with no extra deps.

**Linux `.sh`** — distro-agnostic single-file installer (works on any Linux
with a desktop environment, no root needed):
```bash
chmod +x Unto Browser-0.1.0.sh
./Unto Browser-0.1.0.sh
```
It installs to `~/.local/opt/unto`, registers an application-menu
entry, and prints the binary path. Remove with
`rm -rf ~/.local/opt/unto ~/.local/share/applications/unto.desktop`.

## Keyboard shortcuts

| Keys | Action |
|---|---|
| Ctrl+T / Ctrl+W | new tab / close tab |
| Ctrl+L | focus address bar |
| Ctrl+R | reload |
| Ctrl+Plus / Ctrl+Minus / Ctrl+0 | zoom in / out / reset |
| Alt+Left / Alt+Right | back / forward |

## Project layout (the whole thing)

```
unto/
├── main.js            main process: window, IPC API, history/bookmarks storage
├── preload.js         security bridge (contextIsolation on, sandbox on)
├── scripts/
│   └── make-sh-installer.js   builds the .sh installer from the dir output
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

## Security posture

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- Renderer talks to main only through the explicit `window.unto`
  API (see `preload.js`) — no raw IPC surface
- Pages run in `<webview>` with their own process per site
- CSP set on the chrome document itself
