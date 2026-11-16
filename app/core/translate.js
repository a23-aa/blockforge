// Переводчик через бесплатный MyMemory (без ключа, до ~5000 символов в день с одного IP).
const { UA } = require('./util');

const LANGS = { ru: 'Русский', en: 'English', de: 'Deutsch', fr: 'Français', es: 'Español', it: 'Italiano', pt: 'Português', pl: 'Polski', uk: 'Українська', tr: 'Türkçe', zh: '中文', ja: '日本語', ko: '한국어' };

function chunks(text, max = 450) {
  const parts = text.split(/(?<=[.!?\n])\s+/), out = [];
  let cur = '';
  for (let p of parts) {
    while (p.length > max) { if (cur) { out.push(cur); cur = ''; } out.push(p.slice(0, max)); p = p.slice(max); }
    if ((cur + ' ' + p).length > max) { out.push(cur); cur = p; } else cur = cur ? cur + ' ' + p : p;
  }
  if (cur) out.push(cur);
  return out.filter((x) => x.trim());
}

async function translate(text, from, to) {
  text = String(text || '').trim();
  if (!text) return '';
  if (text.length > 2000) throw new Error('Слишком длинный текст (максимум 2000 символов)');
  if (!LANGS[to]) throw new Error('Неизвестный язык');
  const out = [];
  for (const c of chunks(text)) {
    const pair = (from && from !== 'auto' ? from : 'Autodetect') + '|' + to;
    let j;
    try {
      const r = await fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(c) + '&langpair=' + encodeURIComponent(pair), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
      j = await r.json();
    } catch { throw new Error('Не удалось связаться с переводчиком. Проверь интернет (возможно, нужен VPN).'); }
    if (!j || !j.responseData || (j.responseStatus && Number(j.responseStatus) !== 200)) throw new Error((j && j.responseDetails) || 'Переводчик не ответил');
    out.push(String(j.responseData.translatedText || ''));
  }
  return out.join(' ');
}

module.exports = { translate, LANGS, chunks };
