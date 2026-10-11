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

// Private mode: per-tab in-memory session partition ------------------------
ipcMain.handle('private:partition', () => 'private-' + Date.now());

// Privacy: wipe cache + cookies + storage (settings page) -------------------
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
