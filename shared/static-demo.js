// Статичный «сервер» для демо на GitHub Pages: там нет Node, поэтому заявки, записи,
// розыгрыши и правки из админки хранятся в localStorage посетителя и видны только ему.
// Подключается из core.js автоматически на *.github.io или по ?static=1.

const APP = location.pathname.replace(/[^/]*$/, '');
const key = (name) => `demo:${APP}:${name}`;

function load(name, def) {
  try { const v = localStorage.getItem(key(name)); return v ? JSON.parse(v) : def; } catch { return def; }
}
function save(name, value) {
  try { localStorage.setItem(key(name), JSON.stringify(value)); } catch { /* память переполнена */ }
}
function fail(status, error) {
  const e = new Error(error); e.status = status; throw e;
}
const clean = (v, n) => String(v ?? '').slice(0, n);

let baseContent = null;
async function defaultContent() {
  if (!baseContent) {
    const res = await fetch(new URL('content.json', location.href));
    baseContent = await res.json();
  }
  return baseContent;
}

export async function staticApi(path, method, body, userId) {
  const url = new URL(path, location.origin);
  const p = url.pathname;
  const user = { id: userId, name: 'Гость' };

  if (p === '/api/me') return { isAdmin: true, demo: true, user };

  if (p === '/api/content') {
    if (method === 'PUT') { save('content', body); return { ok: true }; }
    return load('content', null) || await defaultContent();
  }

  if (p === '/api/event') return { ok: true };

  if (p === '/api/stats') {
    return { days: {}, uniqueUsers: 1 };
  }

  if (p === '/api/lead' && method === 'POST') {
    const kind = clean(body.kind, 30) || 'lead';
    const fields = {};
    for (const [k, v] of Object.entries(body.fields || {}).slice(0, 20)) fields[clean(k, 40)] = clean(v, 1000);
    const leads = load('leads', []);
    if (kind === 'booking') {
      const taken = leads.some((l) => l.kind === 'booking' && l.status !== 'cancelled' &&
        l.fields.date === fields.date && l.fields.time === fields.time && l.fields.master === fields.master);
      if (taken) fail(409, 'Это время уже заняли. Выбери другое.');
    }
    const id = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
    leads.push({ id, kind, fields, status: 'new', createdAt: new Date().toISOString(), user });
    save('leads', leads);
    return { ok: true, id };
  }

  if (p === '/api/my-leads') return load('leads', []).filter((l) => l.user && l.user.id === userId);

  if (p === '/api/slots') {
    const date = clean(url.searchParams.get('date'), 10);
    const master = clean(url.searchParams.get('master'), 80);
    const busy = load('leads', [])
      .filter((l) => l.kind === 'booking' && l.status !== 'cancelled' && l.fields.date === date && l.fields.master === master)
      .map((l) => l.fields.time);
    return { busy };
  }

  if (p === '/api/leads' && method === 'GET') return load('leads', []).slice().reverse();

  const leadMatch = p.match(/^\/api\/leads\/([\w-]+)$/);
  if (leadMatch) {
    const leads = load('leads', []);
    const lead = leads.find((l) => l.id === leadMatch[1]);
    if (!lead) fail(404, 'Не найдено');
    if (method === 'PATCH' && ['new', 'done', 'cancelled', 'in_work'].includes(body && body.status)) lead.status = body.status;
    if (method === 'DELETE') lead.status = 'cancelled';
    save('leads', leads);
    return { ok: true };
  }

  const gwMatch = p.match(/^\/api\/giveaway\/([\w-]+)(\/join|\/draw)?$/);
  if (gwMatch) {
    const all = load('giveaways', {});
    const gw = (all[gwMatch[1]] ||= { participants: [], winners: [] });
    const action = gwMatch[2] || '';
    if (action === '/join' && method === 'POST') {
      if (gw.winners.length) fail(400, 'Розыгрыш уже завершён');
      if (!gw.participants.some((x) => x.id === userId)) gw.participants.push(user);
      save('giveaways', all);
    }
    if (action === '/draw' && method === 'POST') {
      if (!gw.participants.length) fail(400, 'Нет участников');
      const w = gw.participants[Math.floor(Math.random() * gw.participants.length)];
      gw.winners = [w];
      save('giveaways', all);
    }
    return {
      count: gw.participants.length,
      joined: gw.participants.some((x) => x.id === userId),
      winners: gw.winners.map((w) => ({ name: w.name })),
      participants: gw.participants,
    };
  }

  fail(404, 'Нет такого метода в демо');
}
