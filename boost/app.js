// Тренажёр ЕГЭ для преподавателя: отсчёт до экзамена, задача дня, задачи по темам с проверкой,
// бесплатные материалы и вебинары, заявка на курс с промокодом.
import {
  tg, inTelegram, api, track, esc, visible, icons, toast, copy, haptic, openLink, openSheet, closeSheet,
  applyBrand, avatarHtml, mountTabs, initTelegram, fmtDateTime, plural,
} from '../shared/core.js';
import { openAdmin } from '../shared/admin.js';

initTelegram();
let content = await api('/api/content');
const me = await api('/api/me').catch(() => ({ isAdmin: false }));
applyBrand(content.brand);
track('open');

// ---------- прогресс ученика: в браузере и в облаке Telegram ----------
const PKEY = 'ege-progress';
let progress = { tasks: {}, days: [] };
try { progress = JSON.parse(localStorage.getItem(PKEY)) || progress; } catch { /* пусто */ }
if (inTelegram && tg.CloudStorage) {
  tg.CloudStorage.getItem('progress', (err, val) => {
    if (err || !val) return;
    try {
      const cloud = JSON.parse(val);
      progress.tasks = { ...cloud.tasks, ...progress.tasks };
      progress.days = [...new Set([...(cloud.days || []), ...progress.days])];
      saveProgress(false);
      tabs.rerender();
    } catch { /* битые данные — игнорируем */ }
  });
}
function saveProgress(cloud = true) {
  progress.days = progress.days.slice(-120);
  try { localStorage.setItem(PKEY, JSON.stringify(progress)); } catch { /* приватный режим */ }
  if (cloud && inTelegram && tg.CloudStorage) {
    try { tg.CloudStorage.setItem('progress', JSON.stringify(progress).slice(0, 4000)); } catch { /* лимит */ }
  }
}
function today() { return new Date().toISOString().slice(0, 10); }
function streak() {
  const set = new Set(progress.days);
  let n = 0;
  for (let d = new Date(); set.has(d.toISOString().slice(0, 10)); d = new Date(d - 864e5)) n++;
  return n;
}

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

const ringSvg = `<svg class="ring" viewBox="0 0 100 100" fill="none" stroke="#fff" stroke-width="4"><polygon points="50,6 88,28 88,72 50,94 12,72 12,28"/><polygon points="50,20 76,35 76,65 50,80 24,65 24,35" stroke-width="3"/><circle cx="50" cy="50" r="14"/></svg>`;

function daysLeft() {
  const d = new Date((content.brand && content.brand.examDate) || '');
  if (isNaN(d)) return null;
  return Math.max(0, Math.ceil((d - Date.now()) / 864e5));
}

function dailyTask() {
  const list = visible(content.tasks);
  if (!list.length) return null;
  const n = Number(today().replace(/-/g, ''));
  return list[n % list.length];
}

// ---------- проверка ответа ----------
function normalize(s) { return String(s || '').toLowerCase().replace(/\s+/g, '').replace(',', '.'); }
function isCorrect(task, value) {
  const a = normalize(task.answer), v = normalize(value);
  if (!v) return false;
  if (task.anyOrder) return a.length === v.length && [...a].sort().join('') === [...v].sort().join('');
  return a === v;
}

function openTask(task, rerender) {
  track('view', 'task:' + task.topic);
  const st = progress.tasks[task.id];
  const sheet = openSheet(`
    <span class="topic-pill">${icons.flask.replace('<svg', '<svg width="14" height="14"')} ${esc(task.topic)} · ${esc(task.difficulty || '')}</span>
    <div class="q" style="white-space:pre-wrap;margin:12px 0 4px;font-size:15.5px">${esc(task.text)}</div>
    <div class="answer-box"><input class="input" id="ans" inputmode="decimal" autocomplete="off" placeholder="Ответ"><button class="btn primary" id="chk">Проверить</button></div>
    <div id="res">${st ? `<div class="faint" style="font-size:13px">Ты уже решал(а) эту задачу${st.ok ? ' — верно' : ''}. Можно ещё раз.</div>` : ''}</div>`);
  const input = sheet.querySelector('#ans');
  const res = sheet.querySelector('#res');
  const check = () => {
    const ok = isCorrect(task, input.value);
    const prev = progress.tasks[task.id] || { tries: 0 };
    progress.tasks[task.id] = { ok: ok || !!prev.ok, last: ok, tries: prev.tries + 1 };
    if (!progress.days.includes(today())) progress.days.push(today());
    saveProgress();
    haptic(ok ? 'success' : 'error');
    track('click', ok ? 'answer:верно' : 'answer:неверно');
    res.innerHTML = `
      <div class="verdict ${ok ? 'ok' : 'bad'}">${ok ? '✅ Верно! Так держать.' : `❌ Пока нет. Правильный ответ: ${esc(task.answer)}`}</div>
      ${task.solution ? `<div class="solution"><b>Разбор.</b> ${esc(task.solution)}</div>` : ''}
      <button class="btn ghost block" id="next" style="margin-top:12px">Следующая задача</button>`;
    res.querySelector('#next').onclick = () => {
      closeSheet();
      const list = visible(content.tasks);
      const next = list.find((t) => !(progress.tasks[t.id] && progress.tasks[t.id].ok) && t.id !== task.id);
      if (next) openTask(next, rerender); else toast('Все задачи решены! 🎉');
    };
    if (rerender) rerender();
  };
  sheet.querySelector('#chk').onclick = check;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
  setTimeout(() => input.focus(), 250);
}

// ---------- Главная ----------
function renderHome(view) {
  const b = content.brand || {};
  const left = daysLeft();
  const tasks = visible(content.tasks);
  const solved = tasks.filter((t) => progress.tasks[t.id] && progress.tasks[t.id].ok).length;
  const daily = dailyTask();
  const dailyDone = daily && progress.tasks[daily.id] && progress.tasks[daily.id].ok;
  const webinars = visible(content.webinars).filter((w) => !w.date || new Date(w.date) > Date.now() - 2 * 36e5)
    .sort((a, c) => new Date(a.date) - new Date(c.date)).slice(0, 3);
  view.innerHTML = `
    <section class="glass count-hero">
      ${ringSvg}
      <div class="kicker">До экзамена</div>
      <div class="days">${left === null ? '—' : left}<small>${left === null ? '' : plural(left, 'день', 'дня', 'дней')}</small></div>
      <div class="meta">${esc(b.examName || 'ЕГЭ')}${b.examDate ? ' · ' + esc(new Date(b.examDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })) : ''}</div>
      <div class="progress-line">
        <div><b>${solved}/${tasks.length}</b><span>задач решено</span></div>
        <div><b>${streak()} 🔥</b><span>${plural(streak(), 'день', 'дня', 'дней')} подряд</span></div>
      </div>
    </section>

    ${daily ? `<div class="section-title">Задача дня <small>${dailyDone ? 'решена ✓' : 'обновляется каждый день'}</small></div>
    <div class="glass daily">
      <span class="topic-pill">${esc(daily.topic)}</span>
      <div class="q">${esc(daily.text.split('\n')[0])}</div>
      <button class="btn primary block" id="solveDaily">${dailyDone ? 'Решить ещё раз' : 'Решить задачу'}</button>
    </div>` : ''}

    ${webinars.length ? `<div class="section-title">Ближайшие вебинары</div>
    <div class="stack">${webinars.map((w) => {
      const d = new Date(w.date);
      return `<div class="glass webinar" data-w="${esc(w.id)}">
        <div class="date"><b>${isNaN(d) ? '—' : d.getDate()}</b><span>${isNaN(d) ? '' : d.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '')}</span></div>
        <div class="body" style="flex:1"><div class="title" style="font-weight:800">${esc(w.title)}</div><div class="muted" style="font-size:13px">${esc(fmtDateTime(w.date))}</div></div>
        <div class="chev">${icons.chev}</div></div>`;
    }).join('')}</div>` : ''}

    <div class="glass item" id="toCourse" style="margin-top:12px">
      <div class="ico">🎓</div>
      <div class="body"><div class="title">${esc((content.course && content.course.title) || 'Курс')}</div><div class="sub">${esc((content.course && content.course.promoText) || 'Подробнее о курсе')}</div></div>
      <div class="chev">${icons.chev}</div>
    </div>
    ${b.footer ? `<p class="demo-note">${esc(b.footer)}</p>` : ''}`;

  const sd = view.querySelector('#solveDaily');
  if (sd) sd.onclick = () => openTask(daily, () => tabs.rerender());
  view.querySelectorAll('[data-w]').forEach((el) => {
    el.onclick = () => { const w = webinars.find((x) => x.id === el.dataset.w); openLink(w.url, 'webinar:' + w.title); };
  });
  view.querySelector('#toCourse').onclick = () => tabs.show('course');
}

// ---------- Тренажёр ----------
let topicFilter = 'all';
function renderTrainer(view) {
  const all = visible(content.tasks);
  const topics = [...new Set(all.map((t) => t.topic))];
  const list = all.filter((t) => topicFilter === 'all' || t.topic === topicFilter);
  const solved = all.filter((t) => progress.tasks[t.id] && progress.tasks[t.id].ok).length;
  view.innerHTML = `
    <h1 class="h1" style="margin:4px 4px 4px">Тренажёр</h1>
    <p class="muted" style="margin:0 4px 12px;font-size:13.5px">Решено ${solved} из ${all.length}. Прогресс сохраняется автоматически.</p>
    <div class="bar" style="margin:0 4px 14px"><i style="width:${all.length ? (solved / all.length) * 100 : 0}%"></i></div>
    <div class="chips">${['all', ...topics].map((t) => `<button class="chip ${t === topicFilter ? 'active' : ''}" data-t="${esc(t)}">${t === 'all' ? 'Все темы' : esc(t)}</button>`).join('')}</div>
    <div class="stack" style="margin-top:6px">${list.map((t, i) => {
      const st = progress.tasks[t.id];
      const cls = st ? (st.ok ? 'ok' : 'bad') : '';
      return `<div class="glass item task-row" data-task="${esc(t.id)}">
        <div class="status ${cls}">${st ? (st.ok ? icons.check : '!') : i + 1}</div>
        <div class="body"><div class="title" style="font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.text.split('\n')[0])}</div>
        <div class="sub">${esc(t.topic)} · ${esc(t.difficulty || '')}</div></div>
        <div class="chev">${icons.chev}</div></div>`;
    }).join('') || '<div class="empty"><div class="big">🧪</div>Задач пока нет</div>'}</div>`;
  view.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { topicFilter = b.dataset.t; haptic(); renderTrainer(view); }; });
  view.querySelectorAll('[data-task]').forEach((el) => {
    el.onclick = () => openTask(all.find((x) => x.id === el.dataset.task), () => renderTrainer(view));
  });
}

// ---------- Материалы ----------
function renderMaterials(view) {
  const list = visible(content.materials);
  view.innerHTML = `
    <h1 class="h1" style="margin:4px 4px 12px">Бесплатные материалы</h1>
    <div class="stack">${list.map((m) => `
      <div class="glass item" data-m="${esc(m.id)}"><div class="ico">${esc(m.emoji || '📄')}</div>
      <div class="body"><div class="title">${esc(m.title)}</div><div class="sub">${esc(m.type || '')}</div></div>
      <div class="chev">${icons.chev}</div></div>`).join('') || '<div class="empty"><div class="big">📚</div>Материалов пока нет</div>'}</div>`;
  view.querySelectorAll('[data-m]').forEach((el) => {
    el.onclick = () => { const m = list.find((x) => x.id === el.dataset.m); openLink(m.url, 'material:' + m.title); };
  });
}

// ---------- Курс и заявка ----------
function renderCourse(view) {
  const c = content.course || {};
  const reviews = visible(content.reviews);
  view.innerHTML = `
    <section class="glass course-card">
      <span class="topic-pill">🎓 Курс</span>
      <h2 style="margin-top:10px">${esc(c.title)}</h2>
      <div class="muted">${esc(c.subtitle || '')}</div>
      <ul class="features">${(c.features || []).map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
      ${c.price ? `<div class="price">${esc(c.price)}</div>` : ''}
      ${c.promoCode ? `<div class="promo-strip"><div style="flex:1"><b>${esc(c.promoCode)}</b><div class="muted" style="font-size:12.5px">${esc(c.promoText || '')}</div></div><button class="btn ghost sm" id="cp">${icons.copy}</button></div>` : ''}
      <button class="btn primary block" id="apply">${esc(c.buttonText || 'Оставить заявку')}</button>
    </section>
    ${reviews.length ? `<div class="section-title">Отзывы учеников</div><div class="stack">${reviews.map((r) => `
      <div class="glass review"><div class="row" style="justify-content:space-between"><span class="who">${esc(r.name)}</span><span class="score">${esc(r.score || '')}</span></div>
      <div class="muted" style="font-size:14px;margin-top:4px">${esc(r.text)}</div></div>`).join('')}</div>` : ''}`;
  const cp = view.querySelector('#cp');
  if (cp) cp.onclick = () => { track('click', 'promo-code'); copy(c.promoCode, 'Промокод скопирован'); };
  view.querySelector('#apply').onclick = () => {
    track('click', 'course-apply');
    if (c.url) return openLink(c.url, 'course-link');
    openLeadForm(c);
  };
}

function openLeadForm(c) {
  const user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
  const sheet = openSheet(`
    <h3 style="margin-bottom:6px">Заявка на курс</h3>
    <p class="muted" style="margin:0 0 14px;font-size:14px">Преподаватель напишет тебе в Telegram и расскажет про формат и цены.</p>
    <label class="field"><span>Имя *</span><input id="l_name" value="${esc(user ? user.first_name : '')}"></label>
    <label class="field"><span>Класс</span><select id="l_grade"><option>11 класс</option><option>10 класс</option><option>Выпускник прошлых лет</option></select></label>
    <label class="field"><span>Telegram или телефон *</span><input id="l_contact" value="${esc(user && user.username ? '@' + user.username : '')}"></label>
    <label class="field"><span>Сколько баллов хочешь</span><input id="l_goal" inputmode="numeric" placeholder="например, 85"></label>
    ${c.promoCode ? `<p class="faint" style="font-size:12.5px;margin:0 0 12px">Промокод ${esc(c.promoCode)} применится автоматически.</p>` : ''}
    <button class="btn primary block" id="send">Отправить заявку</button>`);
  sheet.querySelector('#send').onclick = async (e) => {
    const name = sheet.querySelector('#l_name').value.trim();
    const contact = sheet.querySelector('#l_contact').value.trim();
    if (!name || !contact) { toast('Заполни имя и контакт'); return; }
    e.target.disabled = true;
    try {
      await api('/api/lead', { method: 'POST', body: { kind: 'course', fields: {
        name, grade: sheet.querySelector('#l_grade').value, contact,
        goal: sheet.querySelector('#l_goal').value.trim(), promo: c.promoCode || '',
        solved: String(Object.values(progress.tasks).filter((t) => t.ok).length),
      } } });
      haptic('success');
      closeSheet();
      toast('Заявка отправлена! Скоро напишем 🙌');
    } catch (err) { toast(err.message); e.target.disabled = false; }
  };
}

// ---------- меню ----------
const tabs = mountTabs({
  container: document.getElementById('main'),
  bar: document.getElementById('tabbar'),
  tabs: [
    { id: 'home', title: 'Главная', icon: icons.home, render: renderHome },
    { id: 'trainer', title: 'Тренажёр', icon: icons.flask, render: renderTrainer },
    { id: 'materials', title: 'Материалы', icon: icons.book, render: renderMaterials },
    { id: 'course', title: 'Курс', icon: icons.star, render: renderCourse },
  ],
});
renderTop();

// ---------- админка ----------
const SCHEMA = {
  onBrandPreview: (b) => applyBrand(b),
  objects: [
    { key: 'brand', title: 'Бренд и экзамен', emoji: '🎨', hint: 'Название, цвета, дата экзамена', fields: [
      { key: 'name', label: 'Название', required: true },
      { key: 'tagline', label: 'Подпись под названием' },
      { key: 'avatarText', label: 'Буква или эмодзи на аватарке' },
      { key: 'avatarUrl', label: 'Ссылка на фото-аватар', type: 'url' },
      { key: 'accent', label: 'Основной цвет', type: 'color' },
      { key: 'accent2', label: 'Второй цвет', type: 'color' },
      { key: 'examName', label: 'Экзамен', placeholder: 'ЕГЭ по химии' },
      { key: 'examDate', label: 'Дата экзамена', type: 'date' },
      { key: 'footer', label: 'Подпись внизу главной', type: 'textarea' },
    ] },
    { key: 'course', title: 'Курс и промокод', emoji: '🎓', hint: 'Что продаём и как оставить заявку', fields: [
      { key: 'title', label: 'Название курса', required: true },
      { key: 'subtitle', label: 'Короткое описание', type: 'textarea' },
      { key: 'features', label: 'Что входит (строка = пункт)', type: 'list' },
      { key: 'price', label: 'Цена' },
      { key: 'promoCode', label: 'Промокод' },
      { key: 'promoText', label: 'Что даёт промокод' },
      { key: 'buttonText', label: 'Текст кнопки' },
      { key: 'url', label: 'Ссылка на оплату/бота', type: 'url', help: 'Если пусто — откроется форма заявки, заявки придут во вкладку «Заявки»' },
    ] },
  ],
  collections: [
    { key: 'tasks', title: 'Задачи', itemName: 'Задача', itemTitle: (t) => `${t.topic}: ${String(t.text || '').split('\n')[0]}`, fields: [
      { key: 'topic', label: 'Тема', required: true, placeholder: 'Например: Гидролиз' },
      { key: 'difficulty', label: 'Уровень', type: 'select', options: ['Базовый', 'Повышенный', 'Высокий'], default: 'Базовый' },
      { key: 'text', label: 'Условие', type: 'textarea', required: true },
      { key: 'answer', label: 'Правильный ответ', required: true, help: 'Цифры без пробелов или число (дробь через точку)' },
      { key: 'anyOrder', label: 'Порядок цифр не важен («выберите два»)', type: 'toggle', default: true },
      { key: 'solution', label: 'Разбор', type: 'textarea' },
    ] },
    { key: 'webinars', title: 'Вебинары', itemName: 'Вебинар', fields: [
      { key: 'title', label: 'Тема', required: true },
      { key: 'date', label: 'Дата и время', type: 'datetime', required: true },
      { key: 'url', label: 'Ссылка', type: 'url' },
    ] },
    { key: 'materials', title: 'Материалы', itemName: 'Материал', fields: [
      { key: 'title', label: 'Название', required: true },
      { key: 'type', label: 'Тип', type: 'select', options: ['Шпаргалка', 'Конспект', 'Схема', 'Видео', 'Тест'], default: 'Конспект' },
      { key: 'emoji', label: 'Эмодзи', default: '📄' },
      { key: 'url', label: 'Ссылка', type: 'url', required: true },
    ] },
    { key: 'reviews', title: 'Отзывы', itemName: 'Отзыв', itemTitle: (r) => `${r.name} — ${r.score || ''}`, fields: [
      { key: 'name', label: 'Кто', required: true },
      { key: 'score', label: 'Результат' },
      { key: 'text', label: 'Текст', type: 'textarea', required: true },
    ] },
  ],
};

const statLabel = (k) => k
  .replace(/^tab:home$/, 'Вкладка «Главная»').replace(/^tab:trainer$/, 'Вкладка «Тренажёр»')
  .replace(/^tab:materials$/, 'Вкладка «Материалы»').replace(/^tab:course$/, 'Вкладка «Курс»')
  .replace(/^task:/, 'Задачи по теме: ').replace(/^answer:/, 'Ответов ').replace(/^material:/, 'Материал: ')
  .replace(/^webinar:/, 'Вебинар: ').replace(/^course-apply$/, 'Нажали «Оставить заявку»')
  .replace(/^promo-code$/, 'Скопировали промокод').replace(/^course-link$/, 'Переход на оплату');

function showAdmin() {
  openAdmin({
    content, schema: SCHEMA, demo: me.demo, statLabel, initialTab: (location.hash.match(/admin=([\w-]+)/) || [])[1],
    leads: { title: 'Заявки', kinds: { course: 'Заявка на курс' }, labels: { name: 'Имя', grade: 'Класс', contact: 'Контакт', goal: 'Цель', promo: 'Промокод', solved: 'Решил задач' } },
    onSaved: (fresh) => { content = fresh; applyBrand(content.brand); renderTop(); tabs.rerender(); },
  });
}

// Ссылка …/#admin=stats сразу открывает админку на нужной вкладке (для скриншотов и быстрого входа).
if (me.isAdmin && /admin=/.test(location.hash)) showAdmin();
