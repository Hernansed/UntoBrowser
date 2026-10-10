// app.js — ClearBrowser renderer: tab manager, address bar, navigation, menu.
//
// Tabs are <webview> elements created in this document. The webview tag runs
// the page in a separate Chromium process (out-of-process iframe), which is
// how modern Electron browsers isolate tabs.

const api = window.clearbrowser;
const START_PAGE = 'unto.html'; // bundled start page: Unto (themes, bookmarks, AI)
const HOME_URL = 'unto.html';

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
function createTab(url = START_PAGE, isPrivate = false) {
  const id = nextId++;
  const tabEl = document.createElement('div');
  tabEl.className = 'tab';

  const titleEl = document.createElement('span');
  titleEl.className = 'title';
  titleEl.textContent = 'New Tab';

  const closeEl = document.createElement('button');
  closeEl.className = 'close';
  closeEl.textContent = '\u2715';
  closeEl.title = 'Close tab';
  closeEl.addEventListener('click', (e) => { e.stopPropagation(); closeTab(id); });

  tabEl.append(titleEl, closeEl);
  tabEl.addEventListener('click', () => activateTab(id));
  els.tabs.appendChild(tabEl);

  const view = document.createElement('webview');
  // Private tabs live in a throwaway in-memory session partition -> no cookies,
  // no cache on disk, and nothing written to history.
  if (isPrivate) {
    view.setAttribute('partition', 'private-' + id + '-' + Date.now());
  }
  view.setAttribute('allowpopups', 'true');
  view.style.display = 'none';
  els.content.appendChild(view);

  const tab = { id, view, el: tabEl, titleEl, private: isPrivate };
  tabs.push(tab);

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
    if (tab.id === activeId) document.title = (e.title || 'ClearBrowser') + ' — ClearBrowser';
  });

  view.addEventListener('did-navigate', (e) => onNavigated(tab, e.url));
  view.addEventListener('did-navigate-in-page', (e) => onNavigated(tab, e.url));

  view.addEventListener('did-fail-load', (e) => {
    if (e.errorCode === -3) return; // aborted, ignore
    view.loadURL(
      'data:text/html;charset=utf-8,' +
      encodeURIComponent(
        `<body style="font:15px system-ui;padding:40px;color:#444">
           <h2>Couldn't load the page</h2>
           <p>${e.errorDescription} (${e.errorCode})</p>
           <p style="color:#777">${e.validatedURL}</p>
         </body>`
      )
    );
  });

  // popup / target=_blank -> new tab
  view.addEventListener('new-window', (e) => {
    e.preventDefault();
    createTab(e.url, isPrivate);
  });

  view.addEventListener('dom-ready', () => {
    updateNavButtons(view);
    // Record history only for normal http(s) pages in non-private tabs.
    if (!isPrivate) {
      const url = view.getURL();
      if (/^https?:\/\//i.test(url)) {
        api.history.add({ url, title: view.getTitle() || url });
      }
    }
  });

  // handle popups requested by main
  api.onOpenUrlRequest((u) => createTab(u, false));

  activateTab(id);
  view.src = url; // relative paths resolve against the chrome document
  return id;
}

function onNavigated(tab, url) {
  tab.view.style.display = 'flex';
  if (tab.id === activeId) {
    // hide chrome URL for the bundled start page
    setUrlbar(url.endsWith('/' + START_PAGE) ? '' : (url === 'about:blank' ? '' : url));
    els.bookmark.disabled = !/^https?:\/\//i.test(url);
  }
}

function activateTab(id) {
  activeId = id;
  for (const t of tabs) {
    const on = t.id === id;
    t.el.classList.toggle('active', on);
    t.view.style.display = on ? 'flex' : 'none';
  }
  const t = activeTab();
  if (t) {
    const url = t.view.getURL();
    setUrlbar(url.endsWith('/' + START_PAGE) ? '' : url);
    els.bookmark.disabled = !/^https?:\/\//i.test(url);
    updateNavButtons(t.view);
  }
  els.urlbar.focus();
}

function closeTab(id) {
  const i = tabs.findIndex((t) => t.id === id);
  if (i === -1) return;
  const [t] = tabs.splice(i, 1);
  t.el.remove();
  t.view.remove();
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
  tab.view.style.display = 'flex';
  tab.view.loadURL(url);
  tab.view.focus();
}

// ------------------------------------------------------------------ buttons
els.back.addEventListener('click', () => activeTab()?.view.goBack());
els.fwd.addEventListener('click', () => activeTab()?.view.goForward());
els.reload.addEventListener('click', () => {
  const v = activeTab()?.view;
  if (!v) return;
  if (v.isLoading()) v.stop();
  else v.reload();
});
els.home.addEventListener('click', () => {
  const tab = activeTab();
  if (!tab) return;
  tab.view.loadURL(HOME_URL);
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
  if (e.key === 'Escape') { setUrlbar(activeTab()?.view.getURL() || ''); els.urlbar.blur(); }
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
    case 'history': {
      const list = await api.history.list();
      const recent = list.slice(-40).reverse();
      const html = `<body style="font:14px system-ui;padding:24px">
        <h2>History</h2>
        <ul>${recent.map((h) =>
          `<li><a href="${h.url}">${(h.title || h.url).replace(/[<>]/g, '')}</a>
           <small style="color:#888">${new Date(h.ts).toLocaleString()}</small></li>`).join('')}
        </ul></body>`;
      createTab('data:text/html;charset=utf-8,' + encodeURIComponent(html), false);
      break;
    }
    case 'clear-history': await api.history.clear(); els.menu.classList.add('hidden'); break;
    case 'bookmarks': {
      const list = await api.bookmarks.list();
      const html = `<body style="font:14px system-ui;padding:24px"><h2>Bookmarks</h2>
        <ul>${list.map((b) => `<li><a href="${b.url}">${(b.title || b.url).replace(/[<>]/g, '')}</a></li>`).join('')}</ul></body>`;
      createTab('data:text/html;charset=utf-8,' + encodeURIComponent(html), false);
      break;
    }
    case 'zoom-in': tab.view.setZoomLevel(tab.view.getZoomLevel() + 0.5); break;
    case 'zoom-out': tab.view.setZoomLevel(tab.view.getZoomLevel() - 0.5); break;
    case 'zoom-reset': tab.view.setZoomLevel(0); break;
    case 'devtools': tab.view.openDevTools(); break;
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

// ------------------------------------------------------------------- boot
(async function boot() {
  const state = await api.state.get();
  createTab(START_PAGE, false);
  els.urlbar.focus();
  window.addEventListener('beforeunload', () => {
    api.state.set({ w: window.innerWidth, h: window.innerHeight });
  });
})();
