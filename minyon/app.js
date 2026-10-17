// Valorant-хаб для стримера/ютубера: стримы и видео, лайнапы, прицелы, розыгрыши, промокоды партнёров.
import {
  api, track, esc, visible, icons, toast, copy, haptic, openLink, openSheet,
  applyBrand, avatarHtml, mountTabs, initTelegram, fmtDate, fmtDateTime, plural,
} from '../shared/core.js';
import { openAdmin } from '../shared/admin.js';

initTelegram();
let content = await api('/api/content');
const me = await api('/api/me').catch(() => ({ isAdmin: false }));
applyBrand(content.brand);
track('open');

const MAPS = ['Ascent', 'Bind', 'Haven', 'Split', 'Icebox', 'Breeze', 'Fracture', 'Pearl', 'Lotus', 'Sunset', 'Abyss', 'Corrode'];
const AGENTS = ['Sova', 'Viper', 'Brimstone', 'Omen', 'Astra', 'Harbor', 'Clove', 'KAY/O', 'Killjoy', 'Cypher', 'Deadlock', 'Fade', 'Gekko', 'Breach', 'Skye', 'Tejo', 'Raze', 'Jett', 'Neon', 'Phoenix', 'Reyna', 'Yoru', 'Iso', 'Waylay', 'Chamber', 'Vyse', 'Sage'];

// ---------- шапка ----------
function renderTop() {
  const b = content.brand || {};
  document.getElementById('top').innerHTML = `
    ${avatarHtml(b)}
    <div class="who"><div class="name">${esc(b.name)}</div><div class="tagline">${esc(b.tagline)}</div></div>
    ${me.isAdmin ? `<button class="icon-btn" id="adminBtn" aria-label="Админ-панель">${icons.gear}</button>` : ''}`;
  const btn = document.getElementById('adminBtn');
  if (btn) btn.onclick = showAdmin;
}

// ---------- Главная ----------
function renderHome(view) {
  const s = content.stream || {};
  const vids = visible(content.videos);
  const gws = visible(content.giveaways);
  const links = visible(content.links);
  view.innerHTML = `
    <section class="glass stream-hero cut">
      ${s.live ? '<span class="badge live">В ЭФИРЕ</span>' : '<span class="badge accent">Следующий стрим</span>'}
      <h2>${esc(s.title || 'Стримов пока нет')}</h2>
      ${s.live && s.url ? `<button class="btn primary" id="watch">${icons.play} Смотреть на ${esc(s.platform || 'стриме')}</button>` : ''}
      ${(s.schedule || []).length ? `<ul class="schedule">${s.schedule.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    </section>

    ${vids.length ? `<div class="section-title">Свежие видео <small>${vids.length}</small></div>
    <div class="hscroll">${vids.map((v) => `
      <div class="glass vcard" data-video="${esc(v.id)}">
        <div class="thumb">${esc(v.emoji || '🎬')}<span class="badge">${esc(v.tag || 'Видео')}</span><span class="play">${icons.play}</span></div>
        <div class="cap">${esc(v.title)}<small>${esc(fmtDate(v.date))}</small></div>
      </div>`).join('')}</div>` : ''}

    <div class="grid-2" style="margin-top:12px">
      <div class="glass tile cut" data-go="giveaways"><div class="em">🎁</div><b>Розыгрыши</b><span>${gws.length} ${plural(gws.length, 'активный', 'активных', 'активных')}</span></div>
      <div class="glass tile cut" data-go="crosshairs"><div class="em">🎯</div><b>Прицелы</b><span>копируй в один тап</span></div>
    </div>

    ${links.length ? `<div class="section-title">Где ещё я есть</div>
    <div class="stack">${links.map((l) => `
      <div class="glass item" data-link="${esc(l.id)}"><div class="ico">${esc(l.emoji || '🔗')}</div>
      <div class="body"><div class="title">${esc(l.title)}</div></div><div class="chev">${icons.chev}</div></div>`).join('')}</div>` : ''}
    ${content.brand && content.brand.footer ? `<p class="demo-note">${esc(content.brand.footer)}</p>` : ''}`;

  const watch = view.querySelector('#watch');
  if (watch) watch.onclick = () => openLink(s.url, 'stream');
  view.querySelectorAll('[data-video]').forEach((el) => {
    el.onclick = () => { const v = vids.find((x) => x.id === el.dataset.video); openLink(v.url, 'video:' + v.title); };
  });
  view.querySelectorAll('[data-link]').forEach((el) => {
    el.onclick = () => { const l = links.find((x) => x.id === el.dataset.link); openLink(l.url, 'link:' + l.title); };
  });
  view.querySelectorAll('[data-go]').forEach((el) => { el.onclick = () => tabs.show(el.dataset.go); });
}

// ---------- Гайды (лайнапы) ----------
let mapFilter = 'all';
let agentFilter = 'all';
function renderGuides(view) {
  const all = visible(content.lineups);
  const maps = [...new Set(all.map((l) => l.map))];
  const agents = [...new Set(all.filter((l) => mapFilter === 'all' || l.map === mapFilter).map((l) => l.agent))];
  if (agentFilter !== 'all' && !agents.includes(agentFilter)) agentFilter = 'all';
  const list = all.filter((l) => (mapFilter === 'all' || l.map === mapFilter) && (agentFilter === 'all' || l.agent === agentFilter));
  view.innerHTML = `
    <h1 class="h1" style="margin:4px 4px 12px">Лайнапы</h1>
    <div class="chips">${['all', ...maps].map((m) => `<button class="chip ${m === mapFilter ? 'active' : ''}" data-map="${esc(m)}">${m === 'all' ? 'Все карты' : esc(m)}</button>`).join('')}</div>
    <div class="chips">${['all', ...agents].map((a) => `<button class="chip ${a === agentFilter ? 'active' : ''}" data-agent="${esc(a)}">${a === 'all' ? 'Все агенты' : esc(a)}</button>`).join('')}</div>
    <div class="stack" style="margin-top:6px">${list.length ? list.map((l) => `
      <div class="glass item" data-lineup="${esc(l.id)}">
        <div class="agent-tile">${esc((l.agent || '?').slice(0, 2).toUpperCase())}</div>
        <div class="body"><div class="title">${esc(l.title)}</div>
          <div class="lineup-meta"><span class="badge">${esc(l.agent)}</span><span class="badge">${esc(l.map)}</span><span class="badge accent">${esc(l.site)} · ${esc(l.side)}</span></div>
        </div><div class="chev">${icons.chev}</div>
      </div>`).join('') : '<div class="empty"><div class="big">🗺️</div>Для этой карты гайдов пока нет</div>'}</div>`;
  view.querySelectorAll('[data-map]').forEach((b) => { b.onclick = () => { mapFilter = b.dataset.map; haptic(); renderGuides(view); }; });
  view.querySelectorAll('[data-agent]').forEach((b) => { b.onclick = () => { agentFilter = b.dataset.agent; haptic(); renderGuides(view); }; });
  view.querySelectorAll('[data-lineup]').forEach((el) => {
    el.onclick = () => {
      const l = all.find((x) => x.id === el.dataset.lineup);
      track('view', 'lineup:' + l.title);
      const sh = openSheet(`
        <div class="lineup-meta" style="margin:0 0 8px"><span class="badge">${esc(l.agent)}</span><span class="badge">${esc(l.map)}</span><span class="badge accent">${esc(l.site)} · ${esc(l.side)}</span><span class="badge">${esc(l.difficulty || '')}</span></div>
        <h2 style="font-size:24px;margin-bottom:10px">${esc(l.title)}</h2>
        <p class="muted" style="margin:0 0 16px;white-space:pre-line">${esc(l.desc)}</p>
        ${l.videoUrl ? `<button class="btn primary block" id="lv">${icons.play} Смотреть видео</button>` : ''}`);
      const lv = sh.querySelector('#lv');
      if (lv) lv.onclick = () => openLink(l.videoUrl, 'lineup-video:' + l.title);
    };
  });
}

// ---------- Прицелы ----------
const CH_COLORS = ['#ffffff', '#00ff00', '#7fff00', '#dfff00', '#ffff00', '#00ffff', '#ff00ff', '#ff0000'];
function parseCrosshair(code) {
  const parts = String(code || '').split(';');
  let i = parts.indexOf('P');
  i = i < 0 ? 0 : i + 1;
  const p = {};
  for (; i + 1 < parts.length; i += 2) {
    if (parts[i] === 'A' || parts[i] === 'S') break;
    p[parts[i]] = parts[i + 1];
  }
  return p;
}
// Примерный предпросмотр прицела по коду Valorant (основной прицел).
function crosshairSvg(code) {
  const p = parseCrosshair(code);
  const n = (k, d) => (p[k] === undefined || p[k] === '' ? d : Number(p[k]));
  const color = p.c === '8' && p.u ? '#' + p.u.slice(0, 6) : CH_COLORS[n('c', 0)] || '#fff';
  const outline = p.h !== '0';
  const oT = n('t', 1), oA = n('o', 0.5);
  const S = 2.2; // масштаб предпросмотра
  const rects = [];
  const lines = (thick, len, off, alpha) => {
    const t = thick * S, l = len * S, o = off * S;
    return [
      [-t / 2, -o - l, t, l], [-t / 2, o, t, l], [-o - l, -t / 2, l, t], [o, -t / 2, l, t],
    ].map((r) => ({ r, alpha }));
  };
  if (p['0b'] !== '0') rects.push(...lines(n('0t', 2), n('0l', 6), n('0o', 3), n('0a', 0.8)));
  if (p['1b'] !== '0') rects.push(...lines(n('1t', 2), n('1l', 2), n('1o', 10), n('1a', 0.35)));
  if (p.d === '1') { const z = n('z', 2) * S; rects.push({ r: [-z / 2, -z / 2, z, z], alpha: n('a', 1) }); }
  const body = rects.map(({ r: [x, y, w, h], alpha }) => {
    const ol = outline ? `<rect x="${x - oT}" y="${y - oT}" width="${w + oT * 2}" height="${h + oT * 2}" fill="#000" opacity="${oA}"/>` : '';
    return `${ol}<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" opacity="${alpha}"/>`;
  }).join('');
  return `<svg viewBox="-42 -42 84 84">${body}</svg>`;
}

function renderCrosshairs(view) {
  const list = visible(content.crosshairs);
  view.innerHTML = `
    <h1 class="h1" style="margin:4px 4px 6px">Прицелы</h1>
    <p class="muted" style="margin:0 4px 14px;font-size:13.5px">Скопируй код → Valorant → Настройки → Прицел → Импорт профиля.</p>
    <div class="stack">${list.length ? list.map((c) => `
      <div class="glass ch-card">
        <div class="ch-preview">${crosshairSvg(c.code)}</div>
        <div style="flex:1;min-width:0">
          <div class="title" style="font-weight:800">${esc(c.title)}</div>
          <div class="muted" style="font-size:13px">${esc(c.note || '')}</div>
          <div class="ch-code">${esc(c.code)}</div>
          <button class="btn primary sm" data-copy="${esc(c.id)}">${icons.copy} Скопировать код</button>
        </div>
      </div>`).join('') : '<div class="empty"><div class="big">🎯</div>Прицелов пока нет</div>'}</div>`;
  view.querySelectorAll('[data-copy]').forEach((b) => {
    b.onclick = () => { const c = list.find((x) => x.id === b.dataset.copy); track('click', 'crosshair:' + c.title); copy(c.code, 'Код прицела скопирован'); };
  });
}

// ---------- Розыгрыши ----------
function timeLeft(iso) {
  if (!iso) return 'без срока';
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return 'приём закрыт';
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5);
  return d > 0 ? `${d} ${plural(d, 'день', 'дня', 'дней')} ${h} ч` : `${h} ч ${Math.floor((ms % 36e5) / 6e4)} мин`;
}

function renderGiveaways(view) {
  const list = visible(content.giveaways);
  view.innerHTML = `<h1 class="h1" style="margin:4px 4px 12px">Розыгрыши</h1>
    <div class="stack">${list.length ? list.map((g) => `
      <div class="glass gw-card cut" data-gw="${esc(g.id)}">
        <span class="badge accent">🎁 ${esc(g.title)}</span>
        <div class="prize">${esc(g.prize)}</div>
        <div class="muted" style="font-size:14px">${esc(g.desc || '')}</div>
        ${g.requireChannel ? `<div class="faint" style="font-size:12.5px;margin-top:6px">Условие: подписка на ${esc(g.requireChannel)}</div>` : ''}
        <div class="gw-stats">
          <div><b data-count>…</b><span>участников</span></div>
          <div><b>${esc(timeLeft(g.endsAt))}</b><span>до итогов</span></div>
        </div>
        <div data-action><div class="skeleton" style="height:48px"></div></div>
      </div>`).join('') : '<div class="empty"><div class="big">🎁</div>Сейчас розыгрышей нет — загляни позже</div>'}</div>`;
  list.forEach((g) => loadGiveaway(view.querySelector(`[data-gw="${CSS.escape(g.id)}"]`), g));
}

async function loadGiveaway(card, g) {
  if (!card) return;
  const act = card.querySelector('[data-action]');
  const cnt = card.querySelector('[data-count]');
  try {
    const st = await api('/api/giveaway/' + encodeURIComponent(g.id));
    cnt.textContent = st.count;
    if (st.winners.length) {
      act.innerHTML = `<div class="winners"><b>🏆 Победители:</b><br>${st.winners.map((w) => esc(w.name)).join('<br>')}</div>`;
    } else if (st.joined) {
      act.innerHTML = `<button class="btn ghost block" disabled>${icons.check} Ты участвуешь</button>`;
    } else if (g.endsAt && new Date(g.endsAt) < new Date()) {
      act.innerHTML = '<button class="btn ghost block" disabled>Приём участников закрыт</button>';
    } else {
      act.innerHTML = '<button class="btn primary block">Участвую!</button>';
      act.querySelector('button').onclick = async (e) => {
        e.target.disabled = true;
        try {
          await api('/api/giveaway/' + encodeURIComponent(g.id) + '/join', { method: 'POST', body: {} });
          haptic('success'); toast('Ты в игре! Удачи 🍀');
          track('click', 'giveaway:' + g.title);
          loadGiveaway(card, g);
        } catch (err) { haptic('error'); toast(err.message); e.target.disabled = false; }
      };
    }
  } catch (err) { act.innerHTML = `<div class="muted">${esc(err.message)}</div>`; }
}

// ---------- Промо ----------
function renderPromos(view) {
  const list = visible(content.promos);
  view.innerHTML = `<h1 class="h1" style="margin:4px 4px 12px">Промокоды</h1>
    <div class="stack">${list.length ? list.map((p) => `
      <div class="glass promo">
        <div class="row" style="justify-content:space-between"><span class="faint" style="font-weight:700;font-size:13px">${esc(p.partner || '')}</span>${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}</div>
        <div style="font-weight:800;font-size:17px;margin-top:4px">${esc(p.title)}</div>
        <div class="muted" style="font-size:13.5px;margin-top:4px">${esc(p.desc || '')}</div>
        ${p.code ? `<div class="code"><span>${esc(p.code)}</span><button class="btn ghost sm" data-code="${esc(p.id)}">${icons.copy} Копировать</button></div>` : '<div style="height:12px"></div>'}
        ${p.url ? `<button class="btn primary block" data-go="${esc(p.id)}">Перейти</button>` : ''}
      </div>`).join('') : '<div class="empty"><div class="big">🏷️</div>Промокодов пока нет</div>'}</div>`;
  view.querySelectorAll('[data-code]').forEach((b) => {
    b.onclick = () => { const p = list.find((x) => x.id === b.dataset.code); track('click', 'promo-code:' + p.partner); copy(p.code, 'Промокод скопирован'); };
  });
  view.querySelectorAll('[data-go]').forEach((b) => {
    b.onclick = () => { const p = list.find((x) => x.id === b.dataset.go); openLink(p.url, 'promo-link:' + p.partner); };
  });
}

// ---------- меню ----------
const tabs = mountTabs({
  container: document.getElementById('main'),
  bar: document.getElementById('tabbar'),
  tabs: [
    { id: 'home', title: 'Главная', icon: icons.home, render: renderHome },
    { id: 'guides', title: 'Гайды', icon: icons.map, render: renderGuides },
    { id: 'crosshairs', title: 'Прицелы', icon: icons.crosshair, render: renderCrosshairs },
    { id: 'giveaways', title: 'Розыгрыши', icon: icons.gift, render: renderGiveaways },
    { id: 'promos', title: 'Промо', icon: icons.tag, render: renderPromos },
  ],
});
renderTop();

// ---------- админка ----------
const SCHEMA = {
  onBrandPreview: (b) => applyBrand(b),
  objects: [
    { key: 'brand', title: 'Бренд и оформление', emoji: '🎨', hint: 'Название, описание, цвет, аватар', fields: [
      { key: 'name', label: 'Название канала', required: true },
      { key: 'tagline', label: 'Подпись под названием' },
      { key: 'avatarText', label: 'Буквы на аватарке', help: 'Если нет картинки — 1–2 буквы' },
      { key: 'avatarUrl', label: 'Ссылка на картинку-аватар', type: 'url' },
      { key: 'accent', label: 'Основной цвет', type: 'color' },
      { key: 'accent2', label: 'Второй цвет (градиент)', type: 'color' },
      { key: 'channelUrl', label: 'Ссылка на канал', type: 'url' },
      { key: 'footer', label: 'Подпись внизу главной', type: 'textarea' },
    ] },
    { key: 'stream', title: 'Стрим и расписание', emoji: '🔴', hint: 'Включи «В эфире», когда начинаешь стрим', fields: [
      { key: 'live', label: 'Сейчас в эфире', type: 'toggle' },
      { key: 'title', label: 'Название стрима' },
      { key: 'url', label: 'Ссылка на трансляцию', type: 'url' },
      { key: 'platform', label: 'Площадка', type: 'select', options: ['Twitch', 'YouTube', 'VK Видео', 'Kick', 'Trovo'] },
      { key: 'schedule', label: 'Расписание (строка = день)', type: 'list' },
    ] },
  ],
  collections: [
    { key: 'videos', title: 'Свежие видео', itemName: 'Видео', fields: [
      { key: 'title', label: 'Название', required: true },
      { key: 'url', label: 'Ссылка', type: 'url', required: true },
      { key: 'tag', label: 'Метка', type: 'select', options: ['Видео', 'Shorts', 'Гайд', 'Стрим'], default: 'Видео' },
      { key: 'emoji', label: 'Эмодзи на обложке', default: '🎬' },
      { key: 'date', label: 'Дата', type: 'date', default: () => new Date().toISOString().slice(0, 10) },
    ] },
    { key: 'lineups', title: 'Лайнапы', itemName: 'Лайнап', itemTitle: (l) => `${l.agent} · ${l.map} — ${l.title}`, fields: [
      { key: 'title', label: 'Название', required: true },
      { key: 'agent', label: 'Агент', type: 'select', options: AGENTS, default: 'Sova' },
      { key: 'map', label: 'Карта', type: 'select', options: MAPS, default: 'Ascent' },
      { key: 'site', label: 'Точка', type: 'select', options: ['A', 'B', 'C', 'Mid'], default: 'A' },
      { key: 'side', label: 'Сторона', type: 'select', options: ['Атака', 'Защита', 'Пост-плант', 'Ретейк'], default: 'Атака' },
      { key: 'difficulty', label: 'Сложность', type: 'select', options: ['Легко', 'Средне', 'Сложно'], default: 'Легко' },
      { key: 'desc', label: 'Как кидать', type: 'textarea' },
      { key: 'videoUrl', label: 'Ссылка на видео/шортс', type: 'url' },
    ] },
    { key: 'crosshairs', title: 'Прицелы', itemName: 'Прицел', fields: [
      { key: 'title', label: 'Название', required: true },
      { key: 'note', label: 'Кому подойдёт' },
      { key: 'code', label: 'Код прицела из Valorant', type: 'textarea', required: true },
    ] },
    { key: 'giveaways', title: 'Розыгрыши', itemName: 'Розыгрыш', fields: [
      { key: 'title', label: 'Короткое название', required: true },
      { key: 'prize', label: 'Приз', required: true },
      { key: 'desc', label: 'Условия', type: 'textarea' },
      { key: 'endsAt', label: 'Итоги (дата и время)', type: 'datetime' },
      { key: 'requireChannel', label: 'Обязательная подписка на канал', placeholder: '@username', help: 'Бот должен быть админом этого канала' },
      { key: 'winnersCount', label: 'Сколько победителей', type: 'number', default: 1 },
    ] },
    { key: 'promos', title: 'Промокоды и реклама', itemName: 'Промо', itemTitle: (p) => `${p.partner} — ${p.title}`, fields: [
      { key: 'partner', label: 'Партнёр', required: true },
      { key: 'title', label: 'Заголовок', required: true },
      { key: 'code', label: 'Промокод' },
      { key: 'desc', label: 'Описание', type: 'textarea' },
      { key: 'url', label: 'Ссылка партнёра', type: 'url' },
      { key: 'badge', label: 'Метка', type: 'select', options: ['Партнёр', 'Реклама', 'Подарок', ''], default: 'Партнёр' },
    ] },
    { key: 'links', title: 'Ссылки', itemName: 'Ссылка', fields: [
      { key: 'title', label: 'Текст', required: true },
      { key: 'url', label: 'Ссылка', type: 'url', required: true },
      { key: 'emoji', label: 'Эмодзи', default: '🔗' },
    ] },
  ],
};

const statLabel = (k) => k
  .replace(/^tab:home$/, 'Вкладка «Главная»').replace(/^tab:guides$/, 'Вкладка «Гайды»')
  .replace(/^tab:crosshairs$/, 'Вкладка «Прицелы»').replace(/^tab:giveaways$/, 'Вкладка «Розыгрыши»')
  .replace(/^tab:promos$/, 'Вкладка «Промо»').replace(/^lineup:/, 'Лайнап: ').replace(/^lineup-video:/, 'Видео лайнапа: ')
  .replace(/^crosshair:/, 'Прицел: ').replace(/^giveaway:/, 'Участие: ').replace(/^promo-code:/, 'Код партнёра: ')
  .replace(/^promo-link:/, 'Переход к партнёру: ').replace(/^video:/, 'Видео: ').replace(/^link:/, 'Ссылка: ')
  .replace(/^stream$/, 'Переход на стрим');

// Вкладка админки «Розыгрыши»: участники и выбор победителей.
const giveawayAdmin = {
  id: 'draw', title: 'Итоги розыгрышей',
  render(el) {
    const list = content.giveaways || [];
    el.innerHTML = list.length ? list.map((g) => `
      <div class="glass card" data-g="${esc(g.id)}">
        <div style="font-weight:800">${esc(g.title)}</div>
        <div class="muted" style="font-size:13px">Итоги: ${esc(g.endsAt ? fmtDateTime(g.endsAt) : 'без срока')} · победителей: ${esc(g.winnersCount || 1)}</div>
        <div data-body class="muted" style="margin:10px 0">Загрузка…</div>
        <button class="btn primary block" data-draw>Выбрать победителей случайно</button>
      </div>`).join('') : '<div class="empty">Сначала добавь розыгрыш во вкладке «Контент»</div>';
    list.forEach(async (g) => {
      const card = el.querySelector(`[data-g="${CSS.escape(g.id)}"]`);
      const bodyEl = card.querySelector('[data-body]');
      const show = (st) => {
        bodyEl.innerHTML = `Участников: <b>${st.count}</b>` +
          (st.winners.length ? `<div class="winners" style="margin-top:8px">🏆 ${st.winners.map((w) => esc(w.name)).join(', ')}</div>` : '') +
          (st.participants && st.participants.length ? `<details style="margin-top:8px"><summary>Список участников</summary>${st.participants.map((x) => esc(x.name)).join('<br>')}</details>` : '');
      };
      try { show(await api('/api/giveaway/' + encodeURIComponent(g.id))); } catch (e) { bodyEl.textContent = e.message; }
      card.querySelector('[data-draw]').onclick = async () => {
        if (!confirm('Выбрать победителей? Повторный выбор перезапишет итоги.')) return;
        try {
          await api('/api/giveaway/' + encodeURIComponent(g.id) + '/draw', { method: 'POST', body: { count: g.winnersCount || 1 } });
          haptic('success'); toast('Победители выбраны');
          show(await api('/api/giveaway/' + encodeURIComponent(g.id)));
        } catch (e) { toast(e.message); }
      };
    });
  },
};

function showAdmin() {
  openAdmin({
    content, schema: SCHEMA, demo: me.demo, statLabel, initialTab: (location.hash.match(/admin=([\w-]+)/) || [])[1], extraTabs: [giveawayAdmin],
    onSaved: (fresh) => { content = fresh; applyBrand(content.brand); renderTop(); tabs.rerender(); },
  });
}

// Ссылка …/#admin=stats сразу открывает админку на нужной вкладке (для скриншотов и быстрого входа).
if (me.isAdmin && /admin=/.test(location.hash)) showAdmin();
