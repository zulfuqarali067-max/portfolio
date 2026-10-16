// Общие функции мини-аппов: связь с Telegram, запросы к серверу, меню, шторки, уведомления.

export const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

// ?shot=1 — режим для скриншотов: без анимаций.
if (/[?&]shot=1/.test(location.search)) document.documentElement.classList.add('no-anim');
export const inTelegram = !!(tg && tg.initData);

// В демо (обычный браузер) у каждого браузера свой «пользователь» — для проверки розыгрышей.
function demoUserId() {
  try {
    let id = localStorage.getItem('demo-user');
    if (!id) { id = Math.random().toString(36).slice(2, 10); localStorage.setItem('demo-user', id); }
    return id;
  } catch { return 'guest'; }
}

// На GitHub Pages сервера нет — запросы обслуживает static-demo.js (данные в localStorage).
const STATIC = /\.github\.io$/.test(location.hostname) || /[?&]static=1/.test(location.search);

export async function api(path, { method = 'GET', body } = {}) {
  if (STATIC) {
    const { staticApi } = await import('./static-demo.js');
    return staticApi(path, method, body, demoUserId());
  }
  const headers = { 'X-Demo-User': demoUserId() };
  if (tg && tg.initData) headers['X-Tg-Init-Data'] = tg.initData;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null;
  try { data = await res.json(); } catch { /* пустой ответ */ }
  if (!res.ok) throw new Error((data && data.error) || `Ошибка ${res.status}`);
  return data;
}

export function track(type, key) {
  api('/api/event', { method: 'POST', body: { type, key } }).catch(() => {});
}

// Экранирование текста перед вставкой в HTML.
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function visible(list) { return (list || []).filter((x) => !x.hidden); }

export function haptic(kind = 'light') {
  try {
    if (!tg || !tg.HapticFeedback) return;
    if (kind === 'success' || kind === 'error' || kind === 'warning') tg.HapticFeedback.notificationOccurred(kind);
    else tg.HapticFeedback.impactOccurred(kind);
  } catch { /* старые клиенты */ }
}

let toastTimer;
export function toast(text) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const el = document.createElement('div');
  el.className = 'toast glass';
  el.textContent = text;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2400);
}

export async function copy(text, okText = 'Скопировано') {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* ничего */ }
    ta.remove();
  }
  haptic('success');
  toast(okText);
}

export function openLink(url, statKey) {
  if (!url) return;
  if (statKey) track('click', statKey);
  if (tg && tg.initData) {
    if (/^https?:\/\/t\.me\//i.test(url)) tg.openTelegramLink(url);
    else tg.openLink(url);
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

// ---------- шторка снизу ----------
let sheetStack = [];
export function openSheet(html, { onClose } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  const sheet = document.createElement('div');
  sheet.className = 'sheet glass';
  sheet.innerHTML = `<div class="grabber"></div>${html}`;
  document.body.append(backdrop, sheet);
  const entry = { backdrop, sheet, onClose };
  sheetStack.push(entry);
  backdrop.addEventListener('click', closeSheet);
  syncBackButton();
  haptic('light');
  return sheet;
}

export function closeSheet() {
  const entry = sheetStack.pop();
  if (!entry) return;
  entry.backdrop.remove();
  entry.sheet.remove();
  if (entry.onClose) entry.onClose();
  syncBackButton();
}

// Кнопка «Назад» Telegram закрывает шторки и админку.
const backHandlers = [];
export function pushBack(fn) { backHandlers.push(fn); syncBackButton(); }
export function popBack(fn) {
  const i = backHandlers.lastIndexOf(fn);
  if (i >= 0) backHandlers.splice(i, 1);
  syncBackButton();
}
function syncBackButton() {
  if (!tg || !tg.BackButton) return;
  if (sheetStack.length || backHandlers.length) tg.BackButton.show(); else tg.BackButton.hide();
}
if (tg && tg.BackButton) {
  tg.BackButton.onClick(() => {
    if (sheetStack.length) closeSheet();
    else if (backHandlers.length) backHandlers[backHandlers.length - 1]();
  });
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (sheetStack.length) closeSheet();
  else if (backHandlers.length) backHandlers[backHandlers.length - 1]();
});

// ---------- бренд ----------
export function applyBrand(brand = {}) {
  const root = document.documentElement.style;
  if (brand.accent) root.setProperty('--accent', brand.accent);
  if (brand.accent2) root.setProperty('--accent-2', brand.accent2);
  if (brand.accent) root.setProperty('--blob-1', brand.accent);
  if (brand.name) document.title = brand.name;
  if (tg) {
    try {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      tg.setHeaderColor(bg); tg.setBackgroundColor(bg);
    } catch { /* старые клиенты */ }
  }
}

export function avatarHtml(brand = {}) {
  if (brand.avatarUrl) return `<div class="avatar"><img src="${esc(brand.avatarUrl)}" alt=""></div>`;
  return `<div class="avatar">${esc(brand.avatarText || (brand.name || '?').slice(0, 1))}</div>`;
}

// ---------- нижнее меню ----------
export function mountTabs({ tabs, container, bar, initial }) {
  let current = null;
  bar.innerHTML = tabs.map((t) => `<button data-tab="${t.id}">${t.icon}<span>${esc(t.title)}</span></button>`).join('');
  function show(id) {
    const tab = tabs.find((t) => t.id === id) || tabs[0];
    current = tab.id;
    bar.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab.id));
    container.innerHTML = '';
    const view = document.createElement('div');
    view.className = 'view';
    container.appendChild(view);
    tab.render(view);
    window.scrollTo({ top: 0 });
    track('view', 'tab:' + tab.id);
    try { sessionStorage.setItem('tab', tab.id); } catch { /* ничего */ }
  }
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b && b.dataset.tab !== current) { haptic('light'); show(b.dataset.tab); }
  });
  // Вкладку можно открыть ссылкой: …/#tab=guides
  let start = initial || (location.hash.match(/tab=([\w-]+)/) || [])[1];
  try { start = start || sessionStorage.getItem('tab'); } catch { /* ничего */ }
  show(start || tabs[0].id);
  return { show, rerender: () => show(current) };
}

export function initTelegram() {
  if (!tg) return;
  try { tg.ready(); tg.expand(); } catch { /* ничего */ }
  try { if (tg.disableVerticalSwipes) tg.disableVerticalSwipes(); } catch { /* ничего */ }
}

// ---------- даты ----------
export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}
export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}
export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// ---------- иконки (линейные, 24×24) ----------
const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const icons = {
  home: svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>'),
  book: svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
  target: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
  gift: svg('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v9H5v-9"/><path d="M7.5 8a2.5 2.5 0 1 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 1 1 0 5"/>'),
  tag: svg('<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  copy: svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  play: svg('<polygon points="6 3 20 12 6 21 6 3"/>'),
  chev: svg('<path d="m9 18 6-6-6-6"/>'),
  up: svg('<path d="m18 15-6-6-6 6"/>'),
  down: svg('<path d="m6 9 6 6 6-6"/>'),
  eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: svg('<path d="M17.9 17.9A10.4 10.4 0 0 1 12 19c-6.5 0-10-7-10-7a18.5 18.5 0 0 1 5.1-5.9M9.9 5.2A9.1 9.1 0 0 1 12 5c6.5 0 10 7 10 7a18.6 18.6 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2"/><path d="M2 2l20 20"/>'),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/>'),
  trash: svg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  calendar: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  scissors: svg('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>'),
  star: svg('<polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2"/>'),
  flask: svg('<path d="M9 3h6"/><path d="M10 3v6.5L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9.5V3"/><path d="M7 15h10"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  chart: svg('<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>'),
  inbox: svg('<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z"/>'),
  crosshair: svg('<circle cx="12" cy="12" r="9"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5"/>'),
  map: svg('<polygon points="1 6 8 3 16 6 23 3 23 18 16 21 8 18 1 21 1 6"/><path d="M8 3v15M16 6v15"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  phone: svg('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>'),
  pin: svg('<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'),
};
