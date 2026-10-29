const webpush = require('web-push');
const store = require('./store');

function init() {
  const d = store.db();
  if (!d.vapid) { d.vapid = webpush.generateVAPIDKeys(); store.save(); }
  webpush.setVapidDetails(process.env.VAPID_CONTACT || 'mailto:admin@localhost', d.vapid.publicKey, d.vapid.privateKey);
  return d.vapid.publicKey;
}

async function sendAll(payload) {
  const d = store.db();
  const body = JSON.stringify(payload);
  let sent = 0;
  await Promise.all(d.subs.map(async sub => {
    try { await webpush.sendNotification(sub, body); sent++; }
    catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) d.subs = d.subs.filter(s => s.endpoint !== sub.endpoint);
      else console.error('Push-Fehler:', e.statusCode || e.message);
    }
  }));
  store.save();
  return sent;
}

module.exports = { init, sendAll };
