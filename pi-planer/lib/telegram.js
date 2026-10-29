// Telegram-Bot: Briefing und Erinnerungen als Nachricht, Abhaken/Verschieben per Knopf.
// Verbinden wie bei Indie Assist: dem Bot /start schreiben, dann in der App „Verbinden“ drücken.
// Nur der verbundene Chat darf den Bot bedienen.
const store = require('./store');

const TOKEN = () => process.env.TELEGRAM_TOKEN || '';
let botName = '';
let pendingChat = null; // letzter Chat, der /start geschrieben hat (wartet auf „Verbinden“)
let handlers = {};

async function call(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN()}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description || r.status}`);
  return j.result;
}

const chatId = () => store.db().telegram?.chatId || null;

// payload wie bei Web-Push ({ title, body }) plus optional buttons: [[{ text, data }]]
async function send(payload) {
  if (!TOKEN() || !chatId()) return 0;
  const text = [payload.title, payload.body].filter(Boolean).join('\n');
  const reply_markup = payload.buttons?.length
    ? { inline_keyboard: payload.buttons.map(row => row.map(b => ({ text: b.text, callback_data: b.data }))) } : undefined;
  try { await call('sendMessage', { chat_id: chatId(), text, reply_markup }); return 1; }
  catch (e) { console.error(e.message); return 0; }
}

async function handleUpdate(u) {
  const msg = u.message, cb = u.callback_query;
  const from = msg?.chat?.id ?? cb?.message?.chat?.id;
  if (msg?.text?.startsWith('/start')) {
    pendingChat = { id: from, name: msg.chat.first_name || msg.chat.username || 'Telegram' };
    if (from !== chatId()) await call('sendMessage', { chat_id: from, text: 'Hallo! Drück jetzt im Pi-Planer unter „Mehr → Telegram“ auf „Verbinden“.' });
    return;
  }
  if (!from || from !== chatId()) return; // fremde Chats ignorieren
  if (cb) {
    const [action, id] = String(cb.data || '').split(':');
    const answer = (await handlers.button?.(action, id)) || 'OK';
    await call('answerCallbackQuery', { callback_query_id: cb.id, text: answer }).catch(() => {});
    await send({ body: answer });
    return;
  }
  const text = (msg?.text || '').trim();
  const reply = await handlers.command?.(text);
  if (reply) await send(reply);
}

// Long-Polling: braucht keine von außen erreichbare Adresse und kein HTTPS.
async function poll() {
  let offset = 0;
  for (;;) {
    try {
      const updates = await call('getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] });
      for (const u of updates) { offset = u.update_id + 1; await handleUpdate(u).catch(e => console.error('Telegram:', e.message)); }
    } catch (e) {
      console.error(e.message);
      await new Promise(r => setTimeout(r, 15e3));
    }
  }
}

// Knopf- und Befehls-Logik kommt aus server.js (dort liegen Store-Zugriff und Validierung).
function use(h) { handlers = h; }

async function start() {
  if (!TOKEN()) return;
  try { botName = (await call('getMe')).username; } catch (e) { console.error(e.message); }
  poll();
}

function connect() {
  if (!pendingChat) return null;
  const d = store.db();
  d.telegram = { chatId: pendingChat.id, name: pendingChat.name };
  pendingChat = null;
  store.save();
  return d.telegram;
}
function disconnect() { store.db().telegram = null; store.save(); }
const status = () => ({ configured: !!TOKEN(), bot: botName, connected: !!chatId(), name: store.db().telegram?.name || '' });

module.exports = { use, start, send, connect, disconnect, status, handleUpdate };
