// Kalender-Feed (ICS): Handy-/Google-/Apple-Kalender können ihn abonnieren.
const esc = s => String(s || '').replace(/[\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
const utc = iso => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function toICS(events) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//pi-planer//DE', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Pi-Planer'];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.id}@pi-planer`, `DTSTAMP:${utc(e.created || e.start)}`,
      `DTSTART:${utc(e.start)}`, `DTEND:${utc(e.end || new Date(new Date(e.start).getTime() + 3600e3))}`,
      `SUMMARY:${esc(e.title)}`);
    if (e.place) lines.push(`LOCATION:${esc(e.place)}`);
    if (e.notes) lines.push(`DESCRIPTION:${esc(e.notes)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

// Liest VEVENTs aus einer ICS-Datei (für abonnierte Veranstaltungs-Kalender).
function parseICS(text) {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const out = [];
  for (const block of unfolded.split('BEGIN:VEVENT').slice(1)) {
    const get = k => { const m = block.match(new RegExp(`^${k}[^:\\n]*:(.*)$`, 'm')); return m ? m[1].trim().replace(/\\([,;n\\])/g, (_, c) => c === 'n' ? '\n' : c) : ''; };
    const start = icsDate(get('DTSTART'));
    if (!start) continue;
    out.push({ id: 'ics-' + get('UID'), title: get('SUMMARY'), start, place: get('LOCATION'), url: get('URL') });
  }
  return out;
}
function icsDate(v) {
  const m = v.match(/^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', s = '00', z] = m;
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${z || ''}`).toISOString();
}

module.exports = { toICS, parseICS };
