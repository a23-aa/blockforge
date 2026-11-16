const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const P = require('./paths');
const { fetchJson, download } = require('./util');

const API = 'https://api.modrinth.com/v2';
const DIRS = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' };

function gameDir(inst) { return P.p('instances', inst.id); }
function dirFor(inst, type = 'mod') { return path.join(gameDir(inst), DIRS[type] || 'mods'); }

function loadersFor(inst) {
  if (!inst.loader || inst.loader === 'vanilla') return null;
  if (inst.loader === 'quilt') return ['quilt', 'fabric'];
  return [inst.loader];
}

const NO_LOADER = 'У этой сборки нет загрузчика модов (Vanilla), поэтому моды в ней работать не будут. Нажми «Поставить Fabric» на странице «Моды».';

async function search({ query, inst, type = 'mod', offset = 0 }) {
  const facets = [[`project_type:${type}`]];
  if (inst && inst.mcVersion) facets.push([`versions:${inst.mcVersion}`]);
  if (type === 'mod') {
    const l = loadersFor(inst || {});
    if (l) facets.push(l.map((x) => `categories:${x}`));
  }
  const url = `${API}/search?query=${encodeURIComponent(query || '')}&limit=20&offset=${offset}&index=${query ? 'relevance' : 'downloads'}&facets=${encodeURIComponent(JSON.stringify(facets))}`;
  const r = await fetchJson(url);
  return r.hits.map((h) => ({
    id: h.project_id, slug: h.slug, title: h.title, description: h.description,
    icon: h.icon_url, downloads: h.downloads, author: h.author,
  }));
}

async function installProject(projectId, inst, type = 'mod', seen = new Set(), warnings = []) {
  if (type === 'mod' && !loadersFor(inst)) throw new Error(NO_LOADER);
  if (seen.has(projectId)) return [];
  seen.add(projectId);
  const params = new URLSearchParams({ game_versions: JSON.stringify([inst.mcVersion]) });
  const l = type === 'mod' ? loadersFor(inst) : null;
  if (l) params.set('loaders', JSON.stringify(l));
  const vers = await fetchJson(`${API}/project/${projectId}/version?${params}`);
  if (!vers.length) throw new Error(`Нет версии под ${inst.mcVersion}${l ? ' / ' + inst.loader : ''}`);
  const ver = vers[0];
  const file = ver.files.find((f) => f.primary) || ver.files[0];
  if (!file) throw new Error('У этой версии нет файлов');
  const dest = path.join(dirFor(inst, type), file.filename);
  await download(file.url, dest, { size: file.size });
  const installed = [file.filename];
  for (const dep of ver.dependencies || []) {
    if (dep.dependency_type === 'required' && dep.project_id) {
      try {
        installed.push(...(await installProject(dep.project_id, inst, 'mod', seen, warnings)));
      } catch (e) {
        warnings.push(`Зависимость ${dep.project_id}: ${e.message}`);
      }
    }
  }
  return installed;
}

function list(inst, type = 'mod') {
  const dir = dirFor(inst, type);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /\.(jar|zip)(\.disabled)?$/i.test(f))
    .map((f) => ({ file: f, enabled: !f.endsWith('.disabled'), size: fs.statSync(path.join(dir, f)).size }));
}

function safeName(f) {
  if (f !== path.basename(f)) throw new Error('Некорректное имя файла');
  return f;
}

function toggle(inst, file, type = 'mod') {
  const dir = dirFor(inst, type);
  const f = safeName(file);
  const next = f.endsWith('.disabled') ? f.slice(0, -9) : f + '.disabled';
  fs.renameSync(path.join(dir, f), path.join(dir, next));
}

function remove(inst, file, type = 'mod') {
  fs.unlinkSync(path.join(dirFor(inst, type), safeName(file)));
}

const sha1 = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');

// Ищет обновления для установленных файлов по их хешам (Modrinth)
async function updateAll(inst, type = 'mod') {
  const dir = dirFor(inst, type);
  const files = list(inst, type).filter((f) => f.enabled);
  if (!files.length) return { updated: [], checked: 0 };
  const byHash = {};
  files.forEach((f) => { byHash[sha1(path.join(dir, f.file))] = f.file; });
  const body = { hashes: Object.keys(byHash), algorithm: 'sha1', game_versions: [inst.mcVersion] };
  const l = type === 'mod' ? loadersFor(inst) : null;
  if (l) body.loaders = l;
  const r = await fetchJson(`${API}/version_files/update`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const updated = [];
  for (const [h, ver] of Object.entries(r)) {
    const file = (ver.files || []).find((f) => f.primary) || (ver.files || [])[0];
    if (!file || (file.hashes && file.hashes.sha1 === h)) continue;
    await download(file.url, path.join(dir, file.filename), { size: file.size });
    if (byHash[h] && byHash[h] !== file.filename) { try { fs.unlinkSync(path.join(dir, byHash[h])); } catch {} }
    updated.push(file.filename);
  }
  return { updated, checked: files.length };
}

module.exports = { search, installProject, list, toggle, remove, updateAll, dirFor, loadersFor, NO_LOADER };
