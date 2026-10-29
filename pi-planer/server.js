const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./lib/store');
const push = require('./lib/push');
const events = require('./lib/events');
const scheduler = require('./lib/scheduler');
const telegram = require('./lib/telegram');
const { buildBriefing } = require('./lib/briefing');
const { toICS } = require('./lib/ics');

const PORT = +process.env.PORT || 3000;
const PIN = process.env.APP_PIN;
if (!PIN || PIN.length < 4) { console.error('Bitte APP_PIN setzen (mindestens 4 Zeichen).'); process.exit(1); }

const d = store.db();
if (!d.secret) { d.secret = crypto.randomBytes(32).toString('hex'); store.save(); }
const vapidPublic = push.init();

const sign = what => crypto.createHmac('sha256', d.secret).update(what).digest('hex');
const safeEq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const sessionToken = sign('session:' + PIN);
const icsToken = sign('ics:' + PIN).slice(0, 32);
const cookieOf = req => Object.fromEntries((req.headers.cookie || '').split(/;\s*/).filter(Boolean).map(c => c.split(/=(.*)/s).slice(0, 2)));
const authed = req => safeEq(cookieOf(req).sid || '', sessionToken);

// Brute-Force-Bremse für den PIN: 5 Fehlversuche pro IP, dann 1 Minute Pause.
const fails = new Map();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

const send = (res, code, body, type = 'application/json', headers = {}) => {
  res.writeHead(code, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};
const readBody = req => new Promise((ok, no) => {
  let s = '';
  req.on('data', c => { s += c; if (s.length > 1e6) { no(new Error('zu groß')); req.destroy(); } });
  req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { no(e); } });
});

const str = (v, max = 300) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const isoOrNull = v => { const t = Date.parse(v); return Number.isNaN(t) ? null : new Date(t).toISOString(); };

function cleanTodo(b, old = {}) {
  const t = { ...old };
  if ('title' in b) t.title = str(b.title);
  if ('urgent' in b) t.urgent = !!b.urgent;
  if ('done' in b) t.done = !!b.done;
  if ('due' in b) { t.due = b.due ? isoOrNull(b.due) : null; t.notified = {}; } // neue Frist → Erinnerungen neu
  return t;
}
function cleanEvent(b, old = {}) {
  const e = { ...old };
  if ('title' in b) e.title = str(b.title);
  if ('start' in b) { e.start = isoOrNull(b.start); e.notified = false; }
  if ('end' in b) e.end = b.end ? isoOrNull(b.end) : null;
  if ('place' in b) e.place = str(b.place);
  if ('notes' in b) e.notes = str(b.notes, 2000);
  return e;
}

async function api(req, res, url) {
  const { pathname: p } = url, m = req.method;

  if (p === '/api/login' && m === 'POST') {
    const ip = req.socket.remoteAddress, f = fails.get(ip) || { n: 0, until: 0 };
    if (f.n >= 5 && Date.now() < f.until) return send(res, 429, { error: 'Zu viele Versuche – bitte kurz warten.' });
    const b = await readBody(req);
    if (!safeEq(String(b.pin || ''), PIN)) { fails.set(ip, { n: f.n + 1, until: Date.now() + 60e3 }); return send(res, 401, { error: 'PIN falsch' }); }
    fails.delete(ip);
    return send(res, 200, { ok: true }, 'application/json', { 'Set-Cookie': `sid=${sessionToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000` });
  }
  if (!authed(req)) return send(res, 401, { error: 'Anmeldung nötig' });

  if (p === '/api/state' && m === 'GET') {
    events.refresh().catch(() => {});
    return send(res, 200, { todos: d.todos, events: d.events, extEvents: d.extEvents, icsToken, pushSubs: d.subs.length });
  }
  if (p === '/api/briefing' && m === 'GET') return send(res, 200, buildBriefing(d));
  if (p === '/api/briefing/send' && m === 'POST') {
    const [pushSent, tgSent] = await scheduler.notify(scheduler.briefingMessage(buildBriefing(d)));
    return send(res, 200, { sent: pushSent + tgSent });
  }
  if (p === '/api/telegram' && m === 'GET') return send(res, 200, telegram.status());
  if (p === '/api/telegram/connect' && m === 'POST') {
    if (!telegram.connect()) return send(res, 400, { error: `Der Bot hat noch kein /start bekommen. Schreib in Telegram an ${telegram.status().bot ? '@' + telegram.status().bot : 'deinen Bot'} „/start“ und drück dann noch einmal auf „Verbinden“.` });
    await telegram.send({ body: '✅ Verbunden! Hier kommen ab jetzt dein Briefing und deine Erinnerungen. /hilfe zeigt, was ich kann.' });
    return send(res, 200, telegram.status());
  }
  if (p === '/api/telegram/disconnect' && m === 'POST') { telegram.disconnect(); return send(res, 200, telegram.status()); }
  if (p === '/api/events/external/refresh' && m === 'POST') return send(res, 200, { extEvents: await events.refresh(true) });

  if (p === '/api/push/key') return send(res, 200, { key: vapidPublic });
  if (p === '/api/push/subscribe' && m === 'POST') {
    const sub = await readBody(req);
    if (!sub.endpoint || !sub.keys) return send(res, 400, { error: 'ungültig' });
    d.subs = d.subs.filter(s => s.endpoint !== sub.endpoint).concat(sub); store.save();
    return send(res, 200, { ok: true });
  }

  for (const [coll, clean, label] of [['todos', cleanTodo, 'title'], ['events', cleanEvent, 'title']]) {
    const mt = p.match(new RegExp(`^/api/${coll}(?:/([\\w-]+))?$`));
    if (!mt) continue;
    const list = d[coll], iid = mt[1];
    if (m === 'POST' && !iid) {
      const item = clean(await readBody(req), { id: store.id(), created: new Date().toISOString(), ...(coll === 'todos' ? { done: false, urgent: false, due: null } : {}) });
      if (!item[label] || (coll === 'events' && !item.start)) return send(res, 400, { error: 'Titel' + (coll === 'events' ? ' und Start' : '') + ' nötig' });
      list.push(item); store.save(); return send(res, 201, item);
    }
    const idx = list.findIndex(x => x.id === iid);
    if (idx < 0) return send(res, 404, { error: 'nicht gefunden' });
    if (m === 'PATCH') {
      const upd = clean(await readBody(req), list[idx]);
      if (!upd[label]) return send(res, 400, { error: 'Titel nötig' });
      list[idx] = upd; store.save(); return send(res, 200, upd);
    }
    if (m === 'DELETE') { list.splice(idx, 1); store.save(); return send(res, 200, { ok: true }); }
  }
  return send(res, 404, { error: 'unbekannt' });
}

// ---- Telegram: Knöpfe und Befehle ----
const fmtTime = iso => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: process.env.TZ || 'Europe/Berlin' });
const HILFE = 'So geht\'s:\n/heute – Briefing jetzt\n/neu Text – neue Aufgabe\n/dringend Text – neue dringende Aufgabe\n/offen – alle offenen Aufgaben';
const short = s => s.length > 28 ? s.slice(0, 27) + '…' : s;

async function telegramButton(action, id) {
  const t = d.todos.find(x => x.id === id);
  if (!t) return 'Diese Aufgabe gibt es nicht mehr.';
  if (action === 'done') {
    t.done = true; store.save();
    const left = buildBriefing(d).sections;
    const n = left.overdue.length + left.dueToday.length;
    return `✅ Erledigt: ${t.title}` + (n ? `\nNoch ${n} für heute.` : '\nFür heute ist alles erledigt. 🎉');
  }
  if (action === 'snooze') {
    t.due = new Date(Math.max(Date.now(), +new Date(t.due || 0)) + 3600e3).toISOString();
    t.notified = {}; store.save();
    return `⏰ Verschoben auf ${fmtTime(t.due)}: ${t.title}`;
  }
  return 'Unbekannter Knopf.';
}

async function telegramCommand(text) {
  const [cmd, ...rest] = text.split(' ');
  const arg = rest.join(' ').trim();
  if (cmd === '/heute') return scheduler.briefingMessage(buildBriefing(d));
  if (cmd === '/neu' || cmd === '/dringend') {
    if (!arg) return { body: `Bitte mit Text, z. B. „${cmd} Brot kaufen“.` };
    const t = cleanTodo({ title: arg, urgent: cmd === '/dringend' }, { id: store.id(), created: new Date().toISOString(), done: false, urgent: false, due: null });
    d.todos.push(t); store.save();
    return { body: `${t.urgent ? '🔥' : '📝'} Neu: ${t.title}` };
  }
  if (cmd === '/offen') {
    const open = d.todos.filter(t => !t.done);
    return { body: open.length ? open.map(t => `${t.urgent ? '🔥' : '•'} ${t.title}${t.due ? ' (bis ' + fmtTime(t.due) + ')' : ''}`).join('\n') : 'Nichts offen. 🎉',
      buttons: open.slice(0, 6).map(t => [{ text: '✅ ' + short(t.title), data: 'done:' + t.id }]) };
  }
  return { body: HILFE };
}

telegram.use({ button: telegramButton, command: telegramCommand });

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/calendar.ics') {
      if (!safeEq(url.searchParams.get('t') || '', icsToken)) return send(res, 403, 'verboten', 'text/plain');
      return send(res, 200, toICS(d.events), 'text/calendar; charset=utf-8');
    }
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    const file = path.join(__dirname, 'public', url.pathname === '/' ? 'index.html' : url.pathname);
    if (!file.startsWith(path.join(__dirname, 'public') + path.sep)) return send(res, 403, 'verboten', 'text/plain');
    fs.readFile(file, (err, buf) => err ? send(res, 404, 'nicht gefunden', 'text/plain') : send(res, 200, buf, MIME[path.extname(file)] || 'application/octet-stream'));
  } catch (e) {
    console.error(e);
    send(res, 400, { error: 'Fehler' });
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`Pi-Planer läuft auf Port ${PORT}`));
  scheduler.start();
  telegram.start();
}
module.exports = Object.assign(server, { telegramButton, telegramCommand });
