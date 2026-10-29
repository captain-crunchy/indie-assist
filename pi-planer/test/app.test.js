const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');

process.env.DATA_FILE = path.join(os.tmpdir(), `pi-planer-${process.pid}.json`);
process.env.APP_PIN = '1234';
process.env.TZ = 'Europe/Berlin';

const { buildBriefing } = require('../lib/briefing');
const { toICS, parseICS } = require('../lib/ics');
const server = require('../server');

const iso = s => new Date(s).toISOString();

test('Briefing: Reihenfolge und Inhalt', () => {
  const now = new Date('2026-10-29T08:00:00Z'); // 09:00 Berlin
  const db = {
    todos: [
      { id: 1, title: 'Steuer', due: iso('2026-10-28T10:00:00Z'), urgent: true },
      { id: 2, title: 'Anruf', due: iso('2026-10-29T12:00:00Z') },
      { id: 3, title: 'Putzen', urgent: true },
      { id: 4, title: 'Fertig', done: true, urgent: true },
    ],
    events: [{ id: 'e', title: 'Arzt', start: iso('2026-10-29T09:30:00Z') }],
    extEvents: [{ id: 'x', title: 'Konzert', place: 'Halle', start: iso('2026-10-30T18:00:00Z') }],
  };
  const b = buildBriefing(db, now, 'Europe/Berlin');
  assert.deepStrictEqual(b.sections.overdue.map(t => t.title), ['Steuer']);
  assert.deepStrictEqual(b.sections.dueToday.map(t => t.title), ['Anruf']);
  assert.deepStrictEqual(b.sections.urgent.map(t => t.title), ['Putzen']);
  assert.match(b.body, /Termine: 10:30 Arzt/);
  assert.match(b.body, /Konzert @ Halle/);
  assert.strictEqual(b.title, 'Guten Morgen ☀️');
});

test('ICS: Export und Import stimmen überein, Sonderzeichen werden maskiert', () => {
  const ics = toICS([{ id: 'a', title: 'Kaffee, Kuchen; mit Oma', start: iso('2026-11-01T14:00:00Z'), place: 'Café' }]);
  assert.match(ics, /SUMMARY:Kaffee\\, Kuchen\\; mit Oma/);
  const back = parseICS(ics);
  assert.strictEqual(back[0].title, 'Kaffee, Kuchen; mit Oma');
  assert.strictEqual(back[0].start, '2026-11-01T14:00:00.000Z');
});

test('ICS: Links aus fremden Feeds nur als http(s)', () => {
  const feed = u => `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:1\r\nDTSTART:20261101T140000Z\r\nSUMMARY:X\r\nURL:${u}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
  assert.strictEqual(parseICS(feed('javascript:alert(1)'))[0].url, '');
  assert.strictEqual(parseICS(feed('https://example.org/a'))[0].url, 'https://example.org/a');
});

test('API: Login, To-do anlegen/ändern, Fristwechsel setzt Erinnerung zurück', async () => {
  await new Promise(r => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (p, method = 'GET', body, cookie) => fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body && JSON.stringify(body) });

  assert.strictEqual((await call('/api/state')).status, 401);
  assert.strictEqual((await call('/api/login', 'POST', { pin: 'falsch' })).status, 401);
  const ok = await call('/api/login', 'POST', { pin: '1234' });
  const cookie = ok.headers.get('set-cookie').split(';')[0];

  const created = await (await call('/api/todos', 'POST', { title: '  Brot kaufen ', urgent: true, due: '2026-11-01T10:00:00Z' }, cookie)).json();
  assert.strictEqual(created.title, 'Brot kaufen');
  assert.strictEqual((await call('/api/todos', 'POST', { title: '' }, cookie)).status, 400);

  require('../lib/store').db().todos[0].notified = { soon: true };
  const upd = await (await call('/api/todos/' + created.id, 'PATCH', { due: '2026-11-02T10:00:00Z' }, cookie)).json();
  assert.deepStrictEqual(upd.notified, {});

  const ev = await call('/api/events', 'POST', { title: 'Zahnarzt', start: '2026-11-03T08:00:00Z' }, cookie);
  assert.strictEqual(ev.status, 201);
  const state = await (await call('/api/state', 'GET', null, cookie)).json();
  const feed = await fetch(`${base}/calendar.ics?t=${state.icsToken}`);
  assert.match(await feed.text(), /SUMMARY:Zahnarzt/);
  assert.strictEqual((await fetch(`${base}/calendar.ics?t=x`)).status, 403);
  server.close();
});

test('Scheduler: Erinnerung bei Zeitlimit wird genau einmal gesendet', async () => {
  const push = require('../lib/push');
  const store = require('../lib/store');
  const sent = [];
  push.sendAll = async p => { sent.push(p.title); return 1; };
  const { tick } = require('../lib/scheduler');
  const d = store.db();
  d.todos = [{ id: 'z', title: 'Wichtig', urgent: true, due: iso('2026-10-29T10:00:00Z'), done: false }];
  d.events = []; d.lastBriefing = { '2026-10-29 09:00': true, '2026-10-29 14:00': true };
  await tick(new Date('2026-10-29T09:30:00Z')); // 30 Min. vorher, dringend → "Gleich fällig"
  await tick(new Date('2026-10-29T09:31:00Z')); // nicht doppelt
  await tick(new Date('2026-10-29T10:00:30Z')); // Zeitlimit erreicht
  assert.deepStrictEqual(sent, ['🔥 Gleich fällig', '⏰ Zeitlimit erreicht (dringend)']);
});
