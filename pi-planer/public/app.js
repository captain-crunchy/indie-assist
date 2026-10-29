const $ = s => document.querySelector(s);
const fmtT = iso => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const fmtD = iso => new Date(iso).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
const dayKey = iso => new Date(iso).toDateString();
// Kurz und vertraut: „heute 14:00“, „morgen 9:30“, „gestern 18:00“, sonst „Sa. 31.10., 18:00“
function fmtWhen(iso) {
  const d = new Date(iso), diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5);
  const word = { '-1': 'gestern', 0: 'heute', 1: 'morgen' }[diff];
  return word ? `${word} ${fmtT(iso)}` : `${d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })}, ${fmtT(iso)}`;
}

// Weiße Linien-Symbole im Stil von Indie Assist (24er-Raster, Strich 2). Feste Pfade, kein Nutzertext.
const ICONS = {
  start: '<path d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  aufgaben: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  kalender: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  kalenderPlus: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/>',
  ticket: '<path d="M3 7h18v3.5a1.5 1.5 0 0 0 0 3V17H3v-3.5a1.5 1.5 0 0 0 0-3z"/><path d="M14.5 7v10" stroke-dasharray="2 2.2"/>',
  einstellungen: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  haken: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  korb: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/>',
  flamme: '<path d="M12 3c.8 3.5 5 5.4 5 10.2A5 5 0 0 1 7 13.2c0-2.4 1.3-3.6 2-5.4.9 1.4 1.9 2 3 2.1-.4-2 .1-4.6 0-6.9z"/>',
  uhr: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  warnung: '<path d="M12 3.5L2.5 20h19zM12 10v5M12 17.5v.1"/>',
  ort: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  glocke: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"/>',
  flieger: '<path d="M21 3L3 10.5l7 2.5 2.5 7z"/><path d="M10 13l5-5"/>',
  sonne: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
  mond: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"/>',
  kreis: '<path d="M4 12a8 8 0 0 1 13.7-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.7L4 15.5M4 20v-4.5h4.5"/>',
  schloss: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  link: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
};
function icon(name, cls = 'ic') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', cls); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name] || '';
  return svg;
}
function fillIcons(root = document) {
  root.querySelectorAll('i[data-icon]').forEach(i => { const svg = icon(i.dataset.icon, 'ic' + (i.className ? ' ' + i.className : '')); i.replaceWith(svg); });
}
const badge = (name, red) => h('span', { class: 'badge' + (red ? ' red' : '') }, icon(name));

// Elemente immer per textContent bauen – nie Nutzertext als HTML einsetzen.
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (v === true) el.setAttribute(k, ''); else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) el.append(k);
  return el;
}

async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401 && path !== '/login') { showLogin(); throw new Error('login'); }
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Fehler');
  return j;
}

let state = { todos: [], events: [], extEvents: [], icsToken: '' };

function showLogin() { $('#login').hidden = false; $('#app').hidden = true; $('#nav').hidden = true; }
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  try { await api('/login', 'POST', { pin: $('#pin').value }); $('#login').hidden = true; boot(); }
  catch (err) { $('#loginErr').textContent = err.message; }
});

const late = t => t.due && !t.done && new Date(t.due) < new Date();
function todoRow(t) {
  const when = t.due ? `${late(t) ? 'Überfällig seit' : 'Bis'} ${fmtWhen(t.due)}` : '';
  const meta = (t.urgent && !t.done) || when
    ? h('div', { class: 'meta' }, t.urgent && !t.done ? h('span', { class: 'urgent-tag' }, icon('flamme'), 'Dringend') : null,
        when ? h('span', {}, when) : null) : null;
  return h('li', { class: `item${t.urgent ? ' urgent' : ''}${t.done ? ' done' : ''}${late(t) ? ' late' : ''}` },
    h('button', { class: 'tick', 'aria-label': t.done ? 'Wieder offen' : 'Erledigt', onclick: () => patch('todos', t.id, { done: !t.done }) }, t.done ? icon('haken') : null),
    h('div', { class: 'body' }, h('div', { class: 't' }, t.title), meta),
    t.done ? null : h('button', { class: `icon hot${t.urgent ? ' on' : ''}`, 'aria-label': t.urgent ? 'Nicht mehr dringend' : 'Als dringend markieren', 'aria-pressed': String(!!t.urgent), onclick: () => patch('todos', t.id, { urgent: !t.urgent }) }, icon('flamme')),
    h('button', { class: 'icon del', 'aria-label': 'Löschen', onclick: () => confirm(`„${t.title}“ löschen?`) && del('todos', t.id) }, icon('korb')));
}
// Dringend zuerst, dann nach Zeitlimit, Aufgaben ohne Limit zuletzt.
const byPriority = (a, b) => (b.urgent - a.urgent) || ((a.due ? +new Date(a.due) : Infinity) - (b.due ? +new Date(b.due) : Infinity)) || a.created.localeCompare(b.created);

function renderTodos() {
  const open = state.todos.filter(t => !t.done).sort(byPriority);
  $('#todoList').replaceChildren(...(open.length ? open.map(todoRow) : [h('li', { class: 'empty' }, 'Alles erledigt.')]));
  $('#doneList').replaceChildren(...state.todos.filter(t => t.done).map(todoRow));
}

function eventRow(e, ext) {
  const sub = [e.end && !ext ? 'bis ' + fmtT(e.end) : '', ext && e.source].filter(Boolean).join(' · ');
  return h('div', { class: 'item' },
    h('span', { class: 'time' }, fmtT(e.start)),
    h('div', { class: 'body' }, h('div', { class: 't' }, e.title),
      e.place || sub ? h('div', { class: 'meta' }, e.place ? icon('ort') : null, [e.place, sub].filter(Boolean).join(' · ')) : null),
    ext ? (e.url ? h('a', { class: 'icon', href: e.url, target: '_blank', rel: 'noopener', 'aria-label': 'Mehr Infos' }, icon('link')) : null)
        : h('button', { class: 'icon del', 'aria-label': 'Löschen', onclick: () => confirm(`„${e.title}“ löschen?`) && del('events', e.id) }, icon('korb')));
}
function grouped(list, ext) {
  const out = []; let last = '';
  for (const e of list) {
    if (dayKey(e.start) !== last) { last = dayKey(e.start); out.push(h('div', { class: 'day' }, fmtD(e.start))); }
    out.push(eventRow(e, ext));
  }
  return out;
}
function renderEvents() {
  const from = Date.now() - 3600e3;
  const up = state.events.filter(e => +new Date(e.end || e.start) >= from).sort((a, b) => a.start.localeCompare(b.start));
  $('#eventList').replaceChildren(...(up.length ? grouped(up) : [h('p', { class: 'empty' }, 'Keine Termine.')]));
  $('#extList').replaceChildren(...(state.extEvents.length ? grouped(state.extEvents.slice(0, 60), true)
    : [h('p', { class: 'empty' }, 'Noch keine Veranstaltungen. In der Server-Konfiguration EVENTS_CITY und TICKETMASTER_KEY (oder EVENTS_ICS_URLS) eintragen.')]));
}

async function renderBriefing() {
  const b = await api('/briefing');
  const s = b.sections;
  const sec = (title, ic, items, row, red) => items.length ? [h('h3', { class: 'sec' }, badge(ic, red), title), h('div', { class: 'list' }, ...items.map(row))] : [];
  const hour = new Date().getHours(), morning = hour < 12;
  $('#tab-briefing').replaceChildren(...[
    h('header', { class: 'phead' }, h('h1', {}, morning ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend'), h('small', {}, fmtD(new Date().toISOString())), icon(morning ? 'sonne' : 'start', 'ic bg')),
    ...sec('Überfällig', 'warnung', s.overdue, todoRow, true), ...sec('Heute fällig', 'uhr', s.dueToday, todoRow), ...sec('Dringend', 'flamme', s.urgent, todoRow),
    ...sec('Termine heute', 'kalender', s.termine, e => eventRow(e)), ...sec('Veranstaltungen', 'ticket', s.veranstaltungen, e => eventRow(e, true)),
    b.body.startsWith('Nichts') ? h('div', { class: 'card' }, h('h2', {}, badge('haken'), 'Nichts Dringendes'), h('p', { class: 'hint' }, 'Für heute steht nichts an. Schönen Tag!')) : null].filter(Boolean));
}

function renderAll() { renderTodos(); renderEvents(); renderBriefing().catch(() => {}); $('#icsUrl').value = `${location.origin}/calendar.ics?t=${state.icsToken}`; renderPush(); }
async function reload() { state = await api('/state'); renderAll(); }
async function patch(c, id, body) { await api(`/${c}/${id}`, 'PATCH', body); reload(); }
async function del(c, id) { await api(`/${c}/${id}`, 'DELETE'); reload(); }

const toISO = v => v ? new Date(v).toISOString() : null; // datetime-local = Ortszeit des Geräts
$('#todoForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target;
  await api('/todos', 'POST', { title: f.title.value, urgent: f.urgent.checked, due: toISO(f.due.value) });
  f.reset(); reload();
});
$('#eventForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target;
  await api('/events', 'POST', { title: f.title.value, start: toISO(f.start.value), end: toISO(f.end.value), place: f.place.value });
  f.reset(); reload();
});
$('#refreshExt').addEventListener('click', async () => { await api('/events/external/refresh', 'POST'); reload(); });

// Tabs
function go(tab) {
  document.querySelectorAll('.tab').forEach(s => s.hidden = s.id !== 'tab-' + tab);
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
}
$('#nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) go(b.dataset.tab); });

// Push
const pushOk = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
async function renderPush() {
  $('#pushState').textContent = !pushOk ? 'Dieser Browser kann keine Benachrichtigungen (oder die Seite läuft nicht über HTTPS). Telegram geht immer.'
    : Notification.permission === 'granted' ? 'Auf diesem Gerät eingeschaltet.'
    : Notification.permission === 'denied' ? 'Im Browser blockiert. In den Website-Einstellungen erlauben.' : 'Auf diesem Gerät noch aus.';
}
$('#pushOn').addEventListener('click', async () => {
  if (!pushOk) return renderPush();
  if (await Notification.requestPermission() !== 'granted') return renderPush();
  const reg = await navigator.serviceWorker.ready;
  const { key } = await api('/push/key');
  const pad = '='.repeat((4 - key.length % 4) % 4);
  const raw = atob((key + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, c => c.charCodeAt(0)) });
  await api('/push/subscribe', 'POST', sub.toJSON());
  renderPush();
});
$('#pushTest').addEventListener('click', async () => { const r = await api('/briefing/send', 'POST'); $('#pushState').textContent = `Gesendet an ${r.sent} Gerät(e) bzw. Telegram.`; });

// Telegram
async function renderTelegram() {
  const s = await api('/telegram');
  $('#tgErr').textContent = '';
  $('#tgBot').textContent = s.bot ? '@' + s.bot : 'deines Pi-Planers';
  $('#tgState').textContent = !s.configured ? 'Noch nicht eingerichtet: Bei der Installation einen Bot-Token angeben (siehe Anleitung).'
    : s.connected ? `Verbunden mit ${s.name}. Briefing und Erinnerungen kommen auch per Telegram.` : 'Bekomm Briefing und Erinnerungen als Telegram-Nachricht und hake Aufgaben direkt dort ab.';
  $('#tgSteps').hidden = !s.configured || s.connected;
  $('#tgConnect').hidden = !s.configured || s.connected;
  $('#tgDisconnect').hidden = !s.connected;
}
$('#tgConnect').addEventListener('click', async () => {
  try { await api('/telegram/connect', 'POST'); renderTelegram(); } catch (e) { $('#tgErr').textContent = e.message; }
});
$('#tgDisconnect').addEventListener('click', async () => { await api('/telegram/disconnect', 'POST'); renderTelegram(); });

fillIcons();

async function boot() {
  try { await reload(); } catch { return; }
  $('#app').hidden = false; $('#nav').hidden = false;
  renderTelegram().catch(() => {});
  if (location.hash === '#briefing') go('briefing');
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
}
boot();
setInterval(() => { if (!document.hidden && !$('#app').hidden) reload().catch(() => {}); }, 30e3);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#app').hidden) reload().catch(() => {}); });
