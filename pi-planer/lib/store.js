// Einfache JSON-Datei als Speicher – reicht für eine Person und läuft ohne Datenbank auf dem Pi.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'data.json');
const empty = () => ({ todos: [], events: [], extEvents: [], extFetchedAt: 0, subs: [], vapid: null, lastBriefing: {} });

let db = empty();
try { db = { ...empty(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { /* erster Start */ }

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE); // atomar, damit bei Stromausfall nichts kaputtgeht
}

const id = () => crypto.randomUUID();

module.exports = { db: () => db, save, id };
