const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const P = require('./paths');
const MC = require('./minecraft');
const Loaders = require('./loaders');
const Auth = require('./auth');
const Java = require('./java');
const Premium = require('./premium');

// Готовит всё нужное и запускает игру. Возвращает { child, versionId } после старта процесса.
async function launch(inst, account, config, hooks, server) {
  const { progress, log, onExit } = hooks;
  if (!account) throw new Error('Сначала добавь аккаунт (вкладка «Аккаунты»)');

  progress({ text: 'Проверяю версию ' + inst.mcVersion, pct: 0 });
  const vanilla = await MC.installVanillaMeta(inst.mcVersion);
  const component = (vanilla.javaVersion && vanilla.javaVersion.component) || 'jre-legacy';

  // выбранная вручную Java должна существовать и подходить версии игры
  if (config.javaPath) {
    const need = vanilla.javaVersion && vanilla.javaVersion.majorVersion;
    const t = await Java.test(config.javaPath);
    if (!t.ok) throw new Error('Java не найдена или не работает: ' + config.javaPath + '. Открой Настройки, раздел Java, и выбери «Автоматически».');
    if (need && t.major < need) throw new Error(`Для Minecraft ${inst.mcVersion} нужна Java ${need} или новее, а выбрана Java ${t.major}. Открой Настройки, раздел Java, и выбери «Автоматически» или скачай нужную версию.`);
  }
  let javaExe = null;
  const getJava = async () => {
    if (javaExe) return javaExe;
    javaExe = config.javaPath || (await MC.ensureJava(component, progress));
    return javaExe;
  };

  const isForge = inst.loader === 'forge' || inst.loader === 'neoforge';
  const hasLoader = inst.loader && inst.loader !== 'vanilla';

  // Java и файлы игры готовим одновременно (для vanilla), а повторные запуски идут по быстрому пути
  let v, versionId = inst.mcVersion;
  if (!hasLoader) {
    const [vv] = await Promise.all([MC.prepare(versionId, progress), getJava()]);
    v = vv;
  } else {
    if (isForge) { await Promise.all([MC.prepare(inst.mcVersion, progress), getJava()]); }
    versionId = await Loaders.ensure(inst, { javaExe: javaExe, log, progress });
    const jp = config.javaPath ? Promise.resolve() : getJava();
    const [vv] = await Promise.all([MC.prepare(versionId, progress), jp]);
    v = vv;
  }
  // Java может зависеть от загрузчика (редко), поэтому берём из итоговой версии
  const comp2 = (v.javaVersion && v.javaVersion.component) || component;
  if (!config.javaPath && comp2 !== component) javaExe = await MC.ensureJava(comp2, progress);
  else await getJava();

  const gameDir = P.p('instances', inst.id);
  fs.mkdirSync(gameDir, { recursive: true });

  progress({ text: 'Подготавливаю запуск', pct: 100 });
  const natives = P.p('versions', versionId, 'natives');
  MC.extractNatives(v, natives);
  const skinOn = require('./localskin').apply(gameDir, inst.mcVersion, Premium.isPremium() ? account : null);
  log(skinOn ? 'Скин BlockForge подключён (ресурспак BlockForgeSkin.zip)' : 'Скин BlockForge не используется');
  const assetsRoot = MC.prepareLegacyAssets(v, gameDir);

  const acc = await Auth.ensureFresh(account, config.msClientId);
  const classpath = MC.buildClasspath(v);
  const a = MC.buildArgs(v, {
    name: acc.name,
    uuid: acc.uuid,
    token: acc.type === 'microsoft' ? acc.mcToken : '0',
    userType: acc.type === 'microsoft' ? 'msa' : 'legacy',
    gameDir, assetsRoot, natives, classpath,
  });

  if (server && server.host) {
    a.game.push('--server', String(server.host), '--port', String(server.port || 25565));
  }

  const ram = Number(inst.ram || config.ram || 4096);
  const extra = String(inst.jvmArgs || '').split(' ').filter(Boolean);
  const fast = ['-XX:+UseG1GC', '-XX:+UnlockExperimentalVMOptions', '-XX:G1NewSizePercent=20', '-XX:G1ReservePercent=20', '-XX:MaxGCPauseMillis=50', '-XX:+DisableExplicitGC', '-Xshare:auto'];
  const args = [`-Xmx${ram}M`, `-Xms${Math.min(1024, ram)}M`, ...(inst.jvmArgs ? [] : fast), ...extra, ...a.jvm, a.mainClass, ...a.game];

  log(`Запуск: ${path.basename(javaExe)} ${versionId}, память ${ram} МБ`);
  const child = spawn(javaExe, args, { cwd: gameDir, windowsHide: true });
  const out = (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => log(l));
  child.stdout.on('data', out);
  child.stderr.on('data', out);
  child.on('error', (e) => { log('Ошибка запуска: ' + e.message); onExit(-1); });
  child.on('close', (code) => onExit(code));
  return { child, versionId, account: acc };
}

module.exports = { launch };
