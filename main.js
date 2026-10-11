// main.js — Unto Browser main process (Electron / Chromium engine)
//
// Responsibilities:
//   * create BrowserWindows (one per browser window)
//   * own persistent profile data (history, bookmarks, session) on disk
//   * expose a small, explicit IPC API to the renderer
//
// Deliberately kept flat and readable: no frameworks, no bundler.

const { app, BrowserWindow, ipcMain, session, shell, Menu, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// Custom scheme for the browser's own pages (start page, settings).
// Registered before app ready; standard+secure so localStorage works properly.
protocol.registerSchemesAsPrivileged([
  { scheme: 'unto', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// Memory: one renderer process per site (not per tab) and no GPU process.
// Typical saving: 30–50% on a 10-tab session.
app.commandLine.appendSwitch('renderer-process-limit', '6');
app.commandLine.appendSwitch('process-per-site');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

const USER_DATA_DIR = path.join(app.getPath('userData'), 'profile');
const HISTORY_FILE = path.join(USER_DATA_DIR, 'history.json');
const BOOKMARKS_FILE = path.join(USER_DATA_DIR, 'bookmarks.json');

let mainWindow = null;

// ---------------------------------------------------------------- utilities
function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function isHttpUrl(text) {
  return /^https?:\/\//i.test(text);
}

function looksLikeHost(text) {
  return /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(text) || /^localhost(:\d+)?/.test(text);
}

function normalizeInput(text) {
  const t = (text || '').trim();
  if (!t) return 'about:blank';
  if (isHttpUrl(t) || t.startsWith('about:') || t.startsWith('file://')) return t;
  if (looksLikeHost(t)) return 'https://' + t;
  // search fallback
  return 'https://duckduckgo.com/?q=' + encodeURIComponent(t);
}

// ------------------------------------------------------------------ window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 640,
    minHeight: 400,
    title: 'Unto Browser',
    backgroundColor: '#f5f6f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Pages can open popup windows: route them to our own tab code.
      webviewTag: true,
      nativeWindowOpen: true,
    },
  });

  // No menu bar for a browser-chrome look; keep DevTools shortcut available.
  Menu.setApplicationMenu(null);

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // mainWindow.webContents.openDevTools({ mode: 'detach' }); // uncomment to debug
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ------------------------------------------------------------ single instance
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Serve Unto's own pages from unto://app/<file>
    const rendererDir = path.join(__dirname, 'renderer');
    protocol.handle('unto', (request) => {
      const { pathname } = new URL(request.url);
      const rel = decodeURIComponent(pathname).replace(/^\/+/, '') || 'unto.html';
      const file = path.normalize(path.join(rendererDir, rel));
      if (!file.startsWith(rendererDir)) return new Response('forbidden', { status: 403 });
      return net.fetch(pathToFileURL(file).toString());
    });
    createWindow();
  });

  app.on('window-all-closed', () => {
    // Standard quit behavior on both Windows and Linux.
    app.quit();
  });
}

// --------------------------------------------------------------- IPC API
// History ------------------------------------------------------------------
ipcMain.handle('history:add', (_e, entry) => {
  const list = readJson(HISTORY_FILE, []);
  list.push({
    url: String(entry.url || ''),
    title: String(entry.title || ''),
    ts: Date.now(),
  });
  // cap at 5000 entries to keep the file small
  writeJson(HISTORY_FILE, list.slice(-5000));
  return true;
});

ipcMain.handle('history:list', () => readJson(HISTORY_FILE, []));

ipcMain.handle('history:clear', () => {
  writeJson(HISTORY_FILE, []);
  return true;
});

// Bookmarks ----------------------------------------------------------------
ipcMain.handle('bookmarks:list', () => readJson(BOOKMARKS_FILE, []));

ipcMain.handle('bookmarks:toggle', (_e, bm) => {
  const list = readJson(BOOKMARKS_FILE, []);
  const i = list.findIndex((b) => b.url === bm.url);
  if (i >= 0) list.splice(i, 1);
  else list.push({ url: String(bm.url), title: String(bm.title || bm.url), ts: Date.now() });
  writeJson(BOOKMARKS_FILE, list);
  return list;
});

// Navigation ---------------------------------------------------------------
ipcMain.handle('nav:normalize', (_e, text) => normalizeInput(text));

// Downloads ----------------------------------------------------------------
ipcMain.handle('downloads:open', (_e, fileUrl) => shell.openPath(fileUrl));

// Persist window state (size/position) ------------------------------------
const STATE_FILE = path.join(USER_DATA_DIR, 'window-state.json');
ipcMain.handle('state:get', () => readJson(STATE_FILE, {}));
ipcMain.handle('state:set', (_e, s) => { writeJson(STATE_FILE, s); return true; });

// App settings + network (proxy / DNT / HTTPS-Only) + session restore -------
const SETTINGS_FILE = path.join(USER_DATA_DIR, 'settings.json');
const SESSION_FILE = path.join(USER_DATA_DIR, 'session.json');
let appSettings = readJson(SETTINGS_FILE, {});

const isLocalHost = (u) => {
  try {
    const h = new URL(u).hostname;
    return /^(localhost|127\.|10\.|192\.168\.|\[::1\]|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h.endsWith('.local');
  } catch { return true; }
};

function buildProxyConfig(p) {
  if (!p || p.mode === 'system') return { mode: 'system' };
  if (p.mode === 'direct') return { mode: 'direct' };
  const host = (p.host || '').trim(), port = (p.port || '').trim();
  if (!host || !port) return { mode: 'system' };
  const rules = p.type === 'socks5'
    ? `socks5=${host}:${port}`
    : `http=${host}:${port};https=${host}:${port}`;
  return { mode: 'fixed_servers', proxyRules: rules, proxyBypassRules: p.bypass || '<local>' };
}

const hookedSessions = new WeakSet();
function hookSession(ses) {
  if (!ses || hookedSessions.has(ses)) return;
  hookedSessions.add(ses);
  ses.setProxy(buildProxyConfig(appSettings.proxy));
  // DNT / Global Privacy Control headers
  ses.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, (details, cb) => {
    if (appSettings.dnt || appSettings.gpc) {
      const h = details.requestHeaders;
      if (appSettings.dnt) h['DNT'] = '1';
      if (appSettings.gpc) h['Sec-GPC'] = '1';
      cb({ requestHeaders: h });
    } else cb({});
  });
  // HTTPS-Only mode: upgrade plain http to https (never for local hosts)
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*'] }, (details, cb) => {
    if (appSettings.httpsOnly && /^http:/i.test(details.url) && !isLocalHost(details.url)) {
      cb({ redirectURL: 'https://' + details.url.slice(7) });
    } else cb({});
  });
  // Downloads: ask where to save (default dialog) vs auto-save to Downloads
  ses.on('will-download', (_e, item) => {
    if (appSettings.askDownloadPath === false) {
      item.setSavePath(path.join(app.getPath('downloads'), item.getFilename()));
    }
  });
}

app.on('session-created', hookSession);

ipcMain.handle('settings:get', () => appSettings);
ipcMain.handle('settings:set', (_e, patch) => {
  Object.assign(appSettings, patch || {});
  writeJson(SETTINGS_FILE, appSettings);
  hookSession(session.defaultSession);
  return true;
});
ipcMain.handle('session:save', (_e, data) => { writeJson(SESSION_FILE, data || {}); return true; });
ipcMain.handle('session:get', () => readJson(SESSION_FILE, {}));

// Private mode: per-tab in-memory session partition ------------------------
ipcMain.handle('private:partition', () => 'private-' + Date.now());

// Auto-update: check GitHub Releases for a newer version and install it -----
// No electron-updater dependency: plain fetch + installer hand-off.
const REPO = 'Hernansed/UntoBrowser';
const MY_VERSION = app.getVersion();

function cmpVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

async function fetchLatestRelease() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: {
      'User-Agent': 'Unto-Browser-Updater',
      'Accept': 'application/vnd.github+json',
    },
  });
  if (!res.ok) throw new Error('GitHub API ' + res.status);
  return res.json();
}

function pickInstallerAsset(release) {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  if (process.platform === 'win32') {
    // Unto.Browser.Setup.0.6.1.exe (NSIS)
    return assets.find((a) => /^Unto\.Browser\.Setup\.[\d.]+\.exe$/i.test(a.name)) || null;
  }
  if (process.platform === 'darwin') return null;
  // Linux: deb on Debian/Ubuntu-family, rpm elsewhere; cross-check with dpkg/rpm
  const isDeb = fs.existsSync('/etc/debian_version')
    || (fs.existsSync('/etc/os-release') && /\bid[_=]?(debian|ubuntu|mint|pop|elementary|kali|zorin|deepin|parrot|mx|antiX|devuan|trisquel|raspbian|kylin|neon|astra)\b/i.test(fs.readFileSync('/etc/os-release', 'utf8')));
  const want = isDeb ? /_amd64\.deb$/ : /\.rpm$/;
  const fallback = isDeb ? /\.rpm$/ : /_amd64\.deb$/;
  return assets.find((a) => want.test(a.name)) || assets.find((a) => fallback.test(a.name)) || null;
}

function downloadTo(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (u, redirects) => {
      const mod = u.startsWith('https:') ? require('https') : require('http');
      mod.get(u, { headers: { 'User-Agent': 'Unto-Browser-Updater' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirects > 5) return reject(new Error('too many redirects'));
          res.resume();
          return follow(new URL(res.headers.location, u).toString(), redirects + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error('download HTTP ' + res.statusCode));
        }
        const out = fs.createWriteStream(dest);
        res.pipe(out);
        out.on('finish', () => out.close(() => resolve(dest)));
        out.on('error', reject);
        res.on('error', reject);
      }).on('error', reject);
    };
    follow(url, 0);
  });
}

ipcMain.handle('update:check', async () => {
  try {
    const release = await fetchLatestRelease();
    const latest = String(release.tag_name || '').replace(/^v/, '');
    return { ok: true, current: MY_VERSION, latest, updateAvailable: cmpVersions(latest, MY_VERSION) > 0 };
  } catch (err) {
    return { ok: false, current: MY_VERSION, error: String(err.message || err) };
  }
});

ipcMain.handle('update:install', async () => {
  const result = { ok: false };
  try {
    const release = await fetchLatestRelease();
    const latest = String(release.tag_name || '').replace(/^v/, '');
    if (cmpVersions(latest, MY_VERSION) <= 0) {
      result.error = 'already-up-to-date';
      return result;
    }
    const asset = pickInstallerAsset(release);
    if (!asset) {
      result.error = 'installer-not-found';
      return result;
    }
    const tmpDir = app.getPath('temp');
    const dest = path.join(tmpDir, asset.name);
    result.status = 'downloading';
    await downloadTo(asset.browser_download_url, dest);
    result.status = 'downloaded';
    if (process.platform === 'win32') {
      // NSIS: /S = silent, install over the previous version
      const child = require('child_process').spawn(dest, ['/S'], {
        detached: true, stdio: 'ignore',
      });
      child.unref();
    } else {
      // Linux: .deb / .rpm need root — ask via pkexec (graphical polkit prompt).
      // Try the native package manager first; fall back to the other format.
      const hasDpkg = fs.existsSync('/usr/bin/dpkg') || fs.existsSync('/bin/dpkg');
      const isDebFile = asset.name.endsWith('.deb');
      const execSh = (cmd) => require('child_process').spawn('/bin/sh', ['-c', cmd], {
        detached: true, stdio: 'ignore', env: process.env,
      });
      const child = isDebFile
        ? (hasDpkg
          ? execSh(`pkexec sh -c 'dpkg -i "${dest}" || apt-get install -y -f "${dest}"'`)
          : execSh(`pkexec sh -c 'rpm -Uvh --force "${dest}"'`))
        : (hasDpkg
          ? execSh(`pkexec sh -c 'dpkg -i "${dest}" || apt-get install -y -f "${dest}"'`)
          : execSh(`pkexec sh -c 'rpm -Uvh --force "${dest}"'`));
      child.unref();
    }
    result.ok = true;
    result.installer = asset.name;
    result.quitNeeded = true;
  } catch (err) {
    result.error = String(err.message || err);
  }
  return result;
});

// Privacy: wipe cache + cookies + storage (settings page) ------------------
ipcMain.handle('privacy:clearBrowsing', async () => {
  const s = session.defaultSession;
  await s.clearCache();
  await s.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers'] });
  return true;
});

// Session data cleanup on quit for non-private profile
app.on('before-quit', () => {
  // hook for flushing anything else you persist later
});

// ------------------------------------------------------------------ extras
// Open external links (mailto:, etc.) in the OS default handler.
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) {
      // let the renderer's tab manager handle http(s) as a new tab
      mainWindow?.webContents.send('tabs:open-request', url);
      return { action: 'deny' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });
});
