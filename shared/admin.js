// Админ-панель внутри мини-аппа. Владелец канала правит контент без программиста:
// добавляет, скрывает, двигает и удаляет карточки, меняет бренд, смотрит статистику и заявки.
// Что именно можно править, приложение описывает схемой (schema) — см. app.js каждого приложения.

import { api, esc, icons, toast, haptic, pushBack, popBack, fmtDateTime, openSheet, closeSheet } from './core.js';

const STATUS = { new: 'Новая', in_work: 'В работе', done: 'Готово', cancelled: 'Отменена' };

export function openAdmin({ content, schema, onSaved, extraTabs = [], leads = null, statLabel = (k) => k, demo = false, initialTab }) {
  let draft = structuredClone(content);
  let dirty = false;
  let tab = initialTab || 'content';

  const root = document.createElement('div');
  root.className = 'admin';
  root.innerHTML = `
    <div class="admin-inner">
      <div class="admin-head glass">
        <div class="ttl">Админ-панель ${demo ? '<span class="badge accent">демо</span>' : ''}</div>
        <button class="icon-btn" data-act="close" aria-label="Закрыть">${icons.close}</button>
      </div>
      <div class="admin-tabs chips"></div>
      <div class="admin-body"></div>
    </div>
    <div class="admin-save glass">
      <div class="state"></div>
      <button class="btn primary" data-act="save">Сохранить</button>
    </div>`;
  document.body.appendChild(root);
  document.body.style.overflow = 'hidden';

  const tabsEl = root.querySelector('.admin-tabs');
  const body = root.querySelector('.admin-body');
  const stateEl = root.querySelector('.state');
  const saveBtn = root.querySelector('[data-act="save"]');

  const tabs = [
    { id: 'content', title: 'Контент' },
    ...(leads ? [{ id: 'leads', title: leads.title || 'Заявки' }] : []),
    ...extraTabs.map((t) => ({ id: t.id, title: t.title })),
    { id: 'stats', title: 'Статистика' },
  ];

  function setDirty(v) {
    dirty = v;
    stateEl.textContent = dirty ? 'Есть несохранённые изменения' : 'Всё сохранено';
    saveBtn.disabled = !dirty;
  }

  function renderTabs() {
    tabsEl.innerHTML = tabs.map((t) => `<button class="chip ${t.id === tab ? 'active' : ''}" data-tab="${t.id}">${esc(t.title)}</button>`).join('');
  }

  function render() {
    renderTabs();
    body.innerHTML = '';
    if (tab === 'content') renderContent();
    else if (tab === 'stats') renderStats();
    else if (tab === 'leads') renderLeads();
    else {
      const t = extraTabs.find((x) => x.id === tab);
      if (t) t.render(body, { draft, api, toast });
    }
  }

  // ---------- контент ----------
  function renderContent() {
    for (const obj of schema.objects || []) {
      const card = document.createElement('div');
      card.className = 'glass item';
      card.style.marginBottom = '10px';
      card.innerHTML = `<div class="ico">${obj.emoji || '⚙️'}</div>
        <div class="body"><div class="title">${esc(obj.title)}</div><div class="sub">${esc(obj.hint || 'Нажми, чтобы изменить')}</div></div>
        <div class="chev">${icons.chev}</div>`;
      card.onclick = () => editForm(obj.title, obj.fields, draft[obj.key] || {}, (val) => {
        draft[obj.key] = val; setDirty(true); render();
        if (obj.key === 'brand' && schema.onBrandPreview) schema.onBrandPreview(val);
      });
      body.appendChild(card);
    }

    for (const col of schema.collections || []) {
      const items = (draft[col.key] ||= []);
      const wrap = document.createElement('div');
      wrap.innerHTML = `<div class="section-title">${esc(col.title)} <small>${items.length}</small></div>`;
      const list = document.createElement('div');
      list.className = 'stack';
      items.forEach((it, i) => {
        const row = document.createElement('div');
        row.className = 'glass admin-row' + (it.hidden ? ' is-hidden' : '');
        row.innerHTML = `
          <div class="t">${esc(col.itemTitle ? col.itemTitle(it) : it.title || 'Без названия')}</div>
          <button class="icon-btn" data-a="up" title="Выше">${icons.up}</button>
          <button class="icon-btn" data-a="down" title="Ниже">${icons.down}</button>
          <button class="icon-btn" data-a="hide" title="${it.hidden ? 'Показать' : 'Скрыть'}">${it.hidden ? icons.eyeOff : icons.eye}</button>
          <button class="icon-btn" data-a="edit" title="Изменить">${icons.edit}</button>
          <button class="icon-btn" data-a="del" title="Удалить">${icons.trash}</button>`;
        row.onclick = (e) => {
          const a = e.target.closest('[data-a]')?.dataset.a || 'edit';
          if (a === 'up' && i > 0) { [items[i - 1], items[i]] = [items[i], items[i - 1]]; }
          else if (a === 'down' && i < items.length - 1) { [items[i + 1], items[i]] = [items[i], items[i + 1]]; }
          else if (a === 'hide') { it.hidden = !it.hidden; }
          else if (a === 'del') { if (!confirm('Удалить «' + (it.title || 'элемент') + '»?')) return; items.splice(i, 1); }
          else if (a === 'edit') {
            return editForm(col.itemName || col.title, col.fields, it, (val) => { items[i] = { ...it, ...val }; setDirty(true); render(); });
          } else return;
          haptic('light'); setDirty(true); render();
        };
        list.appendChild(row);
      });
      const add = document.createElement('button');
      add.className = 'btn ghost block';
      add.innerHTML = `${icons.plus} Добавить`;
      add.onclick = () => {
        const blank = { id: 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) };
        for (const f of col.fields) if (f.default !== undefined) blank[f.key] = typeof f.default === 'function' ? f.default() : f.default;
        editForm('Новый элемент: ' + (col.itemName || col.title), col.fields, blank, (val) => {
          items.unshift({ ...blank, ...val }); setDirty(true); render();
        });
      };
      list.appendChild(add);
      wrap.appendChild(list);
      body.appendChild(wrap);
    }
  }

  function fieldHtml(f, value) {
    const id = 'f_' + f.key;
    const v = value ?? '';
    let input;
    const opts = typeof f.options === 'function' ? f.options(draft) : f.options;
    switch (f.type) {
      case 'textarea':
        input = `<textarea id="${id}" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`; break;
      case 'list':
        input = `<textarea id="${id}" placeholder="${esc(f.placeholder || 'Каждый пункт с новой строки')}">${esc((v || []).join('\n'))}</textarea>`; break;
      case 'select':
        input = `<select id="${id}">${(opts || []).map((o) => {
          const val = typeof o === 'object' ? o.value : o;
          const lab = typeof o === 'object' ? o.label : o;
          return `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(lab)}</option>`;
        }).join('')}</select>`; break;
      case 'toggle':
        return `<label class="toggle"><span>${esc(f.label)}</span><input type="checkbox" id="${id}" ${v ? 'checked' : ''}></label>`;
      case 'datetime':
        input = `<input id="${id}" type="datetime-local" value="${esc(v ? String(v).slice(0, 16) : '')}">`; break;
      default:
        input = `<input id="${id}" type="${f.type || 'text'}" value="${esc(v)}" placeholder="${esc(f.placeholder || '')}" ${f.step ? `step="${f.step}"` : ''}>`;
    }
    return `<label class="field"><span>${esc(f.label)}${f.required ? ' *' : ''}</span>${input}${f.help ? `<small class="faint">${esc(f.help)}</small>` : ''}</label>`;
  }

  function readField(sheet, f) {
    const el = sheet.querySelector('#f_' + f.key);
    if (!el) return undefined;
    if (f.type === 'toggle') return el.checked;
    if (f.type === 'number') return el.value === '' ? '' : Number(el.value);
    if (f.type === 'list') return el.value.split('\n').map((s) => s.trim()).filter(Boolean);
    return el.value.trim();
  }

  function editForm(title, fields, value, onDone) {
    const sheet = openSheet(`
      <h3 style="margin-bottom:14px">${esc(title)}</h3>
      ${fields.map((f) => fieldHtml(f, value[f.key])).join('')}
      <div class="row" style="margin-top:6px">
        <button class="btn ghost" data-x="cancel" style="flex:1">Отмена</button>
        <button class="btn primary" data-x="ok" style="flex:2">Готово</button>
      </div>`);
    sheet.querySelector('[data-x="cancel"]').onclick = closeSheet;
    sheet.querySelector('[data-x="ok"]').onclick = () => {
      const val = {};
      for (const f of fields) {
        val[f.key] = readField(sheet, f);
        if (f.required && (val[f.key] === '' || val[f.key] === undefined)) { toast('Заполни поле «' + f.label + '»'); return; }
      }
      closeSheet();
      onDone(val);
    };
  }

  // ---------- статистика ----------
  async function renderStats() {
    body.innerHTML = '<div class="skeleton"></div>';
    let s;
    try { s = await api('/api/stats'); } catch (e) { body.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
      days.push({ d, v: (s.days[d] && s.days[d].opens) || 0 });
    }
    const max = Math.max(1, ...days.map((x) => x.v));
    const total = (field) => {
      const acc = {};
      for (const day of Object.values(s.days)) for (const [k, v] of Object.entries(day[field] || {})) acc[k] = (acc[k] || 0) + v;
      return Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 10);
    };
    const week = days.slice(-7).reduce((a, x) => a + x.v, 0);
    const views = total('views');
    const clicks = total('clicks');
    const bars = (rows) => {
      const m = Math.max(1, ...rows.map((r) => r[1]));
      return rows.length ? rows.map(([k, v]) => `
        <div style="margin-bottom:10px"><div class="row" style="justify-content:space-between;font-size:13.5px;margin-bottom:4px">
        <span>${esc(statLabel(k))}</span><b>${v}</b></div><div class="bar"><i style="width:${(v / m) * 100}%"></i></div></div>`).join('')
        : '<div class="muted">Пока нет данных</div>';
    };
    body.innerHTML = `
      <div class="grid-2">
        <div class="glass card"><div class="muted">Открытий за 7 дней</div><div class="stat-num">${week}</div></div>
        <div class="glass card"><div class="muted">Уникальных людей</div><div class="stat-num">${s.uniqueUsers}</div></div>
      </div>
      <div class="glass card" style="margin-top:10px">
        <div class="muted" style="margin-bottom:10px">Открытия по дням (14 дней)</div>
        <div class="spark">${days.map((x) => `<i title="${x.d}: ${x.v}" style="height:${(x.v / max) * 100}%"></i>`).join('')}</div>
      </div>
      <div class="section-title">Что смотрят</div><div class="glass card">${bars(views)}</div>
      <div class="section-title">На что нажимают <small>всего ${clicks.reduce((a, r) => a + r[1], 0)}</small></div>
      <div class="glass card">${bars(clicks)}</div>
      <p class="faint" style="font-size:12px">Клики по рекламе и партнёрским ссылкам видны здесь — этими цифрами удобно отчитываться перед рекламодателем.</p>`;
  }

  // ---------- заявки ----------
  let leadFilter = 'new';
  async function renderLeads() {
    body.innerHTML = '<div class="skeleton"></div>';
    let list;
    try { list = await api('/api/leads'); } catch (e) { body.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const counts = {};
    list.forEach((l) => { counts[l.status] = (counts[l.status] || 0) + 1; });
    const shown = leadFilter === 'all' ? list : list.filter((l) => l.status === leadFilter);
    body.innerHTML = `
      <div class="chips">${['new', 'in_work', 'done', 'cancelled', 'all'].map((k) =>
        `<button class="chip ${k === leadFilter ? 'active' : ''}" data-f="${k}">${k === 'all' ? 'Все' : STATUS[k]} ${k === 'all' ? list.length : counts[k] || 0}</button>`).join('')}</div>
      <div class="stack">${shown.length ? shown.map((l) => `
        <div class="glass lead">
          <div class="meta">${esc(fmtDateTime(l.createdAt))} · ${esc((leads.kinds && leads.kinds[l.kind]) || l.kind)} · ${esc(l.user ? l.user.name : 'гость')}</div>
          <dl>${Object.entries(l.fields).map(([k, v]) => `<dt>${esc((leads.labels && leads.labels[k]) || k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
          <div class="row" style="margin-top:10px">
            <select class="input" data-id="${l.id}" style="flex:1">${Object.entries(STATUS).map(([k, t]) => `<option value="${k}" ${k === l.status ? 'selected' : ''}>${t}</option>`).join('')}</select>
          </div>
        </div>`).join('') : '<div class="empty"><div class="big">📭</div>Здесь пусто</div>'}</div>`;
    body.querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => { leadFilter = b.dataset.f; renderLeads(); }; });
    body.querySelectorAll('select[data-id]').forEach((sel) => {
      sel.onchange = async () => {
        try { await api('/api/leads/' + sel.dataset.id, { method: 'PATCH', body: { status: sel.value } }); toast('Статус обновлён'); renderLeads(); }
        catch (e) { toast(e.message); }
      };
    });
  }

  // ---------- сохранение и закрытие ----------
  async function save() {
    saveBtn.disabled = true;
    try {
      await api('/api/content', { method: 'PUT', body: draft });
      haptic('success'); toast('Сохранено — подписчики уже видят изменения');
      setDirty(false);
      onSaved(structuredClone(draft));
    } catch (e) { toast(e.message); saveBtn.disabled = false; }
  }

  function close() {
    if (dirty && !confirm('Изменения не сохранены. Закрыть без сохранения?')) return;
    if (dirty && schema.onBrandPreview) schema.onBrandPreview(content.brand || {});
    popBack(close);
    document.body.style.overflow = '';
    root.remove();
  }

  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t && tabsEl.contains(t)) { tab = t.dataset.tab; render(); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') close();
    if (act === 'save') save();
  });
  pushBack(close);
  setDirty(false);
  render();
}
