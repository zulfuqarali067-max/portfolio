// Барбершоп: онлайн-запись (услуга → мастер → день и время → контакты), мои записи с отменой,
// мастера и работы, отзывы и контакты. Владелец видит записи в админке по дням.
import {
  tg, api, track, esc, visible, icons, toast, haptic, openLink, applyBrand, avatarHtml, mountTabs, initTelegram,
} from '../shared/core.js';
import { openAdmin } from '../shared/admin.js';

initTelegram();
let content = await api('/api/content');
const me = await api('/api/me').catch(() => ({ isAdmin: false }));
applyBrand(content.brand);
track('open');

const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const rub = (n) => (n === '' || n === undefined ? '' : Number(n).toLocaleString('ru-RU') + ' ₽');
const prettyDate = (iso) => new Date(iso + 'T12:00').toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });

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
  const b = content.brand || {};
  const promos = visible(content.promos);
  const services = visible(content.services);
  const reviews = visible(content.reviews);
  view.innerHTML = `
    <section class="glass hero-shop">
      <div class="pole"></div>
      <span class="badge accent">${esc(b.hoursText || '')}</span>
      <h2>Стрижка, которая держит форму</h2>
      <p>Запишись за 30 секунд — без звонков и переписок.</p>
      <button class="btn primary block" id="bookNow">${icons.calendar} Записаться</button>
    </section>

    ${promos.length ? `<div class="section-title">Акции</div><div class="hscroll">${promos.map((p) => `
      <div class="glass promo-chip"><b>${esc(p.title)}</b><span>${esc(p.desc || '')}</span></div>`).join('')}</div>` : ''}

    <div class="section-title">Услуги и цены</div>
    <div class="stack">${services.map((s) => `
      <div class="glass svc" data-s="${esc(s.id)}"><div class="em">${esc(s.emoji || '✂️')}</div>
        <div class="body" style="flex:1;min-width:0"><div class="title" style="font-weight:800">${esc(s.title)}</div><div class="muted" style="font-size:13px">${esc(s.duration || '')} мин</div></div>
        <div class="price">${esc(rub(s.price))}</div></div>`).join('')}</div>

    ${reviews.length ? `<div class="section-title">Отзывы</div><div class="stack">${reviews.map((r) => `
      <div class="glass card"><div class="row" style="justify-content:space-between"><b>${esc(r.name)}</b><span class="stars">${'★'.repeat(Number(r.rating) || 5)}</span></div>
      <div class="muted" style="font-size:14px;margin-top:4px">${esc(r.text)}</div></div>`).join('')}</div>` : ''}

    <div class="section-title">Как нас найти</div>
    <div class="stack">
      <div class="glass item" id="map"><div class="ico">${icons.pin}</div><div class="body"><div class="title">${esc(b.address || '')}</div><div class="sub">Открыть на карте</div></div><div class="chev">${icons.chev}</div></div>
      <div class="glass item" id="call"><div class="ico">${icons.phone}</div><div class="body"><div class="title">${esc(b.phone || '')}</div><div class="sub">Позвонить</div></div><div class="chev">${icons.chev}</div></div>
    </div>
    ${b.footer ? `<p class="demo-note">${esc(b.footer)}</p>` : ''}`;
  view.querySelector('#bookNow').onclick = () => { track('click', 'hero-book'); tabs.show('book'); };
  view.querySelectorAll('[data-s]').forEach((el) => {
    el.onclick = () => { booking = { step: 2, serviceId: el.dataset.s }; tabs.show('book'); };
  });
  view.querySelector('#map').onclick = () => openLink(b.mapUrl, 'map');
  view.querySelector('#call').onclick = () => { track('click', 'phone'); window.location.href = 'tel:' + String(b.phone || '').replace(/[^\d+]/g, ''); };
}

// ---------- Запись ----------
let booking = { step: 1 };

function workDays() {
  const s = content.schedule || {};
  const off = new Set((s.daysOff || []).map((x) => String(x).trim().slice(0, 2).toLowerCase()));
  const res = [];
  for (let i = 0; i < Number(s.daysAhead || 14); i++) {
    const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + i);
    if (!off.has(WD[d.getDay()].toLowerCase())) res.push(d);
  }
  return res;
}

function slotsFor(dateIso) {
  const s = content.schedule || {};
  const [oh, om] = String(s.open || '10:00').split(':').map(Number);
  const [ch, cm] = String(s.close || '21:00').split(':').map(Number);
  const step = Number(s.slotMinutes || 60);
  const out = [];
  const now = new Date();
  for (let m = oh * 60 + om; m + step <= ch * 60 + cm; m += step) {
    const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const past = dateIso === localISO(now) && m <= now.getHours() * 60 + now.getMinutes() + 30;
    out.push({ t, past });
  }
  return out;
}

function stepsHtml() {
  return `<div class="steps">${[1, 2, 3, 4].map((n) => `<i class="${n <= booking.step ? 'on' : ''}"></i>`).join('')}</div>`;
}
const backBtn = `<button class="btn ghost sm" data-back style="margin-bottom:12px">← Назад</button>`;

function renderBook(view) {
  const services = visible(content.services);
  const masters = visible(content.masters);
  const svc = services.find((s) => s.id === booking.serviceId);
  const master = masters.find((m) => m.id === booking.masterId);

  if (booking.step === 1 || !svc) {
    booking.step = 1;
    view.innerHTML = `${stepsHtml()}<h1 class="h1" style="margin:0 4px 12px">Выбери услугу</h1>
      <div class="stack">${services.map((s) => `
        <div class="glass svc" data-s="${esc(s.id)}"><div class="em">${esc(s.emoji || '✂️')}</div>
          <div class="body" style="flex:1;min-width:0"><div class="title" style="font-weight:800">${esc(s.title)}</div>
          <div class="muted" style="font-size:13px">${esc(s.desc || '')}</div></div>
          <div class="price">${esc(rub(s.price))}</div></div>`).join('')}</div>`;
    view.querySelectorAll('[data-s]').forEach((el) => {
      el.onclick = () => { booking.serviceId = el.dataset.s; booking.step = booking.masterId ? 3 : 2; haptic(); renderBook(view); };
    });
  } else if (booking.step === 2 || !master) {
    booking.step = 2;
    view.innerHTML = `${stepsHtml()}${backBtn}<h1 class="h1" style="margin:0 4px 12px">Выбери мастера</h1>
      <div class="stack">${masters.map((m) => `
        <div class="glass master" data-m="${esc(m.id)}"><div class="ava">${esc(m.avatarText || m.name.slice(0, 1))}</div>
          <div style="flex:1;min-width:0"><div style="font-weight:800">${esc(m.name)} <span class="badge">${esc(m.role || '')}</span></div>
          <div class="muted" style="font-size:13px">Стаж ${esc(m.exp || '—')}</div></div><div class="chev">${icons.chev}</div></div>`).join('')}</div>`;
    view.querySelectorAll('[data-m]').forEach((el) => {
      el.onclick = () => { booking.masterId = el.dataset.m; booking.step = 3; haptic(); renderBook(view); };
    });
  } else if (booking.step === 3) {
    const days = workDays();
    if (!booking.date || !days.some((d) => localISO(d) === booking.date)) booking.date = days.length ? localISO(days[0]) : '';
    view.innerHTML = `${stepsHtml()}${backBtn}<h1 class="h1" style="margin:0 4px 4px">День и время</h1>
      <p class="muted" style="margin:0 4px 12px">${esc(svc.title)} · ${esc(master.name)}</p>
      <div class="hscroll">${days.map((d) => `<div class="day-chip ${localISO(d) === booking.date ? 'active' : ''}" data-d="${localISO(d)}"><span>${WD[d.getDay()]}</span><b>${d.getDate()}</b></div>`).join('')}</div>
      <div class="section-title" style="margin-top:12px">Свободное время</div>
      <div class="slots" id="slots"><div class="skeleton" style="grid-column:1/-1"></div></div>`;
    view.querySelectorAll('[data-d]').forEach((el) => { el.onclick = () => { booking.date = el.dataset.d; haptic(); renderBook(view); }; });
    loadSlots(view);
  } else {
    const user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
    view.innerHTML = `${stepsHtml()}${backBtn}<h1 class="h1" style="margin:0 4px 12px">Подтверждение</h1>
      <div class="glass summary">
        <div class="line"><span>Услуга</span><b>${esc(svc.title)}</b></div>
        <div class="line"><span>Мастер</span><b>${esc(master.name)}</b></div>
        <div class="line"><span>Когда</span><b>${esc(prettyDate(booking.date))}, ${esc(booking.time)}</b></div>
        <div class="line"><span>Стоимость</span><b>${esc(rub(svc.price))}</b></div>
      </div>
      <div class="glass card" style="margin-top:12px">
        <label class="field"><span>Имя *</span><input id="b_name" value="${esc(user ? user.first_name : '')}"></label>
        <label class="field"><span>Телефон *</span><input id="b_phone" type="tel" inputmode="tel" placeholder="+7"></label>
        <label class="field" style="margin-bottom:0"><span>Комментарий</span><input id="b_note" placeholder="например, хочу как на фото"></label>
      </div>
      <button class="btn primary block" id="confirm" style="margin-top:14px">Записаться</button>`;
    view.querySelector('#confirm').onclick = async (e) => {
      const name = view.querySelector('#b_name').value.trim();
      const phone = view.querySelector('#b_phone').value.trim();
      if (!name || phone.replace(/\D/g, '').length < 10) { toast('Укажи имя и телефон'); return; }
      e.target.disabled = true;
      try {
        await api('/api/lead', { method: 'POST', body: { kind: 'booking', fields: {
          service: svc.title, master: master.name, date: booking.date, time: booking.time,
          name, phone, price: rub(svc.price), note: view.querySelector('#b_note').value.trim(),
        } } });
        haptic('success');
        track('click', 'booking-done');
        view.innerHTML = `<div class="glass card" style="text-align:center;padding:30px 20px">
          <div style="font-size:52px">💈</div>
          <h2 style="font-size:26px;margin:8px 0">Ты записан!</h2>
          <p class="muted">${esc(prettyDate(booking.date))}, ${esc(booking.time)} · ${esc(master.name)}<br>${esc(content.brand.address || '')}</p>
          <button class="btn primary block" id="toMine">Мои записи</button></div>`;
        booking = { step: 1 };
        view.querySelector('#toMine').onclick = () => tabs.show('mine');
      } catch (err) {
        haptic('error'); toast(err.message);
        if (/занял/i.test(err.message)) { booking.step = 3; renderBook(view); } else e.target.disabled = false;
      }
    };
  }
  const back = view.querySelector('[data-back]');
  if (back) back.onclick = () => { booking.step = Math.max(1, booking.step - 1); renderBook(view); };
}

async function loadSlots(view) {
  const box = view.querySelector('#slots');
  const master = visible(content.masters).find((m) => m.id === booking.masterId);
  let busy = [];
  try { busy = (await api(`/api/slots?date=${encodeURIComponent(booking.date)}&master=${encodeURIComponent(master.name)}`)).busy; }
  catch { /* покажем все слоты */ }
  const slots = slotsFor(booking.date);
  box.innerHTML = slots.length ? slots.map(({ t, past }) => {
    const off = past || busy.includes(t);
    return `<div class="slot ${off ? 'busy' : ''}" data-t="${t}" data-off="${off ? 1 : 0}">${t}</div>`;
  }).join('') : '<div class="muted" style="grid-column:1/-1">В этот день записи нет</div>';
  box.querySelectorAll('[data-t]').forEach((el) => {
    el.onclick = () => {
      if (el.dataset.off === '1') return;
      booking.time = el.dataset.t; booking.step = 4; haptic(); renderBook(view);
    };
  });
}

// ---------- Мастера и работы ----------
function renderMasters(view) {
  const masters = visible(content.masters);
  const works = visible(content.works);
  view.innerHTML = `<h1 class="h1" style="margin:4px 4px 12px">Мастера</h1>
    <div class="stack">${masters.map((m) => `
      <div class="glass card"><div class="row"><div class="master" style="padding:0;cursor:default"><div class="ava">${esc(m.avatarText || m.name.slice(0, 1))}</div></div>
        <div style="flex:1"><div style="font-weight:800;font-size:17px">${esc(m.name)}</div><div class="muted" style="font-size:13px">${esc(m.role || '')} · стаж ${esc(m.exp || '—')}</div></div></div>
        <p class="muted" style="font-size:14px;margin:10px 0 12px">${esc(m.bio || '')}</p>
        <button class="btn ghost block sm" data-m="${esc(m.id)}">Записаться к ${esc(m.name)}</button></div>`).join('')}</div>
    ${works.length ? `<div class="section-title">Наши работы</div><div class="grid-2">${works.map((w) => `
      <div class="glass work"><div class="big">${esc(w.emoji || '💈')}</div><b>${esc(w.title)}</b><span>${esc(w.desc || '')}</span></div>`).join('')}</div>` : ''}`;
  view.querySelectorAll('[data-m]').forEach((b) => {
    b.onclick = () => { booking = { step: 1, masterId: b.dataset.m }; tabs.show('book'); };
  });
}

// ---------- Мои записи ----------
const STATUS = { new: 'Ждём тебя', in_work: 'Подтверждена', done: 'Состоялась', cancelled: 'Отменена' };
async function renderMine(view) {
  view.innerHTML = `<h1 class="h1" style="margin:4px 4px 12px">Мои записи</h1><div class="skeleton"></div>`;
  let list = [];
  try { list = (await api('/api/my-leads')).filter((l) => l.kind === 'booking'); } catch { /* пусто */ }
  list.sort((a, b) => (b.fields.date + b.fields.time).localeCompare(a.fields.date + a.fields.time));
  const nowKey = localISO(new Date()) + ' ' + new Date().toTimeString().slice(0, 5);
  view.innerHTML = `<h1 class="h1" style="margin:4px 4px 12px">Мои записи</h1>
    <div class="stack">${list.length ? list.map((l) => {
      const future = l.fields.date + ' ' + l.fields.time > nowKey;
      const canCancel = future && (l.status === 'new' || l.status === 'in_work');
      return `<div class="glass booking">
        <div class="row" style="justify-content:space-between"><span class="when">${esc(prettyDate(l.fields.date))}, ${esc(l.fields.time)}</span>
        <span class="status-pill ${esc(l.status)}">${esc(STATUS[l.status] || l.status)}</span></div>
        <div class="muted" style="margin:4px 0 10px">${esc(l.fields.service)} · ${esc(l.fields.master)} · ${esc(l.fields.price || '')}</div>
        ${canCancel ? `<button class="btn danger sm" data-cancel="${esc(l.id)}">Отменить запись</button>` : ''}
      </div>`;
    }).join('') : `<div class="empty"><div class="big">🗓️</div>Записей пока нет<br><button class="btn primary" id="goBook" style="margin-top:14px">Записаться</button></div>`}</div>`;
  const gb = view.querySelector('#goBook');
  if (gb) gb.onclick = () => tabs.show('book');
  view.querySelectorAll('[data-cancel]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('Отменить запись?')) return;
      try { await api('/api/leads/' + b.dataset.cancel, { method: 'DELETE' }); haptic('success'); toast('Запись отменена'); renderMine(view); }
      catch (e) { toast(e.message); }
    };
  });
}

// ---------- меню ----------
const tabs = mountTabs({
  container: document.getElementById('main'),
  bar: document.getElementById('tabbar'),
  tabs: [
    { id: 'home', title: 'Главная', icon: icons.home, render: renderHome },
    { id: 'book', title: 'Запись', icon: icons.calendar, render: renderBook },
    { id: 'masters', title: 'Мастера', icon: icons.scissors, render: renderMasters },
    { id: 'mine', title: 'Мои записи', icon: icons.user, render: renderMine },
  ],
});
renderTop();

// ---------- админка ----------
const SCHEMA = {
  onBrandPreview: (b) => applyBrand(b),
  objects: [
    { key: 'brand', title: 'Салон и контакты', emoji: '💈', hint: 'Название, адрес, телефон, цвета', fields: [
      { key: 'name', label: 'Название', required: true },
      { key: 'tagline', label: 'Подпись' },
      { key: 'avatarText', label: 'Буквы на логотипе' },
      { key: 'avatarUrl', label: 'Ссылка на логотип', type: 'url' },
      { key: 'accent', label: 'Основной цвет', type: 'color' },
      { key: 'accent2', label: 'Второй цвет', type: 'color' },
      { key: 'address', label: 'Адрес' },
      { key: 'phone', label: 'Телефон' },
      { key: 'mapUrl', label: 'Ссылка на карту', type: 'url' },
      { key: 'hoursText', label: 'Часы работы (текст)' },
      { key: 'footer', label: 'Подпись внизу', type: 'textarea' },
    ] },
    { key: 'schedule', title: 'График записи', emoji: '🕒', hint: 'Часы, длина слота, выходные', fields: [
      { key: 'open', label: 'Открытие', type: 'time' },
      { key: 'close', label: 'Закрытие', type: 'time' },
      { key: 'slotMinutes', label: 'Длина слота, минут', type: 'number', step: 15 },
      { key: 'daysAhead', label: 'На сколько дней вперёд можно записаться', type: 'number' },
      { key: 'daysOff', label: 'Выходные дни (Пн, Вт… — каждый с новой строки)', type: 'list' },
    ] },
  ],
  collections: [
    { key: 'services', title: 'Услуги', itemName: 'Услуга', itemTitle: (s) => `${s.title} — ${rub(s.price)}`, fields: [
      { key: 'title', label: 'Название', required: true },
      { key: 'price', label: 'Цена, ₽', type: 'number', required: true },
      { key: 'duration', label: 'Длительность, мин', type: 'number', default: 60 },
      { key: 'emoji', label: 'Эмодзи', default: '✂️' },
      { key: 'desc', label: 'Описание', type: 'textarea' },
    ] },
    { key: 'masters', title: 'Мастера', itemName: 'Мастер', itemTitle: (m) => `${m.name} — ${m.role || ''}`, fields: [
      { key: 'name', label: 'Имя', required: true },
      { key: 'role', label: 'Должность', default: 'Барбер' },
      { key: 'avatarText', label: 'Буква на аватаре' },
      { key: 'exp', label: 'Стаж' },
      { key: 'bio', label: 'О мастере', type: 'textarea' },
    ] },
    { key: 'promos', title: 'Акции', itemName: 'Акция', fields: [
      { key: 'title', label: 'Заголовок', required: true },
      { key: 'desc', label: 'Условия' },
    ] },
    { key: 'works', title: 'Работы', itemName: 'Работа', fields: [
      { key: 'title', label: 'Название', required: true },
      { key: 'emoji', label: 'Эмодзи', default: '💈' },
      { key: 'desc', label: 'Подпись' },
    ] },
    { key: 'reviews', title: 'Отзывы', itemName: 'Отзыв', itemTitle: (r) => `${r.name} — ${'★'.repeat(Number(r.rating) || 5)}`, fields: [
      { key: 'name', label: 'Имя', required: true },
      { key: 'rating', label: 'Оценка', type: 'select', options: ['5', '4', '3'], default: '5' },
      { key: 'text', label: 'Текст', type: 'textarea', required: true },
    ] },
  ],
};

const statLabel = (k) => k
  .replace(/^tab:home$/, 'Вкладка «Главная»').replace(/^tab:book$/, 'Вкладка «Запись»')
  .replace(/^tab:masters$/, 'Вкладка «Мастера»').replace(/^tab:mine$/, 'Вкладка «Мои записи»')
  .replace(/^hero-book$/, 'Кнопка «Записаться» на главной').replace(/^booking-done$/, 'Завершённые записи')
  .replace(/^map$/, 'Открыли карту').replace(/^phone$/, 'Нажали «Позвонить»');

// Вкладка админки «Календарь»: записи на выбранный день по мастерам.
let calDate = localISO(new Date());
const calendarTab = {
  id: 'calendar', title: 'Календарь',
  async render(el) {
    const days = [];
    for (let i = 0; i < 14; i++) { const d = new Date(); d.setDate(d.getDate() + i); days.push(d); }
    el.innerHTML = `<div class="hscroll">${days.map((d) => `<div class="day-chip ${localISO(d) === calDate ? 'active' : ''}" data-d="${localISO(d)}"><span>${WD[d.getDay()]}</span><b>${d.getDate()}</b></div>`).join('')}</div>
      <div id="calBody" style="margin-top:12px"><div class="skeleton"></div></div>`;
    el.querySelectorAll('[data-d]').forEach((c) => { c.onclick = () => { calDate = c.dataset.d; calendarTab.render(el); }; });
    let leads = [];
    try { leads = await api('/api/leads'); } catch (e) { el.querySelector('#calBody').textContent = e.message; return; }
    const day = leads.filter((l) => l.kind === 'booking' && l.status !== 'cancelled' && l.fields.date === calDate)
      .sort((a, b) => a.fields.time.localeCompare(b.fields.time));
    const byMaster = {};
    day.forEach((l) => { (byMaster[l.fields.master] ||= []).push(l); });
    el.querySelector('#calBody').innerHTML = day.length ? Object.entries(byMaster).map(([m, arr]) => `
      <div class="section-title">${esc(m)} <small>${arr.length}</small></div>
      <div class="stack">${arr.map((l) => `<div class="glass admin-row"><b style="width:52px">${esc(l.fields.time)}</b>
        <div class="t">${esc(l.fields.name)} · ${esc(l.fields.service)}</div><a class="btn ghost sm" href="tel:${esc(l.fields.phone.replace(/[^\d+]/g, ''))}">${icons.phone}</a></div>`).join('')}</div>`).join('')
      : '<div class="empty"><div class="big">☕</div>На этот день записей нет</div>';
  },
};

function showAdmin() {
  openAdmin({
    content, schema: SCHEMA, demo: me.demo, statLabel, initialTab: (location.hash.match(/admin=([\w-]+)/) || [])[1], extraTabs: [calendarTab],
    leads: { title: 'Записи', kinds: { booking: 'Запись' }, labels: { service: 'Услуга', master: 'Мастер', date: 'Дата', time: 'Время', name: 'Имя', phone: 'Телефон', price: 'Цена', note: 'Комментарий' } },
    onSaved: (fresh) => { content = fresh; applyBrand(content.brand); renderTop(); tabs.rerender(); },
  });
}

// Ссылка …/#admin=stats сразу открывает админку на нужной вкладке (для скриншотов и быстрого входа).
if (me.isAdmin && /admin=/.test(location.hash)) showAdmin();
