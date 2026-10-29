const $ = s => document.querySelector(s);
const fmtT = iso => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const fmtD = iso => new Date(iso).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
const dayKey = iso => new Date(iso).toDateString();

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
  const meta = t.due ? `${late(t) ? 'Überfällig seit' : 'Bis'} ${fmtD(t.due)}, ${fmtT(t.due)}` : '';
  return h('li', { class: `item${t.urgent ? ' urgent' : ''}${t.done ? ' done' : ''}${late(t) ? ' late' : ''}` },
    h('button', { class: 'tick', 'aria-label': 'Erledigt', onclick: () => patch('todos', t.id, { done: !t.done }) }, t.done ? '✓' : ''),
    h('div', { class: 'body' }, h('div', { class: 't' }, t.title), meta && h('div', { class: 'meta' }, meta)),
    h('button', { class: `icon hot${t.urgent ? ' on' : ''}`, 'aria-label': 'Dringend umschalten', onclick: () => patch('todos', t.id, { urgent: !t.urgent }) }, '🔥'),
    h('button', { class: 'icon', 'aria-label': 'Löschen', onclick: () => confirm(`„${t.title}“ löschen?`) && del('todos', t.id) }, '🗑'));
}
// Dringend zuerst, dann nach Zeitlimit, Aufgaben ohne Limit zuletzt.
const byPriority = (a, b) => (b.urgent - a.urgent) || ((a.due ? +new Date(a.due) : Infinity) - (b.due ? +new Date(b.due) : Infinity)) || a.created.localeCompare(b.created);

function renderTodos() {
  const open = state.todos.filter(t => !t.done).sort(byPriority);
  $('#todoList').replaceChildren(...(open.length ? open.map(todoRow) : [h('li', { class: 'empty' }, 'Alles erledigt 🎉')]));
  $('#doneList').replaceChildren(...state.todos.filter(t => t.done).map(todoRow));
}

function eventRow(e, ext) {
  const time = fmtT(e.start) + (e.end && !ext ? '–' + fmtT(e.end) : '');
  return h('div', { class: 'item' },
    h('div', { class: 'body' }, h('div', { class: 't' }, e.title),
      h('div', { class: 'meta' }, [time, e.place, ext && e.source].filter(Boolean).join(' · '))),
    ext ? (e.url ? h('a', { href: e.url, target: '_blank', rel: 'noopener' }, 'Info') : null)
        : h('button', { class: 'icon', 'aria-label': 'Löschen', onclick: () => confirm(`„${e.title}“ löschen?`) && del('events', e.id) }, '🗑'));
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
  const sec = (title, items, row) => items.length ? [h('h3', {}, title), ...items.map(row)] : [];
  $('#tab-briefing').replaceChildren(...[
    h('h1', {}, b.title), h('p', { class: 'meta' }, fmtD(new Date().toISOString())),
    ...sec('Überfällig', s.overdue, todoRow), ...sec('Heute fällig', s.dueToday, todoRow), ...sec('Dringend', s.urgent, todoRow),
    ...sec('Termine heute', s.termine, e => eventRow(e)), ...sec('Veranstaltungen', s.veranstaltungen, e => eventRow(e, true)),
    b.body.startsWith('Nichts') ? h('p', { class: 'empty' }, b.body) : null].filter(Boolean));
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
  $('#pushState').textContent = !pushOk ? 'Dieser Browser unterstützt keine Benachrichtigungen (oder die Seite läuft nicht über HTTPS).'
    : Notification.permission === 'granted' ? '✅ Auf diesem Gerät eingeschaltet.'
    : Notification.permission === 'denied' ? '❌ Im Browser blockiert – in den Website-Einstellungen erlauben.' : 'Noch nicht eingeschaltet.';
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
    : s.connected ? `✅ Verbunden mit ${s.name}. Briefing und Erinnerungen kommen auch per Telegram.` : 'Bekomm Briefing und Erinnerungen als Telegram-Nachricht und hake Aufgaben direkt dort ab.';
  $('#tgSteps').hidden = !s.configured || s.connected;
  $('#tgConnect').hidden = !s.configured || s.connected;
  $('#tgDisconnect').hidden = !s.connected;
}
$('#tgConnect').addEventListener('click', async () => {
  try { await api('/telegram/connect', 'POST'); renderTelegram(); } catch (e) { $('#tgErr').textContent = e.message; }
});
$('#tgDisconnect').addEventListener('click', async () => { await api('/telegram/disconnect', 'POST'); renderTelegram(); });

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
