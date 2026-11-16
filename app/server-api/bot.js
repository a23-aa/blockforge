// Telegram-бот BlockForge: продаёт Премиум за Telegram Stars и сам включает его в аккаунте. Node.js 18+, без зависимостей.
// Человек присылает боту свой ID из лаунчера (8 цифр), платит, и Премиум включается автоматически. Вводить код не нужно.
//
// Переменные окружения:
//   BOT_TOKEN    токен от @BotFather (обязательно)
//   API_URL      адрес сервера аккаунтов (обязательно)
//   ADMIN_KEY    админ-ключ сервера аккаунтов (обязательно)
//   OWNER_ID     твой числовой Telegram ID: сюда приходят заявки и предупреждения
//   PRICE_STARS  цена за 30 дней в Stars (по умолчанию 75)
//   DAYS         сколько дней даёт разовая оплата (по умолчанию 30). Подписка с автопродлением всегда 30 дней.
//   PAY_TEXT     как оплатить переводом на карту (пусто = перевод выключен)
const fs = require('fs');
const path = require('path');

const env = process.env;
const TOKEN = env.BOT_TOKEN, API = String(env.API_URL || '').replace(/\/+$/, ''), KEY = env.ADMIN_KEY;
const OWNER = Number(env.OWNER_ID) || 0;
const STARS = env.PRICE_STARS === undefined ? 75 : Number(env.PRICE_STARS) || 0;
const DAYS = Number(env.DAYS) || 30;
const SUB_PERIOD = 2592000; // Telegram допускает для подписки только 30 дней (в секундах)
const PAY_TEXT = env.PAY_TEXT || '';
const TG = (env.TG_API || 'https://api.telegram.org') + '/bot' + TOKEN + '/';
const DIR = env.BOT_DIR || __dirname;
const LOG = path.join(DIR, 'bot-payments.log'), DATA = path.join(DIR, 'bot-data.json');

function need(v, n) { if (!v) { console.error('Не задана переменная ' + n); process.exit(1); } }
if (require.main === module) { need(TOKEN, 'BOT_TOKEN'); need(API, 'API_URL'); need(KEY, 'ADMIN_KEY'); }

/* ---------- хранилище: кто к какому ID лаунчера привязан, какие платежи уже обработаны ---------- */
let store = { links: {}, charges: {} };
try { store = { ...store, ...JSON.parse(fs.readFileSync(DATA, 'utf8')) }; } catch {}
const saveStore = () => { try { fs.writeFileSync(DATA, JSON.stringify(store)); } catch (e) { console.error('Не удалось сохранить', e.message); } };
const note = (line) => { try { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + line + '\n'); } catch {} };

/* ---------- Telegram и сервер аккаунтов ---------- */
async function tg(method, params) {
  const r = await fetch(TG + method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params || {}), signal: AbortSignal.timeout(60000) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(method + ': ' + (j.description || r.status));
  return j.result;
}
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const say = (chat_id, text, extra) => tg('sendMessage', { chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra }).catch((e) => console.error(e.message));
async function admin(p, body) {
  const r = await fetch(API + p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Key': KEY }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || 'сервер аккаунтов ответил ' + r.status); e.status = r.status; throw e; }
  return j;
}
const lookup = (id) => admin('/api/admin/user', { id });
const grant = (id, days) => admin('/api/admin/grant', { id, days });
const newCode = async (days) => (await admin('/api/admin/codes', { days, count: 1 })).codes[0];
const dateOf = (t) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/\.$/, '');
const nameOf = (u) => (u.username ? '@' + u.username : [u.first_name, u.last_name].filter(Boolean).join(' ') || 'id' + u.id) + ' (tg ' + u.id + ')';

/* ---------- тексты и кнопки ---------- */
const INFO = 'Премиум BlockForge открывает: моды и загрузчики, скины, друзей и чаты, свой сервер, много сборок и смену языка. Без Премиума можно просто играть в обычный Minecraft.';
const ASK_ID = 'Пришли свой ID из лаунчера BlockForge: 8 цифр. Его видно в левом нижнем углу лаунчера под твоим ником (ID 12345678). Аккаунт нужно создать заранее, при первом запуске лаунчера.';
const waiting = new Set();

function menu(chat) {
  const rows = [];
  if (STARS) {
    rows.push([{ text: `Подписка на месяц, автопродление (${STARS} Stars)`, callback_data: 'sub' }]);
    rows.push([{ text: `Оплатить ${DAYS} дн. один раз (${STARS} Stars)`, callback_data: 'once' }]);
  }
  if (PAY_TEXT) rows.push([{ text: 'Оплатить переводом на карту', callback_data: 'manual' }]);
  rows.push([{ text: 'Что входит в Премиум', callback_data: 'info' }, { text: 'Сменить ID', callback_data: 'relink' }]);
  return { reply_markup: { inline_keyboard: rows } };
}
async function home(chat) {
  const id = store.links[chat];
  if (!id) { waiting.add(chat); return say(chat, 'Привет! Здесь можно купить Премиум для лаунчера BlockForge.\n\n' + INFO + '\n\n' + ASK_ID); }
  let who = 'ID ' + id;
  try { const u = await lookup(id); who = esc(u.nick) + ' (ID ' + id + ')' + (u.premium ? ', Премиум до ' + dateOf(u.premiumUntil) : ', Премиума нет'); } catch {}
  return say(chat, 'Твой аккаунт: ' + who + '.\nВыбери способ оплаты:', menu(chat));
}

/* ---------- выдача Премиума ---------- */
async function activate(chatId, launcherId, days, via, who) {
  try {
    const r = await grant(launcherId, days);
    note(`${via} ${who} -> ID ${launcherId} +${days}дн до ${new Date(r.premiumUntil).toISOString()}`);
    await say(chatId, `Готово! Премиум включён для ${esc(r.nick)} (ID ${launcherId}) до ${dateOf(r.premiumUntil)}.\nПерезапускать лаунчер не нужно: Премиум появится в течение минуты.`);
    if (OWNER && chatId !== OWNER) say(OWNER, `Премиум выдан (${via}): ${esc(who)} -> ${esc(r.nick)}, до ${dateOf(r.premiumUntil)}.`);
    return true;
  } catch (e) {
    note(`${via} ${who} -> ID ${launcherId} ОШИБКА ${e.message}`);
    await say(chatId, 'Оплата получена, но включить Премиум автоматически не удалось. Владелец уже получил сообщение и включит его вручную.');
    if (OWNER) say(OWNER, `ОШИБКА выдачи (${via}) для ${esc(who)}, ID ${launcherId}, ${days} дн.: ${esc(e.message)}. Выдай вручную командой /grant ${launcherId} ${days}`);
    return false;
  }
}

async function onPayment(m) {
  const sp = m.successful_payment, charge = sp.telegram_payment_charge_id, who = nameOf(m.from);
  if (store.charges[charge]) return; // этот платёж уже обработан
  store.charges[charge] = Date.now(); saveStore();
  const [kind, pid] = String(sp.invoice_payload || '').split(':');
  const launcherId = pid || store.links[m.chat.id];
  const days = kind === 'sub' ? 30 : DAYS;
  note(`ОПЛАТА ${kind || '?'} ${who} charge=${charge} ${sp.total_amount} ${sp.currency}${sp.is_recurring ? ' продление' : ''}`);
  if (!launcherId) {
    const code = await newCode(days).catch(() => null);
    if (code) return say(m.chat.id, `Оплата получена. Твой код на ${days} дн.: <code>${code}</code>\nВведи его в лаунчере: Настройки, блок «Премиум».`);
    if (OWNER) say(OWNER, `ОШИБКА: оплата без ID и код не создан. ${esc(who)} charge=${charge}`);
    return say(m.chat.id, 'Оплата получена. Напиши владельцу, он включит Премиум вручную.');
  }
  return activate(m.chat.id, launcherId, days, sp.is_recurring ? 'stars-продление' : 'stars', who);
}

/* ---------- обработка сообщений ---------- */
async function setLink(chat, id) {
  try {
    const u = await lookup(id);
    store.links[chat] = id; saveStore(); waiting.delete(chat);
    await say(chat, `Привязан аккаунт ${esc(u.nick)} (ID ${id}).`);
    return home(chat);
  } catch (e) {
    if (e.status === 404) return say(chat, 'Игрока с таким ID нет. Проверь цифры в лаунчере и пришли ещё раз.');
    note('lookup ОШИБКА ' + e.message);
    return say(chat, 'Сервер аккаунтов сейчас недоступен. Попробуй через несколько минут.');
  }
}

async function onMessage(m) {
  const chat = m.chat.id, text = String(m.text || '').trim();
  if (m.successful_payment) return onPayment(m);
  if (/^\/(start|help|buy)\b/.test(text)) return home(chat);
  if (text === '/id') return say(chat, 'Твой Telegram ID: <code>' + m.from.id + '</code>');
  if (/^\/link\b/.test(text)) { waiting.add(chat); return say(chat, ASK_ID); }
  if (chat === OWNER) {
    let g;
    if ((g = /^\/gen(?:\s+(\d+))?(?:\s+(\d+))?/.exec(text))) {
      const days = Number(g[1]) || DAYS, count = Math.min(20, Number(g[2]) || 1), out = [];
      try { for (let i = 0; i < count; i++) out.push(await newCode(days)); } catch (e) { return say(chat, 'Ошибка: ' + esc(e.message)); }
      return say(chat, `Коды на ${days} дн.:\n<code>${out.join('\n')}</code>`);
    }
    if ((g = /^\/grant\s+(\d{8})(?:\s+(-?\d+))?/.exec(text))) {
      return grant(g[1], Number(g[2]) || DAYS).then((r) => say(chat, `${esc(r.nick)}: Премиум до ${dateOf(r.premiumUntil)}`)).catch((e) => say(chat, 'Ошибка: ' + esc(e.message)));
    }
    if ((g = /^\/who\s+(\d{8})/.exec(text))) {
      return lookup(g[1]).then((r) => say(chat, `${esc(r.nick)}: ${r.premium ? 'Премиум до ' + dateOf(r.premiumUntil) : 'без Премиума'}`)).catch((e) => say(chat, 'Ошибка: ' + esc(e.message)));
    }
  }
  if (/^\d{8}$/.test(text)) return setLink(chat, text);
  if (waiting.has(chat)) return say(chat, 'ID состоит из 8 цифр, например 12345678. Пришли только цифры.');
  return home(chat);
}

async function onCallback(q) {
  const chat = q.message.chat.id, d = String(q.data || '');
  tg('answerCallbackQuery', { callback_query_id: q.id }).catch(() => {});
  if (d === 'info') return say(chat, INFO);
  if (d === 'relink') { waiting.add(chat); return say(chat, ASK_ID); }
  const id = store.links[chat];
  if ((d === 'sub' || d === 'once') && STARS) {
    if (!id) { waiting.add(chat); return say(chat, ASK_ID); }
    const base = { title: 'Премиум BlockForge', description: d === 'sub' ? 'Премиум на месяц с автопродлением: моды, скины, друзья, свой сервер и многое другое.' : `Премиум на ${DAYS} дн.: моды, скины, друзья, свой сервер и многое другое.`, payload: d + ':' + id, currency: 'XTR', prices: [{ label: d === 'sub' ? 'Премиум, 30 дней' : `Премиум, ${DAYS} дн.`, amount: STARS }] };
    try {
      if (d === 'once') return await tg('sendInvoice', { chat_id: chat, provider_token: '', ...base });
      const url = await tg('createInvoiceLink', { ...base, subscription_period: SUB_PERIOD });
      return say(chat, 'Нажми кнопку, чтобы оформить подписку. Она продлевается раз в 30 дней, отменить можно в Telegram: Настройки, Telegram Stars, Подписки.', { reply_markup: { inline_keyboard: [[{ text: `Оформить за ${STARS} Stars в месяц`, url }]] } });
    } catch (e) { return say(chat, 'Не удалось создать счёт: ' + esc(e.message)); }
  }
  if (d === 'manual' && PAY_TEXT) {
    if (!id) { waiting.add(chat); return say(chat, ASK_ID); }
    return say(chat, esc(PAY_TEXT) + '\n\nКогда оплатишь, нажми кнопку ниже.', { reply_markup: { inline_keyboard: [[{ text: 'Я оплатил', callback_data: 'paid' }]] } });
  }
  if (d === 'paid') {
    if (!OWNER) return say(chat, 'Владелец ещё не настроил приём заявок.');
    await say(OWNER, `Заявка на оплату от ${esc(nameOf(q.from))}, ID лаунчера ${store.links[chat] || 'не привязан'}. Проверь поступление.`, { reply_markup: { inline_keyboard: [[{ text: `Включить на ${DAYS} дн.`, callback_data: 'give:' + q.from.id }], [{ text: 'Отклонить', callback_data: 'deny:' + q.from.id }]] } });
    return say(chat, 'Заявка отправлена. Как только владелец проверит оплату, Премиум включится.');
  }
  if (q.from.id !== OWNER) return;
  const give = /^give:(\d+)$/.exec(d), deny = /^deny:(\d+)$/.exec(d);
  const close = () => tg('editMessageReplyMarkup', { chat_id: chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
  if (give) {
    close();
    const buyer = Number(give[1]), lid = store.links[buyer];
    if (lid) return activate(buyer, lid, DAYS, 'перевод', 'tg ' + buyer);
    const code = await newCode(DAYS).catch(() => null);
    return code ? say(buyer, `Оплата подтверждена. Твой код на ${DAYS} дн.: <code>${code}</code>\nВведи его в лаунчере: Настройки, блок «Премиум».`) : say(chat, 'Не удалось создать код.');
  }
  if (deny) { close(); return say(Number(deny[1]), 'Оплату не удалось подтвердить. Если ты оплатил, напиши владельцу.'); }
}

async function handle(u) {
  if (u.pre_checkout_query) return tg('answerPreCheckoutQuery', { pre_checkout_query_id: u.pre_checkout_query.id, ok: true }).catch((e) => console.error(e.message));
  if (u.message) return onMessage(u.message);
  if (u.callback_query) return onCallback(u.callback_query);
}

async function run() {
  const me = await tg('getMe');
  console.log('Бот запущен: @' + me.username + (STARS ? ', цена ' + STARS + ' Stars' : '') + (PAY_TEXT ? ', перевод включён' : ''));
  let offset = 0;
  for (;;) {
    try {
      const ups = await tg('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query', 'pre_checkout_query'] });
      for (const u of ups) { offset = u.update_id + 1; try { await handle(u); } catch (e) { console.error(e); } }
    } catch (e) { console.error(e.message); await new Promise((r) => setTimeout(r, 5000)); }
  }
}
if (require.main === module) run();
module.exports = { handle, run };
