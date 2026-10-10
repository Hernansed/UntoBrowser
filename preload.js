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
  state: {
    get: () => ipcRenderer.invoke('state:get'),
    set: (s) => ipcRenderer.invoke('state:set', s),
  },
  private: {
    newPartition: () => ipcRenderer.invoke('private:partition'),
  },
  downloads: {
    open: (path) => ipcRenderer.invoke('downloads:open', path),
  },
  onOpenUrlRequest: (cb) => ipcRenderer.on('tabs:open-request', (_e, url) => cb(url)),
});
