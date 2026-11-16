// Премиум: что бесплатно, а что платно. Чтобы переместить функцию, поменяй её в списке PAID.
const store = require('./store');

// ключ функции -> как её назвать в сообщении
const PAID = {
  mods: 'Моды и загрузчики',
  skins: 'Скины',
  friends: 'Друзья и чаты',
  myserver: 'Свой сервер',
  instances: 'Несколько сборок',
  language: 'Смена языка интерфейса',
};

// команда -> функция, которой она принадлежит
const GATES = {
  'loaders:versions': 'mods', 'presets:create': 'mods', 'instances:setLoader': 'mods',
  'mods:addFiles': 'mods', 'mods:openFolder': 'mods', 'mods:update': 'mods', 'mods:search': 'mods', 'mods:install': 'mods',
  'mods:list': 'mods', 'mods:toggle': 'mods', 'mods:remove': 'mods',
  'skins:fetch': 'skins', 'skins:setLocal': 'skins', 'skins:upload': 'skins',
  'social:friends': 'friends', 'social:chat': 'friends', 'social:send': 'friends', 'social:add': 'friends',
  'social:accept': 'friends', 'social:decline': 'friends', 'social:remove': 'friends',
  'srv:status': 'myserver', 'srv:versions': 'myserver', 'srv:start': 'myserver', 'srv:stop': 'myserver', 'srv:cmd': 'myserver',
  'srv:openFolder': 'myserver', 'srv:plugins': 'myserver', 'srv:pluginSearch': 'myserver', 'srv:pluginInstall': 'myserver', 'srv:pluginRemove': 'myserver',
  'tr:translate': 'language',
};

function info() {
  const s = store.getSession();
  const until = (s && s.premiumUntil) || 0;
  return { active: until > Date.now(), until };
}
const isPremium = () => info().active;
function need(feature) {
  if (!PAID[feature]) return;
  if (!isPremium()) { const e = new Error('Премиум: ' + PAID[feature] + ' доступны с подпиской'); e.premium = feature; throw e; }
}

module.exports = { PAID, GATES, info, isPremium, need };
