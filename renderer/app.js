// app.js — ClearBrowser renderer: tab manager, address bar, navigation, menu.
//
// Tabs are <webview> elements created in this document. The webview tag runs
// the page in a separate Chromium process (out-of-process iframe), which is
// how modern Electron browsers isolate tabs.

const api = window.unto;
const START_PAGE = 'unto://app/unto.html'; // bundled start page via custom protocol
const HOME_URL = START_PAGE;

const els = {
  tabs: document.getElementById('tabs'),
  content: document.getElementById('content'),
  urlbar: document.getElementById('urlbar'),
  back: document.getElementById('btn-back'),
  fwd: document.getElementById('btn-fwd'),
  reload: document.getElementById('btn-reload'),
  home: document.getElementById('btn-home'),
  bookmark: document.getElementById('btn-bookmark'),
  menuBtn: document.getElementById('btn-menu'),
  menu: document.getElementById('menu'),
  newTab: document.getElementById('btn-newtab'),
};

/** @type {Array<{id:number, view:Electron.WebviewTag, el:HTMLElement, private:boolean}>} */
const tabs = [];
let activeId = 0;
let nextId = 1;

// ------------------------------------------------------------------- helpers
function activeTab() {
  return tabs.find((t) => t.id === activeId) || null;
}

function setUrlbar(text) {
  if (document.activeElement === els.urlbar) return;
  els.urlbar.value = text || '';
}

function updateNavButtons(view) {
  els.back.disabled = !view || !view.canGoBack();
  els.fwd.disabled = !view || !view.canGoForward();
}

// --------------------------------------------------------------- tab management
// Memory model: a start-page tab is just an <iframe> in the chrome document
// (zero extra processes). A real webview (own Chromium renderer, ~80–150 MB)
// is created ONLY when the tab actually navigates to a website.
function createTab(url = START_PAGE, isPrivate = false) {
  const id = nextId++;
  const tabEl = document.createElement('div');
  tabEl.className = 'tab';

  const titleEl = document.createElement('span');
  titleEl.className = 'title';
  titleEl.textContent = url === START_PAGE ? 'New Tab' : (url.startsWith('unto://') ? 'Settings' : 'Loading…');

  const closeEl = document.createElement('button');
  closeEl.className = 'close';
  closeEl.textContent = '\u2715';
  closeEl.title = 'Close tab';
  closeEl.addEventListener('click', (e) => { e.stopPropagation(); closeTab(id); });

  tabEl.append(titleEl, closeEl);
  tabEl.addEventListener('click', () => activateTab(id));
  els.tabs.appendChild(tabEl);

  const tab = { id, view: null, el: tabEl, titleEl, private: isPrivate, pendingUrl: url, isStart: url === START_PAGE };
  tabs.push(tab);

  if (tab.isStart || url.startsWith('unto://')) {
    attachLightFrame(tab, url);
  } else {
    ensureWebview(tab);
  }

  activateTab(id);
  return id;
}

// Create the real webview for a tab lazily (first real navigation).
function ensureWebview(tab) {
  if (tab.view) return tab.view;
  const view = document.createElement('webview');
  if (tab.private) {
    view.setAttribute('partition', 'private-' + tab.id + '-' + Date.now());
  }
  view.setAttribute('allowpopups', 'true');
  view.style.display = 'none';
  // Electron docs pattern: set src BEFORE inserting into the DOM.
  view.src = tab.pendingUrl || HOME_URL;
  els.content.appendChild(view);
  tab.view = view;
  // ---- webview events ----
  view.addEventListener('did-start-loading', () => {
    if (tab.id === activeId) els.reload.textContent = '\u2715';
  });

  view.addEventListener('did-stop-loading', () => {
    if (tab.id === activeId) els.reload.textContent = '\u21bb';
    updateNavButtons(view);
  });

  view.addEventListener('page-title-updated', (e) => {
    tab.titleEl.textContent = e.title || 'Untitled';
    if (tab.id === activeId) document.title = (e.title || 'Unto Browser') + ' — Unto Browser';
  });

  view.addEventListener('did-navigate', (e) => onNavigated(tab, e.url));
  view.addEventListener('did-navigate-in-page', (e) => onNavigated(tab, e.url));

  view.addEventListener('did-fail-load', (e) => {
    if (e.errorCode === -3) return; // aborted, ignore
    // main-frame failures only; keep the URL visible for debugging
    if (e.isMainFrame) {
      view.loadURL(
        'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          `<body style="font:15px system-ui;padding:40px;background:#05070d;color:#eef2fb">
             <h2>Couldn't load the page</h2>
             <p style="color:#8ea0c4">${e.errorDescription} (${e.errorCode})</p>
             <p style="color:#5a6f96">${e.validatedURL}</p>
           </body>`
        )
      );
    }
  });

  // popup / target=_blank -> new tab
  view.addEventListener('new-window', (e) => {
    e.preventDefault();
    createTab(e.url, tab.private);
  });

  view.addEventListener('dom-ready', () => {
    updateNavButtons(view);
    // Record history only for normal http(s) pages in non-private tabs.
    if (!tab.private) {
      const url = view.getURL();
      if (/^https?:\/\//i.test(url)) {
        api.history.add({ url, title: view.getTitle() || url });
      }
    }
  });

  return view;
}

// Shared light-frame pool: ONE iframe per internal page, created once and
// reused by every tab pointing at it. Switching tabs = instant, zero reloads.
const lightFrames = {}; // url -> {frame, refs:Set<tabId>}
function attachLightFrame(tab, url) {
  const key = (tab.private ? 'p' + tab.id : '') + url; // private tabs get their own frame
  let entry = lightFrames[key];
  if (!entry) {
    const fr = document.createElement('iframe');
    fr.className = 'untoframe';
    fr.src = url;
    fr.style.display = 'none';
    els.content.appendChild(fr);
    entry = lightFrames[key] = { frame: fr, refs: new Set() };
  }
  entry.refs.add(tab.id);
  tab.frame = entry.frame;
  tab.frameKey = key;
}
function releaseLightFrame(tab){
  const key = tab.frameKey;
  if (!key || !lightFrames[key]) return;
  lightFrames[key].refs.delete(tab.id);
  if (lightFrames[key].refs.size === 0) {
    lightFrames[key].frame.remove();
    delete lightFrames[key];
  }
  tab.frame = null; tab.frameKey = null;
}

// Navigate a tab (creating its webview lazily if it was a light start tab).
function navigateTab(tab, url) {
  tab.pendingUrl = url;
  const internal = url === START_PAGE || url.startsWith('unto://');
  if (internal && !tab.view) {
    releaseLightFrame(tab);
    attachLightFrame(tab, url);
    tab.isStart = url === START_PAGE;
    if (tab.id === activeId) {
      tab.frame.style.display = 'flex';
      setUrlbar('');
    }
    return;
  }
  // real website -> needs a webview
  ensureWebview(tab);
  if (tab.frame) tab.frame.style.display = 'none';
  tab.view.loadURL(url);
  if (tab.id === activeId) {
    tab.view.style.display = 'flex';
    setUrlbar(url);
    els.bookmark.disabled = !/^https?:\/\//i.test(url);
  }
}

// Unto internal pages (iframe) ask the shell to navigate the tab
window.addEventListener('message', (e) => {
  if (!e.data || typeof e.data.untoNav !== 'string') return;
  const tab = activeTab();
  if (tab) navigateTab(tab, e.data.untoNav);
});

function onNavigated(tab, url) {
  tab.view.style.display = 'flex';
  if (tab.id === activeId) {
    setUrlbar(url === 'about:blank' ? '' : url.replace(/^unto:\/\/app\//, 'unto://'));
    els.bookmark.disabled = !/^https?:\/\//i.test(url);
  }
}

function activateTab(id) {
  activeId = id;
  for (const t of tabs) {
    const on = t.id === id;
    t.el.classList.toggle('active', on);
    if (t.frame) t.frame.style.display = on ? 'flex' : 'none';
    if (t.view) t.view.style.display = on ? 'flex' : 'none';
  }
  const t = activeTab();
  if (t) {
    if (t.view) {
      const url = t.view.getURL();
      setUrlbar(url.startsWith('unto://app/unto.html') ? '' : (url === 'about:blank' ? '' : url));
      els.bookmark.disabled = !/^https?:\/\//i.test(url);
      updateNavButtons(t.view);
    } else {
      // light internal tab
      setUrlbar('');
      els.bookmark.disabled = true;
      els.back.disabled = true;
      els.fwd.disabled = true;
    }
  }
  els.urlbar.focus();
}

function closeTab(id) {
  const i = tabs.findIndex((t) => t.id === id);
  if (i === -1) return;
  const [t] = tabs.splice(i, 1);
  t.el.remove();
  releaseLightFrame(t);
  if (t.view) t.view.remove();
  if (tabs.length === 0) {
    window.close();
    return;
  }
  if (activeId === id) {
    activateTab(tabs[Math.max(0, i - 1)].id);
  }
}

// --------------------------------------------------------------- navigation
async function navigateFromUrlbar() {
  const tab = activeTab();
  if (!tab) return;
  const url = await api.nav.normalize(els.urlbar.value);
  navigateTab(tab, url);
}

// ------------------------------------------------------------------ buttons
els.back.addEventListener('click', () => activeTab()?.view?.goBack());
els.fwd.addEventListener('click', () => activeTab()?.view?.goForward());
els.reload.addEventListener('click', () => {
  const t = activeTab();
  if (!t) return;
  if (t.frame && !t.view) { t.frame.src = t.frame.src; return; } // reload light tab
  const v = t.view;
  if (!v) return;
  if (v.isLoading()) v.stop();
  else v.reload();
});
els.home.addEventListener('click', () => {
  const tab = activeTab();
  if (!tab) return;
  navigateTab(tab, HOME_URL);
});
els.bookmark.addEventListener('click', async () => {
  const tab = activeTab();
  if (!tab) return;
  const url = tab.view.getURL();
  const list = await api.bookmarks.toggle({ url, title: tab.view.getTitle() || url });
  const saved = list.some((b) => b.url === url);
  els.bookmark.textContent = saved ? '\u2605' : '\u2606';
});
els.newTab.addEventListener('click', () => createTab(START_PAGE, false));

els.urlbar.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') navigateFromUrlbar();
  if (e.key === 'Escape') {
    const t = activeTab();
    setUrlbar(t?.view ? (t.view.getURL() || '') : '');
    els.urlbar.blur();
  }
});

// menu ---------------------------------------------------------------------
els.menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  els.menu.classList.toggle('hidden');
});
document.addEventListener('click', () => els.menu.classList.add('hidden'));

els.menu.addEventListener('click', async (e) => {
  const action = e.target.dataset.action;
  if (!action) return;
  const tab = activeTab();
  switch (action) {
    case 'new-tab': createTab(START_PAGE, false); break;
    case 'private-tab': createTab(START_PAGE, true); break;
    case 'settings': navigateTab(tab, 'unto://app/settings.html'); break;
    case 'history': navigateTab(tab, 'unto://app/history.html'); break;
    case 'bookmarks': navigateTab(tab, 'unto://app/bookmarks.html'); break;
    case 'zoom-in': tab?.view?.setZoomLevel(tab.view.getZoomLevel() + 0.5); break;
    case 'zoom-out': tab?.view?.setZoomLevel(tab.view.getZoomLevel() - 0.5); break;
    case 'zoom-reset': tab?.view?.setZoomLevel(0); break;
    case 'devtools': tab?.view?.openDevTools(); break;
  }
  els.menu.classList.add('hidden');
});

// --------------------------------------------------------------- hotkeys
document.addEventListener('keydown', (e) => {
  const tab = activeTab();
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key.toLowerCase() === 't') { e.preventDefault(); createTab(START_PAGE, false); }
  else if (ctrl && e.key.toLowerCase() === 'w') { e.preventDefault(); closeTab(activeId); }
  else if (ctrl && e.key.toLowerCase() === 'l') { e.preventDefault(); els.urlbar.focus(); els.urlbar.select(); }
  else if (ctrl && e.key.toLowerCase() === 'r') { e.preventDefault(); tab?.view.reload(); }
  else if (ctrl && (e.key === '+' || e.key === '=')) { e.preventDefault(); tab?.view.setZoomLevel(tab.view.getZoomLevel() + 0.5); }
  else if (ctrl && e.key === '-') { e.preventDefault(); tab?.view.setZoomLevel(tab.view.getZoomLevel() - 0.5); }
  else if (ctrl && e.key === '0') { e.preventDefault(); tab?.view.setZoomLevel(0); }
  else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); tab?.view.goBack(); }
  else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); tab?.view.goForward(); }
});

// handle popups requested by main (register ONCE, not per tab)
api.onOpenUrlRequest((u) => createTab(u, false));

// ------------------------------------------------------------------- boot
(async function boot() {
  const state = await api.state.get();
  createTab(START_PAGE, false);
  els.urlbar.focus();
  // silent update check at startup — subtle menu cue when a new version exists
  api.update.check().then((r) => {
    if (r && r.ok && r.updateAvailable) {
      els.menuBtn.textContent = '\u21BB';
      els.menuBtn.title = 'Update available: v' + r.latest + ' — open Settings';
      const btn = document.createElement('button');
      btn.textContent = 'Update to v' + r.latest;
      btn.addEventListener('click', () => {
        els.menu.classList.add('hidden');
        navigateTab(activeTab(), 'unto://app/settings.html');
      });
      els.menu.insertBefore(btn, els.menu.querySelector('[data-action="zoom-in"]'));
    }
  }).catch(() => {});
  window.addEventListener('beforeunload', () => {
    api.state.set({ w: window.innerWidth, h: window.innerHeight });
  });
})();
