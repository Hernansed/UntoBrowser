// themes.js — single source of truth for Unto themes.
// All surfaces (chrome toolbar, start page, settings/history/downloads pages)
// read the same palette and listen for theme:changed to repaint instantly.

const THEME_DEFS = {
  noir:     { bg:'#05070d', bg2:'#0a0f1c', card:'#0e1526', card2:'#131c33', text:'#eef2fb', muted:'#8ea0c4', border:'#1d2946', accent:'#2f6fed', accent2:'#5a8bff', glow:'rgba(47,111,237,.35)' },
  midnight: { bg:'#000308', bg2:'#020910', card:'#04101c', card2:'#071a2b', text:'#dfeaff', muted:'#6f87ad', border:'#10263c', accent:'#1e3a8a', accent2:'#3b82f6', glow:'rgba(59,130,246,.3)' },
  ocean:    { bg:'#03121f', bg2:'#04182b', card:'#062235', card2:'#0a2d47', text:'#e6f4ff', muted:'#7fa8c9', border:'#0f3a58', accent:'#0ea5c9', accent2:'#38c2e0', glow:'rgba(14,165,201,.35)' },
  deepsea:  { bg:'#02131a', bg2:'#04202b', card:'#062a38', card2:'#0a384c', text:'#e4f6fb', muted:'#7fadc0', border:'#11475c', accent:'#14b8a6', accent2:'#2dd4bf', glow:'rgba(20,184,166,.32)' },
  teal:     { bg:'#041512', bg2:'#062019', card:'#0a2b23', card2:'#0f3a2f', text:'#e7fbf3', muted:'#84bcaa', border:'#155742', accent:'#10b981', accent2:'#34d399', glow:'rgba(16,185,129,.3)' },
  forest:   { bg:'#0a1206', bg2:'#101c0a', card:'#16260d', card2:'#1e3212', text:'#eefbe6', muted:'#a3c28d', border:'#2c4a1c', accent:'#4d9e2f', accent2:'#6cc244', glow:'rgba(76,158,47,.3)' },
  lime:     { bg:'#0d1105', bg2:'#141b08', card:'#1c260c', card2:'#263412', text:'#f4fbe4', muted:'#b9cc8a', border:'#3d5219', accent:'#84cc16', accent2:'#a3e635', glow:'rgba(132,204,22,.28)' },
  amber:    { bg:'#120d04', bg2:'#1b1406', card:'#251b08', card2:'#33250c', text:'#fdf3e0', muted:'#ccae7d', border:'#574016', accent:'#f59e0b', accent2:'#fbbf24', glow:'rgba(245,158,11,.28)' },
  sunset:   { bg:'#140a05', bg2:'#1e0f07', card:'#2a1409', card2:'#3a1d0c', text:'#fdeee2', muted:'#cfa388', border:'#5a2e16', accent:'#f97316', accent2:'#fb923c', glow:'rgba(249,115,22,.3)' },
  crimson:  { bg:'#130508', bg2:'#1d070c', card:'#280a11', card2:'#360f17', text:'#fbe7ec', muted:'#c98da0', border:'#571726', accent:'#e11d48', accent2:'#fb7185', glow:'rgba(225,29,72,.3)' },
  rose:     { bg:'#12070d', bg2:'#1c0b15', card:'#270f1d', card2:'#351528', text:'#fae9f3', muted:'#c795b4', border:'#522039', accent:'#ec4899', accent2:'#f472b6', glow:'rgba(236,72,153,.3)' },
  grape:    { bg:'#0e0714', bg2:'#150b1e', card:'#1d0f2a', card2:'#271539', text:'#f3e9fb', muted:'#b394cc', border:'#3b2054', accent:'#9333ea', accent2:'#a855f7', glow:'rgba(147,51,234,.3)' },
  violet:   { bg:'#0b0817', bg2:'#110c24', card:'#181033', card2:'#211645', text:'#efe9fd', muted:'#a89ccf', border:'#31235e', accent:'#7c3aed', accent2:'#8b5cf6', glow:'rgba(124,58,237,.32)' },
  indigo:   { bg:'#070a18', bg2:'#0c1026', card:'#111738', card2:'#182048', text:'#e8ecfd', muted:'#93a0d1', border:'#23305e', accent:'#4f46e5', accent2:'#6366f1', glow:'rgba(79,70,229,.32)' },
  azure:    { bg:'#050c16', bg2:'#081424', card:'#0c1d33', card2:'#122846', text:'#e6f1fd', muted:'#87a6c8', border:'#1c3a60', accent:'#0284c7', accent2:'#38bdf8', glow:'rgba(2,132,199,.32)' },
  steel:    { bg:'#0b0e12', bg2:'#10141a', card:'#161c24', card2:'#1e2530', text:'#e6eaf0', muted:'#94a0af', border:'#2a3542', accent:'#64748b', accent2:'#94a3b8', glow:'rgba(100,116,139,.3)' },
  coffee:   { bg:'#100c09', bg2:'#18120d', card:'#211913', card2:'#2c2119', text:'#f5ede4', muted:'#bba289', border:'#463527', accent:'#a1662f', accent2:'#c98a4b', glow:'rgba(161,102,47,.3)' },
  sand:     { bg:'#f5f1e8', bg2:'#efe9dc', card:'#fffdf8', card2:'#f4efe3', text:'#2d2a24', muted:'#8a8272', border:'#e0d8c6', accent:'#b4832a', accent2:'#cfa04e', glow:'rgba(180,131,42,.22)' },
  snow:     { bg:'#f4f6fb', bg2:'#eef1f8', card:'#ffffff', card2:'#f2f5fb', text:'#111827', muted:'#64748b', border:'#dfe5f0', accent:'#2456d6', accent2:'#4a74e8', glow:'rgba(36,86,214,.25)' },
  sakura:   { bg:'#fbf3f6', bg2:'#f6e9ee', card:'#ffffff', card2:'#faf0f4', text:'#3a2430', muted:'#a1788f', border:'#efd8e2', accent:'#db2777', accent2:'#ec4899', glow:'rgba(219,39,119,.2)' },
  mint:     { bg:'#f0faf5', bg2:'#e6f4ec', card:'#ffffff', card2:'#effaf3', text:'#14332a', muted:'#6f9488', border:'#d5e9de', accent:'#0d9488', accent2:'#14b8a6', glow:'rgba(13,148,136,.2)' },
  paper:    { bg:'#fafafa', bg2:'#f1f1f0', card:'#ffffff', card2:'#f4f4f3', text:'#1c1c1c', muted:'#757570', border:'#e4e4e1', accent:'#c2410c', accent2:'#ea580c', glow:'rgba(194,65,12,.2)' },
  cyber:    { bg:'#020a06', bg2:'#03140a', card:'#052010', card2:'#072e1a', text:'#d8ffe9', muted:'#6fae8d', border:'#0e4d2a', accent:'#22ff88', accent2:'#6effb0', glow:'rgba(34,255,136,.25)' },
  gold:     { bg:'#0c0b06', bg2:'#141208', card:'#1c1910', card2:'#262215', text:'#f8f2dd', muted:'#bdae87', border:'#453c1e', accent:'#d4af37', accent2:'#e5c453', glow:'rgba(212,175,55,.28)' }
};

window.UNTO_THEMES = THEME_DEFS;

function untoApplyTheme(name) {
  const def = THEME_DEFS[name] || THEME_DEFS.noir;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(def)) root.style.setProperty('--' + k, v);
  root.dataset.theme = name;
}
function untoInitTheme(getCurrent, onChange) {
  untoApplyTheme(getCurrent());
  window.unto && window.unto.onThemeChanged && window.unto.onThemeChanged((n) => { untoApplyTheme(n); onChange && onChange(n); });
}
