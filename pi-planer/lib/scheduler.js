// Läuft jede halbe Minute: Briefings (09:00 / 14:00), Zeitlimit-Erinnerungen, Termin-Erinnerungen.
const store = require('./store');
const push = require('./push');
const telegram = require('./telegram');
const events = require('./events');
const { buildBriefing, localParts } = require('./briefing');

const BRIEFING_TIMES = (process.env.BRIEFING_TIMES || '09:00,14:00').split(',').map(s => s.trim());
const CATCH_UP_MIN = 90; // Pi war kurz aus? Briefing noch bis 90 Min. nach der Zeit nachholen.
// Jede Benachrichtigung geht an alle Handys (Web-Push) und – falls verbunden – an Telegram.
const notify = p => Promise.all([push.sendAll(p), telegram.send(p)]);
const short = (s, n = 28) => s.length > n ? s.slice(0, n - 1) + '…' : s;
const todoButtons = t => [[{ text: '✅ Erledigt', data: 'done:' + t.id }, { text: '⏰ +1 Std.', data: 'snooze:' + t.id }]];
function briefingMessage(b) {
  const open = [...b.sections.overdue, ...b.sections.dueToday].slice(0, 4);
  return { title: b.title, body: b.body, tag: 'briefing', url: '/#briefing', buttons: open.map(t => [{ text: '✅ ' + short(t.title), data: 'done:' + t.id }]) };
}

const toMin = hm => +hm.slice(0, 2) * 60 + +hm.slice(3);

async function tick(now = new Date()) {
  const d = store.db();
  const { day, hm } = localParts(now);

  for (const t of BRIEFING_TIMES) {
    const key = `${day} ${t}`;
    const late = toMin(hm) - toMin(t);
    if (late >= 0 && late <= CATCH_UP_MIN && !d.lastBriefing[key]) {
      d.lastBriefing[key] = true;
      d.lastBriefing = Object.fromEntries(Object.entries(d.lastBriefing).slice(-20));
      store.save();
      await events.refresh().catch(() => {});
      await notify(briefingMessage(buildBriefing(d, now)));
    }
  }

  for (const t of d.todos) {
    if (t.done || !t.due) continue;
    const ms = new Date(t.due) - now;
    const soon = (t.urgent ? 60 : 30) * 60e3;
    t.notified = t.notified || {};
    if (ms <= 0 && !t.notified.reached) {
      t.notified.reached = true; store.save();
      await notify({ title: `⏰ Zeitlimit erreicht${t.urgent ? ' (dringend)' : ''}`, body: t.title, tag: 't' + t.id, url: '/', buttons: todoButtons(t) });
    } else if (ms > 0 && ms <= soon && !t.notified.soon) {
      t.notified.soon = true; store.save();
      await notify({ title: `${t.urgent ? '🔥 ' : ''}Gleich fällig`, body: `${t.title} – in ${Math.ceil(ms / 60e3)} Min.`, tag: 't' + t.id, url: '/', buttons: todoButtons(t) });
    }
  }

  for (const e of d.events) {
    const ms = new Date(e.start) - now;
    if (ms > 0 && ms <= 15 * 60e3 && !e.notified) {
      e.notified = true; store.save();
      await notify({ title: 'Termin in Kürze', body: `${e.title} – in ${Math.ceil(ms / 60e3)} Min.${e.place ? ' · ' + e.place : ''}`, tag: 'e' + e.id, url: '/' });
    }
  }
}

function start() {
  const run = () => tick().catch(e => console.error('Scheduler:', e));
  run();
  return setInterval(run, 30e3);
}

module.exports = { start, tick, notify, briefingMessage };
