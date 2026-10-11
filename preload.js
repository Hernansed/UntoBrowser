// preload.js — the only bridge between main and renderer.
// Exposes a minimal, explicit, promise-based API on window.unto.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('unto', {
  history: {
    add: (entry) => ipcRenderer.invoke('history:add', entry),
    list: () => ipcRenderer.invoke('history:list'),
    clear: () => ipcRenderer.invoke('history:clear'),
  },
  bookmarks: {
    list: () => ipcRenderer.invoke('bookmarks:list'),
    toggle: (bm) => ipcRenderer.invoke('bookmarks:toggle', bm),
  },
  nav: {
    normalize: (text) => ipcRenderer.invoke('nav:normalize', text),
  },
  privacy: {
    clearBrowsing: () => ipcRenderer.invoke('privacy:clearBrowsing'),
  },
  state: {
    get: () => ipcRenderer.invoke('state:get'),
    set: (s) => ipcRenderer.invoke('state:set', s),
  },
  private: {
    newPartition: () => ipcRenderer.invoke('private:partition'),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
  },
  session: {
    save: (data) => ipcRenderer.invoke('session:save', data),
    get: () => ipcRenderer.invoke('session:get'),
  },
  theme: {
    get: () => ipcRenderer.invoke('theme:get'),
    set: (name) => ipcRenderer.invoke('theme:set', name),
    onChanged: (cb) => ipcRenderer.on('theme:changed', (_e, n) => cb(n)),
  },
  downloads: {
    open: (path) => ipcRenderer.invoke('downloads:open', path),
    list: () => ipcRenderer.invoke('downloads:list'),
    openSaved: (file) => ipcRenderer.invoke('downloads:openSaved', file),
    showInFolder: (file) => ipcRenderer.invoke('downloads:showInFolder', file),
    clear: () => ipcRenderer.invoke('downloads:clear'),
    onUpdate: (cb) => ipcRenderer.on('downloads:updated', (_e, list) => cb(list)),
  },
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
  },
  onOpenUrlRequest: (cb) => ipcRenderer.on('tabs:open-request', (_e, url) => cb(url)),
});
