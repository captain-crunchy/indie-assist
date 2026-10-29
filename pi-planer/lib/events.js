// Veranstaltungen aus der Umgebung: Ticketmaster (kostenloser API-Key) und/oder ICS-Feeds.
const store = require('./store');
const { parseICS, webUrl } = require('./ics');

const DAY = 24 * 3600e3;

async function fetchTicketmaster(city, key) {
  const from = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const to = new Date(Date.now() + 30 * DAY).toISOString().replace(/\.\d+Z$/, 'Z');
  const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${key}&city=${encodeURIComponent(city)}`
    + `&startDateTime=${from}&endDateTime=${to}&size=50&sort=date,asc&locale=*`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Ticketmaster ' + r.status);
  const j = await r.json();
  return (j._embedded?.events || []).map(e => ({
    id: 'tm-' + e.id, title: e.name, start: e.dates?.start?.dateTime || e.dates?.start?.localDate + 'T00:00:00',
    place: e._embedded?.venues?.[0]?.name || '', url: webUrl(e.url || ''), source: 'Ticketmaster',
  }));
}

async function fetchICS(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('ICS ' + r.status);
  return parseICS(await r.text()).map(e => ({ ...e, source: 'Kalender-Feed' }));
}

// Höchstens einmal pro 6 Stunden neu laden; bei Fehlern bleibt der alte Stand stehen.
async function refresh(force = false) {
  const d = store.db();
  if (!force && Date.now() - d.extFetchedAt < 6 * 3600e3) return d.extEvents;
  const all = [];
  const errors = [];
  if (process.env.TICKETMASTER_KEY && process.env.EVENTS_CITY) {
    try { all.push(...await fetchTicketmaster(process.env.EVENTS_CITY, process.env.TICKETMASTER_KEY)); } catch (e) { errors.push(e.message); }
  }
  for (const u of (process.env.EVENTS_ICS_URLS || '').split(',').map(s => s.trim()).filter(Boolean)) {
    try { all.push(...await fetchICS(u)); } catch (e) { errors.push(e.message); }
  }
  if (all.length || !errors.length) {
    const now = Date.now();
    d.extEvents = all.filter(e => new Date(e.start).getTime() >= now - DAY).sort((a, b) => a.start.localeCompare(b.start));
    d.extFetchedAt = now;
    store.save();
  }
  if (errors.length) console.error('Veranstaltungen:', errors.join('; '));
  return d.extEvents;
}

module.exports = { refresh };
