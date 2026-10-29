// Baut den Text für das Briefing (9 Uhr / 14 Uhr) – reine Funktion, deshalb gut testbar.
const TZ = () => process.env.TZ || 'Europe/Berlin';

function localParts(date, tz = TZ()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(x => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` };
}

const hm = (iso, tz) => localParts(new Date(iso), tz).hm;

function buildBriefing(db, now = new Date(), tz = TZ()) {
  const today = localParts(now, tz).day;
  const isToday = iso => localParts(new Date(iso), tz).day === today;

  const open = db.todos.filter(t => !t.done);
  const overdue = open.filter(t => t.due && new Date(t.due) < now);
  const dueToday = open.filter(t => t.due && new Date(t.due) >= now && isToday(t.due));
  const urgent = open.filter(t => t.urgent && !overdue.includes(t) && !dueToday.includes(t));
  const termine = db.events.filter(e => isToday(e.start) && new Date(e.end || e.start) >= now)
    .sort((a, b) => a.start.localeCompare(b.start));
  const veranstaltungen = db.extEvents.filter(e => isToday(e.start) || (new Date(e.start) > now && new Date(e.start) - now < 3 * 864e5))
    .slice(0, 3);

  const lines = [];
  if (termine.length) lines.push('Termine: ' + termine.map(e => `${hm(e.start, tz)} ${e.title}`).join(', '));
  if (overdue.length) lines.push('Überfällig: ' + overdue.map(t => t.title).join(', '));
  if (dueToday.length) lines.push('Heute fällig: ' + dueToday.map(t => `${t.title} (${hm(t.due, tz)})`).join(', '));
  if (urgent.length) lines.push('Dringend: ' + urgent.map(t => t.title).join(', '));
  if (veranstaltungen.length) lines.push('Veranstaltungen: ' + veranstaltungen.map(e => `${e.title}${e.place ? ' @ ' + e.place : ''}`).join(', '));
  const empty = !lines.length;
  return {
    title: parseInt(hm(now.toISOString(), tz), 10) < 12 ? 'Guten Morgen ☀️' : 'Nachmittags-Briefing',
    body: empty ? 'Nichts Dringendes – schönen Tag!' : lines.join('\n'),
    sections: { termine, overdue, dueToday, urgent, veranstaltungen },
  };
}

module.exports = { buildBriefing, localParts };
