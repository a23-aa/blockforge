const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const P = require('./paths');
const { fetchJson, fetchText, download } = require('./util');
const MC = require('./minecraft');

async function mavenVersions(url) {
  const t = await fetchText(url);
  return [...t.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]);
}

function neoPrefix(mc) {
  const parts = mc.split('.');
  if (parts[0] === '1' && parts.length >= 2) return `${parts[1]}.${parts[2] || '0'}.`;
  return mc + '.';
}

// Список версий загрузчика для данной версии Minecraft (новые — первыми)
async function listVersions(loader, mc) {
  if (loader === 'fabric') {
    const l = await fetchJson(`https://meta.fabricmc.net/v2/versions/loader/${mc}`);
    return l.map((x) => ({ id: x.loader.version, label: x.loader.version + (x.loader.stable ? '' : ' (beta)'), stable: !!x.loader.stable }));
  }
  if (loader === 'quilt') {
    const l = await fetchJson(`https://meta.quiltmc.org/v3/versions/loader/${mc}`);
    return l.map((x) => ({ id: x.loader.version, label: x.loader.version, stable: !/beta|pre|alpha/.test(x.loader.version) }));
  }
  if (loader === 'forge') {
    const all = await mavenVersions('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml');
    const list = all.filter((v) => v.startsWith(mc + '-')).reverse();
    let rec = null;
    try {
      const pr = await fetchJson('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
      rec = pr.promos[`${mc}-recommended`];
    } catch {}
    return list.map((v) => {
      const isRec = rec ? v.startsWith(`${mc}-${rec}`) : false;
      return { id: v, label: v.slice(mc.length + 1) + (isRec ? ' (рекомендуемая)' : ''), stable: rec ? isRec : true };
    });
  }
  if (loader === 'neoforge') {
    let list;
    if (mc === '1.20.1') {
      const all = await mavenVersions('https://maven.neoforged.net/releases/net/neoforged/forge/maven-metadata.xml');
      list = all.filter((v) => v.startsWith('1.20.1-')).reverse();
      return list.map((v) => ({ id: v, label: v.slice(7), stable: true }));
    }
    const all = await mavenVersions('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml');
    const prefix = neoPrefix(mc);
    list = all.filter((v) => v.startsWith(prefix)).reverse();
    return list.map((v) => ({ id: v, label: v, stable: !/beta|alpha/.test(v) }));
  }
  return [];
}

function runInstaller(javaExe, jar, mcDir, log) {
  return new Promise((resolve, reject) => {
    const cp = spawn(javaExe, ['-jar', jar, '--installClient', mcDir], { cwd: mcDir, windowsHide: true });
    const out = (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => log(l));
    cp.stdout.on('data', out);
    cp.stderr.on('data', out);
    cp.on('error', reject);
    cp.on('close', (code) => (code === 0 ? resolve() : reject(new Error('Установщик завершился с кодом ' + code))));
  });
}

// Устанавливает загрузчик и возвращает id версии для запуска
async function ensure(inst, { javaExe, log, progress }) {
  const { loader, mcVersion: mc, loaderVersion: lv } = inst;
  if (inst.versionId && fs.existsSync(MC.versionJsonPath(inst.versionId))) return inst.versionId;

  if (loader === 'fabric' || loader === 'quilt') {
    const base = loader === 'fabric' ? 'https://meta.fabricmc.net/v2' : 'https://meta.quiltmc.org/v3';
    progress({ text: 'Устанавливаю ' + loader, pct: 50 });
    const prof = await fetchJson(`${base}/versions/loader/${mc}/${lv}/profile/json`);
    const id = prof.id;
    const f = MC.versionJsonPath(id);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(prof));
    return id;
  }

  // Forge / NeoForge — через официальный установщик
  let url;
  let verPart;
  if (loader === 'forge') {
    url = `https://maven.minecraftforge.net/net/minecraftforge/forge/${lv}/forge-${lv}-installer.jar`;
    verPart = lv.slice(mc.length + 1);
  } else {
    const art = mc === '1.20.1' ? 'forge' : 'neoforge';
    url = `https://maven.neoforged.net/releases/net/neoforged/${art}/${lv}/${art}-${lv}-installer.jar`;
    verPart = mc === '1.20.1' ? lv.slice(mc.length + 1) : lv;
  }
  const jar = P.p('cache', `installer-${loader}-${lv}.jar`);
  progress({ text: 'Скачиваю установщик ' + loader, pct: 10 });
  await download(url, jar);

  const lp = P.p('launcher_profiles.json');
  if (!fs.existsSync(lp)) fs.writeFileSync(lp, JSON.stringify({ profiles: {}, settings: {}, version: 3 }));

  progress({ text: 'Запускаю установщик ' + loader + ' (это может занять пару минут)', pct: 40 });
  await runInstaller(javaExe, jar, P.root, log);

  const dirs = fs.readdirSync(P.p('versions'));
  const found = dirs.find((d) => d !== mc && d.toLowerCase().includes(verPart.toLowerCase()) && fs.existsSync(MC.versionJsonPath(d)));
  if (!found) throw new Error('Установщик отработал, но версия не найдена в папке versions');
  return found;
}

module.exports = { listVersions, ensure };
