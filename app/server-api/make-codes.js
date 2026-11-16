// Инструмент владельца: создать коды Премиума или выдать Премиум игроку.
//   node make-codes.js <адрес сервера> <админ-ключ> codes <дней> <сколько>
//   node make-codes.js <адрес сервера> <админ-ключ> grant <ник или ID> <дней>
// Админ-ключ задаётся на сервере переменной ADMIN_KEY (не короче 12 символов).
const [, , url, key, cmd, a, b] = process.argv;
if (!url || !key || !['codes', 'grant'].includes(cmd)) {
  console.log('Использование:\n  node make-codes.js http://адрес:3000 АДМИН_КЛЮЧ codes 30 5\n  node make-codes.js http://адрес:3000 АДМИН_КЛЮЧ grant Ник 30');
  process.exit(1);
}
(async () => {
  const path = cmd === 'codes' ? '/api/admin/codes' : '/api/admin/grant';
  const body = cmd === 'codes' ? { days: Number(a) || 30, count: Number(b) || 1 } : { nick: a, id: /^\d{8}$/.test(a || '') ? a : undefined, days: Number(b) || 30 };
  const r = await fetch(url.replace(/\/+$/, '') + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Key': key }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) { console.error('Ошибка:', j.error); process.exit(1); }
  if (cmd === 'codes') { console.log('Коды на ' + j.days + ' дн.:'); j.codes.forEach((c) => console.log('  ' + c)); }
  else console.log('Готово: ' + j.nick + ' (ID ' + j.id + '), Премиум до ' + new Date(j.premiumUntil).toLocaleString('ru-RU'));
})();
